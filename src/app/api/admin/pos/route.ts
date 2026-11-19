import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { verifyAdminRequest, verifyDiscountOverrideToken } from "@/lib/auth";
import { canAccessBranch, canAccessPage, getEffectiveMaxDiscount, hasPermission } from "@/lib/rbac";
import { getTodayMidnightUtc } from "@/lib/config";
import { logAudit, getClientIp } from "@/lib/audit";
import { sendCustomerInvoiceReceiptEmail } from "@/lib/emailReceipt";
import { checkStoreQuota, requireStoreFeature } from "@/lib/entitlements";

// ─────────────────────────────────────────────────────────────────────────────
// GET: POS Bootstrapping Data (Settings, Discounts, Today's Metrics)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }
  if (!canAccessPage(auth.session, "/admin/pos")) {
    return NextResponse.json({ success: false, message: "Forbidden: POS access denied" }, { status: 403 });
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

    const branchFilter = targetBranchId
      ? { branchId: targetBranchId }
      : auth.session.storeId
      ? { branch: { storeId: auth.session.storeId } }
      : {};
    const storeId = auth.session.storeId;

    const [settings, branch, discounts, todaySales] = await Promise.all([
      storeId
        ? prisma.settings.findUnique({ where: { id: storeId } })
        : prisma.settings.findFirst({ orderBy: { id: "asc" } }),
      targetBranchId
        ? prisma.branch.findUnique({
            where: { id: targetBranchId },
            select: { id: true, storeId: true, code: true, name: true, phone: true, address: true, gstNo: true, dlNo: true },
          })
        : null,
      prisma.discount.findMany({
        where: {
          active: true,
          ...(storeId ? { OR: [{ storeId }, { storeId: null }] } : {}),
        },
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

    if (branch && storeId && branch.storeId && branch.storeId !== storeId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized branch access" },
        { status: 403 }
      );
    }

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
  if (!canAccessPage(auth.session, "/admin/pos")) {
    return NextResponse.json({ success: false, error: "Forbidden: POS access denied" }, { status: 403 });
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
      cardAuthCode,
      cardLast4,
      chequeNo,
      chequeBank,
      chequeDate,
      cashTendered,
      tenderedAmount,
      doctorName,
      doctorRegNo,
      managerApprovedBy,
      managerOverrideToken,
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Cart items are required for checkout" },
        { status: 400 }
      );
    }

    const ALLOWED_PAYMENT_METHODS = new Set(["cash", "upi", "card", "cheque", "credit", "split"]);
    if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
      return NextResponse.json(
        { success: false, error: `Unsupported payment method: '${paymentMethod}'` },
        { status: 400 }
      );
    }

    if (paymentMethod === "cheque" && (!chequeNo || !String(chequeNo).trim() || !chequeBank || !String(chequeBank).trim())) {
      return NextResponse.json(
        { success: false, error: "Cheque Number and Bank Name are required for Cheque payment" },
        { status: 400 }
      );
    }

    // Multi-Branch Security & IDOR Isolation Check (Module 2.1.3 & 2.6.1)
    const requestedBranchId =
      branchId !== undefined && branchId !== null && branchId !== ""
        ? parseInt(String(branchId), 10)
        : null;
    if (requestedBranchId !== null && isNaN(requestedBranchId)) {
      return NextResponse.json({ success: false, error: "Invalid branchId" }, { status: 400 });
    }
    if (requestedBranchId !== null && !canAccessBranch(auth.session, requestedBranchId)) {
      return NextResponse.json(
        { success: false, error: "Security Violation: You are not authorized to bill from this store branch" },
        { status: 403 }
      );
    }

    const effectiveBranchId = auth.session.branchId ? auth.session.branchId : requestedBranchId;
    const storeId = auth.session.storeId ?? null;

    // SaaS Lifecycle & Monthly Invoice Quota Gate (3.6.3 & 3.6.4)
    const posGate = await requireStoreFeature(storeId, "posBilling");
    if (!posGate.allowed) return posGate.response!;

    const posQuota = await checkStoreQuota(storeId, "maxMonthlyInvoices", { isPosCheckout: true });
    if (!posQuota.allowed) return posQuota.response!;

    const usesCredit =
      paymentMethod === "credit" ||
      (paymentMethod === "split" && Number(splitPayments?.credit || 0) > 0);
    if (usesCredit) {
      const creditGate = await requireStoreFeature(storeId, "bakiKhataCreditLedger");
      if (!creditGate.allowed) return creditGate.response!;
    }

    const custId =
      customerId !== undefined && customerId !== null && customerId !== ""
        ? parseInt(String(customerId), 10)
        : null;
    if (custId !== null && isNaN(custId)) {
      return NextResponse.json({ success: false, error: "Invalid customerId" }, { status: 400 });
    }
    if (paymentMethod === "credit" && !custId) {
      return NextResponse.json(
        { success: false, error: "Customer selection is required for Credit / Baki Khata sales" },
        { status: 400 }
      );
    }

    // Staff discount permissions check (Module 2.4.2)
    const cashierMaxDiscount = auth.session.maxDiscountPercent ?? (auth.session.role === "admin" ? 100 : 10);
    const canApplyHighDiscount =
      auth.session.role === "admin" ||
      auth.session.role === "manager" ||
      hasPermission(auth.session, "apply_high_discount");

    const verifyOverrideAuthorization = async (
      tx: any,
      token: string | undefined | null,
      approvedByName: string | undefined | null,
      requestedPct: number
    ): Promise<boolean> => {
      if (token) {
        const verified = verifyDiscountOverrideToken(token);
        if (!verified) return false;
        if (storeId && verified.storeId && verified.storeId !== storeId) return false;
        if (verified.cashierId !== currentUserId) return false;
        if (requestedPct > verified.maxApprovedPercent + 0.01) return false;
        return true;
      }
      if (approvedByName && typeof approvedByName === "string" && approvedByName.trim()) {
        const cleanName = approvedByName.trim();
        const mgr = await tx.user.findFirst({
          where: {
            active: true,
            ...(storeId ? { storeId } : {}),
            OR: [
              { name: { equals: cleanName, mode: "insensitive" } },
              { username: { equals: cleanName, mode: "insensitive" } },
            ],
          },
        });
        if (!mgr) return false;
        const mgrRole = (mgr.role || "").toLowerCase();
        const mgrCanOverride =
          mgrRole === "admin" ||
          mgrRole === "manager" ||
          hasPermission({ role: mgrRole, permissions: mgr.permissions, branchId: mgr.branchId }, "apply_high_discount");
        if (!mgrCanOverride) return false;
        const mgrMax = getEffectiveMaxDiscount(mgrRole, mgr.permissions);
        if (requestedPct > mgrMax + 0.01) return false;
        return true;
      }
      return false;
    };

    const currentYear = new Date().getFullYear();
    const invoicePrefix = `DRX-${currentYear}-`;

    // Execute atomic checkout transaction
    const saleResult = await runInTransaction(async (tx) => {
      // Serialize sequential invoice numbering inside PostgreSQL transaction to avoid P2002 collisions
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026001)`;
      const lastSale = await tx.sale.findFirst({
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

      let grossSubtotal = 0;
      let subtotal = 0;
      let totalItemDiscounts = 0;
      let hasItemOverride = false;
      const preparedLines: any[] = [];

      // 1. MODULE 2.6.1 & 2.6.5: Validate each batch & calculate inclusive line totals BEFORE bill discounts
      for (const item of items) {
        const qty = Number(item.quantity);
        if (!item.batchId || !Number.isInteger(qty) || qty <= 0) {
          throw new Error(`Invalid quantity (${item.quantity}) for batch ${item.batchId}`);
        }

        const batch = await tx.batch.findUnique({
          where: { id: Number(item.batchId) },
          include: {
            medicine: true,
            branch: { select: { id: true, storeId: true } },
          },
        });

        if (!batch) {
          throw new Error(`Batch ID ${item.batchId} not found in inventory`);
        }

        if (storeId && batch.branch?.storeId && batch.branch.storeId !== storeId) {
          throw new Error(`Security Violation: Batch ${batch.batchNo} belongs to another store`);
        }

        if (effectiveBranchId && batch.branchId !== effectiveBranchId) {
          throw new Error(`Batch ${batch.batchNo} does not belong to the active store branch`);
        }

        const todayMidnight = getTodayMidnightUtc();
        if (new Date(batch.expiryDate) <= todayMidnight) {
          throw new Error(
            `Safety Violation: Cannot sell expired drug batch ${batch.batchNo} (Expired: ${new Date(batch.expiryDate).toLocaleDateString()})`
          );
        }

        if (batch.quantity < qty) {
          throw new Error(
            `Insufficient stock for ${batch.medicine.name} (Batch: ${batch.batchNo}). Available: ${batch.quantity}, Requested: ${qty}`
          );
        }

        const gstPercent = Number(batch.medicine.gstPercent || 12);
        const unitMrp = Number(batch.mrp);
        const lineGross = unitMrp * qty;

        // Item-level discount validation & calculation (Module 2.4.2)
        const rawAmt = item.discountAmount ?? item.itemDiscountAmount;
        const rawPct = item.discountPercent;
        if ((rawAmt !== undefined && Number(rawAmt) < 0) || (rawPct !== undefined && Number(rawPct) < 0)) {
          throw new Error(`Negative discount is not permitted on ${batch.medicine.name}`);
        }
        const computedItemDisc =
          rawAmt !== undefined && rawAmt !== null
            ? Number(rawAmt)
            : rawPct !== undefined && rawPct !== null
            ? (lineGross * Number(rawPct)) / 100
            : 0;
        if (!Number.isFinite(computedItemDisc)) {
          throw new Error(`Invalid item discount for ${batch.medicine.name}`);
        }
        const lineDiscount = Math.min(lineGross, Math.max(0, computedItemDisc));
        const effectiveLinePct = lineGross > 0 ? (lineDiscount / lineGross) * 100 : 0;

        if (effectiveLinePct > cashierMaxDiscount + 0.01 && !canApplyHighDiscount) {
          const itemOk = await verifyOverrideAuthorization(
            tx,
            item.managerOverrideToken,
            item.managerApprovedBy,
            effectiveLinePct
          );
          if (!itemOk) {
            throw new Error(
              `Permission Denied: Item discount of ${effectiveLinePct.toFixed(1)}% on ${batch.medicine.name} exceeds cashier limit (${cashierMaxDiscount}%) without valid manager authorization`
            );
          }
          hasItemOverride = true;
        }

        const lineNet = Math.max(0, lineGross - lineDiscount);

        grossSubtotal += lineGross;
        subtotal += lineNet;
        totalItemDiscounts += lineDiscount;

        // Deduct batch quantity (Module 2.6.2)
        const oldQty = batch.quantity;
        const newQty = oldQty - qty;

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
            quantity: -qty,
            reason: `Sale: ${invoiceNo}`,
            oldQty,
            newQty,
            userId: currentUserId,
          },
        });

        preparedLines.push({
          medicineId: batch.medicineId,
          batchId: batch.id,
          quantity: qty,
          mrp: unitMrp,
          gstPercent,
          lineNet,
        });
      }

      // 2. MODULE 2.6.5: Order-of-Calculation for Bill-Level Discount (Bug Avoidance)
      // Inclusive totals computed FIRST from lines above, then bill discounts evaluated
      let billDiscount = 0;
      let appliedDiscountId: number | null = null;

      if (discountId) {
        // Master discount path
        const dId = parseInt(String(discountId), 10);
        if (isNaN(dId)) {
          throw new Error("Invalid discount policy ID");
        }
        const discountPolicy = await tx.discount.findUnique({ where: { id: dId } });
        if (!discountPolicy || !discountPolicy.active) {
          throw new Error("Specified discount policy is inactive or does not exist");
        }
        if (storeId && discountPolicy.storeId && discountPolicy.storeId !== storeId) {
          throw new Error("Specified discount policy does not belong to this store");
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
        const rawBillPct = Number(discountPercent);
        if (!Number.isFinite(rawBillPct) || rawBillPct < 0) {
          throw new Error("Bill discount percentage cannot be negative");
        }
        const pct = Math.max(0, Math.min(100, rawBillPct));
        billDiscount = (subtotal * pct) / 100;
      } else {
        const rawFlat = Number(discountAmount || 0);
        if (!Number.isFinite(rawFlat) || rawFlat < 0) {
          throw new Error("Bill discount amount cannot be negative");
        }
        billDiscount = Math.max(0, rawFlat);
      }

      billDiscount = Math.min(subtotal, billDiscount);
      const effectiveBillPct = subtotal > 0 ? (billDiscount / subtotal) * 100 : 0;

      const grandTotal = Math.round(Math.max(0, subtotal - billDiscount) * 100) / 100;
      const combinedTotalDiscount = Math.round((totalItemDiscounts + billDiscount) * 100) / 100;
      const combinedEffectivePct = grossSubtotal > 0 ? (combinedTotalDiscount / grossSubtotal) * 100 : 0;

      // Active Master Discount Policies are pre-approved by Admin/Manager; ad-hoc custom discounts check both bill-level & combined % against cashier ceiling
      if (!canApplyHighDiscount && appliedDiscountId === null) {
        if (effectiveBillPct > cashierMaxDiscount + 0.01) {
          const billOk = await verifyOverrideAuthorization(
            tx,
            managerOverrideToken,
            managerApprovedBy,
            Math.max(effectiveBillPct, combinedEffectivePct)
          );
          if (!billOk) {
            throw new Error(
              `Permission Denied: Bill discount of ${effectiveBillPct.toFixed(1)}% exceeds cashier limit (${cashierMaxDiscount}%) without valid manager authorization`
            );
          }
        } else if (
          billDiscount > 0 &&
          totalItemDiscounts > 0 &&
          combinedEffectivePct > cashierMaxDiscount + 0.01 &&
          !hasItemOverride
        ) {
          const combinedOk = await verifyOverrideAuthorization(
            tx,
            managerOverrideToken,
            managerApprovedBy,
            combinedEffectivePct
          );
          if (!combinedOk) {
            throw new Error(
              `Permission Denied: Combined item + bill discount of ${combinedEffectivePct.toFixed(1)}% exceeds cashier limit (${cashierMaxDiscount}%) without valid manager authorization`
            );
          }
        }
      }

      // Compute GST proportionally AFTER both item and bill discounts
      const billDiscountRatio = subtotal > 0 ? Math.max(0, subtotal - billDiscount) / subtotal : 0;
      let totalGst = 0;
      const finalizedSaleItems = preparedLines.map((line) => {
        const finalLineNet = line.lineNet * billDiscountRatio;
        const taxableBase = finalLineNet / (1 + line.gstPercent / 100);
        const gstAmount = finalLineNet - taxableBase;
        totalGst += gstAmount;
        return {
          medicineId: line.medicineId,
          batchId: line.batchId,
          quantity: line.quantity,
          mrp: line.mrp,
          taxableBase: Math.round(taxableBase * 100) / 100,
          gstPercent: line.gstPercent,
          gstAmount: Math.round(gstAmount * 100) / 100,
          price: Math.round(line.lineNet * 100) / 100,
        };
      });
      totalGst = Math.round(totalGst * 100) / 100;

      // 3. MODULE 2.5.1: Multi-Tender Split Payment Validation & Customer Credit Checks
      let parsedSplits: any = null;
      let creditAmount = 0;
      let effectiveUpiRef = upiRef || null;
      let effectiveCardAuth = cardAuthCode ? String(cardAuthCode).trim().slice(0, 100) : null;
      let effectiveCardLast4 = cardLast4 ? String(cardLast4).trim().slice(0, 4) : null;
      let effectiveChequeNo = chequeNo || null;
      let effectiveChequeBank = chequeBank || null;
      let effectiveChequeDate: Date | null = null;
      if (chequeDate) {
        const parsedDate = new Date(chequeDate);
        if (isNaN(parsedDate.getTime())) {
          throw new Error("Invalid cheque date");
        }
        effectiveChequeDate = parsedDate;
      }

      const computeCustomerDue = (
        sales: Array<{ paymentMethod: string; grandTotal: any; creditAmount: any }>,
        payments: Array<{ amount: any }>
      ) => {
        const totalCreditSales = sales.reduce((sum, s) => {
          const cAmt = Number(s.creditAmount || 0);
          if (cAmt > 0) return sum + cAmt;
          return s.paymentMethod === "credit" ? sum + Number(s.grandTotal) : sum;
        }, 0);
        const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
        return Math.max(0, totalCreditSales - totalPaid);
      };

      if (paymentMethod === "split") {
        if (!splitPayments || typeof splitPayments !== "object") {
          throw new Error("Split payment breakdown is required when paymentMethod is 'split'");
        }

        const cashPart = Number(splitPayments.cash || 0);
        const upiPart = Number(splitPayments.upi || 0);
        const cardPart = Number(splitPayments.card || 0);
        const chequePart = Number(splitPayments.cheque || 0);
        const creditPart = Number(splitPayments.credit || 0);

        if (
          ![cashPart, upiPart, cardPart, chequePart, creditPart].every(
            (v) => Number.isFinite(v) && v >= 0
          )
        ) {
          throw new Error("Split payment amounts must be valid non-negative numbers");
        }

        const totalSplitAllocated = cashPart + upiPart + cardPart + chequePart + creditPart;
        if (totalSplitAllocated < grandTotal - 0.01) {
          throw new Error(
            `Split payment allocation (₹${totalSplitAllocated.toFixed(2)}) is less than grand total (₹${grandTotal.toFixed(2)})`
          );
        }
        if (totalSplitAllocated > grandTotal + 0.01) {
          throw new Error(
            `Split payment allocation (₹${totalSplitAllocated.toFixed(2)}) exceeds grand total (₹${grandTotal.toFixed(2)})`
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
              sales: {
                where: { OR: [{ paymentMethod: "credit" }, { creditAmount: { gt: 0 } }] },
                select: { paymentMethod: true, grandTotal: true, creditAmount: true },
              },
              payments: { select: { amount: true } },
            },
          });

          if (!cust) {
            throw new Error("Selected customer not found for credit allocation");
          }
          if (!cust.active) {
            throw new Error(`Customer '${cust.name}' account is deactivated`);
          }

          const creditLimit = Number(cust.creditLimit);
          if (creditLimit <= 0) {
            throw new Error(`Customer '${cust.name}' has no approved credit limit`);
          }

          const currentDue = computeCustomerDue(cust.sales, cust.payments);

          if (currentDue + creditPart > creditLimit) {
            throw new Error(
              `Credit limit exceeded for ${cust.name}: Approved limit is ₹${creditLimit.toFixed(2)}, current outstanding due is ₹${currentDue.toFixed(2)}. Credit split of ₹${creditPart.toFixed(2)} exceeds limit.`
            );
          }

          creditAmount = Math.min(grandTotal, creditPart);
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
        }
      } else if (paymentMethod === "credit" && custId) {
        // Single Tender Credit Check
        const cust = await tx.customer.findUnique({
          where: { id: custId },
          include: {
            sales: {
              where: { OR: [{ paymentMethod: "credit" }, { creditAmount: { gt: 0 } }] },
              select: { paymentMethod: true, grandTotal: true, creditAmount: true },
            },
            payments: { select: { amount: true } },
          },
        });

        if (!cust) {
          throw new Error("Selected customer not found for credit sale");
        }
        if (!cust.active) {
          throw new Error(`Customer '${cust.name}' account is deactivated`);
        }

        const creditLimit = Number(cust.creditLimit);
        if (creditLimit <= 0) {
          throw new Error(
            `Customer '${cust.name}' has no approved credit limit. Credit billing cannot proceed.`
          );
        }

        const currentDue = computeCustomerDue(cust.sales, cust.payments);

        if (currentDue + grandTotal > creditLimit) {
          throw new Error(
            `Credit limit exceeded for ${cust.name}: Approved limit is ₹${creditLimit.toFixed(2)}, current outstanding due is ₹${currentDue.toFixed(2)}. This sale of ₹${grandTotal.toFixed(2)} exceeds limit.`
          );
        }

        creditAmount = grandTotal;
      }

      // Validate active customer if customerId is attached to any sale
      if (custId && paymentMethod !== "credit") {
        const attachedCust = await tx.customer.findUnique({
          where: { id: custId },
          select: { id: true, name: true, active: true },
        });
        if (!attachedCust) {
          throw new Error("Selected customer not found");
        }
        if (!attachedCust.active) {
          throw new Error(`Customer '${attachedCust.name}' account is deactivated`);
        }
      }

      // Compute cash tendered / change due and validate against shortfall if explicitly provided
      const rawProvidedCash =
        paymentMethod === "split"
          ? splitPayments?.cashTendered
          : cashTendered !== undefined && cashTendered !== null
          ? cashTendered
          : tenderedAmount;

      const cashPortion =
        paymentMethod === "cash"
          ? grandTotal
          : paymentMethod === "split"
          ? Number(parsedSplits?.cash || 0)
          : 0;

      let effectiveCashTendered = cashPortion;
      if (rawProvidedCash !== undefined && rawProvidedCash !== null && rawProvidedCash !== "") {
        const numCash = Number(rawProvidedCash);
        if (!Number.isFinite(numCash) || numCash < 0) {
          throw new Error("Invalid cash tendered amount");
        }
        if (cashPortion > 0 && numCash < cashPortion - 0.01) {
          throw new Error(
            `Cash tendered (₹${numCash.toFixed(2)}) is less than cash due (₹${cashPortion.toFixed(2)})`
          );
        }
        effectiveCashTendered = numCash;
      }
      const changeDue = Math.max(0, Math.round((effectiveCashTendered - cashPortion) * 100) / 100);

      // 4. Create Sale Master Header (Module 2.6.3)
      const newSale = await tx.sale.create({
        data: {
          invoiceNo,
          customerId: custId,
          saleDate: new Date(),
          totalAmount: Math.round(grossSubtotal * 100) / 100,
          gstAmount: totalGst,
          discountAmount: combinedTotalDiscount,
          discountId: appliedDiscountId,
          grandTotal,
          paymentMethod,
          splitDetails: parsedSplits
            ? JSON.stringify({ ...parsedSplits, cashTendered: effectiveCashTendered, changeDue })
            : null,
          creditAmount,
          cardAuthCode: effectiveCardAuth,
          cardLast4: effectiveCardLast4,
          upiRef: effectiveUpiRef,
          chequeNo: effectiveChequeNo,
          chequeBank: effectiveChequeBank,
          chequeDate: effectiveChequeDate,
          doctorName: doctorName || null,
          doctorRegNo: doctorRegNo || null,
          createdBy: currentUserId,
          branchId: effectiveBranchId,
          items: {
            create: finalizedSaleItems,
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
        effectiveCashTendered,
        changeDue,
      };
    });

    const finalSale = saleResult.sale;
    const splitPaymentsData = saleResult.splitPayments;
    const effectiveCashTendered = saleResult.effectiveCashTendered;
    const changeDue = saleResult.changeDue;

    const storeSettings = storeId
      ? await prisma.settings.findUnique({ where: { id: storeId } }).catch(() => null)
      : await prisma.settings.findFirst({ orderBy: { id: "asc" } }).catch(() => null);

    // Audit log (Module 2.6.2)
    await logAudit({
      storeId,
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
    let emailReceiptQueued = false;
    const hasEmailProvider = Boolean(
      (process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.startsWith("SG.")) ||
        (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
    );
    if (finalSale.customer?.email) {
      emailReceiptQueued = true;
      emailReceiptSent = hasEmailProvider;
      sendCustomerInvoiceReceiptEmail({
        toEmail: finalSale.customer.email,
        customerName: finalSale.customer.name,
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
    }

    // Determine if cash drawer kick should be requested (Module 2.5.2)
    const shouldKickDrawer =
      paymentMethod === "cash" || (paymentMethod === "split" && (splitPaymentsData?.cash || 0) > 0);

    const res = NextResponse.json({
      success: true,
      sale: {
        ...finalSale,
        splitPayments: splitPaymentsData,
        cashTendered: effectiveCashTendered,
        changeDue,
        store: storeSettings
          ? {
              name: storeSettings.storeName,
              address: storeSettings.storeAddress,
              phone: storeSettings.storePhone,
              gstNo: storeSettings.storeGst,
              dlNo: storeSettings.storeDl,
            }
          : null,
      },
      kickCashDrawer: shouldKickDrawer,
      emailReceiptSent,
      emailReceiptQueued,
    });
    if (posQuota.warningHeader) {
      res.headers.set("X-Quota-Warning", posQuota.warningHeader);
    }
    return res;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Checkout failed and rolled back" },
      { status: 400 }
    );
  }
}
