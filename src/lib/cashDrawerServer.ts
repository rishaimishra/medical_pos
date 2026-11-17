import { prisma } from "@/lib/prisma";

export interface ShiftCashFigures {
  cashSales: number;
  upiSales: number;
  cardSales: number;
  chequeSales: number;
  creditSales: number;
  cashReturns: number;
  cashExpenses: number;
  cashIncomes: number;
  cashBakiCollections: number;
  cashSupplierPayouts: number;
  totalSalesCount: number;
}

/**
 * Shared shift cash aggregator for Day-End Cash Drawer Summary & Z-Report Closing.
 * Filters sales and returns by precise `createdAt` timestamps (not @db.Date `saleDate`)
 * so intra-day multi-shift closings remain exact.
 */
export async function calculateShiftCashFigures(params: {
  storeId?: number | null;
  branchId?: number | null;
  shiftStart: Date;
  shiftEnd: Date;
}): Promise<ShiftCashFigures> {
  const { storeId, branchId, shiftStart, shiftEnd } = params;

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

  const [sales, returns, expenses, customerCashPayments, supplierCashPayments] = await Promise.all([
    prisma.sale.findMany({
      where: {
        ...branchScope,
        createdAt: { gte: shiftStart, lte: shiftEnd },
      },
      select: {
        id: true,
        grandTotal: true,
        paymentMethod: true,
        splitDetails: true,
      },
    }),
    prisma.return.findMany({
      where: {
        ...branchScope,
        status: "processed",
        refundMethod: "cash",
        createdAt: { gte: shiftStart, lte: shiftEnd },
      },
      select: { refundAmount: true },
    }),
    prisma.expense.findMany({
      where: {
        ...expenseScope,
        paymentMode: "cash",
        expenseDate: { gte: shiftStart, lte: shiftEnd },
      },
      select: { type: true, amount: true },
    }),
    prisma.customerPayment.findMany({
      where: {
        ...branchScope,
        paymentMethod: "cash",
        createdAt: { gte: shiftStart, lte: shiftEnd },
      },
      select: { amount: true },
    }),
    prisma.supplierPayment.findMany({
      where: {
        ...branchScope,
        paymentMethod: "cash",
        createdAt: { gte: shiftStart, lte: shiftEnd },
      },
      select: { amount: true },
    }),
  ]);

  let cashSales = 0;
  let upiSales = 0;
  let cardSales = 0;
  let chequeSales = 0;
  let creditSales = 0;

  for (const sale of sales) {
    const total = Number(sale.grandTotal);
    const method = (sale.paymentMethod || "cash").toLowerCase();

    if (method === "cash") {
      cashSales += total;
    } else if (method === "upi") {
      upiSales += total;
    } else if (method === "card") {
      cardSales += total;
    } else if (method === "cheque") {
      chequeSales += total;
    } else if (method === "credit") {
      creditSales += total;
    } else if (method === "split" && sale.splitDetails) {
      try {
        const splitObj =
          typeof sale.splitDetails === "string"
            ? JSON.parse(sale.splitDetails)
            : sale.splitDetails;
        cashSales += Number(splitObj.cash || 0);
        upiSales += Number(splitObj.upi || 0);
        cardSales += Number(splitObj.card || 0);
        chequeSales += Number(splitObj.cheque || 0);
        creditSales += Number(splitObj.credit || 0);
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
    if (exp.type === "expense") cashExpenses += amt;
    else if (exp.type === "income") cashIncomes += amt;
  }

  let cashBakiCollections = 0;
  for (const cp of customerCashPayments) {
    cashBakiCollections += Number(cp.amount);
  }

  let cashSupplierPayouts = 0;
  for (const sp of supplierCashPayments) {
    cashSupplierPayouts += Number(sp.amount);
  }

  return {
    cashSales: Math.round(cashSales * 100) / 100,
    upiSales: Math.round(upiSales * 100) / 100,
    cardSales: Math.round(cardSales * 100) / 100,
    chequeSales: Math.round(chequeSales * 100) / 100,
    creditSales: Math.round(creditSales * 100) / 100,
    cashReturns: Math.round(cashReturns * 100) / 100,
    cashExpenses: Math.round(cashExpenses * 100) / 100,
    cashIncomes: Math.round(cashIncomes * 100) / 100,
    cashBakiCollections: Math.round(cashBakiCollections * 100) / 100,
    cashSupplierPayouts: Math.round(cashSupplierPayouts * 100) / 100,
    totalSalesCount: sales.length,
  };
}
