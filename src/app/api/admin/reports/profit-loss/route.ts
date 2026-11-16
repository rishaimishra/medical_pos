import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch } from "@/lib/rbac";

/**
 * MODULE 2.15.2: Real-Time Profit & Loss (P&L) Engine API
 *
 * Implements Standard Retail Pharmacy Accounting:
 * 1. Gross Revenue = Total POS Sales
 * 2. Less Sales Returns & Trade Discounts = Net Realized Turnover
 * 3. Less Cost of Goods Sold (COGS: Batch Purchase Cost x Qty Sold)
 *    = GROSS PROFIT (Gross Margin %)
 * 4. Plus Operational Incomes (Clinic fees, scrap, misc)
 * 5. Less Operating Overhead Expenses (Electricity, Rent, Staff Salary, Tea, Delivery)
 *    = NET OPERATING PROFIT (Net Margin %)
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  try {
    let targetBranchId: number | null = auth.session.branchId;
    if (!targetBranchId && branchIdParam && branchIdParam !== "all") {
      const bId = parseInt(branchIdParam, 10);
      if (!isNaN(bId) && canAccessBranch(auth.session, bId)) {
        targetBranchId = bId;
      }
    }

    const branchFilter = targetBranchId ? { branchId: targetBranchId } : {};

    // Date range boundaries (defaults to current month if unspecified)
    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);

    const end = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);

    // 1. Fetch Sales and Line Items (to compute Revenue and COGS)
    const sales = await prisma.sale.findMany({
      where: {
        ...branchFilter,
        saleDate: { gte: start, lte: end },
      },
      include: {
        items: {
          include: {
            batch: { select: { purchasePrice: true, mrp: true } },
          },
        },
      },
    });

    let grossSales = 0;
    let totalDiscount = 0;
    let cogs = 0;

    for (const sale of sales) {
      grossSales += Number(sale.grandTotal);
      totalDiscount += Number(sale.discountAmount);

      for (const item of sale.items) {
        const costPrice = Number(item.batch?.purchasePrice || Number(item.mrp) * 0.7);
        cogs += costPrice * item.quantity;
      }
    }

    // 2. Fetch Returns in period
    const returns = await prisma.return.findMany({
      where: {
        ...branchFilter,
        status: "processed",
        createdAt: { gte: start, lte: end },
      },
      select: { refundAmount: true },
    });

    const totalRefunds = returns.reduce((sum, r) => sum + Number(r.refundAmount), 0);
    const netTurnover = Math.max(0, Math.round((grossSales - totalRefunds) * 100) / 100);

    // Gross Profit
    const grossProfit = Math.round((netTurnover - cogs) * 100) / 100;
    const grossMarginPercent = netTurnover > 0 ? Math.round((grossProfit / netTurnover) * 10000) / 100 : 0;

    // 3. Fetch Operational Expenses & Incomes
    const expenseRecords = await prisma.expense.findMany({
      where: {
        ...branchFilter,
        expenseDate: { gte: start, lte: end },
      },
      select: {
        type: true,
        category: true,
        amount: true,
      },
    });

    let totalOperatingExpenses = 0;
    let totalOtherIncome = 0;
    const expenseBreakdown: Record<string, number> = {};

    for (const exp of expenseRecords) {
      const amt = Number(exp.amount);
      if (exp.type === "expense") {
        totalOperatingExpenses += amt;
        expenseBreakdown[exp.category] = (expenseBreakdown[exp.category] || 0) + amt;
      } else if (exp.type === "income") {
        totalOtherIncome += amt;
      }
    }

    // Net Operating Profit
    const netProfit = Math.round((grossProfit + totalOtherIncome - totalOperatingExpenses) * 100) / 100;
    const netMarginPercent = netTurnover > 0 ? Math.round((netProfit / netTurnover) * 10000) / 100 : 0;

    return NextResponse.json({
      success: true,
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        branchId: targetBranchId,
      },
      statement: {
        // Income Side
        grossSales: Math.round(grossSales * 100) / 100,
        totalRefunds: Math.round(totalRefunds * 100) / 100,
        totalDiscount: Math.round(totalDiscount * 100) / 100,
        netTurnover,

        // Direct Cost
        cogs: Math.round(cogs * 100) / 100,
        grossProfit,
        grossMarginPercent,

        // Operating Overheads
        otherIncomes: Math.round(totalOtherIncome * 100) / 100,
        operatingExpenses: Math.round(totalOperatingExpenses * 100) / 100,
        expenseCategoryBreakdown: expenseBreakdown,

        // Bottom Line
        netProfit,
        netMarginPercent,
        status: netProfit >= 0 ? "profitable" : "loss_making",
        totalInvoices: sales.length,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/reports/profit-loss error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to generate Profit & Loss report" },
      { status: 500 }
    );
  }
}
