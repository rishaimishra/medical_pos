import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch } from "@/lib/rbac";

/**
 * MODULE 2.15.1: Real-Time Performance Analytics & Business Intelligence API
 *
 * Provides:
 * 1. Time-series Sales & Revenue Trends (Today, This Week, This Month, Last 12 Months)
 * 2. Top 10 Revenue-Generating Medicines
 * 3. Highest Margin & Profit Products
 * 4. Payment Mode Breakdown (Cash vs. UPI vs. Card vs. Credit / Baki Khata vs. Split)
 * 5. Branch Performance Comparison
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");
  const range = searchParams.get("range") || "month"; // "today" | "week" | "month" | "year" | "custom"
  const startDateParam = searchParams.get("startDate");
  const endDateParam = searchParams.get("endDate");

  try {
    let targetBranchId: number | null = auth.session.branchId;
    if (!targetBranchId && branchIdParam && branchIdParam !== "all") {
      const bId = parseInt(branchIdParam, 10);
      if (!isNaN(bId) && canAccessBranch(auth.session, bId)) {
        targetBranchId = bId;
      }
    }

    const branchFilter = targetBranchId ? { branchId: targetBranchId } : {};

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
    } else if (range === "year") {
      startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    } else if (range === "custom" && startDateParam) {
      startDate = new Date(startDateParam);
      startDate.setHours(0, 0, 0, 0);
      if (endDateParam) {
        endDate = new Date(endDateParam);
        endDate.setHours(23, 59, 59, 999);
      }
    } else {
      // "month" default
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }

    // 2. Fetch Sales in Date Window
    const sales = await prisma.sale.findMany({
      where: {
        ...branchFilter,
        saleDate: { gte: startDate, lte: endDate },
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
      orderBy: { saleDate: "asc" },
    });

    // 3. Fetch Returns in Date Window (to compute Net Realized Revenue)
    const returns = await prisma.return.findMany({
      where: {
        ...branchFilter,
        status: "processed",
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { refundAmount: true },
    });

    const totalRefunds = returns.reduce((acc, r) => acc + Number(r.refundAmount), 0);

    // ==========================================
    // A. TIME-SERIES REVENUE & INVOICE COUNTS
    // ==========================================
    const trendMap: Record<string, { label: string; revenue: number; count: number; cogs: number }> = {};

    // Helper: format label based on range
    const getBucketKey = (d: Date) => {
      if (range === "today") {
        return `${String(d.getHours()).padStart(2, "0")}:00`;
      } else if (range === "year") {
        return d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
      } else {
        return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
      }
    };

    let grossSalesTotal = 0;
    let totalCogs = 0;
    let totalDiscountTotal = 0;

    // Payment Mode Tally
    const paymentModes: Record<string, number> = {
      cash: 0,
      upi: 0,
      card: 0,
      credit: 0,
      cheque: 0,
      split: 0,
    };

    // Product Performance Maps
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

    // Branch Performance Map
    const branchStatsMap: Record<string, { name: string; code: string; revenue: number; invoices: number }> = {};

    for (const sale of sales) {
      const saleGross = Number(sale.grandTotal);
      grossSalesTotal += saleGross;
      totalDiscountTotal += Number(sale.discountAmount);

      const bucket = getBucketKey(sale.saleDate);
      if (!trendMap[bucket]) {
        trendMap[bucket] = { label: bucket, revenue: 0, count: 0, cogs: 0 };
      }
      trendMap[bucket].revenue += saleGross;
      trendMap[bucket].count += 1;

      // Payment mode breakdown
      const mode = (sale.paymentMethod || "cash").toLowerCase();
      if (mode === "split" && sale.splitDetails) {
        try {
          const splitObj = JSON.parse(sale.splitDetails);
          paymentModes.cash += Number(splitObj.cash || 0);
          paymentModes.upi += Number(splitObj.upi || 0);
          paymentModes.card += Number(splitObj.card || 0);
          paymentModes.credit += Number(splitObj.credit || 0);
        } catch {
          paymentModes.cash += saleGross;
        }
      } else if (paymentModes[mode] !== undefined) {
        paymentModes[mode] += saleGross;
      } else {
        paymentModes.cash += saleGross;
      }

      // Branch Stats
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

      // Line Items Processing
      for (const item of sale.items) {
        const linePrice = Number(item.price);
        const purchaseCost = Number(item.batch?.purchasePrice || Number(item.mrp) * 0.7); // Fallback to 70% if unrecorded
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

    const netRealizedRevenue = Math.max(0, Math.round((grossSalesTotal - totalRefunds) * 100) / 100);
    const overallGrossProfit = Math.round((grossSalesTotal - totalCogs) * 100) / 100;
    const overallGrossMarginPercent =
      grossSalesTotal > 0 ? Math.round((overallGrossProfit / grossSalesTotal) * 10000) / 100 : 0;

    // Top 10 Revenue Generating Medicines
    const allMeds = Object.values(medicineSalesMap);
    const topRevenueMedicines = [...allMeds]
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10)
      .map((m, idx) => ({
        rank: idx + 1,
        ...m,
        revenueSharePercent: grossSalesTotal > 0 ? Math.round((m.totalRevenue / grossSalesTotal) * 1000) / 10 : 0,
      }));

    // Top High Margin Products
    const topMarginMedicines = [...allMeds]
      .filter((m) => m.totalRevenue > 0)
      .sort((a, b) => b.grossMargin - a.grossMargin)
      .slice(0, 10)
      .map((m, idx) => ({
        rank: idx + 1,
        ...m,
        marginPercent: m.totalRevenue > 0 ? Math.round((m.grossMargin / m.totalRevenue) * 1000) / 10 : 0,
      }));

    // Payment Mode Shares
    const totalPayments = Object.values(paymentModes).reduce((a, b) => a + b, 0);
    const paymentBreakdown = Object.entries(paymentModes).map(([mode, amt]) => ({
      mode: mode.toUpperCase(),
      amount: Math.round(amt * 100) / 100,
      sharePercent: totalPayments > 0 ? Math.round((amt / totalPayments) * 1000) / 10 : 0,
    }));

    // Time-series array
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
        cogs: Math.round(totalCogs * 100) / 100,
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
