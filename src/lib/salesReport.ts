import { prisma } from "@/lib/prisma";
import { getBatchPurchaseCost } from "@/lib/reports";
import { toLocalYMD } from "@/lib/csv";

export interface SalesSummaryMonthRow {
  monthKey: string; // YYYY-MM
  label: string; // e.g. "Nov 2026"
  salesCount: number;
  returnsCount: number;
  grossSales: number;
  refunds: number;
  netRevenue: number;
  gstAmount: number;
  discountAmount: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
}

export interface TopMedicineRow {
  medicineId: number;
  name: string;
  company: string;
  category: string;
  unitsSold: number;
  returnedUnits: number;
  netUnitsSold: number;
  grossRevenue: number;
  netRevenue: number;
  cogs: number;
  profit: number;
}

export interface TopCustomerRow {
  customerId: number;
  name: string;
  phone: string;
  ordersCount: number;
  grossSpend: number;
  refunds: number;
  netSpend: number;
}

export interface PaymentMethodBreakdownRow {
  method: string;
  label: string;
  count: number;
  amount: number;
  percentage: number;
}

export interface AdminSalesSummaryResult {
  range: {
    startDate: string;
    endDate: string;
    daysCount: number;
  };
  summary: {
    grossSales: number;
    refunds: number;
    netRevenue: number;
    gstAmount: number;
    discountAmount: number;
    cogs: number;
    grossProfit: number;
    grossMarginPercent: number;
    operatingExpenses: number;
    otherIncome: number;
    netProfit: number;
    invoicesCount: number;
    returnsCount: number;
    dailyAverage: number;
    currentMonthRevenue: number;
    previousMonthRevenue: number;
    momGrowthPercent: number;
  };
  months: SalesSummaryMonthRow[];
  topMedicines: TopMedicineRow[];
  topCustomers: TopCustomerRow[];
  paymentMethods: PaymentMethodBreakdownRow[];
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function parseYmdToLocalDate(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(year, month, day, 0, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

function monthKeyFromDate(d: Date, useUtc = false): string {
  const y = useUtc ? d.getUTCFullYear() : d.getFullYear();
  const m = (useUtc ? d.getUTCMonth() : d.getMonth()) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function monthLabel(year: number, monthIndex0: number): string {
  const dt = new Date(year, monthIndex0, 1);
  return dt.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export function decomposePaymentAmounts(sale: {
  paymentMethod: string | null;
  grandTotal: any;
  splitDetails: string | null;
}): Record<string, number> {
  const method = (sale.paymentMethod || "cash").toLowerCase();
  const total = Number(sale.grandTotal || 0);

  if (method === "split" && sale.splitDetails) {
    try {
      const parsed = JSON.parse(sale.splitDetails);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const out: Record<string, number> = {};
        let assigned = 0;
        for (const [k, v] of Object.entries(parsed)) {
          const val = Number(v || 0);
          if (val > 0) {
            const normKey = k.toLowerCase();
            out[normKey] = (out[normKey] || 0) + val;
            assigned += val;
          }
        }
        if (assigned > 0) {
          return out;
        }
      } else if (Array.isArray(parsed)) {
        const out: Record<string, number> = {};
        let assigned = 0;
        for (const entry of parsed) {
          const k = String(entry?.method || "cash").toLowerCase();
          const val = Number(entry?.amount || 0);
          if (val > 0) {
            out[k] = (out[k] || 0) + val;
            assigned += val;
          }
        }
        if (assigned > 0) {
          return out;
        }
      }
    } catch {
      // Fallback to treating entire amount as split
    }
  }

  return { [method]: total };
}

export async function queryAdminSalesSummary(options: {
  storeId?: number | null;
  branchId?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<AdminSalesSummaryResult> {
  const now = new Date();

  const parsedStart = options.startDate ? parseYmdToLocalDate(options.startDate) : null;
  const parsedEnd = options.endDate ? parseYmdToLocalDate(options.endDate) : null;

  const startLocal = parsedStart || new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endLocal = parsedEnd || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  endLocal.setHours(23, 59, 59, 999);

  if (endLocal < startLocal) {
    endLocal.setTime(startLocal.getTime());
    endLocal.setHours(23, 59, 59, 999);
  }

  const startYmd = toLocalYMD(startLocal);
  const endYmd = toLocalYMD(endLocal);

  const saleUtcRange = {
    gte: new Date(Date.UTC(startLocal.getFullYear(), startLocal.getMonth(), startLocal.getDate(), 0, 0, 0, 0)),
    lte: new Date(Date.UTC(endLocal.getFullYear(), endLocal.getMonth(), endLocal.getDate(), 23, 59, 59, 999)),
  };

  const daysCount = Math.max(
    1,
    Math.round(
      (Date.UTC(endLocal.getFullYear(), endLocal.getMonth(), endLocal.getDate()) -
        Date.UTC(startLocal.getFullYear(), startLocal.getMonth(), startLocal.getDate())) /
        (1000 * 60 * 60 * 24)
    ) + 1
  );

  // Build 12-month window ending on the current calendar month (so 12-month chart & MoM growth are always complete)
  const currMonthStartLocal = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const currMonthEndLocal = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const twelveMonthsStartLocal = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0);

  const twelveMonthUtcRange = {
    gte: new Date(Date.UTC(twelveMonthsStartLocal.getFullYear(), twelveMonthsStartLocal.getMonth(), 1, 0, 0, 0, 0)),
    lte: new Date(Date.UTC(currMonthEndLocal.getFullYear(), currMonthEndLocal.getMonth(), currMonthEndLocal.getDate(), 23, 59, 59, 999)),
  };

  const branchScope = options.branchId
    ? { branchId: options.branchId }
    : options.storeId
    ? { branch: { storeId: options.storeId } }
    : {};

  const expenseScope = options.branchId
    ? { branchId: options.branchId }
    : options.storeId
    ? { storeId: options.storeId }
    : {};

  const [
    periodSales,
    periodReturns,
    periodExpenses,
    twelveMonthSales,
    twelveMonthReturns,
    twelveMonthExpenses,
  ] = await Promise.all([
    prisma.sale.findMany({
      where: { ...branchScope, saleDate: saleUtcRange },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items: {
          include: {
            medicine: { select: { id: true, name: true, company: true, category: true } },
            batch: { select: { purchasePrice: true, mrp: true } },
          },
        },
      },
    }),
    prisma.return.findMany({
      where: {
        ...branchScope,
        status: "processed",
        OR: [
          { processedAt: { gte: startLocal, lte: endLocal } },
          { processedAt: null, createdAt: { gte: startLocal, lte: endLocal } },
        ],
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        sale: { select: { gstAmount: true, grandTotal: true, totalAmount: true } },
        items: {
          include: {
            medicine: { select: { id: true, name: true, company: true, category: true, gstPercent: true } },
            batch: { select: { purchasePrice: true, mrp: true } },
            saleItem: {
              select: {
                mrp: true,
                quantity: true,
                gstAmount: true,
                gstPercent: true,
                batch: { select: { purchasePrice: true, mrp: true } },
              },
            },
          },
        },
      },
    }),
    prisma.expense.findMany({
      where: {
        ...expenseScope,
        expenseDate: { gte: startLocal, lte: endLocal },
      },
      select: { type: true, amount: true },
    }),
    prisma.sale.findMany({
      where: { ...branchScope, saleDate: twelveMonthUtcRange },
      select: {
        id: true,
        saleDate: true,
        grandTotal: true,
        gstAmount: true,
        discountAmount: true,
        items: {
          select: {
            quantity: true,
            mrp: true,
            batch: { select: { purchasePrice: true, mrp: true } },
          },
        },
      },
    }),
    prisma.return.findMany({
      where: {
        ...branchScope,
        status: "processed",
        OR: [
          { processedAt: { gte: twelveMonthsStartLocal, lte: currMonthEndLocal } },
          { processedAt: null, createdAt: { gte: twelveMonthsStartLocal, lte: currMonthEndLocal } },
        ],
      },
      select: {
        refundAmount: true,
        processedAt: true,
        createdAt: true,
        items: {
          select: {
            quantity: true,
            price: true,
            restockAction: true,
            batch: { select: { purchasePrice: true, mrp: true } },
            saleItem: {
              select: {
                mrp: true,
                quantity: true,
                gstAmount: true,
                gstPercent: true,
                batch: { select: { purchasePrice: true, mrp: true } },
              },
            },
          },
        },
      },
    }),
    prisma.expense.findMany({
      where: {
        ...expenseScope,
        expenseDate: { gte: twelveMonthsStartLocal, lte: currMonthEndLocal },
      },
      select: { type: true, amount: true, expenseDate: true },
    }),
  ]);

  // 1. Selected Period Metrics + Top 10 Medicines + Top 5 Customers + Payment Breakdown
  let grossSales = 0;
  let gstAmount = 0;
  let discountAmount = 0;
  let grossCogs = 0;

  const medicineMap = new Map<number, TopMedicineRow>();
  const customerMap = new Map<number, TopCustomerRow>();
  const paymentMap = new Map<string, { count: number; amount: number }>();

  for (const sale of periodSales) {
    const gTotal = Number(sale.grandTotal || 0);
    grossSales += gTotal;
    gstAmount += Number(sale.gstAmount || 0);
    discountAmount += Number(sale.discountAmount || 0);

    // Payment method decomposition (handles splitPayments JSON)
    const parts = decomposePaymentAmounts(sale);
    for (const [methodKey, amt] of Object.entries(parts)) {
      const existing = paymentMap.get(methodKey) || { count: 0, amount: 0 };
      existing.count += 1;
      existing.amount += amt;
      paymentMap.set(methodKey, existing);
    }

    // Customer spend tracking
    if (sale.customer) {
      const cEntry = customerMap.get(sale.customer.id) || {
        customerId: sale.customer.id,
        name: sale.customer.name,
        phone: sale.customer.phone,
        ordersCount: 0,
        grossSpend: 0,
        refunds: 0,
        netSpend: 0,
      };
      cEntry.ordersCount += 1;
      cEntry.grossSpend += gTotal;
      customerMap.set(sale.customer.id, cEntry);
    }

    // Line-item COGS and bill-discount-proportional medicine revenue aggregation
    const itemsSubtotal = sale.items.reduce((acc, it) => acc + Number(it.price || 0), 0);
    const billPayableRatio =
      itemsSubtotal > 0 ? Math.max(0, Math.min(1, gTotal / itemsSubtotal)) : 1;

    for (const item of sale.items) {
      const costUnit = getBatchPurchaseCost(item.batch, item.mrp);
      const itemCogs = costUnit * item.quantity;
      const itemRev = Number(item.price || 0) * billPayableRatio;
      grossCogs += itemCogs;

      if (item.medicine) {
        const mEntry = medicineMap.get(item.medicine.id) || {
          medicineId: item.medicine.id,
          name: item.medicine.name,
          company: item.medicine.company || "",
          category: item.medicine.category || "General",
          unitsSold: 0,
          returnedUnits: 0,
          netUnitsSold: 0,
          grossRevenue: 0,
          netRevenue: 0,
          cogs: 0,
          profit: 0,
        };
        mEntry.unitsSold += item.quantity;
        mEntry.grossRevenue += itemRev;
        mEntry.cogs += itemCogs;
        medicineMap.set(item.medicine.id, mEntry);
      }
    }
  }

  let refunds = 0;
  let returnedRestockCogs = 0;
  let returnedGst = 0;

  for (const ret of periodReturns) {
    const rAmt = Number(ret.refundAmount || 0);
    refunds += rAmt;

    if (ret.customer) {
      const cEntry = customerMap.get(ret.customer.id) || {
        customerId: ret.customer.id,
        name: ret.customer.name,
        phone: ret.customer.phone,
        ordersCount: 0,
        grossSpend: 0,
        refunds: 0,
        netSpend: 0,
      };
      cEntry.refunds += rAmt;
      customerMap.set(ret.customer.id, cEntry);
    }

    for (const rItem of ret.items) {
      const batchRef = rItem.batch || rItem.saleItem?.batch;
      const fallbackMrp =
        rItem.saleItem?.mrp ?? Number(rItem.price || 0) / Math.max(1, rItem.quantity);
      const costUnit = getBatchPurchaseCost(batchRef, fallbackMrp);
      const itemReturnCogs = rItem.restockAction === "restock" ? costUnit * rItem.quantity : 0;
      returnedRestockCogs += itemReturnCogs;

      const siQty = rItem.saleItem?.quantity || 0;
      if (siQty > 0 && Number(rItem.saleItem?.gstAmount || 0) > 0) {
        returnedGst += Number(rItem.saleItem!.gstAmount) * (rItem.quantity / siQty);
      } else {
        const rate = Number(rItem.saleItem?.gstPercent ?? rItem.medicine?.gstPercent ?? 0);
        if (rate > 0) {
          returnedGst += (Number(rItem.price || 0) * rate) / (100 + rate);
        }
      }

      const medId = rItem.medicine?.id || rItem.medicineId;
      if (medId && medicineMap.has(medId)) {
        const mEntry = medicineMap.get(medId)!;
        mEntry.returnedUnits += rItem.quantity;
        mEntry.netRevenue -= Number(rItem.price || 0);
        mEntry.cogs -= itemReturnCogs;
      }
    }
  }

  let operatingExpenses = 0;
  let otherIncome = 0;
  for (const exp of periodExpenses) {
    if (exp.type === "income") {
      otherIncome += Number(exp.amount || 0);
    } else {
      operatingExpenses += Number(exp.amount || 0);
    }
  }

  const netRevenue = Math.max(0, grossSales - refunds);
  const netGstAmount = Math.max(0, gstAmount - returnedGst);
  const netCogs = Math.max(0, grossCogs - returnedRestockCogs);
  const grossProfit = netRevenue - netCogs;
  const grossMarginPercent = netRevenue > 0 ? round2((grossProfit / netRevenue) * 100) : 0;
  const netProfit = grossProfit + otherIncome - operatingExpenses;
  const dailyAverage = round2(netRevenue / daysCount);

  // Finalize Top 10 Medicines
  const topMedicines = Array.from(medicineMap.values())
    .map((m) => {
      const netRev = Math.max(0, m.grossRevenue + m.netRevenue); // m.netRevenue accumulated negative return amounts
      const netUnits = Math.max(0, m.unitsSold - m.returnedUnits);
      const netItemCogs = Math.max(0, m.cogs);
      return {
        ...m,
        netUnitsSold: netUnits,
        grossRevenue: round2(m.grossRevenue),
        netRevenue: round2(netRev),
        cogs: round2(netItemCogs),
        profit: round2(netRev - netItemCogs),
      };
    })
    .filter((m) => m.netUnitsSold > 0)
    .sort((a, b) => b.netRevenue - a.netRevenue)
    .slice(0, 10);

  // Finalize Top 5 Customers
  const topCustomers = Array.from(customerMap.values())
    .map((c) => ({
      ...c,
      grossSpend: round2(c.grossSpend),
      refunds: round2(c.refunds),
      netSpend: round2(Math.max(0, c.grossSpend - c.refunds)),
    }))
    .filter((c) => c.ordersCount > 0)
    .sort((a, b) => b.netSpend - a.netSpend)
    .slice(0, 5);

  // Finalize Payment Methods Breakdown
  const paymentTotalAmt = Array.from(paymentMap.values()).reduce((sum, p) => sum + p.amount, 0);
  const labelMap: Record<string, string> = {
    cash: "Cash",
    upi: "UPI / QR",
    card: "Card (Debit/Credit)",
    cheque: "Cheque",
    credit: "Baki / Credit",
    split: "Split Payment",
  };
  const paymentMethods = Array.from(paymentMap.entries())
    .map(([method, data]) => ({
      method,
      label: labelMap[method] || method.toUpperCase(),
      count: data.count,
      amount: round2(data.amount),
      percentage: paymentTotalAmt > 0 ? round2((data.amount / paymentTotalAmt) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // 2. Build 12-Month Breakdown & MoM Growth %
  const monthBuckets = new Map<
    string,
    SalesSummaryMonthRow & { grossCogsAcc: number; returnRestockCogsAcc: number }
  >();

  for (let offset = 11; offset >= 0; offset--) {
    const dt = new Date(currMonthStartLocal.getFullYear(), currMonthStartLocal.getMonth() - offset, 1);
    const key = monthKeyFromDate(dt, false);
    monthBuckets.set(key, {
      monthKey: key,
      label: monthLabel(dt.getFullYear(), dt.getMonth()),
      salesCount: 0,
      returnsCount: 0,
      grossSales: 0,
      refunds: 0,
      netRevenue: 0,
      gstAmount: 0,
      discountAmount: 0,
      cogs: 0,
      grossProfit: 0,
      operatingExpenses: 0,
      netProfit: 0,
      grossCogsAcc: 0,
      returnRestockCogsAcc: 0,
    });
  }

  for (const s of twelveMonthSales) {
    const key = monthKeyFromDate(new Date(s.saleDate), true);
    const bucket = monthBuckets.get(key);
    if (!bucket) continue;
    bucket.salesCount += 1;
    bucket.grossSales += Number(s.grandTotal || 0);
    bucket.gstAmount += Number(s.gstAmount || 0);
    bucket.discountAmount += Number(s.discountAmount || 0);
    for (const item of s.items) {
      bucket.grossCogsAcc += getBatchPurchaseCost(item.batch, item.mrp) * item.quantity;
    }
  }

  for (const r of twelveMonthReturns) {
    const dt = r.processedAt ? new Date(r.processedAt) : new Date(r.createdAt);
    const key = monthKeyFromDate(dt, false);
    const bucket = monthBuckets.get(key);
    if (!bucket) continue;
    bucket.returnsCount += 1;
    bucket.refunds += Number(r.refundAmount || 0);
    for (const rItem of r.items) {
      if (rItem.restockAction === "restock") {
        const batchRef = rItem.batch || rItem.saleItem?.batch;
        const fallbackMrp =
          rItem.saleItem?.mrp ?? Number(rItem.price || 0) / Math.max(1, rItem.quantity);
        bucket.returnRestockCogsAcc += getBatchPurchaseCost(batchRef, fallbackMrp) * rItem.quantity;
      }
      const siQty = rItem.saleItem?.quantity || 0;
      if (siQty > 0 && Number(rItem.saleItem?.gstAmount || 0) > 0) {
        bucket.gstAmount = Math.max(
          0,
          bucket.gstAmount - Number(rItem.saleItem!.gstAmount) * (rItem.quantity / siQty)
        );
      } else {
        const rate = Number(rItem.saleItem?.gstPercent ?? 0);
        if (rate > 0) {
          bucket.gstAmount = Math.max(
            0,
            bucket.gstAmount - (Number(rItem.price || 0) * rate) / (100 + rate)
          );
        }
      }
    }
  }

  for (const e of twelveMonthExpenses) {
    if (e.type === "income") continue;
    const key = monthKeyFromDate(new Date(e.expenseDate), false);
    const bucket = monthBuckets.get(key);
    if (!bucket) continue;
    bucket.operatingExpenses += Number(e.amount || 0);
  }

  const months: SalesSummaryMonthRow[] = Array.from(monthBuckets.values()).map((b) => {
    const mNetRev = Math.max(0, b.grossSales - b.refunds);
    const mCogs = Math.max(0, b.grossCogsAcc - b.returnRestockCogsAcc);
    const mGrossProfit = mNetRev - mCogs;
    const mNetProfit = mGrossProfit - b.operatingExpenses;
    return {
      monthKey: b.monthKey,
      label: b.label,
      salesCount: b.salesCount,
      returnsCount: b.returnsCount,
      grossSales: round2(b.grossSales),
      refunds: round2(b.refunds),
      netRevenue: round2(mNetRev),
      gstAmount: round2(b.gstAmount),
      discountAmount: round2(b.discountAmount),
      cogs: round2(mCogs),
      grossProfit: round2(mGrossProfit),
      operatingExpenses: round2(b.operatingExpenses),
      netProfit: round2(mNetProfit),
    };
  });

  const currentMonthRow = months[months.length - 1];
  const prevMonthRow = months.length >= 2 ? months[months.length - 2] : undefined;
  const currentMonthRevenue = currentMonthRow ? currentMonthRow.netRevenue : 0;
  const previousMonthRevenue = prevMonthRow ? prevMonthRow.netRevenue : 0;

  let momGrowthPercent = 0;
  if (previousMonthRevenue > 0) {
    momGrowthPercent = round2(((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100);
  } else if (currentMonthRevenue > 0) {
    momGrowthPercent = 100;
  }

  return {
    range: {
      startDate: startYmd,
      endDate: endYmd,
      daysCount,
    },
    summary: {
      grossSales: round2(grossSales),
      refunds: round2(refunds),
      netRevenue: round2(netRevenue),
      gstAmount: round2(netGstAmount),
      discountAmount: round2(discountAmount),
      cogs: round2(netCogs),
      grossProfit: round2(grossProfit),
      grossMarginPercent,
      operatingExpenses: round2(operatingExpenses),
      otherIncome: round2(otherIncome),
      netProfit: round2(netProfit),
      invoicesCount: periodSales.length,
      returnsCount: periodReturns.length,
      dailyAverage,
      currentMonthRevenue,
      previousMonthRevenue,
      momGrowthPercent,
    },
    months,
    topMedicines,
    topCustomers,
    paymentMethods,
  };
}
