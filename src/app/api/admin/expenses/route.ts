import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, canAccessPage } from "@/lib/rbac";
import { logAudit, getClientIp } from "@/lib/audit";

/**
 * MODULE 2.12.1: General Income & Expense Ledger API
 * 
 * GET: Filter expenses & incomes by Date Range, Branch, Category, Payment Mode, Type, Search.
 * POST: Create operational expense or miscellaneous income voucher with auto EXP-YYYY-XXXXX sequence.
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");
  const type = searchParams.get("type"); // "expense" | "income" | "all"
  const category = searchParams.get("category");
  const paymentMode = searchParams.get("paymentMode");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const search = searchParams.get("search")?.trim() || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const skip = (page - 1) * limit;

  try {
    const whereClause: any = {};

    // Multi-tenant Store scoping
    if (auth.session.storeId) {
      whereClause.storeId = auth.session.storeId;
    }

    // Branch scoping
    if (auth.session.branchId) {
      whereClause.branchId = auth.session.branchId;
    } else if (branchIdParam && branchIdParam !== "all") {
      const bId = parseInt(branchIdParam, 10);
      if (!isNaN(bId)) {
        if (!canAccessBranch(auth.session, bId)) {
          return NextResponse.json({ success: false, message: "Forbidden: No branch access" }, { status: 403 });
        }
        whereClause.branchId = bId;
      }
    }

    // Type filter
    if (type && type !== "all") {
      whereClause.type = type;
    }

    // Category filter
    if (category && category !== "all") {
      whereClause.category = category;
    }

    // Payment mode filter
    if (paymentMode && paymentMode !== "all") {
      whereClause.paymentMode = paymentMode;
    }

    // Date range filter
    if (startDate || endDate) {
      whereClause.expenseDate = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        whereClause.expenseDate.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        whereClause.expenseDate.lte = end;
      }
    }

    // Search filter
    if (search) {
      whereClause.OR = [
        { voucherNo: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
        { payeeOrPayer: { contains: search, mode: "insensitive" } },
        { referenceNo: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
      ];
    }

    // Fetch paginated expenses and total count
    const [expenses, totalCount, allMatching] = await Promise.all([
      prisma.expense.findMany({
        where: whereClause,
        include: {
          branch: { select: { id: true, code: true, name: true } },
          user: { select: { id: true, name: true, role: true } },
        },
        orderBy: { expenseDate: "desc" },
        skip,
        take: limit,
      }),
      prisma.expense.count({ where: whereClause }),
      prisma.expense.findMany({
        where: whereClause,
        select: {
          type: true,
          category: true,
          amount: true,
          paymentMode: true,
        },
      }),
    ]);

    // KPI Summary Calculations
    let totalExpenses = 0;
    let totalIncomes = 0;
    const categoryBreakdown: Record<string, { total: number; count: number }> = {};
    const paymentModeBreakdown: Record<string, number> = {};

    for (const item of allMatching) {
      const amt = Number(item.amount);
      if (item.type === "expense") {
        totalExpenses += amt;
      } else if (item.type === "income") {
        totalIncomes += amt;
      }

      // Category breakdown
      if (!categoryBreakdown[item.category]) {
        categoryBreakdown[item.category] = { total: 0, count: 0 };
      }
      categoryBreakdown[item.category].total += amt;
      categoryBreakdown[item.category].count += 1;

      // Payment mode breakdown
      paymentModeBreakdown[item.paymentMode] = (paymentModeBreakdown[item.paymentMode] || 0) + amt;
    }

    const netOverhead = Math.round((totalExpenses - totalIncomes) * 100) / 100;

    return NextResponse.json({
      success: true,
      expenses,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      summary: {
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        totalIncomes: Math.round(totalIncomes * 100) / 100,
        netOverhead,
        totalRecords: totalCount,
        categoryBreakdown,
        paymentModeBreakdown,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/expenses error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch expenses" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const {
      type = "expense",
      category,
      title,
      amount,
      paymentMode = "cash",
      referenceNo,
      payeeOrPayer,
      notes,
      expenseDate,
      branchId,
    } = body;

    if (!category || !category.trim()) {
      return NextResponse.json({ success: false, message: "Expense category is required" }, { status: 400 });
    }

    if (!title || !title.trim()) {
      return NextResponse.json({ success: false, message: "Title / Description is required" }, { status: 400 });
    }

    const numericAmount = parseFloat(String(amount));
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ success: false, message: "Amount must be a positive number" }, { status: 400 });
    }

    // Branch resolution
    let targetBranchId = auth.session.branchId;
    if (!targetBranchId && branchId) {
      const bId = parseInt(String(branchId), 10);
      if (!isNaN(bId) && canAccessBranch(auth.session, bId)) {
        targetBranchId = bId;
      }
    }

    // If still null, pick main branch or first branch of store
    if (!targetBranchId) {
      const firstBranch = await prisma.branch.findFirst({
        where: auth.session.storeId ? { storeId: auth.session.storeId } : {},
        orderBy: [{ isMain: "desc" }, { id: "asc" }],
      });
      targetBranchId = firstBranch?.id ?? null;
    }

    // Generate Voucher Number: EXP-YYYY-XXXXX
    const year = new Date().getFullYear();
    const countThisYear = await prisma.expense.count({
      where: {
        createdAt: {
          gte: new Date(year, 0, 1),
          lte: new Date(year, 11, 31, 23, 59, 59),
        },
      },
    });
    const voucherNo = `EXP-${year}-${String(countThisYear + 1).padStart(5, "0")}`;

    const createdExpense = await prisma.expense.create({
      data: {
        voucherNo,
        storeId: auth.session.storeId ?? null,
        branchId: targetBranchId,
        userId: auth.session.userId,
        type: type === "income" ? "income" : "expense",
        category: category.trim(),
        title: title.trim(),
        amount: numericAmount,
        paymentMode: (paymentMode || "cash").toLowerCase(),
        referenceNo: referenceNo?.trim() || null,
        payeeOrPayer: payeeOrPayer?.trim() || null,
        notes: notes?.trim() || null,
        expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
      },
      include: {
        branch: { select: { id: true, code: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    });

    // Audit Log
    await logAudit({
      storeId: auth.session.storeId ?? null,
      action: "EXPENSE_RECORDED",
      entity: "Expense",
      entityId: createdExpense.id,
      userId: auth.session.userId,
      branchId: targetBranchId || undefined,
      ipAddress: getClientIp(req),
      details: {
        voucherNo,
        type: createdExpense.type,
        category: createdExpense.category,
        amount: numericAmount,
        paymentMode: createdExpense.paymentMode,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${createdExpense.type === "income" ? "Income" : "Expense"} voucher created successfully`,
      expense: createdExpense,
    });
  } catch (error: any) {
    console.error("POST /api/admin/expenses error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to record expense voucher" },
      { status: 500 }
    );
  }
}
