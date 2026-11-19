import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySuperAdminRequest } from "@/lib/auth";
import { getClientIp, logPlatformAudit } from "@/lib/audit";
import { getBatchPurchaseCost } from "@/lib/reports";

/**
 * MODULE 3.3.3: Single-Branch Deep-Dive API (`/api/super-admin/branches/[id]`)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifySuperAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { id: rawId } = await params;
  const branchId = parseInt(rawId, 10);
  if (!branchId || isNaN(branchId)) {
    return NextResponse.json({ success: false, message: "Invalid branch ID" }, { status: 400 });
  }

  try {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: {
        store: {
          select: {
            id: true,
            storeName: true,
            storeStatus: true,
            storeGst: true,
            storeDl: true,
            city: true,
            state: true,
          },
        },
      },
    });
    if (!branch) {
      return NextResponse.json({ success: false, message: "Branch not found" }, { status: 404 });
    }

    const thirtyDaysAgoUtc = new Date();
    thirtyDaysAgoUtc.setUTCDate(thirtyDaysAgoUtc.getUTCDate() - 29);

    const [staff, batches, recentSales, recentReturns, recentExpenses, cashClosings, sales30dAgg] =
      await Promise.all([
        prisma.user.findMany({
          where: { branchId },
          select: { id: true, name: true, username: true, email: true, role: true, active: true, lastLogin: true },
        }),
        prisma.batch.findMany({
          where: { branchId },
          orderBy: { expiryDate: "asc" },
          include: { medicine: { select: { id: true, name: true, category: true } } },
          take: 100,
        }),
        prisma.sale.findMany({
          where: { branchId },
          orderBy: [{ saleDate: "desc" }, { id: "desc" }],
          take: 25,
          include: { customer: { select: { name: true, phone: true } } },
        }),
        prisma.return.findMany({
          where: { branchId },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { sale: { select: { invoiceNo: true } } },
        }),
        prisma.expense.findMany({
          where: { branchId },
          orderBy: { expenseDate: "desc" },
          take: 20,
        }),
        prisma.cashDrawerClosing.findMany({
          where: { branchId },
          orderBy: { shiftEnd: "desc" },
          take: 15,
          include: { user: { select: { name: true } } },
        }),
        prisma.sale.aggregate({
          where: { branchId, saleDate: { gte: thirtyDaysAgoUtc } },
          _sum: { grandTotal: true },
          _count: { _all: true },
        }),
      ]);

    const todayMidnight = new Date();
    todayMidnight.setUTCHours(0, 0, 0, 0);
    const thirtyAhead = new Date(todayMidnight.getTime() + 30 * 24 * 60 * 60 * 1000);

    let stockValue = 0;
    let expiredCount = 0;
    let expiring30Count = 0;
    for (const b of batches) {
      stockValue += getBatchPurchaseCost(b, b.mrp) * Math.max(0, b.quantity);
      if (b.quantity > 0) {
        if (b.expiryDate <= todayMidnight) expiredCount++;
        else if (b.expiryDate <= thirtyAhead) expiring30Count++;
      }
    }

    return NextResponse.json({
      success: true,
      branch: {
        ...branch,
        sales30d: Number(sales30dAgg._sum.grandTotal || 0),
        invoices30d: sales30dAgg._count._all,
        stockValue: Math.round(stockValue * 100) / 100,
        expiredCount,
        expiring30Count,
      },
      staff,
      batches: batches.map((b) => ({
        id: b.id,
        medicineName: b.medicine.name,
        category: b.medicine.category,
        batchNo: b.batchNo,
        expiryDate: b.expiryDate,
        quantity: b.quantity,
        purchasePrice: Number(b.purchasePrice),
        mrp: Number(b.mrp),
      })),
      recentSales: recentSales.map((s) => ({
        id: s.id,
        invoiceNo: s.invoiceNo,
        saleDate: s.saleDate,
        grandTotal: Number(s.grandTotal),
        paymentMethod: s.paymentMethod,
        customerName: s.customer?.name || "Walk-in",
      })),
      recentReturns: recentReturns.map((r) => ({
        id: r.id,
        returnNumber: r.returnNumber,
        invoiceNo: r.sale.invoiceNo,
        refundAmount: Number(r.refundAmount),
        status: r.status,
        createdAt: r.createdAt,
      })),
      recentExpenses: recentExpenses.map((e) => ({
        id: e.id,
        voucherNo: e.voucherNo,
        type: e.type,
        category: e.category,
        title: e.title,
        amount: Number(e.amount),
        expenseDate: e.expenseDate,
      })),
      cashClosings: cashClosings.map((c) => ({
        id: c.id,
        closingNumber: c.closingNumber,
        shiftEnd: c.shiftEnd,
        expectedCash: Number(c.expectedCash),
        countedCash: Number(c.countedCash),
        difference: Number(c.difference),
        status: c.status,
        cashierName: c.user?.name || "-",
      })),
    });
  } catch (err: any) {
    console.error("[GET /api/super-admin/branches/[id] Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load branch detail" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifySuperAdminRequest(req, ["ceo", "platform_admin"]);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { id: rawId } = await params;
  const branchId = parseInt(rawId, 10);
  if (!branchId || isNaN(branchId)) {
    return NextResponse.json({ success: false, message: "Invalid branch ID" }, { status: 400 });
  }

  try {
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return NextResponse.json({ success: false, message: "Branch not found" }, { status: 404 });
    }
    const body = await req.json();
    const active = Boolean(body.active);
    if (branch.isMain && !active) {
      return NextResponse.json({ success: false, message: "Cannot deactivate a store's primary MAIN branch." }, { status: 400 });
    }
    const updated = await prisma.branch.update({ where: { id: branchId }, data: { active } });

    await logPlatformAudit({
      platformUserId: auth.session.platformUserId,
      storeId: branch.storeId,
      action: active ? "STORE_BRANCH_ACTIVATED" : "STORE_BRANCH_DEACTIVATED",
      entity: "branches",
      entityId: branchId,
      details: { branchCode: branch.code, branchName: branch.name },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, branch: updated });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to update branch" },
      { status: 500 }
    );
  }
}
