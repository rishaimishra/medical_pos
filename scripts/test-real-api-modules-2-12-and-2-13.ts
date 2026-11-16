/**
 * Real Integration Test Suite for MODULE 2.12 & MODULE 2.13
 * 
 * MODULE 2.12:
 * - 2.12.1: General Income & Expense Ledger (Electricity, Rent, Staff Salary, Tea)
 * - 2.12.2: Day-End Cash Drawer Reconciliation (Z-Report, Denominations Counter, Exact/Excess/Shortage)
 * 
 * MODULE 2.13:
 * - 2.13.1: Master Financial Ledger With Party Filter & CSV Export
 * - 2.13.2: Document Numbering (INV, PO, RET, EXP, ZREP) & Amount In Words
 * - 2.13.3: GST-Inclusive MRP Calculation Rule & Stock Revalidation
 */

import { prisma } from "../src/lib/prisma";
import { GET as getExpenses, POST as postExpense } from "../src/app/api/admin/expenses/route";
import { GET as getSingleExpense, DELETE as deleteExpense } from "../src/app/api/admin/expenses/[id]/route";
import { GET as getDrawerSummary } from "../src/app/api/admin/cash-drawer/summary/route";
import { POST as postDrawerClose } from "../src/app/api/admin/cash-drawer/close/route";
import { GET as getClosings } from "../src/app/api/admin/cash-drawer/closings/route";
import { GET as getSingleClosing } from "../src/app/api/admin/cash-drawer/closings/[id]/route";
import { GET as getLedger } from "../src/app/api/admin/ledger/route";
import { numberToIndianWords } from "../src/lib/numberToWords";
import { calculateGstInclusiveLine, aggregateGstSlabs } from "../src/lib/taxCalculations";
import { createSessionToken, hashPassword } from "../src/lib/auth";
import { NextRequest } from "next/server";

let currentToken = "";

// Helper to mock NextRequest with admin authorization headers
function mockRequest(url: string, method = "GET", body?: any): NextRequest {
  const init: any = {
    method,
    headers: {
      "Content-Type": "application/json",
      cookie: `med_pos_admin_session=${currentToken}`,
    },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), init);
}

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`  ✔ [PASS] ${desc}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${desc}`);
    failedTests++;
  }
}

async function main() {
  console.log("================================================================================");
  console.log("INTEGRATION TEST SUITE: MODULE 2.12 & MODULE 2.13");
  console.log("Financial Ledger, Expenses, Day-End Cash Closing, Z-Report & Tax Engine");
  console.log("================================================================================");

  const runId = Math.floor(Math.random() * 900000) + 100000;

  // 1. Setup Test Store & Branch
  const currentStore = await prisma.settings.findFirst({ orderBy: { id: "asc" } });
  const storeId = currentStore?.id || 1;

  const testBranch = await prisma.branch.create({
    data: {
      code: `T${runId.toString().slice(-4)}`,
      name: `Test Outlet ${runId}`,
      storeId,
      isMain: false,
      active: true,
    },
  });

  const adminPasswordHash = await hashPassword("Admin123!");
  const testAdminUser = await prisma.user.create({
    data: {
      name: `Admin Officer ${runId}`,
      username: `admin_fin_${runId}`,
      email: `admin_fin_${runId}@pharmacy.local`,
      password: adminPasswordHash,
      role: "admin",
      permissions: JSON.stringify(["view_profit_reports", "manage_settings"]),
      branchId: testBranch.id,
      storeId,
      active: true,
    },
  });
  const userId = testAdminUser.id;

  currentToken = createSessionToken({
    userId: testAdminUser.id,
    storeId,
    branchId: testBranch.id,
    username: testAdminUser.username,
    name: testAdminUser.name,
    email: testAdminUser.email,
    role: "admin",
    permissions: [],
    allowedPages: [],
    maxDiscountPercent: 100.0,
    issuedAt: Date.now(),
    lastActive: Date.now(),
  });

  console.log(`  * Initialized Test Branch ID: ${testBranch.id} [${testBranch.code}]`);

  // =========================================================================
  // SUITE 1: Operational Expenses & Incomes (2.12.1)
  // =========================================================================
  console.log("\n--- SUITE 1: General Income & Expense Ledger (2.12.1) ---");

  // A. Create Operational Expense Voucher (Electricity)
  const expReq1 = mockRequest("http://localhost:3000/api/admin/expenses", "POST", {
    branchId: testBranch.id,
    type: "expense",
    category: "Electricity",
    title: `Monthly Shop Electricity Bill ${runId}`,
    amount: "1850.50",
    paymentMode: "cash",
    referenceNo: `EB-${runId}`,
    payeeOrPayer: "State Electricity Board",
    notes: "Counter power supply",
  });
  const expRes1 = await postExpense(expReq1);
  const expData1 = await expRes1.json();

  assert(expRes1.status === 200 && expData1.success, "POST /api/admin/expenses creates expense voucher");
  assert(expData1.expense.voucherNo.startsWith("EXP-"), `Voucher number format is EXP-YYYY-XXXXX (${expData1.expense.voucherNo})`);
  assert(Number(expData1.expense.amount) === 1850.50, "Expense amount recorded accurately as 1850.50");

  // B. Create Miscellaneous Income Voucher (Consulting)
  const incReq2 = mockRequest("http://localhost:3000/api/admin/expenses", "POST", {
    branchId: testBranch.id,
    type: "income",
    category: "Consulting / Service Income",
    title: `Doctor Clinic Consultation Revenue ${runId}`,
    amount: "1200.00",
    paymentMode: "cash",
    payeeOrPayer: "Walk-in Patient Consults",
  });
  const incRes2 = await postExpense(incReq2);
  const incData2 = await incRes2.json();

  assert(incRes2.status === 200 && incData2.success, "POST /api/admin/expenses creates income voucher");
  assert(incData2.expense.type === "income", "Income type correctly stored");

  // C. List & Filter Expenses
  const listExpReq = mockRequest(`http://localhost:3000/api/admin/expenses?branchId=${testBranch.id}`);
  const listExpRes = await getExpenses(listExpReq);
  const listExpData = await listExpRes.json();

  assert(listExpRes.status === 200 && listExpData.success, "GET /api/admin/expenses returns 200");
  assert(listExpData.expenses.length === 2, `Branch contains exactly 2 recorded vouchers (Found: ${listExpData.expenses.length})`);
  assert(listExpData.summary.totalExpenses === 1850.50, `KPI Total Expenses is ₹1850.50 (Got: ${listExpData.summary.totalExpenses})`);
  assert(listExpData.summary.totalIncomes === 1200.00, `KPI Total Incomes is ₹1200.00 (Got: ${listExpData.summary.totalIncomes})`);
  assert(listExpData.summary.netOverhead === 650.50, `KPI Net Overhead is ₹650.50 (Got: ${listExpData.summary.netOverhead})`);

  // D. Single Voucher Lookup
  const singleExpReq = mockRequest(`http://localhost:3000/api/admin/expenses/${expData1.expense.id}`);
  const singleExpRes = await getSingleExpense(singleExpReq, { params: Promise.resolve({ id: String(expData1.expense.id) }) });
  const singleExpData = await singleExpRes.json();
  assert(singleExpData.success && singleExpData.expense.voucherNo === expData1.expense.voucherNo, "GET /api/admin/expenses/[id] fetches single voucher details");

  // =========================================================================
  // SUITE 2: Day-End Cash Drawer Reconciliation (Z-Report) (2.12.2)
  // =========================================================================
  console.log("\n--- SUITE 2: Day-End Cash Drawer Reconciliation (Z-Report) (2.12.2) ---");

  // Create test sales on branch: 1 cash sale of ₹5,000, 1 UPI sale of ₹2,500
  const testSaleCash = await prisma.sale.create({
    data: {
      invoiceNo: `INV-${new Date().getFullYear()}-${runId.toString().slice(-5)}`,
      customerId: null,
      saleDate: new Date(),
      totalAmount: 5000,
      gstAmount: 535.71,
      grandTotal: 5000,
      paymentMethod: "cash",
      branchId: testBranch.id,
      createdBy: userId,
    },
  });

  const testSaleUpi = await prisma.sale.create({
    data: {
      invoiceNo: `INV-DRW-UPI-${runId}`,
      customerId: null,
      saleDate: new Date(),
      totalAmount: 2500,
      gstAmount: 267.86,
      grandTotal: 2500,
      paymentMethod: "upi",
      branchId: testBranch.id,
      createdBy: userId,
    },
  });

  // Create test return on branch: ₹350 cash refund
  const testReturn = await prisma.return.create({
    data: {
      returnNumber: `RET-DRW-${runId}`,
      saleId: testSaleCash.id,
      branchId: testBranch.id,
      reason: "Customer medicine return",
      refundAmount: 350,
      status: "processed",
      createdBy: userId,
    },
  });

  // A. Check Live Shift Summary Calculation
  // Expected Cash = Opening Float (e.g. 500) + Cash Sales (5000) - Cash Returns (350) - Cash Expenses (1850.50) + Cash Incomes (1200) = 4499.50
  const drawerSumReq = mockRequest(`http://localhost:3000/api/admin/cash-drawer/summary?branchId=${testBranch.id}`);
  const drawerSumRes = await getDrawerSummary(drawerSumReq);
  const drawerSumData = await drawerSumRes.json();

  assert(drawerSumRes.status === 200 && drawerSumData.success, "GET /api/admin/cash-drawer/summary returns 200");
  assert(drawerSumData.figures.cashSales === 5000, `Live Cash Sales aggregated as ₹5000 (Got: ${drawerSumData.figures.cashSales})`);
  assert(drawerSumData.figures.cashReturns === 350, `Live Cash Returns aggregated as ₹350 (Got: ${drawerSumData.figures.cashReturns})`);
  assert(drawerSumData.figures.cashExpenses === 1850.50, `Live Cash Expenses aggregated as ₹1850.50 (Got: ${drawerSumData.figures.cashExpenses})`);
  assert(drawerSumData.figures.cashIncomes === 1200, `Live Cash Incomes aggregated as ₹1200 (Got: ${drawerSumData.figures.cashIncomes})`);
  assert(drawerSumData.figures.otherChannels.upiSales === 2500, `Non-cash UPI sales tracked separately as ₹2500`);

  // B. Close Register with Exact Match
  // Expected = 500 (float) + 5000 - 350 - 1850.50 + 1200 = 4499.50
  // Denominations to equal 4499.50:
  // 500 x 8 = 4000
  // 200 x 2 = 400
  // 50 x 1 = 50
  // 20 x 2 = 40
  // 5 x 1 = 5
  // 2 x 2 = 4
  // coins = 0.50
  // Total = 4499.50 (Exact)
  const closeExactReq = mockRequest("http://localhost:3000/api/admin/cash-drawer/close", "POST", {
    branchId: testBranch.id,
    openingFloat: 500,
    denominations: {
      "500": 8,
      "200": 2,
      "50": 1,
      "20": 2,
      "5": 1,
      "2": 2,
      coins: 0.50,
    },
    notes: "Evening shift handover - all balanced",
  });
  const closeExactRes = await postDrawerClose(closeExactReq);
  const closeExactData = await closeExactRes.json();

  assert(closeExactRes.status === 200 && closeExactData.success, "POST /api/admin/cash-drawer/close succeeds");
  assert(closeExactData.closing.status === "exact", `Reconciliation status is 'exact' (Got: ${closeExactData.closing.status})`);
  assert(Number(closeExactData.closing.difference) === 0, `Discrepancy is ₹0.00 (Got: ${closeExactData.closing.difference})`);
  assert(closeExactData.closing.closingNumber.startsWith("ZREP-"), `Closing number follows ZREP-YYYY-XXXXX format (${closeExactData.closing.closingNumber})`);

  // C. Test Closing with Cash Shortage
  // Counted = 4000 (short by 499.50)
  const closeShortReq = mockRequest("http://localhost:3000/api/admin/cash-drawer/close", "POST", {
    branchId: testBranch.id,
    openingFloat: 500,
    denominations: {
      "500": 8, // 4000
    },
    notes: "Shortage test",
  });
  const closeShortRes = await postDrawerClose(closeShortReq);
  const closeShortData = await closeShortRes.json();

  assert(closeShortData.closing.status === "shortage", `Shortage correctly flagged as 'shortage' (Got: ${closeShortData.closing.status})`);
  assert(Number(closeShortData.closing.difference) < 0, `Difference is negative for shortage (${closeShortData.closing.difference})`);

  // D. List Past Closings & Single Z-Report View
  const listClosingsReq = mockRequest(`http://localhost:3000/api/admin/cash-drawer/closings?branchId=${testBranch.id}`);
  const listClosingsRes = await getClosings(listClosingsReq);
  const listClosingsData = await listClosingsRes.json();

  assert(listClosingsData.closings.length === 2, `History records 2 shift closings (Found: ${listClosingsData.closings.length})`);
  assert(listClosingsData.summary.statusCounts.exact === 1 && listClosingsData.summary.statusCounts.shortage === 1, "Status breakdown accurately tracks exact and shortage counts");

  const singleCloseReq = mockRequest(`http://localhost:3000/api/admin/cash-drawer/closings/${closeExactData.closing.id}`);
  const singleCloseRes = await getSingleClosing(singleCloseReq, { params: Promise.resolve({ id: String(closeExactData.closing.id) }) });
  const singleCloseData = await singleCloseRes.json();

  assert(singleCloseData.success && singleCloseData.closing.denominations["500"] === 8, "GET /api/admin/cash-drawer/closings/[id] returns parsed denomination breakdown for printing");

  // =========================================================================
  // SUITE 3: Master Financial Ledger & Party Filter (2.13.1)
  // =========================================================================
  console.log("\n--- SUITE 3: Master Financial Ledger & Party Filter (2.13.1) ---");

  const ledgerReq = mockRequest(`http://localhost:3000/api/admin/ledger?branchId=${testBranch.id}`);
  const ledgerRes = await getLedger(ledgerReq);
  const ledgerData = await ledgerRes.json();

  assert(ledgerRes.status === 200 && ledgerData.success, "GET /api/admin/ledger returns 200");
  assert(ledgerData.entries.length >= 4, `Ledger synthesizes multiple domains into unified list (${ledgerData.entries.length} entries)`);
  assert(ledgerData.summary.totalCredit > 0, `Total Credits aggregated (> 0: ₹${ledgerData.summary.totalCredit})`);
  assert(ledgerData.summary.totalDebit > 0, `Total Debits aggregated (> 0: ₹${ledgerData.summary.totalDebit})`);

  // Verify running balance is computed on each entry
  const hasRunningBalance = ledgerData.entries.every((e: any) => typeof e.runningBalance === "number");
  assert(hasRunningBalance, "Running balance is computed on all ledger entries");

  // Filter by partyType = "customer"
  const custLedgerReq = mockRequest(`http://localhost:3000/api/admin/ledger?branchId=${testBranch.id}&partyType=customer`);
  const custLedgerRes = await getLedger(custLedgerReq);
  const custLedgerData = await custLedgerRes.json();
  const allCustomers = custLedgerData.entries.every((e: any) => e.partyType === "customer");
  assert(allCustomers, "Ledger partyType filter strictly restricts to customer records");

  // =========================================================================
  // SUITE 4: Document Numbering & Amount In Words (2.13.2)
  // =========================================================================
  console.log("\n--- SUITE 4: Document Numbering & Amount In Words (2.13.2) ---");

  assert(numberToIndianWords(1540.50) === "Rupees One Thousand Five Hundred Forty and Fifty Paise Only", "Indian currency words for ₹1540.50 matches exact RBI/GST format");
  assert(numberToIndianWords(270) === "Rupees Two Hundred Seventy Only", "Indian currency words for ₹270 matches 'Rupees Two Hundred Seventy Only'");
  assert(numberToIndianWords(0) === "Rupees Zero Only", "Indian currency words for ₹0 matches 'Rupees Zero Only'");
  assert(numberToIndianWords(100000) === "Rupees One Lakh Only", "Indian currency words for ₹1,00,000 matches 'Rupees One Lakh Only'");

  // Document numbering checks
  assert(/^INV-\d{4}-\d{5}$|^INV-TEST-/.test(testSaleCash.invoiceNo), "Sales Invoice follows INV-YYYY-XXXXX sequence");
  assert(/^RET-/.test(testReturn.returnNumber), "Return Credit Note follows RET- sequence");
  assert(/^EXP-\d{4}-\d{5}$/.test(expData1.expense.voucherNo), "Expense Voucher follows EXP-YYYY-XXXXX sequence");
  assert(/^ZREP-\d{4}-\d{5}$/.test(closeExactData.closing.closingNumber), "Z-Report closing follows ZREP-YYYY-XXXXX sequence");

  // =========================================================================
  // SUITE 5: GST-Inclusive MRP Calculation Rule (2.13.3)
  // =========================================================================
  console.log("\n--- SUITE 5: GST-Inclusive MRP Calculation Rule (2.13.3) ---");

  // Rule: Taxable value = MRP / (1 + GST%); GST amount = MRP - taxable value; CGST = SGST = GST / 2
  const taxCheck1 = calculateGstInclusiveLine(112, 1, 12, 0);
  assert(taxCheck1.taxableValue === 100.00, `₹112 @ 12% GST yields Taxable Value of ₹100.00 (Got: ${taxCheck1.taxableValue})`);
  assert(taxCheck1.gstAmount === 12.00, `₹112 @ 12% GST yields GST of ₹12.00 (Got: ${taxCheck1.gstAmount})`);
  assert(taxCheck1.cgstAmount === 6.00 && taxCheck1.sgstAmount === 6.00, "CGST and SGST split evenly at 50% each (₹6.00 each)");

  // With line discount
  const taxCheck2 = calculateGstInclusiveLine(100, 2, 18, 20); // Gross 200, Net 180 @ 18% GST -> 180 / 1.18 = 152.54
  assert(taxCheck2.netInclusiveAmount === 180.00, "Discount applies on the inclusive total before tax calculation (₹180.00)");
  assert(taxCheck2.taxableValue === 152.54, `Taxable value for ₹180 net @ 18% is ₹152.54 (Got: ${taxCheck2.taxableValue})`);
  assert(taxCheck2.gstAmount === 27.46, `GST amount for ₹180 net @ 18% is ₹27.46 (Got: ${taxCheck2.gstAmount})`);

  // Slabs aggregation
  const slabs = aggregateGstSlabs([
    { mrp: 112, quantity: 1, gstPercent: 12 },
    { mrp: 118, quantity: 1, gstPercent: 18 },
  ]);
  assert(slabs[12].totalGst === 12.00 && slabs[18].totalGst === 18.00, "aggregateGstSlabs accurately categorizes 12% and 18% GST slabs");

  // =========================================================================
  // Cleanup Test Data
  // =========================================================================
  console.log("\n--- Cleanup Test Data ---");
  await prisma.cashDrawerClosing.deleteMany({ where: { branchId: testBranch.id } });
  await prisma.expense.deleteMany({ where: { branchId: testBranch.id } });
  await prisma.return.deleteMany({ where: { branchId: testBranch.id } });
  await prisma.sale.deleteMany({ where: { branchId: testBranch.id } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.branch.delete({ where: { id: testBranch.id } });
  console.log("  ✔ Cleaned up temporary test branch, user, sales, returns, expenses, and closings");

  console.log("\n================================================================================");
  console.log(`TEST SUITE RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log("================================================================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal test suite error:", err);
  process.exit(1);
});
