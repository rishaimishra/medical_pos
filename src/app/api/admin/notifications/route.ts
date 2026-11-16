import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const userStoreId = auth.session.storeId;
  const userBranchId = auth.session.branchId;

  try {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAhead = new Date(todayMidnight.getTime() + 30 * 24 * 60 * 60 * 1000);

    const branchFilter = userBranchId ? { branchId: userBranchId } : {};

    // 1. Critical expiring batches (<= 30 days)
    const expiringBatches = await prisma.batch.findMany({
      where: {
        quantity: { gt: 0 },
        expiryDate: { gt: todayMidnight, lte: thirtyDaysAhead },
        ...branchFilter,
      },
      include: {
        medicine: { select: { name: true } },
      },
      orderBy: { expiryDate: "asc" },
      take: 5,
    });

    // 2. Out of stock or low stock batches
    const lowStockBatches = await prisma.batch.findMany({
      where: {
        quantity: { lte: 10 },
        ...branchFilter,
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
        ...branchFilter,
      },
      include: {
        supplier: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // 4. Overdue Chronic Patient Refills
    const overdueRefills = await prisma.customer.findMany({
      where: {
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

    const notifications: Array<{
      id: string;
      type: "expiry" | "stock" | "po" | "refill";
      title: string;
      message: string;
      href: string;
      severity: "danger" | "warning" | "info";
      timestamp: string;
    }> = [];

    expiringBatches.forEach((b) => {
      const days = Math.ceil((new Date(b.expiryDate).getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
      notifications.push({
        id: `exp_${b.id}`,
        type: "expiry",
        title: "Drug Expiring Soon",
        message: `${b.medicine.name} (Batch: ${b.batchNo}) expires in ${days} day(s). Qty: ${b.quantity}`,
        href: `/admin/batches?tier=critical_30`,
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

