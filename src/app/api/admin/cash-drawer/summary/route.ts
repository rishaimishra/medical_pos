import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch } from "@/lib/rbac";

/**
 * MODULE 2.12.2: Live Cash Drawer Shift Summary & Expected Balance Calculation
 * 
 * Aggregates live shift metrics for Day-End Z-Report closing:
 * - Opening Float (from last shift closing or 0)
 * - Cash Sales (+ receipts)
 * - Cash Returns (- refunds paid)
 * - Cash Expenses (- petty cash spent on tea, rent, electricity)
 * - Cash Incomes (+ miscellaneous non-sale cash received)
 * - Live Expected Cash in drawer
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");
  const shiftStartParam = searchParams.get("shiftStart");
  const shiftEndParam = searchParams.get("shiftEnd");

  try {
    // Determine target branch
    let targetBranchId: number | null = auth.session.branchId;
    if (!targetBranchId && branchIdParam) {
      const bId = parseInt(branchIdParam, 10);
      if (!isNaN(bId) && canAccessBranch(auth.session, bId)) {
        targetBranchId = bId;
      }
    }

    if (!targetBranchId) {
      const firstBranch = await prisma.branch.findFirst({
        where: auth.session.storeId ? { storeId: auth.session.storeId } : {},
        orderBy: [{ isMain: "desc" }, { id: "asc" }],
      });
      targetBranchId = firstBranch?.id ?? null;
    }

    // Find the latest closed shift for this branch to default shiftStart
    const lastClosing = await prisma.cashDrawerClosing.findFirst({
      where: targetBranchId ? { branchId: targetBranchId } : {},
      orderBy: { shiftEnd: "desc" },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    let shiftStart: Date;
    if (shiftStartParam) {
      shiftStart = new Date(shiftStartParam);
    } else if (lastClosing) {
      shiftStart = new Date(lastClosing.shiftEnd);
    } else {
      shiftStart = new Date();
      shiftStart.setHours(0, 0, 0, 0); // start of today
    }

    const shiftEnd = shiftEndParam ? new Date(shiftEndParam) : new Date();

    const branchFilter = targetBranchId ? { branchId: targetBranchId } : {};

    // 1. Fetch Sales in shift window
    const sales = await prisma.sale.findMany({
      where: {
        ...branchFilter,
        saleDate: {
          gte: shiftStart,
          lte: shiftEnd,
        },
      },
      select: {
        id: true,
        invoiceNo: true,
        grandTotal: true,
        paymentMethod: true,
        splitDetails: true,
      },
    });

    let cashSales = 0;
    let upiSales = 0;
    let cardSales = 0;
    let creditSales = 0;
    let totalSalesCount = sales.length;

    for (const sale of sales) {
      const total = Number(sale.grandTotal);
      const method = (sale.paymentMethod || "cash").toLowerCase();

      if (method === "cash") {
        cashSales += total;
      } else if (method === "upi") {
        upiSales += total;
      } else if (method === "card") {
        cardSales += total;
      } else if (method === "credit") {
        creditSales += total;
      } else if (method === "split" && sale.splitDetails) {
        try {
          const splitObj = typeof sale.splitDetails === "string"
            ? JSON.parse(sale.splitDetails)
            : sale.splitDetails;
          cashSales += Number(splitObj.cash || 0);
          upiSales += Number(splitObj.upi || 0);
          cardSales += Number(splitObj.card || 0);
          creditSales += Number(splitObj.credit || 0);
        } catch {
          cashSales += total;
        }
      } else {
        cashSales += total;
      }
    }

    // 2. Fetch Returns with cash refund in shift window
    const returns = await prisma.return.findMany({
      where: {
        ...branchFilter,
        createdAt: {
          gte: shiftStart,
          lte: shiftEnd,
        },
      },
      select: {
        id: true,
        refundAmount: true,
      },
    });

    let cashReturns = 0;
    for (const ret of returns) {
      cashReturns += Number(ret.refundAmount);
    }

    // 3. Fetch Operational Expenses & Incomes paid in cash in shift window
    const expenses = await prisma.expense.findMany({
      where: {
        ...branchFilter,
        paymentMode: "cash",
        expenseDate: {
          gte: shiftStart,
          lte: shiftEnd,
        },
      },
      select: {
        id: true,
        type: true,
        amount: true,
        category: true,
        title: true,
      },
    });

    let cashExpenses = 0;
    let cashIncomes = 0;
    for (const exp of expenses) {
      const amt = Number(exp.amount);
      if (exp.type === "expense") {
        cashExpenses += amt;
      } else if (exp.type === "income") {
        cashIncomes += amt;
      }
    }

    // Default opening float from last shift counted cash (or 0)
    const suggestedOpeningFloat = lastClosing ? Number(lastClosing.countedCash) : 0;

    // Expected Cash Formula: Opening Float + Cash Sales - Cash Returns - Cash Expenses + Cash Incomes
    const expectedCash = Math.round(
      (suggestedOpeningFloat + cashSales - cashReturns - cashExpenses + cashIncomes) * 100
    ) / 100;

    return NextResponse.json({
      success: true,
      shift: {
        branchId: targetBranchId,
        shiftStart: shiftStart.toISOString(),
        shiftEnd: shiftEnd.toISOString(),
        isOngoing: true,
      },
      lastClosing: lastClosing
        ? {
            id: lastClosing.id,
            closingNumber: lastClosing.closingNumber,
            closedAt: lastClosing.shiftEnd,
            countedCash: Number(lastClosing.countedCash),
            cashierName: lastClosing.user?.name || "Previous Staff",
          }
        : null,
      figures: {
        suggestedOpeningFloat: Math.round(suggestedOpeningFloat * 100) / 100,
        cashSales: Math.round(cashSales * 100) / 100,
        cashReturns: Math.round(cashReturns * 100) / 100,
        cashExpenses: Math.round(cashExpenses * 100) / 100,
        cashIncomes: Math.round(cashIncomes * 100) / 100,
        expectedCash,
        totalSalesCount,
        otherChannels: {
          upiSales: Math.round(upiSales * 100) / 100,
          cardSales: Math.round(cardSales * 100) / 100,
          creditSales: Math.round(creditSales * 100) / 100,
        },
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/cash-drawer/summary error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to calculate cash drawer summary" },
      { status: 500 }
    );
  }
}
