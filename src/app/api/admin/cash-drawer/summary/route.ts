import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, canAccessPage } from "@/lib/rbac";
import { calculateShiftCashFigures } from "@/lib/cashDrawerServer";

/**
 * MODULE 2.12.2: Live Cash Drawer Shift Summary & Expected Balance Calculation
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!canAccessPage(auth.session, "/admin/financials") && !canAccessPage(auth.session, "/admin/pos")) {
    return NextResponse.json({ success: false, message: "Forbidden: Access to cash drawer summary denied" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");
  const shiftStartParam = searchParams.get("shiftStart");
  const shiftEndParam = searchParams.get("shiftEnd");

  try {
    let targetBranchId: number | null = auth.session.branchId;
    if (!targetBranchId && branchIdParam && branchIdParam !== "all") {
      const bId = parseInt(branchIdParam, 10);
      if (isNaN(bId) || !canAccessBranch(auth.session, bId)) {
        return NextResponse.json({ success: false, message: "Forbidden: Unauthorized branch access" }, { status: 403 });
      }
      targetBranchId = bId;
    }

    if (targetBranchId && auth.session.storeId) {
      const br = await prisma.branch.findUnique({ where: { id: targetBranchId }, select: { storeId: true } });
      if (!br || (br.storeId && br.storeId !== auth.session.storeId)) {
        return NextResponse.json({ success: false, message: "Forbidden: Branch belongs to another store" }, { status: 403 });
      }
    }

    if (!targetBranchId) {
      const firstBranch = await prisma.branch.findFirst({
        where: auth.session.storeId ? { storeId: auth.session.storeId } : {},
        orderBy: [{ isMain: "desc" }, { id: "asc" }],
      });
      targetBranchId = firstBranch?.id ?? null;
    }

    const lastClosing = await prisma.cashDrawerClosing.findFirst({
      where: {
        ...(targetBranchId ? { branchId: targetBranchId } : {}),
        ...(auth.session.storeId ? { storeId: auth.session.storeId } : {}),
      },
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
      shiftStart.setHours(0, 0, 0, 0);
    }

    const shiftEnd = shiftEndParam ? new Date(shiftEndParam) : new Date();

    const figures = await calculateShiftCashFigures({
      storeId: auth.session.storeId,
      branchId: targetBranchId,
      shiftStart,
      shiftEnd,
    });

    const suggestedOpeningFloat = lastClosing ? Number(lastClosing.countedCash) : 0;

    // Expected Cash = Opening Float + Cash Sales - Cash Returns - Cash Expenses + Cash Incomes + Cash Baki Collections - Cash Supplier Payouts
    const expectedCash =
      Math.round(
        (suggestedOpeningFloat +
          figures.cashSales -
          figures.cashReturns -
          figures.cashExpenses +
          figures.cashIncomes +
          figures.cashBakiCollections -
          figures.cashSupplierPayouts) *
          100
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
        cashSales: figures.cashSales,
        cashReturns: figures.cashReturns,
        cashExpenses: figures.cashExpenses,
        cashIncomes: figures.cashIncomes,
        cashBakiCollections: figures.cashBakiCollections,
        cashSupplierPayouts: figures.cashSupplierPayouts,
        expectedCash,
        totalSalesCount: figures.totalSalesCount,
        otherChannels: {
          upiSales: figures.upiSales,
          cardSales: figures.cardSales,
          chequeSales: figures.chequeSales,
          creditSales: figures.creditSales,
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
