import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, canAccessPage } from "@/lib/rbac";
import { logAudit, getClientIp } from "@/lib/audit";
import { calculateShiftCashFigures } from "@/lib/cashDrawerServer";

/**
 * MODULE 2.12.2: Day-End Cash Drawer Reconciliation (Z-Report Closing)
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

  if (!canAccessPage(auth.session, "/admin/financials")) {
    return NextResponse.json({ success: false, message: "Forbidden: Access to close cash drawer denied" }, { status: 403 });
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

    // Resolve & authorize branch
    let targetBranchId: number | null = auth.session.branchId;
    if (!targetBranchId && branchId) {
      const bId = parseInt(String(branchId), 10);
      if (isNaN(bId) || !canAccessBranch(auth.session, bId)) {
        return NextResponse.json({ success: false, message: "Forbidden: Invalid or unauthorized branch" }, { status: 403 });
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
      const coinsVal = Math.max(0, parseFloat(String(denominations.coins || 0)));
      cleanDenominations.coins = coinsVal;
      countedCash += coinsVal;
    }

    countedCash = Math.round(countedCash * 100) / 100;

    // Resolve shift boundaries
    const shiftEnd = shiftEndParam ? new Date(shiftEndParam) : new Date();
    let shiftStart: Date;
    if (shiftStartParam) {
      shiftStart = new Date(shiftStartParam);
    } else {
      const lastClosing = await prisma.cashDrawerClosing.findFirst({
        where: {
          ...(targetBranchId ? { branchId: targetBranchId } : {}),
          ...(auth.session.storeId ? { storeId: auth.session.storeId } : {}),
        },
        orderBy: { shiftEnd: "desc" },
      });
      if (lastClosing) {
        shiftStart = new Date(lastClosing.shiftEnd);
      } else {
        shiftStart = new Date();
        shiftStart.setHours(0, 0, 0, 0);
      }
    }

    // 2. Query Cash Transactions during Shift via shared shift helper
    const figures = await calculateShiftCashFigures({
      storeId: auth.session.storeId,
      branchId: targetBranchId,
      shiftStart,
      shiftEnd,
    });

    const openingFloat = Math.max(0, parseFloat(String(openingFloatParam || 0)));

    const totalCashIn = figures.cashSales + figures.cashIncomes + figures.cashBakiCollections;
    const totalCashOut = figures.cashReturns + figures.cashExpenses + figures.cashSupplierPayouts;
    const expectedCash = Math.round((openingFloat + totalCashIn - totalCashOut) * 100) / 100;

    const difference = Math.round((countedCash - expectedCash) * 100) / 100;
    let status: "exact" | "excess" | "shortage" = "exact";
    if (difference > 0) status = "excess";
    else if (difference < 0) status = "shortage";

    // 3. Concurrency-safe ZREP-YYYY-XXXXX sequential numbering inside transaction
    const year = new Date().getFullYear();
    const zrepPrefix = `ZREP-${year}-`;

    const closing = await runInTransaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026004)`;
      const lastZ = await tx.cashDrawerClosing.findFirst({
        where: { closingNumber: { startsWith: zrepPrefix } },
        orderBy: { id: "desc" },
        select: { closingNumber: true },
      });
      let nextSeq = 1;
      if (lastZ?.closingNumber) {
        const parts = lastZ.closingNumber.split("-");
        const parsed = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(parsed)) nextSeq = parsed + 1;
      }
      const closingNumber = `${zrepPrefix}${String(nextSeq).padStart(5, "0")}`;

      return await tx.cashDrawerClosing.create({
        data: {
          closingNumber,
          storeId: auth.session!.storeId ?? null,
          branchId: targetBranchId,
          userId: auth.session!.userId,
          shiftStart,
          shiftEnd,
          openingFloat,
          cashSales: figures.cashSales,
          cashReturns: figures.cashReturns,
          cashExpenses: Math.round((figures.cashExpenses + figures.cashSupplierPayouts) * 100) / 100,
          cashIncomes: Math.round((figures.cashIncomes + figures.cashBakiCollections) * 100) / 100,
          expectedCash,
          countedCash,
          difference,
          status,
          denominations: JSON.stringify(cleanDenominations),
          totalSalesCount: figures.totalSalesCount,
          notes: notes?.trim() || null,
        },
        include: {
          branch: { select: { id: true, code: true, name: true, phone: true, address: true, gstNo: true, dlNo: true } },
          user: { select: { id: true, name: true, role: true } },
        },
      });
    });

    await logAudit({
      storeId: auth.session.storeId ?? null,
      action: "CASH_DRAWER_CLOSED",
      entity: "CashDrawerClosing",
      entityId: closing.id,
      userId: auth.session.userId,
      branchId: targetBranchId || undefined,
      ipAddress: getClientIp(req),
      details: {
        closingNumber: closing.closingNumber,
        expectedCash,
        countedCash,
        difference,
        status,
        salesCount: figures.totalSalesCount,
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
