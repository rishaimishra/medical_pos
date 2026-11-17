import { prisma } from "@/lib/prisma";

export interface MasterLedgerEntry {
  id: string;
  date: string;
  refNo: string;
  source: "sale" | "return" | "expense" | "income" | "supplier_payment" | "customer_payment";
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

export interface LedgerQueryOptions {
  storeId?: number | null;
  branchId?: number | null;
  partyType?: string | null;
  entryType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  search?: string | null;
  page?: number;
  limit?: number;
}

export async function queryMasterLedger(options: LedgerQueryOptions) {
  const {
    storeId,
    branchId,
    partyType,
    entryType,
    startDate,
    endDate,
    search = "",
    page = 1,
    limit = 50,
  } = options;

  const branchScope = branchId
    ? { branchId }
    : storeId
    ? { branch: { storeId } }
    : {};

  const expenseScope = branchId
    ? { branchId }
    : storeId
    ? { storeId }
    : {};

  // Boundaries for DateTime columns vs @db.Date columns
  const dateFilter: { gte?: Date; lte?: Date } = {};
  const dbDateFilter: { gte?: Date; lte?: Date } = {};
  if (startDate) {
    const s = new Date(startDate);
    s.setHours(0, 0, 0, 0);
    dateFilter.gte = s;
    dbDateFilter.gte = new Date(`${startDate}T00:00:00.000Z`);
  }
  if (endDate) {
    const e = new Date(endDate);
    e.setHours(23, 59, 59, 999);
    dateFilter.lte = e;
    dbDateFilter.lte = new Date(`${endDate}T23:59:59.999Z`);
  }

  const hasDateFilter = Boolean(dateFilter.gte || dateFilter.lte);

  const [sales, supplierPayments, returns, expenses, customerPayments] = await Promise.all([
    // A. Paid portion of Sales -> Credit (excludes uncollected Baki Khata creditAmount to avoid double-counting CustomerPayment)
    prisma.sale.findMany({
      where: {
        ...branchScope,
        ...(hasDateFilter ? { saleDate: dbDateFilter } : {}),
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        branch: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),

    // B. Supplier Payments -> Debit (actual vendor cash/bank disbursements)
    prisma.supplierPayment.findMany({
      where: {
        ...branchScope,
        ...(hasDateFilter ? { paymentDate: dbDateFilter } : {}),
      },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        branch: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),

    // C. Processed Sales Returns (cash / upi / card refunds -> Debit; store_credit settles Baki Khata instead of cash flow)
    prisma.return.findMany({
      where: {
        ...branchScope,
        status: "processed",
        refundMethod: { not: "store_credit" },
        ...(hasDateFilter ? { createdAt: dateFilter } : {}),
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

    // D. Operational Expenses & Miscellaneous Incomes
    prisma.expense.findMany({
      where: {
        ...expenseScope,
        ...(hasDateFilter ? { expenseDate: dateFilter } : {}),
      },
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
      orderBy: { expenseDate: "desc" },
    }),

    // E. Customer Baki Khata Settlements -> Credit (excluding store_credit return adjustments)
    prisma.customerPayment.findMany({
      where: {
        ...branchScope,
        paymentMethod: { not: "store_credit" },
        ...(hasDateFilter ? { paymentDate: dbDateFilter } : {}),
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        branch: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const allEntries: MasterLedgerEntry[] = [];

  for (const s of sales) {
    const grand = Number(s.grandTotal);
    const creditPortion = Number(
      s.creditAmount || (s.paymentMethod === "credit" ? grand : 0)
    );
    const collectedAmt = Math.max(0, Math.round((grand - creditPortion) * 100) / 100);
    if (collectedAmt <= 0) continue; // Pure credit sale flows in when settled via CustomerPayment

    allEntries.push({
      id: `sale-${s.id}`,
      date: (s.createdAt || s.saleDate).toISOString(),
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
      amount: collectedAmt,
      credit: collectedAmt,
      debit: 0,
      notes:
        creditPortion > 0
          ? `Invoice: ${s.invoiceNo} • Paid: ₹${collectedAmt.toFixed(2)} (Credit: ₹${creditPortion.toFixed(2)})`
          : `Invoice: ${s.invoiceNo} • Net Total: ₹${collectedAmt.toFixed(2)}`,
    });
  }

  for (const sp of supplierPayments) {
    const amt = Number(sp.amount);
    allEntries.push({
      id: `suppay-${sp.id}`,
      date: (sp.createdAt || sp.paymentDate).toISOString(),
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
      paymentMode: (r.refundMethod || "cash").toUpperCase(),
      amount: amt,
      credit: 0,
      debit: amt,
      notes: `Original Bill: ${r.sale?.invoiceNo || "-"} • Reason: ${r.reason || "Customer Return"}`,
    });
  }

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

  for (const cp of customerPayments) {
    const amt = Number(cp.amount);
    allEntries.push({
      id: `custpay-${cp.id}`,
      date: (cp.createdAt || cp.paymentDate).toISOString(),
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

  // Apply post-aggregation filters BEFORE computing running balance so filtered views reconcile
  let filtered = allEntries;

  if (partyType && partyType !== "all") {
    filtered = filtered.filter((e) => e.partyType === partyType);
  }

  if (entryType && entryType !== "all") {
    filtered = filtered.filter((e) => e.entryType === entryType);
  }

  const normalizedSearch = (search || "").trim().toLowerCase();
  if (normalizedSearch) {
    filtered = filtered.filter(
      (e) =>
        e.refNo.toLowerCase().includes(normalizedSearch) ||
        e.partyName.toLowerCase().includes(normalizedSearch) ||
        e.category.toLowerCase().includes(normalizedSearch) ||
        (e.notes && e.notes.toLowerCase().includes(normalizedSearch)) ||
        (e.partyPhone && e.partyPhone.includes(normalizedSearch))
    );
  }

  // Sort chronologically (oldest first) and compute running balance over the filtered set
  filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let currentBalance = 0;
  let totalCredit = 0;
  let totalDebit = 0;
  for (const entry of filtered) {
    totalCredit += entry.credit;
    totalDebit += entry.debit;
    currentBalance += entry.credit - entry.debit;
    entry.runningBalance = Math.round(currentBalance * 100) / 100;
  }

  const netCashFlow = Math.round((totalCredit - totalDebit) * 100) / 100;
  const reversed = [...filtered].reverse();
  const totalCount = reversed.length;
  const paginatedEntries = reversed.slice((page - 1) * limit, page * limit);

  return {
    entries: paginatedEntries,
    allFilteredEntries: reversed,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
    },
    summary: {
      totalCredit: Math.round(totalCredit * 100) / 100,
      totalDebit: Math.round(totalDebit * 100) / 100,
      netCashFlow,
      totalTransactions: totalCount,
    },
  };
}
