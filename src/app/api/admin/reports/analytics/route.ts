import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeReportRequest, getBatchPurchaseCost } from "@/lib/reports";

/**
 * MODULE 2.15.1: Real-Time Performance Analytics & Business Intelligence API
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");

  const authCtx = await authorizeReportRequest(req, branchIdParam);
  if (!authCtx.authorized) return authCtx.response!;

  const range = searchParams.get("range") || "month";
  const startDateParam = searchParams.get("startDate");
  const endDateParam = searchParams.get("endDate");

  try {
    const targetBranchId = authCtx.branchId ?? null;
    const branchScope = targetBranchId
      ? { branchId: targetBranchId }
      : authCtx.storeId
        ? { branch: { storeId: authCtx.storeId } }
        : {};

    // 1. Resolve Date Range
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date();

    if (range === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (range === "week") {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (range === "year") {
      startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (range === "custom" && startDateParam) {
      startDate = new Date(startDateParam);
      startDate.setHours(0, 0, 0, 0);
      if (endDateParam) {
        endDate = new Date(endDateParam);
        endDate.setHours(23, 59, 59, 999);
      }
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    }

    const dbDateRange = {
      gte: new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0)),
      lte: new Date(Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999)),
    };

    // 2. Fetch Sales & Processed Returns in Date Window
    const [sales, returns] = await Promise.all([
      prisma.sale.findMany({
        where: {
          ...branchScope,
          saleDate: dbDateRange,
        },
        include: {
          branch: { select: { id: true, code: true, name: true } },
          items: {
            include: {
              medicine: { select: { id: true, name: true, company: true, category: true } },
              batch: { select: { purchasePrice: true, mrp: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.return.findMany({
        where: {
          ...branchScope,
          status: "processed",
          createdAt: { gte: startDate, lte: endDate },
        },
        include: {
          items: {
            include: {
              saleItem: {
                include: {
                  batch: { select: { purchasePrice: true, mrp: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    const totalRefunds = returns.reduce((acc, r) => acc + Number(r.refundAmount), 0);

    // Compute COGS reversed by restocked returns
    let returnedRestockCogs = 0;
    for (const ret of returns) {
      for (const ri of ret.items) {
        if (ri.restockAction === "restock") {
          const unitCost = getBatchPurchaseCost(ri.saleItem?.batch, ri.saleItem?.mrp);
          returnedRestockCogs += unitCost * ri.quantity;
        }
      }
    }

    // A. Time-Series & KPIs
    const trendMap: Record<string, { label: string; revenue: number; count: number; cogs: number }> = {};

    const getBucketKey = (sale: { saleDate: Date; createdAt: Date }) => {
      if (range === "today") {
        const d = new Date(sale.createdAt || sale.saleDate);
        return `${String(d.getHours()).padStart(2, "0")}:00`;
      } else if (range === "year") {
        return new Date(sale.saleDate).toLocaleString("en-IN", { month: "short", year: "2-digit" });
      } else {
        return new Date(sale.saleDate).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
      }
    };

    let grossSalesTotal = 0;
    let totalCogs = 0;
    let totalDiscountTotal = 0;

    const paymentModes: Record<string, number> = {
      cash: 0,
      upi: 0,
      card: 0,
      credit: 0,
      cheque: 0,
      split: 0,
    };

    const medicineSalesMap: Record<
      number,
      {
        id: number;
        name: string;
        company: string;
        category: string;
        unitsSold: number;
        totalRevenue: number;
        totalCost: number;
        grossMargin: number;
      }
    > = {};

    const branchStatsMap: Record<string, { name: string; code: string; revenue: number; invoices: number }> = {};

    for (const sale of sales) {
      const saleGross = Number(sale.grandTotal);
      grossSalesTotal += saleGross;
      totalDiscountTotal += Number(sale.discountAmount);

      const bucket = getBucketKey(sale);
      if (!trendMap[bucket]) {
        trendMap[bucket] = { label: bucket, revenue: 0, count: 0, cogs: 0 };
      }
      trendMap[bucket].revenue += saleGross;
      trendMap[bucket].count += 1;

      const mode = (sale.paymentMethod || "cash").toLowerCase();
      if (mode === "split" && sale.splitDetails) {
        try {
          const splitObj = JSON.parse(sale.splitDetails);
          paymentModes.cash += Number(splitObj.cash || 0);
          paymentModes.upi += Number(splitObj.upi || 0);
          paymentModes.card += Number(splitObj.card || 0);
          paymentModes.cheque += Number(splitObj.cheque || 0);
          paymentModes.credit += Number(splitObj.credit || 0);
        } catch {
          paymentModes.cash += saleGross;
        }
      } else if (paymentModes[mode] !== undefined) {
        paymentModes[mode] += saleGross;
      } else {
        paymentModes.cash += saleGross;
      }

      const bKey = String(sale.branchId || 0);
      if (!branchStatsMap[bKey]) {
        branchStatsMap[bKey] = {
          name: sale.branch?.name || "Main Counter",
          code: sale.branch?.code || "MAIN",
          revenue: 0,
          invoices: 0,
        };
      }
      branchStatsMap[bKey].revenue += saleGross;
      branchStatsMap[bKey].invoices += 1;

      for (const item of sale.items) {
        const linePrice = Number(item.price);
        const purchaseCost = getBatchPurchaseCost(item.batch, item.mrp);
        const lineCost = purchaseCost * item.quantity;
        const lineMargin = linePrice - lineCost;

        totalCogs += lineCost;
        trendMap[bucket].cogs += lineCost;

        const medId = item.medicine.id;
        if (!medicineSalesMap[medId]) {
          medicineSalesMap[medId] = {
            id: medId,
            name: item.medicine.name,
            company: item.medicine.company,
            category: item.medicine.category,
            unitsSold: 0,
            totalRevenue: 0,
            totalCost: 0,
            grossMargin: 0,
          };
        }
        medicineSalesMap[medId].unitsSold += item.quantity;
        medicineSalesMap[medId].totalRevenue = Math.round((medicineSalesMap[medId].totalRevenue + linePrice) * 100) / 100;
        medicineSalesMap[medId].totalCost = Math.round((medicineSalesMap[medId].totalCost + lineCost) * 100) / 100;
        medicineSalesMap[medId].grossMargin = Math.round((medicineSalesMap[medId].grossMargin + lineMargin) * 100) / 100;
      }
    }

    const effectiveCogs = Math.max(0, Math.round((totalCogs - returnedRestockCogs) * 100) / 100);
    const netRealizedRevenue = Math.max(0, Math.round((grossSalesTotal - totalRefunds) * 100) / 100);
    const overallGrossProfit = Math.round((netRealizedRevenue - effectiveCogs) * 100) / 100;
    const overallGrossMarginPercent =
      netRealizedRevenue > 0 ? Math.round((overallGrossProfit / netRealizedRevenue) * 10000) / 100 : 0;

    const allMeds = Object.values(medicineSalesMap);
    const topRevenueMedicines = [...allMeds]
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10)
      .map((m, idx) => ({
        rank: idx + 1,
        ...m,
        revenueSharePercent: grossSalesTotal > 0 ? Math.round((m.totalRevenue / grossSalesTotal) * 1000) / 10 : 0,
      }));

    const topMarginMedicines = [...allMeds]
      .filter((m) => m.totalRevenue > 0)
      .sort((a, b) => b.grossMargin - a.grossMargin)
      .slice(0, 10)
      .map((m, idx) => ({
        rank: idx + 1,
        ...m,
        marginPercent: m.totalRevenue > 0 ? Math.round((m.grossMargin / m.totalRevenue) * 1000) / 10 : 0,
      }));

    const totalPayments = Object.values(paymentModes).reduce((a, b) => a + b, 0);
    const paymentBreakdown = Object.entries(paymentModes).map(([mode, amt]) => ({
      mode: mode.toUpperCase(),
      amount: Math.round(amt * 100) / 100,
      sharePercent: totalPayments > 0 ? Math.round((amt / totalPayments) * 1000) / 10 : 0,
    }));

    const trendPoints = Object.values(trendMap).map((t) => ({
      ...t,
      revenue: Math.round(t.revenue * 100) / 100,
      profit: Math.round((t.revenue - t.cogs) * 100) / 100,
    }));

    return NextResponse.json({
      success: true,
      timeWindow: {
        range,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        branchId: targetBranchId,
      },
      summary: {
        grossSales: Math.round(grossSalesTotal * 100) / 100,
        totalRefunds: Math.round(totalRefunds * 100) / 100,
        netRevenue: netRealizedRevenue,
        cogs: effectiveCogs,
        grossProfit: overallGrossProfit,
        grossMarginPercent: overallGrossMarginPercent,
        totalInvoices: sales.length,
        averageTicketSize: sales.length > 0 ? Math.round((grossSalesTotal / sales.length) * 100) / 100 : 0,
        totalDiscountsGiven: Math.round(totalDiscountTotal * 100) / 100,
      },
      trend: trendPoints,
      topRevenueMedicines,
      topMarginMedicines,
      paymentBreakdown,
      branchComparison: Object.values(branchStatsMap),
    });
  } catch (error: any) {
    console.error("GET /api/admin/reports/analytics error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to generate analytics" },
      { status: 500 }
    );
  }
}
