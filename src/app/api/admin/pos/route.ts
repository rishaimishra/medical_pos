import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, hasPermission } from "@/lib/rbac";
import { logAudit, getClientIp } from "@/lib/audit";

// ─────────────────────────────────────────────────────────────────────────────
// GET: POS Bootstrapping Data (Settings, Discounts, Today's Metrics)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const branchParam = searchParams.get("branchId");
  const requestedBranchId = branchParam && branchParam !== "all" ? parseInt(branchParam, 10) : null;
  const targetBranchId = auth.session.branchId ? auth.session.branchId : requestedBranchId;

  if (targetBranchId && !canAccessBranch(auth.session, targetBranchId)) {
    return NextResponse.json(
      { success: false, message: "Unauthorized branch access" },
      { status: 403 }
    );
  }

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const branchFilter = targetBranchId ? { branchId: targetBranchId } : {};

    const [settings, branch, discounts, todaySales] = await Promise.all([
      prisma.settings.findFirst({ orderBy: { id: "asc" } }),
      targetBranchId
        ? prisma.branch.findUnique({
            where: { id: targetBranchId },
            select: { id: true, code: true, name: true, phone: true, address: true, gstNo: true, dlNo: true },
          })
        : null,
      prisma.discount.findMany({
        where: { active: true },
        orderBy: { value: "asc" },
      }),
      prisma.sale.findMany({
        where: {
          saleDate: { gte: todayStart },
          ...branchFilter,
        },
        select: { grandTotal: true },
      }),
    ]);

    const todayCount = todaySales.length;
    const todayRevenue = todaySales.reduce((acc, s) => acc + Number(s.grandTotal || 0), 0);

    return NextResponse.json({
      success: true,
      store: {
        name: branch?.name || settings?.storeName || "DRxStore Pharmacy",
        address: branch?.address || settings?.storeAddress || "",
        phone: branch?.phone || settings?.storePhone || "",
        dlNo: branch?.dlNo || settings?.storeDl || "",
        gstNo: branch?.gstNo || settings?.storeGst || "",
        email: settings?.storeEmail || "",
        currency: settings?.currency || "₹",
        upiId: "drxstore@upi",
      },
      branch,
      discounts: discounts.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        value: Number(d.value),
        minAmount: Number(d.minAmount),
      })),
      todayMetrics: {
        salesCount: todayCount,
        totalRevenue: todayRevenue,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to load POS settings" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST: Atomic POS Sale Finalization
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest | Request) {
  const auth = await verifyAdminRequest(req as any);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const currentUserId = auth.session.userId;

  try {
    const body = await req.json();
    const {
      customerId,
      paymentMethod = "cash",
      items,
      discountAmount = 0,
      discountId,
      branchId,
      upiRef,
      chequeNo,
      chequeBank,
      chequeDate,
      doctorName,
      doctorRegNo,
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Cart items are required for checkout" },
        { status: 400 }
      );
    }

    // Multi-Branch Security & IDOR Isolation Check (Module 2.1.3)
    const requestedBranchId = branchId ? parseInt(branchId, 10) : null;
    if (requestedBranchId !== null && !canAccessBranch(auth.session, requestedBranchId)) {
      return NextResponse.json(
        { success: false, error: "Security Violation: You are not authorized to bill from this store branch" },
        { status: 403 }
      );
    }

    const effectiveBranchId = auth.session.branchId ? auth.session.branchId : requestedBranchId;

    const custId = customerId ? parseInt(customerId, 10) : null;
    if (paymentMethod === "credit" && !custId) {
      return NextResponse.json(
        { success: false, error: "Customer selection is required for Credit / Baki Khata sales" },
        { status: 400 }
      );
    }

    // Generate formatted invoice number DRX-YYYY-00001
    const currentYear = new Date().getFullYear();
    const invoicePrefix = `DRX-${currentYear}-`;
    const lastSale = await prisma.sale.findFirst({
      where: { invoiceNo: { startsWith: invoicePrefix } },
      orderBy: { id: "desc" },
    });

    let nextNumber = 1;
    if (lastSale?.invoiceNo) {
      const parts = lastSale.invoiceNo.split("-");
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) nextNumber = lastSeq + 1;
    }
    const invoiceNo = `${invoicePrefix}${String(nextNumber).padStart(5, "0")}`;

    // Staff discount permissions check (Module 2.4.2)
    const cashierMaxDiscount = auth.session.maxDiscountPercent ?? (auth.session.role === "admin" ? 100 : 10);
    const canApplyHighDiscount =
      auth.session.role === "admin" ||
      auth.session.role === "manager" ||
      hasPermission(auth.session, "apply_high_discount");

    // Execute atomic checkout transaction
    const saleResult = await runInTransaction(async (tx) => {
      let subtotal = 0;
      let totalItemDiscounts = 0;
      let totalGst = 0;
      const preparedLines = [];

      // 1. Validate each batch, stock, expiry, and item-level discount atomically
      for (const item of items) {
        const batch = await tx.batch.findUnique({
          where: { id: item.batchId },
          include: { medicine: true },
        });

        if (!batch) {
          throw new Error(`Batch ID ${item.batchId} not found`);
        }

        if (effectiveBranchId && batch.branchId && batch.branchId !== effectiveBranchId) {
          throw new Error(`Batch ${batch.batchNo} does not belong to the active store branch`);
        }

        const now = new Date();
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (new Date(batch.expiryDate) <= todayMidnight) {
          throw new Error(
            `Safety Violation: Cannot sell expired drug batch ${batch.batchNo} (Expired: ${new Date(batch.expiryDate).toLocaleDateString()})`
          );
        }

        if (batch.quantity < item.quantity) {
          throw new Error(
            `Insufficient stock for ${batch.medicine.name} (Batch: ${batch.batchNo}). Available: ${batch.quantity}, Requested: ${item.quantity}`
          );
        }

        const gstPercent = Number(batch.medicine.gstPercent || 12);
        const unitMrp = Number(batch.mrp);
        const lineGross = unitMrp * item.quantity;

        // Item-level discount calculation & cashier limit check (Module 2.4.2)
        const lineDiscount = Math.min(
          lineGross,
          Number(item.discountAmount || item.itemDiscountAmount || (item.discountPercent ? (lineGross * item.discountPercent) / 100 : 0))
        );
        const effectiveLinePct = lineGross > 0 ? (lineDiscount / lineGross) * 100 : 0;

        if (effectiveLinePct > cashierMaxDiscount + 0.01 && !canApplyHighDiscount && !item.managerApprovedBy) {
          throw new Error(
            `Permission Denied: Item discount of ${effectiveLinePct.toFixed(1)}% on ${batch.medicine.name} exceeds cashier limit (${cashierMaxDiscount}%) without manager authorization`
          );
        }

        const lineNet = Math.max(0, lineGross - lineDiscount);
        const taxableBase = lineNet / (1 + gstPercent / 100);
        const gstAmount = lineNet - taxableBase;

        subtotal += lineNet;
        totalItemDiscounts += lineDiscount;
        totalGst += gstAmount;

        // Deduct batch quantity
        const oldQty = batch.quantity;
        const newQty = oldQty - item.quantity;

        await tx.batch.update({
          where: { id: batch.id },
          data: { quantity: newQty },
        });

        // Write immutable stock_adjustments entry
        await tx.stockAdjustment.create({
          data: {
            batchId: batch.id,
            medicineId: batch.medicineId,
            branchId: batch.branchId || effectiveBranchId || null,
            type: "sale",
            quantity: -item.quantity,
            reason: `Sale: ${invoiceNo}`,
            oldQty,
            newQty,
          },
        });

        preparedLines.push({
          medicineId: batch.medicineId,
          batchId: batch.id,
          quantity: item.quantity,
          mrp: unitMrp,
          taxableBase,
          gstPercent,
          gstAmount,
          price: lineNet,
        });
      }

      // Bill-level discount validation (Module 2.4.2)
      const billDiscount = Math.min(subtotal, Number(discountAmount || 0));
      const effectiveBillPct = subtotal > 0 ? (billDiscount / subtotal) * 100 : 0;

      if (effectiveBillPct > cashierMaxDiscount + 0.01 && !canApplyHighDiscount && !body.managerApprovedBy) {
        throw new Error(
          `Permission Denied: Bill discount of ${effectiveBillPct.toFixed(1)}% exceeds cashier limit (${cashierMaxDiscount}%) without manager authorization`
        );
      }

      const grandTotal = Math.max(0, subtotal - billDiscount);
      const combinedTotalDiscount = totalItemDiscounts + billDiscount;

      // 2. Enforce Baki Khata Credit Limit
      if (paymentMethod === "credit" && custId) {
        const cust = await tx.customer.findUnique({
          where: { id: custId },
          include: {
            sales: { where: { paymentMethod: "credit" }, select: { grandTotal: true } },
            payments: { select: { amount: true } },
          },
        });

        if (!cust) {
          throw new Error("Selected customer not found for credit sale");
        }

        const creditLimit = Number(cust.creditLimit);
        if (creditLimit <= 0) {
          throw new Error(
            `Customer '${cust.name}' has no approved credit limit. Credit billing cannot proceed.`
          );
        }

        const totalCreditSales = cust.sales.reduce((sum, s) => sum + Number(s.grandTotal), 0);
        const totalPaid = cust.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const currentDue = Math.max(0, totalCreditSales - totalPaid);

        if (currentDue + grandTotal > creditLimit) {
          throw new Error(
            `Credit limit exceeded for ${cust.name}: Approved limit is ₹${creditLimit.toFixed(2)}, current outstanding due is ₹${currentDue.toFixed(2)}. This sale of ₹${grandTotal.toFixed(2)} exceeds limit.`
          );
        }
      }

      // 3. Create Sale header
      const newSale = await tx.sale.create({
        data: {
          invoiceNo,
          customerId: custId,
          saleDate: new Date(),
          totalAmount: subtotal,
          gstAmount: totalGst,
          discountAmount: combinedTotalDiscount,
          discountId: discountId ? parseInt(discountId, 10) : null,
          grandTotal,
          paymentMethod,
          upiRef: paymentMethod === "upi" ? upiRef : null,
          chequeNo: paymentMethod === "cheque" ? chequeNo : null,
          chequeBank: paymentMethod === "cheque" ? chequeBank : null,
          chequeDate: paymentMethod === "cheque" && chequeDate ? new Date(chequeDate) : null,
          doctorName: doctorName || null,
          doctorRegNo: doctorRegNo || null,
          createdBy: currentUserId,
          branchId: effectiveBranchId,
          items: {
            create: preparedLines,
          },
        },
        include: {
          items: {
            include: {
              medicine: {
                select: { id: true, name: true, genericName: true, company: true, hsnCode: true },
              },
              batch: {
                select: { id: true, batchNo: true, expiryDate: true },
              },
            },
          },
          customer: {
            select: { id: true, name: true, phone: true, email: true, address: true },
          },
          branch: {
            select: { id: true, name: true, code: true, address: true, phone: true, gstNo: true, dlNo: true },
          },
        },
      });

      // 4. Write customer purchase log if registered customer
      if (custId) {
        await tx.customerPurchaseLog.create({
          data: {
            customerId: custId,
            saleId: newSale.id,
            amount: grandTotal,
            date: new Date(),
          },
        });
      }

      return newSale;
    });

    // Audit log
    await logAudit({
      action: "INVOICE_CREATED",
      entity: "Sale",
      entityId: saleResult.id,
      userId: currentUserId,
      branchId: effectiveBranchId || undefined,
      ipAddress: getClientIp(req as any),
      details: {
        invoiceNo: saleResult.invoiceNo,
        grandTotal: saleResult.grandTotal,
        paymentMethod,
        itemsCount: items.length,
      },
    });

    return NextResponse.json({
      success: true,
      sale: saleResult,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Checkout failed and rolled back" },
      { status: 400 }
    );
  }
}
