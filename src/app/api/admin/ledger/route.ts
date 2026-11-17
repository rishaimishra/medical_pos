import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch } from "@/lib/rbac";

/**
 * MODULE 2.13.1: Master Financial Ledger API
 * 
 * Aggregates chronologically:
 * - Sales (Credit: customer payments & cash collections)
 * - Purchases (Debit: inventory procurement & supplier bills)
 * - Supplier Direct Payments (Debit: accounts payable settlements)
 * - Sales Returns (Debit: counter refunds issued to customers)
 * - Operational Expenses (Debit: rent, electricity, tea, staff salary)
 * - Operational Incomes (Credit: non-sale miscellaneous revenue)
 * - Customer Settlements (Credit: Baki Khata collections)
 * 
 * Supports:
 * - Date Range Filter
 * - Branch Scoping
 * - Party Filter (Customer, Supplier, Payee, General)
 * - Entry Type Filter (Credit / Debit / All)
 * - Search Filter (party name, voucher/invoice #, note)
 * - Chronological Running Balance & KPI Summary
 */

export interface MasterLedgerEntry {
  id: string;
  date: string;
  refNo: string;
  source: "sale" | "purchase" | "return" | "expense" | "income" | "supplier_payment" | "customer_payment";
  entryType: "credit" | "debit";
  category: string;
  partyType: "customer" | "supplier" | "expense_payee" | "general";
  partyName: string;
  partyPhone?: string;
  branchId?: number | null;
  branchName?: string;
  branchCode?: string;
  paymentMode: string;
  amount: number;
  credit: number;
  debit: number;
  runningBalance?: number;
  notes?: string;
}

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");
  const partyType = searchParams.get("partyType"); // "all" | "customer" | "supplier" | "expense_payee" | "general"
  const entryType = searchParams.get("entryType"); // "all" | "credit" | "debit"
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const search = searchParams.get("search")?.trim().toLowerCase() || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

  try {
    // 1. Resolve Branch & Tenant Filters
    let targetBranchId: number | null = auth.session.branchId;
    if (!targetBranchId && branchIdParam && branchIdParam !== "all") {
      const bId = parseInt(branchIdParam, 10);
      if (!isNaN(bId) && canAccessBranch(auth.session, bId)) {
        targetBranchId = bId;
      }
    }

    const branchFilter = targetBranchId ? { branchId: targetBranchId } : {};

    // Date range boundaries
    let dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter = {};
      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        dateFilter.gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        dateFilter.lte = e;
      }
    }

    // 2. Fetch parallel data across financial domains
    const [sales, purchases, supplierPayments, returns, expenses, customerPayments] = await Promise.all([
      // A. Sales (Credit)
      prisma.sale.findMany({
        where: {
          ...branchFilter,
          ...(dateFilter.gte || dateFilter.lte ? { saleDate: dateFilter } : {}),
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, code: true, name: true } },
        },
        orderBy: { saleDate: "desc" },
      }),

      // B. Purchases / POs (Debit)
      prisma.purchaseOrder.findMany({
        where: {
          ...branchFilter,
          status: { in: ["received", "partially_received", "completed", "confirmed"] },
          ...(dateFilter.gte || dateFilter.lte ? { poDate: dateFilter } : {}),
        },
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, code: true, name: true } },
        },
        orderBy: { poDate: "desc" },
      }),

      // C. Supplier Direct Payments (Debit)
      prisma.supplierPayment.findMany({
        where: {
          ...branchFilter,
          ...(dateFilter.gte || dateFilter.lte ? { paymentDate: dateFilter } : {}),
        },
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, code: true, name: true } },
        },
        orderBy: { paymentDate: "desc" },
      }),

      // D. Sales Returns (Debit)
      prisma.return.findMany({
        where: {
          ...branchFilter,
          status: "processed",
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}),
        },
        include: {
          sale: {
            select: {
              invoiceNo: true,
              customer: { select: { id: true, name: true, phone: true } },
            },
          },
          branch: { select: { id: true, code: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),

      // E. Operational Expenses & Incomes
      prisma.expense.findMany({
        where: {
          ...branchFilter,
          ...(dateFilter.gte || dateFilter.lte ? { expenseDate: dateFilter } : {}),
        },
        include: {
          branch: { select: { id: true, code: true, name: true } },
        },
        orderBy: { expenseDate: "desc" },
      }),

      // F. Customer Credit Payments / Settlements (Credit)
      prisma.customerPayment.findMany({
        where: {
          ...branchFilter,
          ...(dateFilter.gte || dateFilter.lte ? { paymentDate: dateFilter } : {}),
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, code: true, name: true } },
        },
        orderBy: { paymentDate: "desc" },
      }),
    ]);

    // 3. Normalize into uniform ledger records
    const allEntries: MasterLedgerEntry[] = [];

    // Sales -> Credit
    for (const s of sales) {
      const amt = Number(s.grandTotal);
      allEntries.push({
        id: `sale-${s.id}`,
        date: s.saleDate.toISOString(),
        refNo: s.invoiceNo,
        source: "sale",
        entryType: "credit",
        category: "Pharma Counter Sale",
        partyType: "customer",
        partyName: s.customer?.name || "Walk-in Patient",
        partyPhone: s.customer?.phone || undefined,
        branchId: s.branch?.id,
        branchName: s.branch?.name,
        branchCode: s.branch?.code,
        paymentMode: (s.paymentMethod || "cash").toUpperCase(),
        amount: amt,
        credit: amt,
        debit: 0,
        notes: `Invoice: ${s.invoiceNo} • Net Total: ₹${amt.toFixed(2)}`,
      });
    }

    // Purchases -> Debit
    for (const p of purchases) {
      const amt = Number(p.total);
      allEntries.push({
        id: `po-${p.id}`,
        date: p.poDate.toISOString(),
        refNo: p.poNumber,
        source: "purchase",
        entryType: "debit",
        category: "Medicine Stock Inward",
        partyType: "supplier",
        partyName: p.supplier?.name || "Distributor Vendor",
        partyPhone: p.supplier?.phone || undefined,
        branchId: p.branch?.id,
        branchName: p.branch?.name,
        branchCode: p.branch?.code,
        paymentMode: "CREDIT / INVOICE",
        amount: amt,
        credit: 0,
        debit: amt,
        notes: p.invoiceNo ? `Vendor Bill: ${p.invoiceNo}` : `PO Status: ${p.status}`,
      });
    }

    // Supplier Direct Payments -> Debit
    for (const sp of supplierPayments) {
      const amt = Number(sp.amount);
      allEntries.push({
        id: `suppay-${sp.id}`,
        date: sp.paymentDate.toISOString(),
        refNo: sp.referenceNo || `SUP-PAY-${sp.id}`,
        source: "supplier_payment",
        entryType: "debit",
        category: "Supplier Account Settlement",
        partyType: "supplier",
        partyName: sp.supplier?.name || "Vendor",
        partyPhone: sp.supplier?.phone || undefined,
        branchId: sp.branch?.id,
        branchName: sp.branch?.name,
        branchCode: sp.branch?.code,
        paymentMode: (sp.paymentMethod || "bank_transfer").toUpperCase(),
        amount: amt,
        credit: 0,
        debit: amt,
        notes: sp.notes || `Paid to ${sp.supplier?.name || "distributor"}`,
      });
    }

    // Sales Returns -> Debit
    for (const r of returns) {
      const amt = Number(r.refundAmount);
      allEntries.push({
        id: `return-${r.id}`,
        date: r.createdAt.toISOString(),
        refNo: r.returnNumber,
        source: "return",
        entryType: "debit",
        category: "Counter Medicine Refund",
        partyType: "customer",
        partyName: r.sale?.customer?.name || "Walk-in Patient",
        partyPhone: r.sale?.customer?.phone || undefined,
        branchId: r.branch?.id,
        branchName: r.branch?.name,
        branchCode: r.branch?.code,
        paymentMode: "CASH",
        amount: amt,
        credit: 0,
        debit: amt,
        notes: `Original Bill: ${r.sale?.invoiceNo || "-"} • Reason: ${r.reason || "Customer Return"}`,
      });
    }

    // Operational Expenses & Incomes
    for (const exp of expenses) {
      const amt = Number(exp.amount);
      const isIncome = exp.type === "income";
      allEntries.push({
        id: `expense-${exp.id}`,
        date: exp.expenseDate.toISOString(),
        refNo: exp.voucherNo,
        source: isIncome ? "income" : "expense",
        entryType: isIncome ? "credit" : "debit",
        category: exp.category,
        partyType: exp.payeeOrPayer ? "expense_payee" : "general",
        partyName: exp.payeeOrPayer || (isIncome ? "Payer / Customer" : "Vendor / Staff"),
        branchId: exp.branch?.id,
        branchName: exp.branch?.name,
        branchCode: exp.branch?.code,
        paymentMode: exp.paymentMode.toUpperCase(),
        amount: amt,
        credit: isIncome ? amt : 0,
        debit: isIncome ? 0 : amt,
        notes: `${exp.title}${exp.referenceNo ? ` • Ref: ${exp.referenceNo}` : ""}${exp.notes ? ` • ${exp.notes}` : ""}`,
      });
    }

    // Customer Credit Settlements -> Credit
    for (const cp of customerPayments) {
      const amt = Number(cp.amount);
      allEntries.push({
        id: `custpay-${cp.id}`,
        date: cp.paymentDate.toISOString(),
        refNo: cp.referenceNo || `CUST-PAY-${cp.id}`,
        source: "customer_payment",
        entryType: "credit",
        category: "Baki Khata Settlement",
        partyType: "customer",
        partyName: cp.customer?.name || "Patient",
        partyPhone: cp.customer?.phone || undefined,
        branchId: cp.branch?.id,
        branchName: cp.branch?.name,
        branchCode: cp.branch?.code,
        paymentMode: (cp.paymentMethod || "cash").toUpperCase(),
        amount: amt,
        credit: amt,
        debit: 0,
        notes: cp.notes || `Credit clearance by ${cp.customer?.name || "patient"}`,
      });
    }

    // 4. Sort all entries chronologically (oldest first to compute running balance correctly)
    allEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 5. Compute chronological running balance
    let currentBalance = 0;
    for (const entry of allEntries) {
      currentBalance += entry.credit - entry.debit;
      entry.runningBalance = Math.round(currentBalance * 100) / 100;
    }

    // 6. Apply post-aggregation filters
    let filtered = allEntries;

    if (partyType && partyType !== "all") {
      filtered = filtered.filter((e) => e.partyType === partyType);
    }

    if (entryType && entryType !== "all") {
      filtered = filtered.filter((e) => e.entryType === entryType);
    }

    if (search) {
      filtered = filtered.filter(
        (e) =>
          e.refNo.toLowerCase().includes(search) ||
          e.partyName.toLowerCase().includes(search) ||
          e.category.toLowerCase().includes(search) ||
          (e.notes && e.notes.toLowerCase().includes(search)) ||
          (e.partyPhone && e.partyPhone.includes(search))
      );
    }

    // KPI Aggregation over filtered results
    let totalCredit = 0;
    let totalDebit = 0;
    for (const row of filtered) {
      totalCredit += row.credit;
      totalDebit += row.debit;
    }
    const netCashFlow = Math.round((totalCredit - totalDebit) * 100) / 100;

    // Sort descending for display (most recent first)
    const reversed = [...filtered].reverse();

    // Paginate
    const totalCount = reversed.length;
    const paginatedEntries = reversed.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      success: true,
      entries: paginatedEntries,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      summary: {
        totalCredit: Math.round(totalCredit * 100) / 100,
        totalDebit: Math.round(totalDebit * 100) / 100,
        netCashFlow,
        totalTransactions: totalCount,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/ledger error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch ledger" },
      { status: 500 }
    );
  }
}
