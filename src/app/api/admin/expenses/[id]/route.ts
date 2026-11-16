import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch } from "@/lib/rbac";
import { logAudit, getClientIp } from "@/lib/audit";

/**
 * GET & DELETE /api/admin/expenses/[id]
 * Fetches or removes a single expense/income voucher.
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const expenseId = parseInt(id, 10);
  if (isNaN(expenseId)) {
    return NextResponse.json({ success: false, message: "Invalid expense ID" }, { status: 400 });
  }

  try {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        branch: { select: { id: true, code: true, name: true, address: true, phone: true } },
        user: { select: { id: true, name: true, role: true } },
      },
    });

    if (!expense) {
      return NextResponse.json({ success: false, message: "Expense voucher not found" }, { status: 404 });
    }

    // Branch access check
    if (expense.branchId && !canAccessBranch(auth.session, expense.branchId)) {
      return NextResponse.json({ success: false, message: "Forbidden: No branch access" }, { status: 403 });
    }

    return NextResponse.json({ success: true, expense });
  } catch (error: any) {
    console.error("GET /api/admin/expenses/[id] error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch voucher" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const expenseId = parseInt(id, 10);
  if (isNaN(expenseId)) {
    return NextResponse.json({ success: false, message: "Invalid expense ID" }, { status: 400 });
  }

  try {
    const existing = await prisma.expense.findUnique({
      where: { id: expenseId },
    });

    if (!existing) {
      return NextResponse.json({ success: false, message: "Voucher not found" }, { status: 404 });
    }

    if (existing.branchId && !canAccessBranch(auth.session, existing.branchId)) {
      return NextResponse.json({ success: false, message: "Forbidden: No branch access" }, { status: 403 });
    }

    await prisma.expense.delete({
      where: { id: expenseId },
    });

    await logAudit({
      storeId: auth.session.storeId ?? null,
      action: "EXPENSE_DELETED",
      entity: "Expense",
      entityId: existing.id,
      userId: auth.session.userId,
      branchId: existing.branchId || undefined,
      ipAddress: getClientIp(req),
      details: {
        voucherNo: existing.voucherNo,
        amount: Number(existing.amount),
        type: existing.type,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Voucher ${existing.voucherNo} deleted successfully`,
    });
  } catch (error: any) {
    console.error("DELETE /api/admin/expenses/[id] error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to delete expense" },
      { status: 500 }
    );
  }
}
