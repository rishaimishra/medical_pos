import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch } from "@/lib/rbac";
import { logAudit, getClientIp } from "@/lib/audit";

/**
 * MODULE 2.12.2: Day-End Cash Drawer Reconciliation (Z-Report Closing)
 * 
 * End-of-shift register closing tool:
 * 1. Cashier counts and enters physical currency denominations:
 *    ₹2000, ₹500, ₹200, ₹100, ₹50, ₹20, ₹10, ₹5, ₹2, ₹1, and Coins.
 * 2. Compares physical cash against recorded sales/returns/expenses/float.
 * 3. Flags Exact Match, Cash Excess (+₹X), or Cash Shortage (-₹X).
 * 4. Generates Z-Report slip with number ZREP-YYYY-XXXXX and logs audit trail.
 */

const VALID_DENOMINATION_VALUES: Record<string, number> = {
  "2000": 2000,
  "500": 500,
  "200": 200,
  "100": 100,
  "50": 50,
  "20": 20,
  "10": 10,
  "5": 5,
  "2": 2,
  "1": 1,
};

export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const {
      branchId,
      shiftStart: shiftStartParam,
      shiftEnd: shiftEndParam,
      openingFloat: openingFloatParam,
      denominations,
      notes,
    } = body;

    // Resolve branch
    let targetBranchId: number | null = auth.session.branchId;
    if (!targetBranchId && branchId) {
      const bId = parseInt(String(branchId), 10);
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

    // 1. Calculate Physical Counted Cash from Denominations
    let countedCash = 0;
    const cleanDenominations: Record<string, number> = {
      "2000": 0,
      "500": 0,
      "200": 0,
      "100": 0,
      "50": 0,
      "20": 0,
      "10": 0,
      "5": 0,
      "2": 0,
      "1": 0,
      coins: 0,
    };

    if (denominations && typeof denominations === "object") {
      for (const [key, multiplier] of Object.entries(VALID_DENOMINATION_VALUES)) {
        const count = Math.max(0, parseInt(String(denominations[key] || 0), 10));
        cleanDenominations[key] = count;
        countedCash += count * multiplier;
      }
      // Add loose coins / change value
      const coinsVal = Math.max(0, parseFloat(String(denominations.coins || 0)));
      cleanDenominations.coins = coinsVal;
      countedCash += coinsVal;
    }

    countedCash = Math.round(countedCash * 100) / 100;

    // Resolve shift time boundaries
    const shiftEnd = shiftEndParam ? new Date(shiftEndParam) : new Date();
    let shiftStart: Date;
    if (shiftStartParam) {
      shiftStart = new Date(shiftStartParam);
    } else {
      const lastClosing = await prisma.cashDrawerClosing.findFirst({
        where: targetBranchId ? { branchId: targetBranchId } : {},
        orderBy: { shiftEnd: "desc" },
      });
      if (lastClosing) {
        shiftStart = new Date(lastClosing.shiftEnd);
      } else {
        shiftStart = new Date();
        shiftStart.setHours(0, 0, 0, 0);
      }
    }

    const branchFilter = targetBranchId ? { branchId: targetBranchId } : {};

    // 2. Query Cash Transactions during Shift
    const [sales, returns, expenses] = await Promise.all([
      prisma.sale.findMany({
        where: {
          ...branchFilter,
          saleDate: { gte: shiftStart, lte: shiftEnd },
        },
        select: { grandTotal: true, paymentMethod: true, splitDetails: true },
      }),
      prisma.return.findMany({
        where: {
          ...branchFilter,
          createdAt: { gte: shiftStart, lte: shiftEnd },
        },
        select: { refundAmount: true },
      }),
      prisma.expense.findMany({
        where: {
          ...branchFilter,
          paymentMode: "cash",
          expenseDate: { gte: shiftStart, lte: shiftEnd },
        },
        select: { type: true, amount: true },
      }),
    ]);

    let cashSales = 0;
    for (const sale of sales) {
      const method = (sale.paymentMethod || "cash").toLowerCase();
      const total = Number(sale.grandTotal);
      if (method === "cash") {
        cashSales += total;
      } else if (method === "split" && sale.splitDetails) {
        try {
          const splitObj = typeof sale.splitDetails === "string"
            ? JSON.parse(sale.splitDetails)
            : sale.splitDetails;
          cashSales += Number(splitObj.cash || 0);
        } catch {
          cashSales += total;
        }
      }
    }

    let cashReturns = 0;
    for (const ret of returns) {
      cashReturns += Number(ret.refundAmount);
    }

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

    const openingFloat = Math.max(0, parseFloat(String(openingFloatParam || 0)));

    // System Expected Cash Formula
    const expectedCash = Math.round(
      (openingFloat + cashSales - cashReturns - cashExpenses + cashIncomes) * 100
    ) / 100;

    // Reconciliation Difference
    const difference = Math.round((countedCash - expectedCash) * 100) / 100;
    let status: "exact" | "excess" | "shortage" = "exact";
    if (difference > 0) status = "excess";
    else if (difference < 0) status = "shortage";

    // 3. Generate Z-Report Number: ZREP-YYYY-XXXXX
    const year = new Date().getFullYear();
    const countThisYear = await prisma.cashDrawerClosing.count({
      where: {
        createdAt: {
          gte: new Date(year, 0, 1),
          lte: new Date(year, 11, 31, 23, 59, 59),
        },
      },
    });
    const closingNumber = `ZREP-${year}-${String(countThisYear + 1).padStart(5, "0")}`;

    // 4. Save Record
    const closing = await prisma.cashDrawerClosing.create({
      data: {
        closingNumber,
        storeId: auth.session.storeId ?? null,
        branchId: targetBranchId,
        userId: auth.session.userId,
        shiftStart,
        shiftEnd,
        openingFloat,
        cashSales: Math.round(cashSales * 100) / 100,
        cashReturns: Math.round(cashReturns * 100) / 100,
        cashExpenses: Math.round(cashExpenses * 100) / 100,
        cashIncomes: Math.round(cashIncomes * 100) / 100,
        expectedCash,
        countedCash,
        difference,
        status,
        denominations: JSON.stringify(cleanDenominations),
        totalSalesCount: sales.length,
        notes: notes?.trim() || null,
      },
      include: {
        branch: { select: { id: true, code: true, name: true, phone: true, address: true, gstNo: true, dlNo: true } },
        user: { select: { id: true, name: true, role: true } },
      },
    });

    // 5. System Audit Log
    await logAudit({
      storeId: auth.session.storeId ?? null,
      action: "CASH_DRAWER_CLOSED",
      entity: "CashDrawerClosing",
      entityId: closing.id,
      userId: auth.session.userId,
      branchId: targetBranchId || undefined,
      ipAddress: getClientIp(req),
      details: {
        closingNumber,
        expectedCash,
        countedCash,
        difference,
        status,
        salesCount: sales.length,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Shift closed successfully: ${status === "exact" ? "Exact Match (₹0 diff)" : status === "excess" ? `Cash Excess of +₹${difference.toFixed(2)}` : `Cash Shortage of -₹${Math.abs(difference).toFixed(2)}`}`,
      closing,
    });
  } catch (error: any) {
    console.error("POST /api/admin/cash-drawer/close error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to close cash drawer shift" },
      { status: 500 }
    );
  }
}
