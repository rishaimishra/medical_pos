import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, canAccessPage, hasPermission } from "@/lib/rbac";
import { getTodayMidnightUtc } from "@/lib/config";
import { getBatchPurchaseCost } from "@/lib/reports";
import { toLocalYMD } from "@/lib/csv";

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function getTimeBasedGreeting(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

function monthKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthKeyUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!canAccessPage(auth.session, "/admin/dashboard")) {
    return NextResponse.json(
      { success: false, message: "Forbidden: Dashboard access denied" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const branchParam = searchParams.get("branchId");
  const requestedBranchId =
    branchParam && branchParam !== "all" ? parseInt(branchParam, 10) : null;

  if (branchParam && branchParam !== "all" && (requestedBranchId === null || isNaN(requestedBranchId))) {
    return NextResponse.json({ success: false, message: "Invalid branchId" }, { status: 400 });
  }

  if (requestedBranchId !== null && !canAccessBranch(auth.session, requestedBranchId)) {
    return NextResponse.json({ success: false, message: "Forbidden: Unauthorized branch access" }, { status: 403 });
  }

  const storeId = auth.session.storeId ?? null;
  if (requestedBranchId !== null && storeId) {
    const br = await prisma.branch.findUnique({
      where: { id: requestedBranchId },
      select: { storeId: true },
    });
    if (!br || (br.storeId && br.storeId !== storeId)) {
      return NextResponse.json(
        { success: false, message: "Forbidden: Branch belongs to another store" },
        { status: 403 }
      );
    }
  }

  const canSwitch =
    auth.session.role === "admin" ||
    hasPermission(auth.session, "switch_branches") ||
    !auth.session.branchId;

  const effectiveBranchId = canSwitch
    ? requestedBranchId
    : auth.session.branchId;

  const branchScope = effectiveBranchId
    ? { branchId: effectiveBranchId }
    : storeId
    ? { branch: { storeId } }
    : {};

  const expenseScope = effectiveBranchId
    ? { branchId: effectiveBranchId }
    : storeId
    ? { storeId }
    : {};

  const saleBranchSql = effectiveBranchId
    ? Prisma.sql`s.branch_id = ${effectiveBranchId}`
    : storeId
    ? Prisma.sql`br.store_id = ${storeId}`
    : Prisma.sql`TRUE`;

  const retBranchSql = effectiveBranchId
    ? Prisma.sql`r.branch_id = ${effectiveBranchId}`
    : storeId
    ? Prisma.sql`br.store_id = ${storeId}`
    : Prisma.sql`TRUE`;

  try {
    const now = new Date();
    const todayMidnightUtc = getTodayMidnightUtc();
    const thirtyDaysAheadUtc = new Date(todayMidnightUtc.getTime() + 30 * 24 * 60 * 60 * 1000);

    const todayLocalStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayLocalEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const todayYmd = toLocalYMD(todayLocalStart);

    const monthStartLocal = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const monthEndLocal = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const sevenDaysStartLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
    const thirtyDaysAgoLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
    const sixMonthsStartLocal = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);

    const thirtyDaysStartUtc = new Date(
      Date.UTC(thirtyDaysAgoLocal.getFullYear(), thirtyDaysAgoLocal.getMonth(), thirtyDaysAgoLocal.getDate(), 0, 0, 0, 0)
    );
    const sixMonthsStartUtc = new Date(
      Date.UTC(sixMonthsStartLocal.getFullYear(), sixMonthsStartLocal.getMonth(), 1, 0, 0, 0, 0)
    );

    const [
      settingsRow,
      allTimeSalesAgg,
      allTimeReturnsAgg,
      allTimeCogsRows,
      allTimeRestockRows,
      sixMonthSales,
      sixMonthProcessedReturns,
      sixMonthExpenses,
      poStatusGroups,
      recentSalesRows,
      allMedicines,
      allBatches,
      pendingReturnCount,
      totalCustomers,
    ] = await Promise.all([
      storeId
        ? prisma.settings.findUnique({ where: { id: storeId }, select: { lowQty: true } })
        : prisma.settings.findFirst({ select: { lowQty: true } }),
      prisma.sale.aggregate({
        where: branchScope,
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      prisma.return.aggregate({
        where: { ...branchScope, status: "processed" },
        _sum: { refundAmount: true },
      }),
      prisma.$queryRaw<Array<{ total_cogs: any }>>`
        SELECT COALESCE(SUM(si.quantity * COALESCE(b.purchase_price, si.mrp * 0.7)), 0) AS total_cogs
        FROM sales_items si
        JOIN sales s ON si.sale_id = s.id
        LEFT JOIN branches br ON s.branch_id = br.id
        LEFT JOIN batches b ON si.batch_id = b.id
        WHERE ${saleBranchSql}
      `,
      prisma.$queryRaw<Array<{ total_restock_cogs: any }>>`
        SELECT COALESCE(SUM(ri.quantity * COALESCE(b.purchase_price, sb.purchase_price, COALESCE(si.mrp, ri.price / GREATEST(ri.quantity, 1)) * 0.7)), 0) AS total_restock_cogs
        FROM return_items ri
        JOIN returns r ON ri.return_id = r.id
        LEFT JOIN branches br ON r.branch_id = br.id
        LEFT JOIN batches b ON ri.batch_id = b.id
        LEFT JOIN sales_items si ON ri.sale_item_id = si.id
        LEFT JOIN batches sb ON si.batch_id = sb.id
        WHERE r.status = 'processed' AND ri.restock_action = 'restock' AND ${retBranchSql}
      `,
      prisma.sale.findMany({
        where: { ...branchScope, saleDate: { gte: sixMonthsStartUtc } },
        select: {
          id: true,
          saleDate: true,
          createdAt: true,
          grandTotal: true,
          items: {
            select: {
              medicineId: true,
              quantity: true,
              mrp: true,
              price: true,
              medicine: {
                select: { id: true, name: true, company: true, category: true },
              },
              batch: {
                select: { purchasePrice: true, mrp: true },
              },
            },
          },
        },
      }),
      prisma.return.findMany({
        where: {
          ...branchScope,
          status: "processed",
          OR: [
            { processedAt: { gte: sixMonthsStartLocal } },
            { processedAt: null, createdAt: { gte: sixMonthsStartLocal } },
          ],
        },
        select: {
          id: true,
          refundAmount: true,
          processedAt: true,
          createdAt: true,
          items: {
            select: {
              medicineId: true,
              quantity: true,
              price: true,
              restockAction: true,
              batch: { select: { purchasePrice: true, mrp: true } },
              saleItem: {
                select: {
                  mrp: true,
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
          expenseDate: { gte: sixMonthsStartLocal, lte: monthEndLocal },
        },
        select: { type: true, amount: true, expenseDate: true },
      }),
      prisma.purchaseOrder.groupBy({
        by: ["status"],
        where: branchScope,
        _count: { _all: true },
      }),
      prisma.sale.findMany({
        where: branchScope,
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          invoiceNo: true,
          saleDate: true,
          createdAt: true,
          grandTotal: true,
          paymentMethod: true,
          customer: { select: { name: true, phone: true } },
          branch: { select: { name: true, code: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.medicine.findMany({
        where: storeId ? { storeId } : undefined,
        select: { id: true, name: true },
      }),
      prisma.batch.findMany({
        where: branchScope,
        select: {
          id: true,
          medicineId: true,
          quantity: true,
          expiryDate: true,
          purchasePrice: true,
          mrp: true,
        },
      }),
      prisma.return.count({
        where: { ...branchScope, status: "pending" },
      }),
      prisma.customer.count({
        where: { active: true, ...(storeId ? { storeId } : {}) },
      }),
    ]);

    const lowQtyThreshold = typeof settingsRow?.lowQty === "number" ? settingsRow.lowQty : 10;

    // --- Buckets for Today, Month, All-Time, 7-Day Chart, 6-Month Chart, and Top 5 30d ---
    const makeEmptySummary = () => ({
      grossSales: 0,
      refunds: 0,
      netRevenue: 0,
      invoicesCount: 0,
      cogs: 0,
      returnRestockCogs: 0,
      grossProfit: 0,
    });

    const todaySum = makeEmptySummary();
    const monthSum = makeEmptySummary();
    const allTimeSum = {
      grossSales: Number(allTimeSalesAgg._sum.grandTotal || 0),
      refunds: Number(allTimeReturnsAgg._sum.refundAmount || 0),
      netRevenue: 0,
      invoicesCount: allTimeSalesAgg._count._all,
      cogs: Number(allTimeCogsRows[0]?.total_cogs || 0),
      returnRestockCogs: Number(allTimeRestockRows[0]?.total_restock_cogs || 0),
      grossProfit: 0,
    };

    // 7-day map (key = YYYY-MM-DD local)
    const sevenDayMap = new Map<
      string,
      {
        date: string;
        label: string;
        grossSales: number;
        refunds: number;
        cogs: number;
        returnRestockCogs: number;
        invoicesCount: number;
      }
    >();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const ymd = toLocalYMD(d);
      sevenDayMap.set(ymd, {
        date: ymd,
        label: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" }),
        grossSales: 0,
        refunds: 0,
        cogs: 0,
        returnRestockCogs: 0,
        invoicesCount: 0,
      });
    }

    // 6-month map (key = YYYY-MM)
    const sixMonthMap = new Map<
      string,
      {
        monthKey: string;
        label: string;
        grossSales: number;
        refunds: number;
        cogs: number;
        returnRestockCogs: number;
        expenses: number;
        otherIncome: number;
      }
    >();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mk = monthKeyLocal(d);
      sixMonthMap.set(mk, {
        monthKey: mk,
        label: d.toLocaleDateString("en-IN", { month: "short" }),
        grossSales: 0,
        refunds: 0,
        cogs: 0,
        returnRestockCogs: 0,
        expenses: 0,
        otherIncome: 0,
      });
    }

    // Top 5 Medicines (30d) accumulator
    const topMed30dMap = new Map<
      number,
      {
        medicineId: number;
        name: string;
        company: string;
        category: string;
        unitsSold: number;
        returnedUnits: number;
        grossRevenue: number;
        refundedRevenue: number;
      }
    >();
    let soldUnits30dGross = 0;
    let returnedUnits30d = 0;

    const currentMonthKey = monthKeyLocal(now);

    for (const s of sixMonthSales) {
      const sDate = new Date(s.saleDate);
      const sYmdUtc = sDate.toISOString().slice(0, 10);
      const sMonthUtc = monthKeyUtc(sDate);
      const gTotal = Number(s.grandTotal || 0);

      let saleCogs = 0;
      const itemsSubtotal = s.items.reduce((acc, it) => acc + Number(it.price || 0), 0);
      const billPayableRatio =
        itemsSubtotal > 0 ? Math.max(0, Math.min(1, gTotal / itemsSubtotal)) : 1;

      for (const item of s.items) {
        saleCogs += getBatchPurchaseCost(item.batch, item.mrp) * item.quantity;
      }

      // Month
      if (sMonthUtc === currentMonthKey) {
        monthSum.grossSales += gTotal;
        monthSum.cogs += saleCogs;
        monthSum.invoicesCount += 1;
      }

      // Today
      if (sYmdUtc === todayYmd) {
        todaySum.grossSales += gTotal;
        todaySum.cogs += saleCogs;
        todaySum.invoicesCount += 1;
      }

      // 7-Day chart
      const dayBucket = sevenDayMap.get(sYmdUtc);
      if (dayBucket) {
        dayBucket.grossSales += gTotal;
        dayBucket.cogs += saleCogs;
        dayBucket.invoicesCount += 1;
      }

      // 6-Month chart
      if (sDate >= sixMonthsStartUtc) {
        const mBucket = sixMonthMap.get(sMonthUtc);
        if (mBucket) {
          mBucket.grossSales += gTotal;
          mBucket.cogs += saleCogs;
        }
      }

      // 30-Day Top Medicines (scaled by billPayableRatio so returned net revenue matches)
      if (sDate >= thirtyDaysStartUtc) {
        for (const item of s.items) {
          soldUnits30dGross += item.quantity;
          if (!item.medicine) continue;
          const m = topMed30dMap.get(item.medicine.id) || {
            medicineId: item.medicine.id,
            name: item.medicine.name,
            company: item.medicine.company || "",
            category: item.medicine.category || "General",
            unitsSold: 0,
            returnedUnits: 0,
            grossRevenue: 0,
            refundedRevenue: 0,
          };
          m.unitsSold += item.quantity;
          m.grossRevenue += Number(item.price || 0) * billPayableRatio;
          topMed30dMap.set(item.medicine.id, m);
        }
      }
    }

    for (const r of sixMonthProcessedReturns) {
      const rDate = r.processedAt ? new Date(r.processedAt) : new Date(r.createdAt);
      const rYmd = toLocalYMD(rDate);
      const rMonth = monthKeyLocal(rDate);
      const rAmt = Number(r.refundAmount || 0);

      let restockCogs = 0;
      for (const rItem of r.items) {
        if (rItem.restockAction === "restock") {
          const batchRef = rItem.batch || rItem.saleItem?.batch;
          const fallbackMrp =
            rItem.saleItem?.mrp ?? Number(rItem.price || 0) / Math.max(1, rItem.quantity);
          restockCogs += getBatchPurchaseCost(batchRef, fallbackMrp) * rItem.quantity;
        }
      }

      // Month
      if (rMonth === currentMonthKey) {
        monthSum.refunds += rAmt;
        monthSum.returnRestockCogs += restockCogs;
      }

      // Today
      if (rDate >= todayLocalStart && rDate <= todayLocalEnd) {
        todaySum.refunds += rAmt;
        todaySum.returnRestockCogs += restockCogs;
      }

      // 7-Day chart
      const dayBucket = sevenDayMap.get(rYmd);
      if (dayBucket) {
        dayBucket.refunds += rAmt;
        dayBucket.returnRestockCogs += restockCogs;
      }

      // 6-Month chart
      if (rDate >= sixMonthsStartLocal) {
        const mBucket = sixMonthMap.get(rMonth);
        if (mBucket) {
          mBucket.refunds += rAmt;
          mBucket.returnRestockCogs += restockCogs;
        }
      }

      // 30-Day Top Medicines deductions
      if (rDate >= thirtyDaysAgoLocal) {
        for (const rItem of r.items) {
          returnedUnits30d += rItem.quantity;
          if (rItem.medicineId && topMed30dMap.has(rItem.medicineId)) {
            const m = topMed30dMap.get(rItem.medicineId)!;
            m.returnedUnits += rItem.quantity;
            m.refundedRevenue += Number(rItem.price || 0);
          }
        }
      }
    }

    let monthExpenses = 0;
    let monthOtherIncome = 0;
    for (const exp of sixMonthExpenses) {
      const eDate = new Date(exp.expenseDate);
      const eMonth = monthKeyLocal(eDate);
      const amt = Number(exp.amount || 0);
      const mBucket = sixMonthMap.get(eMonth);
      if (exp.type === "income") {
        if (mBucket) mBucket.otherIncome += amt;
        if (eMonth === currentMonthKey) monthOtherIncome += amt;
      } else {
        if (mBucket) mBucket.expenses += amt;
        if (eMonth === currentMonthKey) monthExpenses += amt;
      }
    }

    const finalizeRevSummary = (s: ReturnType<typeof makeEmptySummary>) => {
      const netRevenue = Math.max(0, s.grossSales - s.refunds);
      const netCogs = Math.max(0, s.cogs - s.returnRestockCogs);
      const grossProfit = netRevenue - netCogs;
      return {
        grossSales: round2(s.grossSales),
        refunds: round2(s.refunds),
        netRevenue: round2(netRevenue),
        invoicesCount: s.invoicesCount,
        cogs: round2(netCogs),
        grossProfit: round2(grossProfit),
      };
    };

    const todayFinal = finalizeRevSummary(todaySum);
    const monthFinal = finalizeRevSummary(monthSum);
    const allTimeFinal = finalizeRevSummary(allTimeSum);

    const sevenDayChart = Array.from(sevenDayMap.values()).map((d) => {
      const netRevenue = Math.max(0, d.grossSales - d.refunds);
      const netCogs = Math.max(0, d.cogs - d.returnRestockCogs);
      return {
        date: d.date,
        label: d.label,
        grossSales: round2(d.grossSales),
        refunds: round2(d.refunds),
        netRevenue: round2(netRevenue),
        cogs: round2(netCogs),
        grossProfit: round2(netRevenue - netCogs),
        invoicesCount: d.invoicesCount,
      };
    });

    const sixMonthExpenseVsProfit = Array.from(sixMonthMap.values()).map((m) => {
      const netRevenue = Math.max(0, m.grossSales - m.refunds);
      const netCogs = Math.max(0, m.cogs - m.returnRestockCogs);
      const grossProfit = netRevenue - netCogs;
      const netProfit = grossProfit + m.otherIncome - m.expenses;
      return {
        monthKey: m.monthKey,
        label: m.label,
        expenses: round2(m.expenses),
        grossProfit: round2(grossProfit),
        netProfit: round2(netProfit),
      };
    });

    const topMedicines30d = Array.from(topMed30dMap.values())
      .map((m) => ({
        medicineId: m.medicineId,
        name: m.name,
        company: m.company,
        category: m.category,
        unitsSold: Math.max(0, m.unitsSold - m.returnedUnits),
        netRevenue: round2(Math.max(0, m.grossRevenue - m.refundedRevenue)),
      }))
      .filter((m) => m.unitsSold > 0)
      .sort((a, b) => b.netRevenue - a.netRevenue || b.unitsSold - a.unitsSold)
      .slice(0, 5);

    // PO counts by status
    const poStatusCounts = {
      draft: 0,
      pending: 0,
      price_updated: 0,
      confirmed: 0,
      shipped: 0,
      received: 0,
      cancelled: 0,
      total: 0,
    };
    for (const grp of poStatusGroups) {
      const count = grp._count._all;
      poStatusCounts.total += count;
      if (grp.status in poStatusCounts) {
        (poStatusCounts as any)[grp.status] = count;
      }
    }

    // Inventory & Alert Overview
    let totalStockUnits = 0;
    let inventoryCostValue = 0;
    let expiredCount = 0;
    let expiringSoonCount = 0;

    const activeQtyByMedicine = new Map<number, number>();

    for (const b of allBatches) {
      const expTime = new Date(b.expiryDate).getTime();
      if (b.quantity > 0) {
        if (expTime <= todayMidnightUtc.getTime()) {
          expiredCount += 1;
        } else {
          totalStockUnits += b.quantity;
          inventoryCostValue += getBatchPurchaseCost(b, b.mrp) * b.quantity;
          activeQtyByMedicine.set(
            b.medicineId,
            (activeQtyByMedicine.get(b.medicineId) || 0) + b.quantity
          );
          if (expTime <= thirtyDaysAheadUtc.getTime()) {
            expiringSoonCount += 1;
          }
        }
      }
    }

    let outOfStockCount = 0;
    let lowStockCount = 0;
    for (const med of allMedicines) {
      const qty = activeQtyByMedicine.get(med.id) || 0;
      if (qty === 0) {
        outOfStockCount += 1;
      } else if (qty <= lowQtyThreshold) {
        lowStockCount += 1;
      }
    }

    const recentSales = recentSalesRows.map((s) => ({
      id: s.id,
      invoiceNo: s.invoiceNo,
      saleDate: s.saleDate.toISOString().slice(0, 10),
      createdAt: s.createdAt.toISOString(),
      grandTotal: round2(Number(s.grandTotal || 0)),
      paymentMethod: s.paymentMethod,
      customerName: s.customer?.name || "Walk-in Customer",
      customerPhone: s.customer?.phone || "",
      branchCode: s.branch?.code || "",
      branchName: s.branch?.name || "",
      itemsCount: s._count.items,
    }));

    return NextResponse.json({
      success: true,
      greeting: getTimeBasedGreeting(now),
      userName: auth.session.name,
      revenueSummary: {
        today: todayFinal,
        month: {
          ...monthFinal,
          expenses: round2(monthExpenses),
          otherIncome: round2(monthOtherIncome),
          netProfit: round2(monthFinal.grossProfit + monthOtherIncome - monthExpenses),
        },
        allTime: allTimeFinal,
      },
      poStatusCounts,
      sevenDayChart,
      sixMonthExpenseVsProfit,
      topMedicines30d,
      recentSales,
      overview: {
        totalMedicines: allMedicines.length,
        totalStockUnits,
        soldUnits30d: Math.max(0, soldUnits30dGross - returnedUnits30d),
        outOfStockCount,
        lowStockCount,
        expiredCount,
        expiringSoonCount,
        pendingReturnCount,
        totalCustomers,
        inventoryCostValue: round2(inventoryCostValue),
        lowQtyThreshold,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/dashboard error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load dashboard summary", error: error.message },
      { status: 500 }
    );
  }
}
