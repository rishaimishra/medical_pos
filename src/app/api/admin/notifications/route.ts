import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, hasPermission } from "@/lib/rbac";
import { getTodayMidnightUtc } from "@/lib/config";

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const branchParam = searchParams.get("branchId");
  const requestedBranchId = branchParam && branchParam !== "all" ? parseInt(branchParam, 10) : null;
  if (branchParam && branchParam !== "all" && (requestedBranchId === null || isNaN(requestedBranchId))) {
    return NextResponse.json({ success: false, message: "Invalid branchId" }, { status: 400 });
  }
  if (requestedBranchId !== null && !canAccessBranch(auth.session, requestedBranchId)) {
    return NextResponse.json({ success: false, message: "Unauthorized branch access" }, { status: 403 });
  }

  const userStoreId = auth.session.storeId;
  if (requestedBranchId !== null && userStoreId) {
    const br = await prisma.branch.findUnique({ where: { id: requestedBranchId }, select: { storeId: true } });
    if (!br || (br.storeId && br.storeId !== userStoreId)) {
      return NextResponse.json({ success: false, message: "Forbidden: Branch belongs to another store" }, { status: 403 });
    }
  }

  const canSwitch =
    auth.session.role === "admin" ||
    hasPermission(auth.session, "switch_branches") ||
    !auth.session.branchId;
  const effectiveBranchId = canSwitch ? requestedBranchId : auth.session.branchId;

  try {
    const now = new Date();
    const todayMidnight = getTodayMidnightUtc();
    const thirtyDaysAhead = new Date(todayMidnight.getTime() + 30 * 24 * 60 * 60 * 1000);

    const storeSettings = userStoreId
      ? await prisma.settings.findUnique({ where: { id: userStoreId }, select: { lowQty: true } })
      : await prisma.settings.findFirst({ select: { lowQty: true } });
    const lowQtyThreshold = typeof storeSettings?.lowQty === "number" ? storeSettings.lowQty : 10;

    const branchScope = {
      ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
      ...(userStoreId ? { branch: { storeId: userStoreId } } : {}),
    };

    // 1. Expired & Critical expiring batches (<= 30 days)
    const expiringBatches = await prisma.batch.findMany({
      where: {
        quantity: { gt: 0 },
        expiryDate: { lte: thirtyDaysAhead },
        ...branchScope,
      },
      include: {
        medicine: { select: { name: true } },
      },
      orderBy: { expiryDate: "asc" },
      take: 5,
    });

    // 2. Out of stock or low stock unexpired batches
    const lowStockBatches = await prisma.batch.findMany({
      where: {
        quantity: { lte: lowQtyThreshold },
        expiryDate: { gt: todayMidnight },
        ...branchScope,
      },
      include: {
        medicine: { select: { name: true } },
      },
      orderBy: { quantity: "asc" },
      take: 5,
    });

    // 3. Pending Purchase Orders
    const pendingPOs = await prisma.purchaseOrder.findMany({
      where: {
        status: { in: ["pending", "price_updated"] },
        ...branchScope,
      },
      include: {
        supplier: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // 4. Overdue Chronic Patient Refills (active patients only)
    const overdueRefills = await prisma.customer.findMany({
      where: {
        active: true,
        isChronic: true,
        nextRefillDate: { lte: todayMidnight },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        chronicDiseases: true,
        nextRefillDate: true,
      },
      take: 5,
    });

    // 5. Pending Return Requests
    const pendingReturns = await prisma.return.findMany({
      where: {
        status: "pending",
        ...branchScope,
      },
      include: {
        sale: { select: { invoiceNo: true } },
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // 6. Unread Supplier Portal Messages
    const unreadSupplierMessages = await prisma.supplierMessage.findMany({
      where: {
        direction: "in",
        status: "unread",
      },
      include: {
        supplier: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // 7. Unread Patient Prescription Uploads & Order Requests (Module 2.18.2)
    const unreadPrescriptions = await prisma.patientMessage.findMany({
      where: {
        direction: "in",
        isRead: false,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const notifications: Array<{
      id: string;
      type: "expiry" | "stock" | "po" | "refill" | "return" | "message" | "prescription";
      title: string;
      message: string;
      href: string;
      severity: "danger" | "warning" | "info";
      timestamp: string;
    }> = [];

    expiringBatches.forEach((b) => {
      const days = Math.ceil((new Date(b.expiryDate).getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
      const isExpired = days <= 0;
      notifications.push({
        id: `exp_${b.id}`,
        type: "expiry",
        title: isExpired ? "Expired Drug Alert" : "Drug Expiring Soon",
        message: isExpired
          ? `${b.medicine.name} (Batch: ${b.batchNo}) expired${days === 0 ? " today" : ` ${Math.abs(days)} day(s) ago`}. Qty: ${b.quantity}`
          : `${b.medicine.name} (Batch: ${b.batchNo}) expires in ${days} day(s). Qty: ${b.quantity}`,
        href: isExpired ? `/admin/batches?tier=expired` : `/admin/batches?tier=critical_30`,
        severity: "danger",
        timestamp: b.updatedAt.toISOString(),
      });
    });

    lowStockBatches.forEach((b) => {
      notifications.push({
        id: `stock_${b.id}`,
        type: "stock",
        title: b.quantity === 0 ? "Out of Stock" : "Low Stock Alert",
        message: `${b.medicine.name} (Batch: ${b.batchNo}) has ${b.quantity} unit(s) remaining.`,
        href: `/admin/batches?stock=low_stock`,
        severity: b.quantity === 0 ? "danger" : "warning",
        timestamp: b.updatedAt.toISOString(),
      });
    });

    pendingPOs.forEach((po) => {
      notifications.push({
        id: `po_${po.id}`,
        type: "po",
        title: "Purchase Order Pending",
        message: `${po.poNumber} with ${po.supplier?.name || "Supplier"} awaits confirmation.`,
        href: `/admin/purchases`,
        severity: "info",
        timestamp: po.createdAt.toISOString(),
      });
    });

    overdueRefills.forEach((c) => {
      notifications.push({
        id: `refill_${c.id}`,
        type: "refill",
        title: "Patient Refill Due",
        message: `${c.name} (${c.chronicDiseases || "Chronic"}) medicine refill is due.`,
        href: `/admin/customers?chronic=chronic`,
        severity: "warning",
        timestamp: (c.nextRefillDate || now).toISOString(),
      });
    });

    pendingReturns.forEach((ret) => {
      notifications.push({
        id: `ret_${ret.id}`,
        type: "return",
        title: "Pending Return Approval",
        message: `${ret.returnNumber} (Invoice ${ret.sale?.invoiceNo || "-"}) for ${ret.customer?.name || "Customer"} — ₹${Number(ret.refundAmount || 0).toFixed(2)} awaits action.`,
        href: `/admin/returns`,
        severity: "warning",
        timestamp: ret.createdAt.toISOString(),
      });
    });

    unreadSupplierMessages.forEach((msg) => {
      notifications.push({
        id: `smsg_${msg.id}`,
        type: "message",
        title: "Supplier Message",
        message: `${msg.supplier?.name || msg.supplierName || "Supplier"}: ${msg.subject}`,
        href: `/admin/messages`,
        severity: "info",
        timestamp: msg.createdAt.toISOString(),
      });
    });

    unreadPrescriptions.forEach((pm) => {
      notifications.push({
        id: `rx_${pm.id}`,
        type: "prescription",
        title: "New Patient Prescription",
        message: `${pm.customer?.name || "Patient"} (${pm.customer?.phone || ""}) ${pm.fileName ? `uploaded ${pm.fileName}` : "submitted an order request"}.`,
        href: `/admin/pos?rxCustomerId=${pm.customerId}&rxMessageId=${pm.id}`,
        severity: "warning",
        timestamp: pm.createdAt.toISOString(),
      });
    });

    return NextResponse.json({
      success: true,
      totalCount: notifications.length,
      notifications,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

