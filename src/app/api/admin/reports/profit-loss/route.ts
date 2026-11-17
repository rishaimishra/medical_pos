import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeReportRequest, getBatchPurchaseCost } from "@/lib/reports";

/**
 * MODULE 2.15.2: Real-Time Profit & Loss (P&L) Engine API
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");

  const authCtx = await authorizeReportRequest(req, branchIdParam);
  if (!authCtx.authorized) return authCtx.response!;

  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  try {
    const targetBranchId = authCtx.branchId ?? null;
    const branchScope = targetBranchId
      ? { branchId: targetBranchId }
      : authCtx.storeId
      ? { branch: { storeId: authCtx.storeId } }
      : {};
    const expenseScope = targetBranchId
      ? { branchId: targetBranchId }
      : authCtx.storeId
      ? { storeId: authCtx.storeId }
      : {};

    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);

    const end = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);

    const dbDateRange = {
      gte: new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0)),
      lte: new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999)),
    };

    const [sales, returns, expenseRecords] = await Promise.all([
      prisma.sale.findMany({
        where: {
          ...branchScope,
          saleDate: dbDateRange,
        },
        include: {
          items: {
            include: {
              batch: { select: { purchasePrice: true, mrp: true } },
            },
          },
        },
      }),
      prisma.return.findMany({
        where: {
          ...branchScope,
          status: "processed",
          createdAt: { gte: start, lte: end },
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
      prisma.expense.findMany({
        where: {
          ...expenseScope,
          expenseDate: { gte: start, lte: end },
        },
        select: {
          type: true,
          category: true,
          amount: true,
        },
      }),
    ]);

    let grossSales = 0;
    let totalDiscount = 0;
    let grossCogs = 0;

    for (const sale of sales) {
      grossSales += Number(sale.grandTotal);
      totalDiscount += Number(sale.discountAmount);

      for (const item of sale.items) {
        const costPrice = getBatchPurchaseCost(item.batch, item.mrp);
        grossCogs += costPrice * item.quantity;
      }
    }

    const totalRefunds = returns.reduce((sum, r) => sum + Number(r.refundAmount), 0);
    let returnedRestockCogs = 0;
    for (const ret of returns) {
      for (const ri of ret.items) {
        if (ri.restockAction === "restock") {
          const unitCost = getBatchPurchaseCost(ri.saleItem?.batch, ri.saleItem?.mrp);
          returnedRestockCogs += unitCost * ri.quantity;
        }
      }
    }

    const cogs = Math.max(0, Math.round((grossCogs - returnedRestockCogs) * 100) / 100);
    const netTurnover = Math.max(0, Math.round((grossSales - totalRefunds) * 100) / 100);

    const grossProfit = Math.round((netTurnover - cogs) * 100) / 100;
    const grossMarginPercent = netTurnover > 0 ? Math.round((grossProfit / netTurnover) * 10000) / 100 : 0;

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
        grossSales: Math.round(grossSales * 100) / 100,
        totalRefunds: Math.round(totalRefunds * 100) / 100,
        totalDiscount: Math.round(totalDiscount * 100) / 100,
        netTurnover,
        cogs,
        grossProfit,
        grossMarginPercent,
        otherIncomes: Math.round(totalOtherIncome * 100) / 100,
        operatingExpenses: Math.round(totalOperatingExpenses * 100) / 100,
        expenseCategoryBreakdown: expenseBreakdown,
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
