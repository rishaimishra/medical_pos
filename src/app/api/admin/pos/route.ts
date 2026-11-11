import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, hasPermission } from "@/lib/rbac";
import { logAudit, getClientIp } from "@/lib/audit";
import { sendCustomerInvoiceReceiptEmail } from "@/lib/emailReceipt";

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
// POST: Atomic POS Sale Finalization (MODULE 2.5 & 2.6)
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
      splitPayments,
      items,
      discountAmount = 0,
      discountPercent,
      discountId,
      branchId,
      upiRef,
      chequeNo,
      chequeBank,
      chequeDate,
      cashTendered,
      tenderedAmount,
      doctorName,
      doctorRegNo,
      managerApprovedBy,
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Cart items are required for checkout" },
        { status: 400 }
      );
    }

    // Multi-Branch Security & IDOR Isolation Check (Module 2.1.3 & 2.6.1)
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

    // Generate formatted invoice number DRX-YYYY-00001 (Module 2.13.2)
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
      const preparedLines: any[] = [];

      // 1. MODULE 2.6.1 & 2.6.5: Validate each batch & calculate inclusive line totals BEFORE discounts
      for (const item of items) {
        const batch = await tx.batch.findUnique({
          where: { id: item.batchId },
          include: { medicine: true },
        });

        if (!batch) {
          throw new Error(`Batch ID ${item.batchId} not found in inventory`);
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

        // Deduct batch quantity (Module 2.6.2)
        const oldQty = batch.quantity;
        const newQty = oldQty - item.quantity;

        await tx.batch.update({
          where: { id: batch.id },
          data: { quantity: newQty },
        });

        // Write immutable stock_adjustments entry (Module 2.6.2)
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
            userId: currentUserId,
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

      // 2. MODULE 2.6.5: Order-of-Calculation for Bill-Level Discount (Bug Avoidance)
      // Inclusive totals computed FIRST from lines above, then bill discounts evaluated
      let billDiscount = 0;
      let appliedDiscountId: number | null = null;

      if (discountId) {
        // Master discount path
        const dId = parseInt(discountId, 10);
        const discountPolicy = await tx.discount.findUnique({ where: { id: dId } });
        if (!discountPolicy || !discountPolicy.active) {
          throw new Error("Specified discount policy is inactive or does not exist");
        }
        if (subtotal < Number(discountPolicy.minAmount)) {
          throw new Error(
            `Minimum purchase of ₹${Number(discountPolicy.minAmount).toFixed(2)} required for '${discountPolicy.name}' policy`
          );
        }
        if (discountPolicy.type === "percent") {
          billDiscount = (subtotal * Number(discountPolicy.value)) / 100;
        } else {
          billDiscount = Number(discountPolicy.value);
        }
        appliedDiscountId = discountPolicy.id;
      } else if (discountPercent !== undefined && discountPercent !== null && discountPercent !== "") {
        // Custom-% path: Subtotal is already computed, resolving legacy $inclTotal undefined bug
        const pct = Math.max(0, Math.min(100, Number(discountPercent)));
        billDiscount = (subtotal * pct) / 100;
      } else {
        // Flat discount amount path
        billDiscount = Math.max(0, Number(discountAmount || 0));
      }

      billDiscount = Math.min(subtotal, billDiscount);
      const effectiveBillPct = subtotal > 0 ? (billDiscount / subtotal) * 100 : 0;

      if (effectiveBillPct > cashierMaxDiscount + 0.01 && !canApplyHighDiscount && !managerApprovedBy && !body.managerApprovedBy) {
        throw new Error(
          `Permission Denied: Bill discount of ${effectiveBillPct.toFixed(1)}% exceeds cashier limit (${cashierMaxDiscount}%) without manager authorization`
        );
      }

      const grandTotal = Math.round(Math.max(0, subtotal - billDiscount) * 100) / 100;
      const combinedTotalDiscount = totalItemDiscounts + billDiscount;

      // 3. MODULE 2.5.1: Multi-Tender Split Payment Validation & Customer Credit Checks
      let parsedSplits: any = null;
      let effectiveUpiRef = upiRef || null;
      let effectiveChequeNo = chequeNo || null;
      let effectiveChequeBank = chequeBank || null;
      let effectiveChequeDate = chequeDate ? new Date(chequeDate) : null;

      if (paymentMethod === "split") {
        if (!splitPayments || typeof splitPayments !== "object") {
          throw new Error("Split payment breakdown is required when paymentMethod is 'split'");
        }

        const cashPart = Number(splitPayments.cash || 0);
        const upiPart = Number(splitPayments.upi || 0);
        const cardPart = Number(splitPayments.card || 0);
        const chequePart = Number(splitPayments.cheque || 0);
        const creditPart = Number(splitPayments.credit || 0);

        const totalSplitAllocated = cashPart + upiPart + cardPart + chequePart + creditPart;
        if (totalSplitAllocated < grandTotal - 0.01) {
          throw new Error(
            `Split payment allocation (₹${totalSplitAllocated.toFixed(2)}) is less than grand total (₹${grandTotal.toFixed(2)})`
          );
        }

        if (chequePart > 0 && (!chequeNo || !chequeBank)) {
          throw new Error("Cheque Number and Bank Name are required for cheque split portion");
        }

        if (creditPart > 0) {
          if (!custId) {
            throw new Error("A registered customer is required to allocate Store Credit (Baki Khata)");
          }

          const cust = await tx.customer.findUnique({
            where: { id: custId },
            include: {
              sales: { where: { paymentMethod: { in: ["credit", "split"] } }, select: { grandTotal: true } },
              payments: { select: { amount: true } },
            },
          });

          if (!cust) {
            throw new Error("Selected customer not found for credit allocation");
          }

          const creditLimit = Number(cust.creditLimit);
          if (creditLimit <= 0) {
            throw new Error(`Customer '${cust.name}' has no approved credit limit`);
          }

          const totalCreditSales = cust.sales.reduce((sum, s) => sum + Number(s.grandTotal), 0);
          const totalPaid = cust.payments.reduce((sum, p) => sum + Number(p.amount), 0);
          const currentDue = Math.max(0, totalCreditSales - totalPaid);

          if (currentDue + creditPart > creditLimit) {
            throw new Error(
              `Credit limit exceeded for ${cust.name}: Approved limit is ₹${creditLimit.toFixed(2)}, current outstanding due is ₹${currentDue.toFixed(2)}. Credit split of ₹${creditPart.toFixed(2)} exceeds limit.`
            );
          }
        }

        parsedSplits = {
          cash: cashPart,
          upi: upiPart,
          card: cardPart,
          cheque: chequePart,
          credit: creditPart,
        };

        if (upiPart > 0 && upiRef) effectiveUpiRef = upiRef;
        if (chequePart > 0) {
          effectiveChequeNo = chequeNo || null;
          effectiveChequeBank = chequeBank || null;
          effectiveChequeDate = chequeDate ? new Date(chequeDate) : null;
        }
      } else if (paymentMethod === "credit" && custId) {
        // Single Tender Credit Check
        const cust = await tx.customer.findUnique({
          where: { id: custId },
          include: {
            sales: { where: { paymentMethod: { in: ["credit", "split"] } }, select: { grandTotal: true } },
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

      // 4. Create Sale Master Header (Module 2.6.3)
      const newSale = await tx.sale.create({
        data: {
          invoiceNo,
          customerId: custId,
          saleDate: new Date(),
          totalAmount: subtotal,
          gstAmount: totalGst,
          discountAmount: combinedTotalDiscount,
          discountId: appliedDiscountId,
          grandTotal,
          paymentMethod,
          upiRef: effectiveUpiRef,
          chequeNo: effectiveChequeNo,
          chequeBank: effectiveChequeBank,
          chequeDate: effectiveChequeDate,
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

      // 5. MODULE 2.6.4: Customer Purchase Log Entry
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

      return {
        sale: newSale,
        splitPayments: parsedSplits,
      };
    });

    const finalSale = saleResult.sale;
    const splitPaymentsData = saleResult.splitPayments;

    // Calculate change due if cash tendered was supplied
    const effectiveCashTendered = Number(
      body.splitPayments?.cashTendered ||
      cashTendered ||
      tenderedAmount ||
      (paymentMethod === "cash" ? finalSale.grandTotal : Number(splitPaymentsData?.cash || 0))
    );
    const cashPortion = paymentMethod === "cash" ? Number(finalSale.grandTotal) : Number(splitPaymentsData?.cash || 0);
    const changeDue = Math.max(0, effectiveCashTendered - cashPortion);

    // Audit log (Module 2.6.2)
    await logAudit({
      action: "INVOICE_CREATED",
      entity: "Sale",
      entityId: finalSale.id,
      userId: currentUserId,
      branchId: effectiveBranchId || undefined,
      ipAddress: getClientIp(req as any),
      details: {
        invoiceNo: finalSale.invoiceNo,
        grandTotal: finalSale.grandTotal,
        paymentMethod,
        splitPayments: splitPaymentsData,
        itemsCount: items.length,
        cashTendered: effectiveCashTendered,
        changeDue,
      },
    });

    // 6. MODULE 2.6.4: Asynchronous Email Receipt Dispatch (Non-blocking for POS speed)
    let emailReceiptSent = false;
    if (finalSale.customer?.email) {
      emailReceiptSent = true;
      prisma.settings.findFirst().then((storeSettings) => {
        sendCustomerInvoiceReceiptEmail({
          toEmail: finalSale.customer!.email!,
          customerName: finalSale.customer!.name,
          invoiceNo: finalSale.invoiceNo,
          saleDate: finalSale.saleDate,
          storeName: finalSale.branch?.name || storeSettings?.storeName || "DRxStore Pharmacy",
          storeAddress: finalSale.branch?.address || storeSettings?.storeAddress || "",
          storePhone: finalSale.branch?.phone || storeSettings?.storePhone || "",
          storeGst: finalSale.branch?.gstNo || storeSettings?.storeGst || "",
          storeDl: finalSale.branch?.dlNo || storeSettings?.storeDl || "",
          paymentMethod,
          splitDetails: splitPaymentsData || undefined,
          upiRef: finalSale.upiRef,
          chequeNo: finalSale.chequeNo,
          doctorName: finalSale.doctorName,
          items: finalSale.items.map((i) => ({
            name: i.medicine.name,
            batchNo: i.batch.batchNo,
            expiryDate: i.batch.expiryDate,
            quantity: i.quantity,
            mrp: Number(i.mrp),
            price: Number(i.price),
          })),
          subtotal: Number(finalSale.totalAmount),
          discountAmount: Number(finalSale.discountAmount),
          gstAmount: Number(finalSale.gstAmount),
          grandTotal: Number(finalSale.grandTotal),
        }).catch((err) => {
          console.error("Non-blocking receipt email dispatch error:", err);
        });
      }).catch((err) => {
        console.error("Failed to prepare receipt email settings:", err);
      });
    }

    // Determine if cash drawer kick should be requested (Module 2.5.2)
    const shouldKickDrawer =
      paymentMethod === "cash" || (paymentMethod === "split" && (splitPaymentsData?.cash || 0) > 0);

    return NextResponse.json({
      success: true,
      sale: {
        ...finalSale,
        splitPayments: splitPaymentsData,
        cashTendered: effectiveCashTendered,
        changeDue,
      },
      kickCashDrawer: shouldKickDrawer,
      emailReceiptSent,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Checkout failed and rolled back" },
      { status: 400 }
    );
  }
}
