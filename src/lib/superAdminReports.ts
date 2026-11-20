import fs from "fs";
import path from "path";
import { prisma } from "./prisma";
import { getBatchPurchaseCost } from "./reports";
import { PRESCRIPTION_STORAGE_DIR } from "./prescriptionFiles";
import {
  normalizeMonthlyMrr,
  parseCustomFeaturesJson,
  parseCustomLimitsJson,
  parseFeaturesJson,
} from "./saasFeatures";

export interface CeoReportFilters {
  startDate?: string | null;
  endDate?: string | null;
  state?: string | null;
  city?: string | null;
  planCode?: string | null;
  storeId?: number | null;
  branchId?: number | null;
  sortBy?: string | null;
}

function getFileSizeSafe(filePath?: string | null): number {
  if (!filePath) return 0;
  try {
    const fp = path.resolve(PRESCRIPTION_STORAGE_DIR, path.basename(filePath));
    if (fp.startsWith(PRESCRIPTION_STORAGE_DIR + path.sep) && fs.existsSync(fp)) {
      return fs.statSync(fp).size;
    }
  } catch {
    // ignore missing file on disk
  }
  return 0;
}

function toMonthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(year: number, monthZeroIdx: number): string {
  return new Date(Date.UTC(year, monthZeroIdx, 1)).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * MODULE 3.9: Shared CEO Executive BI Engine powering both `/api/super-admin/reports`
 * and `/api/super-admin/reports/export` (multi-sheet `.xlsx` & CSV).
 */
export async function queryCeoBiReports(filters: CeoReportFilters = {}) {
  const now = new Date();
  const todayMidnightUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const endBound = filters.endDate
    ? new Date(`${filters.endDate}T23:59:59.999Z`)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const startBound = filters.startDate
    ? new Date(`${filters.startDate}T00:00:00.000Z`)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29, 0, 0, 0));

  const spanMs = Math.max(86_400_000, endBound.getTime() - startBound.getTime());
  const prevEnd = new Date(startBound.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs);

  const monthStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const twelveMonthsAgoStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1, 0, 0, 0));

  const [
    platformCfg,
    stores,
    branches,
    plans,
    subscriptions,
    allPayments,
    salesInPeriod,
    prevSales,
    saleItemsInPeriod,
    returnsInPeriod,
    expensesInPeriod,
    batches,
    medGroups,
    custGroups,
    supGroups,
    userGroups,
    monthlySalesByBranch,
    rxFiles,
    poInPeriod,
    supMsgGroups,
    supPayments,
    custPayments,
    creditSales,
    closingGroups,
    discountGroups,
  ] = await Promise.all([
    prisma.platformConfig.findFirst({ orderBy: { id: "asc" } }),
    prisma.settings.findMany({
      where: { OR: [{ setupDone: true }, { branches: { some: {} } }] },
      orderBy: { id: "asc" },
      select: {
        id: true,
        storeName: true,
        storeStatus: true,
        storeGst: true,
        storeDl: true,
        storeEmail: true,
        ownerName: true,
        ownerEmail: true,
        city: true,
        state: true,
        setupDone: true,
        createdAt: true,
      },
    }),
    prisma.branch.findMany({
      orderBy: [{ storeId: "asc" }, { isMain: "desc" }, { id: "asc" }],
      select: {
        id: true,
        storeId: true,
        code: true,
        name: true,
        gstNo: true,
        dlNo: true,
        isMain: true,
        active: true,
      },
    }),
    prisma.subscriptionPlan.findMany({
      orderBy: [{ sortOrder: "asc" }, { priceInr: "asc" }],
    }),
    prisma.storeSubscription.findMany({
      orderBy: [{ id: "asc" }],
      include: { plan: true },
    }),
    prisma.subscriptionPayment.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        store: { select: { id: true, storeName: true, storeGst: true } },
        plan: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.sale.findMany({
      where: { saleDate: { gte: startBound, lte: endBound } },
      select: {
        id: true,
        branchId: true,
        grandTotal: true,
        paymentMethod: true,
        splitDetails: true,
        creditAmount: true,
        doctorName: true,
        saleDate: true,
      },
    }),
    prisma.sale.findMany({
      where: { saleDate: { gte: prevStart, lte: prevEnd } },
      select: { branchId: true, grandTotal: true },
    }),
    prisma.saleItem.findMany({
      where: { sale: { saleDate: { gte: startBound, lte: endBound } } },
      select: {
        saleId: true,
        medicineId: true,
        batchId: true,
        quantity: true,
        price: true,
        sale: { select: { branchId: true, doctorName: true } },
        medicine: { select: { scheduleType: true, storeId: true } },
        batch: { select: { purchasePrice: true, mrp: true } },
      },
    }),
    prisma.return.findMany({
      where: { status: "processed", createdAt: { gte: startBound, lte: endBound } },
      select: {
        id: true,
        branchId: true,
        refundAmount: true,
        items: {
          select: {
            quantity: true,
            restockAction: true,
            batch: { select: { purchasePrice: true, mrp: true } },
          },
        },
      },
    }),
    prisma.expense.findMany({
      where: { expenseDate: { gte: startBound, lte: endBound } },
      select: { storeId: true, branchId: true, type: true, amount: true },
    }),
    prisma.batch.findMany({
      select: {
        id: true,
        medicineId: true,
        branchId: true,
        quantity: true,
        purchasePrice: true,
        mrp: true,
        expiryDate: true,
        createdAt: true,
        medicine: { select: { storeId: true } },
      },
    }),
    prisma.medicine.groupBy({
      by: ["storeId"],
      where: { storeId: { not: null } },
      _count: { _all: true },
    }),
    prisma.customer.groupBy({
      by: ["storeId"],
      where: { storeId: { not: null } },
      _count: { _all: true },
    }),
    prisma.supplier.groupBy({
      by: ["storeId"],
      where: { storeId: { not: null } },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["storeId"],
      where: { storeId: { not: null }, active: true },
      _count: { _all: true },
    }),
    prisma.sale.groupBy({
      by: ["branchId"],
      where: { branchId: { not: null }, saleDate: { gte: monthStartUtc } },
      _count: { _all: true },
    }),
    prisma.patientMessage.findMany({
      select: {
        storeId: true,
        filePath: true,
        customer: { select: { storeId: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      select: {
        id: true,
        supplierId: true,
        branchId: true,
        status: true,
        total: true,
        supplier: { select: { storeId: true } },
        branch: { select: { storeId: true } },
      },
    }),
    prisma.supplierMessage.groupBy({
      by: ["storeId"],
      where: { storeId: { not: null } },
      _count: { _all: true },
    }),
    prisma.supplierPayment.findMany({
      select: { supplierId: true, branchId: true, amount: true, supplier: { select: { storeId: true } } },
    }),
    prisma.customerPayment.findMany({
      select: { customerId: true, branchId: true, amount: true, customer: { select: { storeId: true } } },
    }),
    prisma.sale.findMany({
      where: { OR: [{ paymentMethod: "credit" }, { creditAmount: { gt: 0 } }] },
      select: {
        id: true,
        customerId: true,
        branchId: true,
        paymentMethod: true,
        grandTotal: true,
        creditAmount: true,
        branch: { select: { storeId: true } },
      },
    }),
    prisma.cashDrawerClosing.groupBy({
      by: ["storeId"],
      where: { storeId: { not: null } },
      _count: { _all: true },
    }),
    prisma.discount.groupBy({
      by: ["storeId"],
      where: { storeId: { not: null }, active: true },
      _count: { _all: true },
    }),
  ]);

  // Last sale date per batch (for 60/90/180d dead stock identification)
  const batchLastSold = await prisma.saleItem.groupBy({
    by: ["batchId"],
    _max: { id: true },
  });
  const latestSaleByBatchDate = await prisma.saleItem.findMany({
    where: { id: { in: batchLastSold.map((b) => b._max.id!).filter(Boolean) } },
    select: { batchId: true, sale: { select: { saleDate: true } } },
  });
  const lastSaleDateByBatch = new Map<number, Date>();
  for (const row of latestSaleByBatchDate) {
    if (row.sale?.saleDate) lastSaleDateByBatch.set(row.batchId, row.sale.saleDate);
  }

  const branchMap = new Map(branches.map((b) => [b.id, b]));
  const storeMap = new Map(stores.map((s) => [s.id, s]));

  // Latest active/open/most-recent subscription per store
  const subsByStore = new Map<number, typeof subscriptions>();
  const latestSubByStore = new Map<number, (typeof subscriptions)[number]>();
  for (const s of subscriptions) {
    const arr = subsByStore.get(s.storeId) || [];
    arr.push(s);
    subsByStore.set(s.storeId, arr);
    latestSubByStore.set(s.storeId, s); // ascending order => last write wins (latest id)
  }

  // --------------------------------------------------------------------------
  // 3.9.1A: 12-Month Trailing MRR Movement Bridge & SaaS Revenue
  // --------------------------------------------------------------------------
  const mrrBridge12m: Array<{
    monthKey: string;
    label: string;
    newMrr: number;
    expansionMrr: number;
    churnedMrr: number;
    endingMrr: number;
    taxableRevenue: number;
    gstCollected: number;
    totalCollected: number;
    refundedAmount: number;
    netCollectedRevenue: number;
    paymentsCount: number;
  }> = [];

  for (let offset = 11; offset >= 0; offset--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const mStart = new Date(Date.UTC(y, m, 1, 0, 0, 0));
    const mEnd = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));

    let newMrr = 0;
    let expansionMrr = 0;
    let churnedMrr = 0;
    let endingMrr = 0;

    for (const [sId, list] of subsByStore.entries()) {
      if (!storeMap.has(sId)) continue;
      // Paid subscriptions ordered chronologically
      const paidList = list.filter((sub) => Number(sub.plan.priceInr) > 0);
      if (paidList.length === 0) continue;

      let activeMrrAtEnd = 0;
      for (let i = 0; i < paidList.length; i++) {
        const sub = paidList[i];
        const subMrr = normalizeMonthlyMrr(
          Number(sub.plan.priceInr),
          sub.plan.billingCycle,
          sub.plan.intervalCount
        );
        const startTs = sub.currentPeriodStart || sub.createdAt;
        const endTs = sub.currentPeriodEnd;
        const st = sub.status.toLowerCase();

        // Did this subscription start inside this month?
        if (startTs >= mStart && startTs <= mEnd && st !== "created") {
          const prevSub = i > 0 ? paidList[i - 1] : null;
          if (!prevSub) {
            newMrr += subMrr;
          } else {
            const prevMrr = normalizeMonthlyMrr(
              Number(prevSub.plan.priceInr),
              prevSub.plan.billingCycle,
              prevSub.plan.intervalCount
            );
            if (subMrr > prevMrr) expansionMrr += subMrr - prevMrr;
            else if (subMrr < prevMrr) churnedMrr += prevMrr - subMrr;
          }
        }

        // Did it churn / get cancelled / expire in this month without being superseded by a newer plan?
        const nextSub = i < paidList.length - 1 ? paidList[i + 1] : null;
        const nextStart = nextSub ? nextSub.currentPeriodStart || nextSub.createdAt : null;
        const isLastOrNotRenewed = i === paidList.length - 1;
        if (
          isLastOrNotRenewed &&
          ["cancelled", "expired", "suspended"].includes(st) &&
          (sub.cancelledAt || sub.updatedAt) >= mStart &&
          (sub.cancelledAt || sub.updatedAt) <= mEnd
        ) {
          churnedMrr += subMrr;
        }

        // Historical point-in-time month-end active check (preserves earlier months for upgraded/superseded plans)
        const terminatedBeforeEnd =
          (st === "cancelled" && (sub.cancelledAt || sub.updatedAt) <= mEnd) ||
          (st === "suspended" && sub.updatedAt <= mEnd) ||
          (st === "expired" && !nextSub && sub.updatedAt <= mEnd) ||
          Boolean(nextStart && nextStart <= mEnd);
        if (startTs <= mEnd && endTs >= mEnd && st !== "created" && !terminatedBeforeEnd) {
          activeMrrAtEnd = subMrr;
        }
      }
      endingMrr += activeMrrAtEnd;
    }

    let taxableRevenue = 0;
    let gstCollected = 0;
    let totalCollected = 0;
    let refundedAmount = 0;
    let paymentsCount = 0;

    for (const p of allPayments) {
      const ts = p.paidAt || p.createdAt;
      if (ts < mStart || ts > mEnd) continue;
      if (p.status === "captured") {
        taxableRevenue += Number(p.amountSubtotal);
        gstCollected += Number(p.gstAmount);
        totalCollected += Number(p.totalAmount);
        paymentsCount++;
      } else if (p.status === "refunded") {
        refundedAmount += Number(p.totalAmount);
      }
    }

    mrrBridge12m.push({
      monthKey: toMonthKey(mStart),
      label: monthLabel(y, m),
      newMrr: Math.round(newMrr * 100) / 100,
      expansionMrr: Math.round(expansionMrr * 100) / 100,
      churnedMrr: Math.round(churnedMrr * 100) / 100,
      endingMrr: Math.round(endingMrr * 100) / 100,
      taxableRevenue: Math.round(taxableRevenue * 100) / 100,
      gstCollected: Math.round(gstCollected * 100) / 100,
      totalCollected: Math.round(totalCollected * 100) / 100,
      refundedAmount: Math.round(refundedAmount * 100) / 100,
      netCollectedRevenue: Math.round((totalCollected - refundedAmount) * 100) / 100,
      paymentsCount,
    });
  }

  // --------------------------------------------------------------------------
  // 3.9.1B: Plan Tier Distribution & Conversion Analysis
  // --------------------------------------------------------------------------
  const totalCurrentMrr = Array.from(latestSubByStore.entries()).reduce((sum, [sId, sub]) => {
    if (!storeMap.has(sId)) return sum;
    const isOpen = sub.status === "active" && (!sub.currentPeriodEnd || sub.currentPeriodEnd >= now);
    if (!isOpen || Number(sub.plan.priceInr) <= 0) return sum;
    return sum + normalizeMonthlyMrr(Number(sub.plan.priceInr), sub.plan.billingCycle, sub.plan.intervalCount);
  }, 0);

  const planTierBreakdown = plans.map((plan) => {
    let subscriberCount = 0;
    let trialCount = 0;
    let tierMrr = 0;
    let tenureDaysSum = 0;
    let convertedFromTrial = 0;
    let everTrialOrPlan = 0;

    for (const [sId, list] of subsByStore.entries()) {
      if (!storeMap.has(sId)) continue;
      const latest = list[list.length - 1];
      if (!latest) continue;

      const hadThisPlan = list.some((s) => s.planId === plan.id);
      if (hadThisPlan) everTrialOrPlan++;

      if (latest.planId === plan.id) {
        const isNotExpired = !latest.currentPeriodEnd || latest.currentPeriodEnd >= now;
        if (latest.status === "active" && isNotExpired) {
          subscriberCount++;
          const m = normalizeMonthlyMrr(
            Number(plan.priceInr),
            plan.billingCycle,
            plan.intervalCount
          );
          tierMrr += m;
          const tenureDays = Math.max(
            1,
            Math.round((now.getTime() - latest.createdAt.getTime()) / 86_400_000)
          );
          tenureDaysSum += tenureDays;
          convertedFromTrial++;
        } else if (latest.status === "trialing" && isNotExpired) {
          trialCount++;
        }
      }
    }

    const totalActiveCount = subscriberCount + trialCount;
    return {
      planId: plan.id,
      code: plan.code,
      name: plan.name,
      billingCycle: plan.billingCycle,
      priceInr: Number(plan.priceInr),
      isActive: plan.isActive,
      subscriberCount,
      trialCount,
      mrr: Math.round(tierMrr * 100) / 100,
      mrrSharePct: totalCurrentMrr > 0 ? Math.round((tierMrr / totalCurrentMrr) * 1000) / 10 : 0,
      avgTenureDays: subscriberCount > 0 ? Math.round(tenureDaysSum / subscriberCount) : 0,
      conversionRatePct:
        everTrialOrPlan > 0 ? Math.round((convertedFromTrial / everTrialOrPlan) * 1000) / 10 : 0,
      totalActiveCount,
    };
  });

  // --------------------------------------------------------------------------
  // 3.9.1C: Razorpay Settlement & SaaS Tax Liability Summary (SAC 998314)
  // --------------------------------------------------------------------------
  const periodPayments = allPayments.filter((p) => {
    const ts = p.paidAt || p.createdAt;
    return ts >= startBound && ts <= endBound;
  });

  let taxCapturedSubtotal = 0;
  let taxCapturedGst = 0;
  let taxCapturedTotal = 0;
  let taxRefundedSubtotal = 0;
  let taxRefundedGst = 0;
  let taxRefundedTotal = 0;
  let capturedCount = 0;
  let refundedCount = 0;
  let failedCount = 0;
  let razorpayCapturedTotal = 0;
  let offlineCapturedTotal = 0;
  const byMethodMap = new Map<string, { method: string; count: number; total: number }>();

  for (const p of periodPayments) {
    if (p.status === "captured") {
      capturedCount++;
      taxCapturedSubtotal += Number(p.amountSubtotal);
      taxCapturedGst += Number(p.gstAmount);
      taxCapturedTotal += Number(p.totalAmount);
      if (p.paymentType === "manual_offline") offlineCapturedTotal += Number(p.totalAmount);
      else razorpayCapturedTotal += Number(p.totalAmount);
      const m = (p.paymentMethod || "razorpay").toUpperCase();
      const prev = byMethodMap.get(m) || { method: m, count: 0, total: 0 };
      prev.count++;
      prev.total += Number(p.totalAmount);
      byMethodMap.set(m, prev);
    } else if (p.status === "refunded") {
      refundedCount++;
      taxRefundedSubtotal += Number(p.amountSubtotal);
      taxRefundedGst += Number(p.gstAmount);
      taxRefundedTotal += Number(p.totalAmount);
    } else if (p.status === "failed") {
      failedCount++;
    }
  }

  const netTaxableLiability = Math.round((taxCapturedSubtotal - taxRefundedSubtotal) * 100) / 100;
  const netGstLiability = Math.round((taxCapturedGst - taxRefundedGst) * 100) / 100;

  const taxSummary = {
    sacCode: platformCfg?.sacCode || "998314",
    gstNo: platformCfg?.gstNo || null,
    legalEntityName: platformCfg?.legalEntityName || "Medical POS SaaS Pvt. Ltd.",
    gstRatePct: 18,
    periodTaxableSales: Math.round(taxCapturedSubtotal * 100) / 100,
    periodGstCollected: Math.round(taxCapturedGst * 100) / 100,
    periodRefundsTotal: Math.round(taxRefundedTotal * 100) / 100,
    netTaxableLiability,
    netGstLiability,
    netTotalCollected: Math.round((taxCapturedTotal - taxRefundedTotal) * 100) / 100,
    cgstOutput: Math.round((netGstLiability / 2) * 100) / 100,
    sgstOutput: Math.round((netGstLiability / 2) * 100) / 100,
    capturedCount,
    refundedCount,
    failedCount,
    razorpayCapturedTotal: Math.round(razorpayCapturedTotal * 100) / 100,
    offlineCapturedTotal: Math.round(offlineCapturedTotal * 100) / 100,
    byMethod: Array.from(byMethodMap.values()).map((r) => ({
      ...r,
      total: Math.round(r.total * 100) / 100,
    })),
  };

  // --------------------------------------------------------------------------
  // 3.9.2 & 3.9.3 Aggregation Maps Across Branches and Stores
  // --------------------------------------------------------------------------
  const medCountByStore = new Map<number, number>();
  medGroups.forEach((g) => g.storeId && medCountByStore.set(g.storeId, g._count._all));
  const custCountByStore = new Map<number, number>();
  custGroups.forEach((g) => g.storeId && custCountByStore.set(g.storeId, g._count._all));
  const supCountByStore = new Map<number, number>();
  supGroups.forEach((g) => g.storeId && supCountByStore.set(g.storeId, g._count._all));
  const staffCountByStore = new Map<number, number>();
  userGroups.forEach((g) => g.storeId && staffCountByStore.set(g.storeId, g._count._all));
  const closingCountByStore = new Map<number, number>();
  closingGroups.forEach((g) => g.storeId && closingCountByStore.set(g.storeId, g._count._all));
  const discCountByStore = new Map<number, number>();
  discountGroups.forEach((g) => g.storeId && discCountByStore.set(g.storeId, g._count._all));
  const supMsgByStore = new Map<number, number>();
  supMsgGroups.forEach((g) => g.storeId && supMsgByStore.set(g.storeId, g._count._all));

  const monthlyInvoicesByStore = new Map<number, number>();
  monthlySalesByBranch.forEach((row) => {
    const br = row.branchId ? branchMap.get(row.branchId) : null;
    if (br?.storeId) {
      monthlyInvoicesByStore.set(br.storeId, (monthlyInvoicesByStore.get(br.storeId) || 0) + row._count._all);
    }
  });

  // Inventory valuation, expiry & dead stock per branch/store
  const thirtyAhead = new Date(todayMidnightUtc.getTime() + 30 * 86_400_000);
  const ninetyAhead = new Date(todayMidnightUtc.getTime() + 90 * 86_400_000);
  const dead60Cutoff = new Date(now.getTime() - 60 * 86_400_000);
  const dead90Cutoff = new Date(now.getTime() - 90 * 86_400_000);
  const dead180Cutoff = new Date(now.getTime() - 180 * 86_400_000);

  const filterBranchIdForCalc =
    filters.branchId && !isNaN(filters.branchId) ? filters.branchId : null;

  const stockValByBranch = new Map<number, number>();
  const branchInventoryRisk = new Map<
    number,
    {
      expiredValue: number;
      expiredCount: number;
      expiring30d: number;
      expiring90d: number;
      dead60: number;
      dead90: number;
      dead180: number;
    }
  >();
  const batchCountByStore = new Map<number, number>();
  const storeInventoryRisk = new Map<
    number,
    {
      stockValue: number;
      expiredValue: number;
      expiredCount: number;
      expiring30d: number;
      expiring90d: number;
      dead60: number;
      dead90: number;
      dead180: number;
    }
  >();

  for (const b of batches) {
    const br = b.branchId ? branchMap.get(b.branchId) : null;
    const sId = br?.storeId ?? b.medicine?.storeId ?? null;
    const cost = getBatchPurchaseCost(b, b.mrp);
    const qty = Math.max(0, b.quantity);
    const val = cost * qty;
    const isExpired = qty > 0 && b.expiryDate <= todayMidnightUtc;
    const isExp30 = qty > 0 && !isExpired && b.expiryDate <= thirtyAhead;
    const isExp90 = qty > 0 && !isExpired && !isExp30 && b.expiryDate <= ninetyAhead;
    const refActivity = lastSaleDateByBatch.get(b.id) || b.createdAt;
    const isDead180 = qty > 0 && refActivity <= dead180Cutoff;
    const isDead90 = qty > 0 && refActivity <= dead90Cutoff;
    const isDead60 = qty > 0 && refActivity <= dead60Cutoff;

    if (b.branchId) {
      stockValByBranch.set(b.branchId, (stockValByBranch.get(b.branchId) || 0) + val);
      const brRisk = branchInventoryRisk.get(b.branchId) || {
        expiredValue: 0,
        expiredCount: 0,
        expiring30d: 0,
        expiring90d: 0,
        dead60: 0,
        dead90: 0,
        dead180: 0,
      };
      if (isExpired) {
        brRisk.expiredCount++;
        brRisk.expiredValue += val;
      } else if (isExp30) brRisk.expiring30d++;
      else if (isExp90) brRisk.expiring90d++;
      if (isDead180) brRisk.dead180++;
      if (isDead90) brRisk.dead90++;
      if (isDead60) brRisk.dead60++;
      branchInventoryRisk.set(b.branchId, brRisk);
    }

    if (filterBranchIdForCalc && b.branchId !== filterBranchIdForCalc) continue;

    if (sId) {
      batchCountByStore.set(sId, (batchCountByStore.get(sId) || 0) + 1);
      const r = storeInventoryRisk.get(sId) || {
        stockValue: 0,
        expiredValue: 0,
        expiredCount: 0,
        expiring30d: 0,
        expiring90d: 0,
        dead60: 0,
        dead90: 0,
        dead180: 0,
      };
      r.stockValue += val;
      if (isExpired) {
        r.expiredCount++;
        r.expiredValue += val;
      } else if (isExp30) {
        r.expiring30d++;
      } else if (isExp90) {
        r.expiring90d++;
      }
      if (isDead180) r.dead180++;
      if (isDead90) r.dead90++;
      if (isDead60) r.dead60++;
      storeInventoryRisk.set(sId, r);
    }
  }

  // Sales, COGS, Returns, Expenses & Schedule compliance per branch
  const branchPerf = new Map<
    number,
    {
      grossSales: number;
      prevSales: number;
      invoicesCount: number;
      refunds: number;
      cogs: number;
      expenses: number;
      incomes: number;
      cash: number;
      upi: number;
      card: number;
      credit: number;
      otherPay: number;
      scheduleTotal: number;
      scheduleWithDoc: number;
    }
  >();

  const ensureBranchPerf = (branchId: number) => {
    let rec = branchPerf.get(branchId);
    if (!rec) {
      rec = {
        grossSales: 0,
        prevSales: 0,
        invoicesCount: 0,
        refunds: 0,
        cogs: 0,
        expenses: 0,
        incomes: 0,
        cash: 0,
        upi: 0,
        card: 0,
        credit: 0,
        otherPay: 0,
        scheduleTotal: 0,
        scheduleWithDoc: 0,
      };
      branchPerf.set(branchId, rec);
    }
    return rec;
  };

  const invoiceCountByStoreInPeriod = new Map<number, number>();
  for (const s of salesInPeriod) {
    if (!s.branchId) continue;
    const rec = ensureBranchPerf(s.branchId);
    const grand = Number(s.grandTotal || 0);
    rec.grossSales += grand;
    rec.invoicesCount++;
    const pm = (s.paymentMethod || "cash").toLowerCase();
    if (pm === "cash") rec.cash += grand;
    else if (pm === "upi") rec.upi += grand;
    else if (pm === "card") rec.card += grand;
    else if (pm === "credit") rec.credit += grand;
    else if (pm === "split") {
      let sp: any = null;
      if (s.splitDetails) {
        try {
          sp = JSON.parse(s.splitDetails);
        } catch {
          sp = null;
        }
      }
      if (sp && typeof sp === "object") {
        const c = Number(sp.cash || 0);
        const u = Number(sp.upi || 0);
        const ca = Number(sp.card || 0);
        const cr = Number(sp.credit ?? s.creditAmount ?? 0);
        const ch = Number(sp.cheque || 0);
        rec.cash += c;
        rec.upi += u;
        rec.card += ca;
        rec.credit += cr;
        const allocated = c + u + ca + cr;
        rec.otherPay += Math.max(ch, Math.max(0, grand - allocated));
      } else {
        const cr = Number(s.creditAmount || 0);
        rec.credit += cr;
        rec.otherPay += Math.max(0, grand - cr);
      }
    } else rec.otherPay += grand;

    const br = branchMap.get(s.branchId);
    if (br?.storeId) {
      invoiceCountByStoreInPeriod.set(br.storeId, (invoiceCountByStoreInPeriod.get(br.storeId) || 0) + 1);
    }
  }

  for (const ps of prevSales) {
    if (!ps.branchId) continue;
    ensureBranchPerf(ps.branchId).prevSales += Number(ps.grandTotal || 0);
  }

  for (const si of saleItemsInPeriod) {
    const bId = si.sale?.branchId;
    if (bId) {
      const rec = ensureBranchPerf(bId);
      const unitCost = getBatchPurchaseCost(si.batch, si.batch?.mrp || 0);
      rec.cogs += unitCost * si.quantity;

      const sch = si.medicine?.scheduleType || "normal";
      if (["schedule_h", "schedule_h1", "schedule_x"].includes(sch)) {
        rec.scheduleTotal++;
        if (si.sale?.doctorName && si.sale.doctorName.trim().length > 0) {
          rec.scheduleWithDoc++;
        }
      }
    }
  }

  for (const r of returnsInPeriod) {
    if (!r.branchId) continue;
    const rec = ensureBranchPerf(r.branchId);
    rec.refunds += Number(r.refundAmount || 0);
    for (const ri of r.items) {
      if (ri.restockAction === "restock" && ri.batch) {
        rec.cogs = Math.max(0, rec.cogs - getBatchPurchaseCost(ri.batch, ri.batch.mrp) * ri.quantity);
      }
    }
  }

  // Store expenses fallback when branchId is null
  const storeOnlyExpenses = new Map<number, { expenses: number; incomes: number }>();
  for (const ex of expensesInPeriod) {
    const amt = Number(ex.amount || 0);
    if (ex.branchId) {
      const rec = ensureBranchPerf(ex.branchId);
      if (ex.type === "income") rec.incomes += amt;
      else rec.expenses += amt;
    } else if (ex.storeId) {
      const cur = storeOnlyExpenses.get(ex.storeId) || { expenses: 0, incomes: 0 };
      if (ex.type === "income") cur.incomes += amt;
      else cur.expenses += amt;
      storeOnlyExpenses.set(ex.storeId, cur);
    }
  }

  // Storage footprint & Portal activity
  const rxFootprintByStore = new Map<number, { files: number; bytes: number; totalMsgs: number }>();
  for (const msg of rxFiles) {
    const sId = msg.storeId ?? msg.customer?.storeId ?? null;
    if (!sId) continue;
    const cur = rxFootprintByStore.get(sId) || { files: 0, bytes: 0, totalMsgs: 0 };
    cur.totalMsgs++;
    if (msg.filePath) {
      cur.files++;
      cur.bytes += getFileSizeSafe(msg.filePath);
    }
    rxFootprintByStore.set(sId, cur);
  }

  const poCountByStore = new Map<number, number>();
  const supAccountPurchased = new Map<string, { storeId: number; amount: number }>();
  const supAccountPaid = new Map<string, number>();

  for (const po of poInPeriod) {
    if (filterBranchIdForCalc && po.branchId !== filterBranchIdForCalc) continue;
    const sId = po.branch?.storeId ?? po.supplier?.storeId ?? null;
    if (!sId) continue;
    poCountByStore.set(sId, (poCountByStore.get(sId) || 0) + 1);
    if (po.status !== "cancelled" && po.status !== "draft") {
      const key = `${sId}:${po.supplierId}`;
      const prev = supAccountPurchased.get(key) || { storeId: sId, amount: 0 };
      prev.amount += Number(po.total || 0);
      supAccountPurchased.set(key, prev);
    }
  }
  for (const sp of supPayments) {
    if (filterBranchIdForCalc && sp.branchId !== filterBranchIdForCalc) continue;
    const sId = sp.supplier?.storeId;
    if (!sId) continue;
    const key = `${sId}:${sp.supplierId}`;
    supAccountPaid.set(key, (supAccountPaid.get(key) || 0) + Number(sp.amount || 0));
  }
  const poPayableByStore = new Map<number, number>();
  for (const [key, entry] of supAccountPurchased.entries()) {
    const due = Math.max(0, entry.amount - (supAccountPaid.get(key) || 0));
    poPayableByStore.set(entry.storeId, (poPayableByStore.get(entry.storeId) || 0) + due);
  }

  const custAccountCredit = new Map<string, { storeId: number; amount: number }>();
  const custAccountPaid = new Map<string, number>();
  for (const cs of creditSales) {
    if (filterBranchIdForCalc && cs.branchId !== filterBranchIdForCalc) continue;
    const sId = cs.branch?.storeId;
    if (!sId) continue;
    const creditPortion =
      Number(cs.creditAmount || 0) > 0
        ? Number(cs.creditAmount)
        : cs.paymentMethod === "credit"
        ? Number(cs.grandTotal || 0)
        : 0;
    const key = `${sId}:${cs.customerId ? cs.customerId : `walkin_${cs.id}`}`;
    const prev = custAccountCredit.get(key) || { storeId: sId, amount: 0 };
    prev.amount += creditPortion;
    custAccountCredit.set(key, prev);
  }
  for (const cp of custPayments) {
    if (filterBranchIdForCalc && cp.branchId !== filterBranchIdForCalc) continue;
    const sId = cp.customer?.storeId;
    if (!sId) continue;
    const key = `${sId}:${cp.customerId}`;
    custAccountPaid.set(key, (custAccountPaid.get(key) || 0) + Number(cp.amount || 0));
  }
  const custBakiByStore = new Map<number, number>();
  for (const [key, entry] of custAccountCredit.entries()) {
    const due = Math.max(0, entry.amount - (custAccountPaid.get(key) || 0));
    custBakiByStore.set(entry.storeId, (custBakiByStore.get(entry.storeId) || 0) + due);
  }

  // --------------------------------------------------------------------------
  // Filter matching & Build Store / Branch Leaderboards + Consolidated P&L
  // --------------------------------------------------------------------------
  const stateFilter = (filters.state || "").trim().toLowerCase();
  const cityFilter = (filters.city || "").trim().toLowerCase();
  const planCodeFilter = (filters.planCode || "").trim().toUpperCase();
  const filterStoreId = filters.storeId && !isNaN(filters.storeId) ? filters.storeId : null;
  const filterBranchId = filters.branchId && !isNaN(filters.branchId) ? filters.branchId : null;

  const branchLeaderboard: any[] = [];
  const storeLeaderboard: any[] = [];
  const upsellAndChurnRows: any[] = [];

  const pnlTotals = {
    grossSales: 0,
    refunds: 0,
    netRevenue: 0,
    cogs: 0,
    grossProfit: 0,
    grossMarginPct: 0,
    operatingExpenses: 0,
    otherIncome: 0,
    netProfit: 0,
    invoicesCount: 0,
    paymentSplit: { cash: 0, upi: 0, card: 0, credit: 0, other: 0 },
  };

  for (const store of stores) {
    if (filterStoreId && store.id !== filterStoreId) continue;
    if (stateFilter && stateFilter !== "all" && (store.state || "").toLowerCase() !== stateFilter) continue;
    if (cityFilter && cityFilter !== "all" && (store.city || "").toLowerCase() !== cityFilter) continue;

    const sub = latestSubByStore.get(store.id);
    const planCode = sub?.plan?.code || "LEGACY";
    const planName = sub?.plan?.name || "Standard Workspace";
    if (planCodeFilter && planCodeFilter !== "ALL" && planCode.toUpperCase() !== planCodeFilter) continue;

    const storeBranches = branches.filter(
      (b) => b.storeId === store.id && (!filterBranchId || b.id === filterBranchId)
    );
    if (filterBranchId && storeBranches.length === 0) continue;

    let sGross = 0;
    let sPrevGross = 0;
    let sInvoices = 0;
    let sRefunds = 0;
    let sCogs = 0;
    let sExpenses = filterBranchId ? 0 : storeOnlyExpenses.get(store.id)?.expenses || 0;
    let sIncomes = filterBranchId ? 0 : storeOnlyExpenses.get(store.id)?.incomes || 0;
    let sCash = 0;
    let sUpi = 0;
    let sCard = 0;
    let sCredit = 0;
    let sOtherPay = 0;
    let sSchTotal = 0;
    let sSchDoc = 0;

    for (const br of storeBranches) {
      const bp = branchPerf.get(br.id);
      const brStock = stockValByBranch.get(br.id) || 0;
      const bGross = bp?.grossSales || 0;
      const bRefunds = bp?.refunds || 0;
      const bNet = Math.max(0, bGross - bRefunds);
      const bCogs = bp?.cogs || 0;
      const bGrossProfit = bNet - bCogs;
      const bExpenses = bp?.expenses || 0;
      const bNetProfit = bGrossProfit + (bp?.incomes || 0) - bExpenses;

      const hasGst = Boolean(br.gstNo || store.storeGst);
      const hasDl = Boolean(br.dlNo || store.storeDl);

      const brRisk = branchInventoryRisk.get(br.id);

      branchLeaderboard.push({
        branchId: br.id,
        branchCode: br.code,
        branchName: br.name,
        storeId: store.id,
        storeName: store.storeName || `Store #${store.id}`,
        city: store.city || null,
        state: store.state || null,
        isMain: br.isMain,
        active: br.active,
        hasGst,
        hasDl,
        complianceComplete: hasGst && hasDl,
        invoicesCount: bp?.invoicesCount || 0,
        grossSales: Math.round(bGross * 100) / 100,
        refunds: Math.round(bRefunds * 100) / 100,
        netRevenue: Math.round(bNet * 100) / 100,
        cogs: Math.round(bCogs * 100) / 100,
        grossMarginPct: bNet > 0 ? Math.round((bGrossProfit / bNet) * 1000) / 10 : 0,
        operatingExpenses: Math.round(bExpenses * 100) / 100,
        netProfit: Math.round(bNetProfit * 100) / 100,
        stockValue: Math.round(brStock * 100) / 100,
        expiredStockValue: Math.round((brRisk?.expiredValue || 0) * 100) / 100,
        expiredBatchesCount: brRisk?.expiredCount || 0,
        deadStock60dCount: brRisk?.dead60 || 0,
        deadStock90dCount: brRisk?.dead90 || 0,
        deadStock180dCount: brRisk?.dead180 || 0,
      });

      sGross += bGross;
      sPrevGross += bp?.prevSales || 0;
      sInvoices += bp?.invoicesCount || 0;
      sRefunds += bRefunds;
      sCogs += bCogs;
      sExpenses += bExpenses;
      sIncomes += bp?.incomes || 0;
      sCash += bp?.cash || 0;
      sUpi += bp?.upi || 0;
      sCard += bp?.card || 0;
      sCredit += bp?.credit || 0;
      sOtherPay += bp?.otherPay || 0;
      sSchTotal += bp?.scheduleTotal || 0;
      sSchDoc += bp?.scheduleWithDoc || 0;
    }

    const sNet = Math.max(0, sGross - sRefunds);
    const sGrossProfit = sNet - sCogs;
    const sNetProfit = sGrossProfit + sIncomes - sExpenses;
    const sGrowthPct =
      sPrevGross > 0 ? Math.round(((sGross - sPrevGross) / sPrevGross) * 1000) / 10 : sGross > 0 ? 100 : 0;

    const invRisk = storeInventoryRisk.get(store.id) || {
      stockValue: 0,
      expiredValue: 0,
      expiredCount: 0,
      expiring30d: 0,
      expiring90d: 0,
      dead60: 0,
      dead90: 0,
      dead180: 0,
    };
    const rxFoot = rxFootprintByStore.get(store.id) || { files: 0, bytes: 0, totalMsgs: 0 };
    const poCount = poCountByStore.get(store.id) || 0;
    const supMsgCount = supMsgByStore.get(store.id) || 0;

    // Portal Adoption Score (0–100): Supplier Portal usage (max 50) + Patient Portal Rx/Messages (max 50)
    const supplierPortalScore = Math.min(50, poCount * 10 + supMsgCount * 10);
    const patientPortalScore = Math.min(50, rxFoot.files * 15 + rxFoot.totalMsgs * 10);
    const portalAdoptionScore = Math.min(100, supplierPortalScore + patientPortalScore);

    const scheduleCompliancePct =
      sSchTotal > 0 ? Math.round((sSchDoc / sSchTotal) * 1000) / 10 : 100;

    const custBaki = Math.round((custBakiByStore.get(store.id) || 0) * 100) / 100;
    const supPayable = Math.round((poPayableByStore.get(store.id) || 0) * 100) / 100;

    const customLim = sub ? parseCustomLimitsJson(sub.customLimitsJson) : {};
    const usedBr = storeBranches.length;
    const usedStaff = staffCountByStore.get(store.id) || 0;
    const usedMeds = medCountByStore.get(store.id) || 0;
    const usedMonthlyInv = monthlyInvoicesByStore.get(store.id) || 0;
    const usedSup = supCountByStore.get(store.id) || 0;
    const usedCust = custCountByStore.get(store.id) || 0;

    const limBr = customLim.maxBranches ?? sub?.plan?.maxBranches ?? -1;
    const limStaff = customLim.maxStaffUsers ?? sub?.plan?.maxStaffUsers ?? -1;
    const limMeds = customLim.maxMedicines ?? sub?.plan?.maxMedicines ?? -1;
    const limInv = customLim.maxMonthlyInvoices ?? sub?.plan?.maxMonthlyInvoices ?? -1;
    const limSup = customLim.maxSuppliers ?? sub?.plan?.maxSuppliers ?? -1;
    const limCust = customLim.maxCustomers ?? sub?.plan?.maxCustomers ?? -1;

    const quotaTriggers: string[] = [];
    const checkQ = (lbl: string, u: number, l: number) => {
      if (l > 0 && u / l >= 0.8) quotaTriggers.push(`${lbl} ${u}/${l}`);
    };
    checkQ("Branches", usedBr, limBr);
    checkQ("Staff", usedStaff, limStaff);
    checkQ("Medicines", usedMeds, limMeds);
    checkQ("Monthly Bills", usedMonthlyInv, limInv);
    checkQ("Suppliers", usedSup, limSup);
    checkQ("Customers", usedCust, limCust);

    if (
      quotaTriggers.length > 0 ||
      store.storeStatus === "grace_period" ||
      store.storeStatus === "suspended"
    ) {
      upsellAndChurnRows.push({
        storeId: store.id,
        storeName: store.storeName || `Store #${store.id}`,
        storeStatus: store.storeStatus,
        planCode,
        planName,
        signalType: quotaTriggers.length > 0 ? "Upsell Lead (>=80%)" : "At-Risk / Grace",
        details:
          quotaTriggers.length > 0
            ? quotaTriggers.join(", ")
            : `Store status: ${store.storeStatus}`,
      });
    }

    storeLeaderboard.push({
      storeId: store.id,
      storeName: store.storeName || `Store #${store.id}`,
      city: store.city || null,
      state: store.state || null,
      storeStatus: store.storeStatus,
      planCode,
      planName,
      branchesCount: storeBranches.length,
      invoicesCount: sInvoices,
      grossRetailGmv: Math.round(sGross * 100) / 100,
      refundsTotal: Math.round(sRefunds * 100) / 100,
      netRevenue: Math.round(sNet * 100) / 100,
      avgBasketSize: sInvoices > 0 ? Math.round((sGross / sInvoices) * 100) / 100 : 0,
      cogs: Math.round(sCogs * 100) / 100,
      grossProfit: Math.round(sGrossProfit * 100) / 100,
      grossMarginPct: sNet > 0 ? Math.round((sGrossProfit / sNet) * 1000) / 10 : 0,
      operatingExpenses: Math.round(sExpenses * 100) / 100,
      otherIncome: Math.round(sIncomes * 100) / 100,
      netProfit: Math.round(sNetProfit * 100) / 100,
      paymentSplit: {
        cash: Math.round(sCash * 100) / 100,
        upi: Math.round(sUpi * 100) / 100,
        card: Math.round(sCard * 100) / 100,
        credit: Math.round(sCredit * 100) / 100,
        other: Math.round(sOtherPay * 100) / 100,
      },
      inventoryValuation: Math.round(invRisk.stockValue * 100) / 100,
      portalAdoptionScore,
      growthPct: sGrowthPct,
      expiredStockValue: Math.round(invRisk.expiredValue * 100) / 100,
      expiredBatchesCount: invRisk.expiredCount,
      expiring30dCount: invRisk.expiring30d,
      expiring90dCount: invRisk.expiring90d,
      deadStock60dCount: invRisk.dead60,
      deadStock90dCount: invRisk.dead90,
      deadStock180dCount: invRisk.dead180,
      scheduleDrugItemsSold: sSchTotal,
      scheduleWithDocCount: sSchDoc,
      scheduleCompliancePct,
      customerBakiDue: custBaki,
      supplierPayableDue: supPayable,
      quotaUsage: {
        branches: `${usedBr}/${limBr === -1 ? "∞" : limBr}`,
        staff: `${usedStaff}/${limStaff === -1 ? "∞" : limStaff}`,
        medicines: `${usedMeds}/${limMeds === -1 ? "∞" : limMeds}`,
        monthlyBills: `${usedMonthlyInv}/${limInv === -1 ? "∞" : limInv}`,
        suppliers: `${usedSup}/${limSup === -1 ? "∞" : limSup}`,
        customers: `${usedCust}/${limCust === -1 ? "∞" : limCust}`,
      },
    });

    pnlTotals.grossSales += sGross;
    pnlTotals.refunds += sRefunds;
    pnlTotals.netRevenue += sNet;
    pnlTotals.cogs += sCogs;
    pnlTotals.grossProfit += sGrossProfit;
    pnlTotals.operatingExpenses += sExpenses;
    pnlTotals.otherIncome += sIncomes;
    pnlTotals.netProfit += sNetProfit;
    pnlTotals.invoicesCount += sInvoices;
    pnlTotals.paymentSplit.cash += sCash;
    pnlTotals.paymentSplit.upi += sUpi;
    pnlTotals.paymentSplit.card += sCard;
    pnlTotals.paymentSplit.credit += sCredit;
    pnlTotals.paymentSplit.other += sOtherPay;
  }

  pnlTotals.grossSales = Math.round(pnlTotals.grossSales * 100) / 100;
  pnlTotals.refunds = Math.round(pnlTotals.refunds * 100) / 100;
  pnlTotals.netRevenue = Math.round(pnlTotals.netRevenue * 100) / 100;
  pnlTotals.cogs = Math.round(pnlTotals.cogs * 100) / 100;
  pnlTotals.grossProfit = Math.round(pnlTotals.grossProfit * 100) / 100;
  pnlTotals.grossMarginPct =
    pnlTotals.netRevenue > 0 ? Math.round((pnlTotals.grossProfit / pnlTotals.netRevenue) * 1000) / 10 : 0;
  pnlTotals.operatingExpenses = Math.round(pnlTotals.operatingExpenses * 100) / 100;
  pnlTotals.otherIncome = Math.round(pnlTotals.otherIncome * 100) / 100;
  pnlTotals.netProfit = Math.round(pnlTotals.netProfit * 100) / 100;
  pnlTotals.paymentSplit = {
    cash: Math.round(pnlTotals.paymentSplit.cash * 100) / 100,
    upi: Math.round(pnlTotals.paymentSplit.upi * 100) / 100,
    card: Math.round(pnlTotals.paymentSplit.card * 100) / 100,
    credit: Math.round(pnlTotals.paymentSplit.credit * 100) / 100,
    other: Math.round(pnlTotals.paymentSplit.other * 100) / 100,
  };

  // Sort Store Leaderboard
  const sortBy = (filters.sortBy || "gmv").toLowerCase();
  storeLeaderboard.sort((a, b) => {
    if (sortBy === "invoices") return b.invoicesCount - a.invoicesCount;
    if (sortBy === "profit") return b.netProfit - a.netProfit;
    if (sortBy === "stockvalue") return b.inventoryValuation - a.inventoryValuation;
    if (sortBy === "adoption") return b.portalAdoptionScore - a.portalAdoptionScore;
    if (sortBy === "growth") return b.growthPct - a.growthPct;
    return b.grossRetailGmv - a.grossRetailGmv;
  });
  branchLeaderboard.sort((a, b) => b.netRevenue - a.netRevenue);

  // Risk & Compliance Aggregate Summary (weighted H/H1 compliance across total dispensed schedule lines)
  const totalSchSoldAll = storeLeaderboard.reduce((s, r) => s + r.scheduleDrugItemsSold, 0);
  const totalSchDocAll = storeLeaderboard.reduce((s, r) => s + (r.scheduleWithDocCount || 0), 0);

  const riskAndCompliance = {
    totalExpiredValue: Math.round(
      storeLeaderboard.reduce((s, r) => s + r.expiredStockValue, 0) * 100
    ) / 100,
    expiredBatchesCount: storeLeaderboard.reduce((s, r) => s + r.expiredBatchesCount, 0),
    expiring30dCount: storeLeaderboard.reduce((s, r) => s + r.expiring30dCount, 0),
    expiring90dCount: storeLeaderboard.reduce((s, r) => s + r.expiring90dCount, 0),
    deadStock60dCount: storeLeaderboard.reduce((s, r) => s + r.deadStock60dCount, 0),
    deadStock90dCount: storeLeaderboard.reduce((s, r) => s + r.deadStock90dCount, 0),
    deadStock180dCount: storeLeaderboard.reduce((s, r) => s + r.deadStock180dCount, 0),
    scheduleDrugItemsSold: totalSchSoldAll,
    scheduleCompliancePct:
      totalSchSoldAll > 0 ? Math.round((totalSchDocAll / totalSchSoldAll) * 1000) / 10 : 100,
    totalCustomerBakiDue: Math.round(
      storeLeaderboard.reduce((s, r) => s + r.customerBakiDue, 0) * 100
    ) / 100,
    totalSupplierPayableDue: Math.round(
      storeLeaderboard.reduce((s, r) => s + r.supplierPayableDue, 0) * 100
    ) / 100,
    missingComplianceBranchesCount: branchLeaderboard.filter((b) => !b.complianceComplete).length,
  };

  // --------------------------------------------------------------------------
  // 3.9.3: Capacity, Database/Rx Storage Footprint & Feature Adoption Telemetry
  // --------------------------------------------------------------------------
  const matchedStoreIds = new Set(storeLeaderboard.map((r) => r.storeId));
  const filteredStores = stores.filter((s) => matchedStoreIds.has(s.id));
  const totalNonDraftStores = filteredStores.length;
  const featureChecks: Array<{
    key: string;
    label: string;
    isAdopted: (sId: number) => boolean;
  }> = [
    {
      key: "multiBranchManagement",
      label: "Multi-Branch Operations (>1 Outlet)",
      isAdopted: (sId) => branches.filter((b) => b.storeId === sId).length > 1,
    },
    {
      key: "supplierPortalAndGrn",
      label: "Supplier Extranet & Purchase Orders",
      isAdopted: (sId) => (poCountByStore.get(sId) || 0) > 0 || (supMsgByStore.get(sId) || 0) > 0,
    },
    {
      key: "patientPortalAndRxQueue",
      label: "Patient Rx Portal & Refill Queue",
      isAdopted: (sId) => (rxFootprintByStore.get(sId)?.totalMsgs || 0) > 0,
    },
    {
      key: "customDiscountsAndDayEndClose",
      label: "Cash Drawer Z-Report & Promo Schemes",
      isAdopted: (sId) =>
        (closingCountByStore.get(sId) || 0) > 0 || (discCountByStore.get(sId) || 0) > 0,
    },
    {
      key: "gstAndRegulatoryReports",
      label: "Schedule H / H1 Dispensing Controls",
      isAdopted: (sId) => {
        const row = storeLeaderboard.find((r) => r.storeId === sId);
        return Boolean(row && row.scheduleDrugItemsSold > 0);
      },
    },
    {
      key: "expenseAndFinancialLedger",
      label: "Operational Expense & Income Vouchers",
      isAdopted: (sId) => expensesInPeriod.some((e) => e.storeId === sId),
    },
  ];

  const featureAdoption = featureChecks.map((fc) => {
    let eligiblePlanStores = 0;
    let adoptedStores = 0;
    for (const s of filteredStores) {
      const sub = latestSubByStore.get(s.id);
      const effFeatures = sub
        ? {
            ...parseFeaturesJson(sub.plan.featuresJson),
            ...parseCustomFeaturesJson(sub.customFeaturesJson),
          }
        : null;
      const unlocked = effFeatures ? Boolean((effFeatures as any)[fc.key]) : true;
      if (unlocked) eligiblePlanStores++;
      if (fc.isAdopted(s.id)) adoptedStores++;
    }
    return {
      key: fc.key,
      label: fc.label,
      adoptedStores,
      eligiblePlanStores,
      totalStores: totalNonDraftStores,
      adoptionPctOfEligible:
        eligiblePlanStores > 0 ? Math.round((adoptedStores / eligiblePlanStores) * 1000) / 10 : 0,
      adoptionPctOfPlatform:
        totalNonDraftStores > 0 ? Math.round((adoptedStores / totalNonDraftStores) * 1000) / 10 : 0,
    };
  });

  const storageFootprint = filteredStores
    .map((s) => {
      const sub = latestSubByStore.get(s.id);
      const rx = rxFootprintByStore.get(s.id) || { files: 0, bytes: 0, totalMsgs: 0 };
      const medicineRows = medCountByStore.get(s.id) || 0;
      const batchRows = batchCountByStore.get(s.id) || 0;
      const invoiceRows = invoiceCountByStoreInPeriod.get(s.id) || 0;
      const customerRows = custCountByStore.get(s.id) || 0;
      const rxStorageMb = Math.round((rx.bytes / (1024 * 1024)) * 1000) / 1000;
      return {
        storeId: s.id,
        storeName: s.storeName || `Store #${s.id}`,
        planName: sub?.plan?.name || "Standard",
        medicineRows,
        batchRows,
        invoiceRows,
        customerRows,
        rxFileCount: rx.files,
        rxStorageBytes: rx.bytes,
        rxStorageMb,
      };
    })
    .sort((a, b) => b.rxStorageBytes - a.rxStorageBytes || b.medicineRows - a.medicineRows);

  const statesSet = Array.from(new Set(stores.map((s) => s.state).filter((v): v is string => Boolean(v)))).sort();
  const citiesSet = Array.from(new Set(stores.map((s) => s.city).filter((v): v is string => Boolean(v)))).sort();

  return {
    range: {
      startDate: startBound.toISOString().slice(0, 10),
      endDate: endBound.toISOString().slice(0, 10),
    },
    executiveKpis: {
      currentMrr: Math.round(totalCurrentMrr * 100) / 100,
      currentArr: Math.round(totalCurrentMrr * 12 * 100) / 100,
      totalNonDraftStores,
      totalBranches: branches.length,
    },
    mrrBridge12m,
    planTierBreakdown,
    taxSummary,
    consolidatedPnl: pnlTotals,
    storeLeaderboard,
    branchLeaderboard,
    riskAndCompliance,
    featureAdoption,
    storageFootprint,
    upsellAndChurnRows,
    paymentsLedger: periodPayments.slice(0, 500).map((p) => ({
      invoiceNo: p.invoiceNo,
      storeId: p.storeId,
      storeName: p.store?.storeName || `Store #${p.storeId}`,
      storeGst: p.store?.storeGst || null,
      planCode: p.plan?.code || "",
      planName: p.plan?.name || "",
      paymentType: p.paymentType,
      paymentMethod: p.paymentMethod || "razorpay",
      status: p.status,
      amountSubtotal: Number(p.amountSubtotal),
      gstPercent: Number(p.gstPercent),
      gstAmount: Number(p.gstAmount),
      totalAmount: Number(p.totalAmount),
      paidAt: (p.paidAt || p.createdAt).toISOString(),
    })),
    filterOptions: {
      states: statesSet,
      cities: citiesSet,
      plans: plans.map((p) => ({ code: p.code, name: p.name })),
      stores: stores.map((s) => ({ id: s.id, name: s.storeName || `Store #${s.id}` })),
      branches: branches.map((b) => ({ id: b.id, storeId: b.storeId, name: `${b.code} - ${b.name}` })),
    },
  };
}
