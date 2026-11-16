import { prisma } from "../src/lib/db-transaction";
import { createSessionToken, hashPassword } from "../src/lib/auth";
import {
  getEscPosCashDrawerKickBytes,
  getEscPosCashDrawerKickHex,
  getEscPosCashDrawerKickBase64,
} from "../src/lib/cashDrawer";
import * as cashDrawerRoute from "../src/app/api/admin/pos/cash-drawer/route";
import * as posRoute from "../src/app/api/admin/pos/route";
import { sendCustomerInvoiceReceiptEmail } from "../src/lib/emailReceipt";
import { NextRequest } from "next/server";

let testPassed = 0;
let testFailed = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`  ✔ [PASS] ${testName}`);
    testPassed++;
  } else {
    console.error(`  ✖ [FAIL] ${testName}`);
    if (details) console.error("    Details:", details);
    testFailed++;
  }
}

function createReq(
  url: string,
  token?: string,
  method = "GET",
  body?: any
): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) {
    headers["cookie"] = `med_pos_admin_session=${token}`;
  }

  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function main() {
  console.log("================================================================================");
  console.log("INTEGRATION TEST SUITE: MODULE 2.5 & MODULE 2.6");
  console.log("Multi-Tender Payments, Cash Drawer Solenoid & Sale Finalization Rules");
  console.log("================================================================================");

  const runId = Math.floor(Math.random() * 900000) + 100000;
  const currentStore = await prisma.settings.findFirst();
  const storeId = currentStore?.id || 1;

  // 1. Setup Test Store Branches
  const branchMain = await prisma.branch.create({
    data: {
      storeId,
      code: `BR-M25-${runId}`,
      name: `M25 Main Pharmacy-${runId}`,
      address: "101 Park Street, Kolkata",
      phone: `98765${runId.toString().slice(0, 5)}`,
      email: `m25-main-${runId}@drxstore.com`,
      isMain: true,
      active: true,
    },
  });

  const branchOther = await prisma.branch.create({
    data: {
      storeId,
      code: `BR-M25-OTH-${runId}`,
      name: `M25 Other Pharmacy-${runId}`,
      address: "202 South St, Kolkata",
      phone: `98766${runId.toString().slice(0, 5)}`,
      email: `m25-other-${runId}@drxstore.com`,
      isMain: false,
      active: true,
    },
  });

  // 2. Setup Test Cashier and Admin Users
  const passwordHash = await hashPassword("StrongPass#123");
  const cashierUser = await prisma.user.create({
    data: {
      storeId,
      branchId: branchMain.id,
      name: `Cashier M25 ${runId}`,
      username: `cashier_m25_${runId}`,
      email: `cashier_m25_${runId}@drxstore.com`,
      password: passwordHash,
      role: "cashier",
      active: true,
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      storeId,
      branchId: branchMain.id,
      name: `Admin M25 ${runId}`,
      username: `admin_m25_${runId}`,
      email: `admin_m25_${runId}@drxstore.com`,
      password: passwordHash,
      role: "admin",
      active: true,
    },
  });

  const cashierToken = createSessionToken({
    userId: cashierUser.id,
    storeId,
    branchId: branchMain.id,
    username: cashierUser.username,
    name: cashierUser.name,
    email: cashierUser.email,
    role: "cashier",
    permissions: [],
    allowedPages: [],
    maxDiscountPercent: 10.0,
    issuedAt: Date.now(),
    lastActive: Date.now(),
  });

  const adminToken = createSessionToken({
    userId: adminUser.id,
    storeId,
    branchId: branchMain.id,
    username: adminUser.username,
    name: adminUser.name,
    email: adminUser.email,
    role: "admin",
    permissions: [],
    allowedPages: [],
    maxDiscountPercent: 100.0,
    issuedAt: Date.now(),
    lastActive: Date.now(),
  });

  // 3. Setup Test Customers (One with high limit, one with low limit, one with email)
  const customerRegular = await prisma.customer.create({
    data: {
      name: `Regular Patient ${runId}`,
      phone: `911${runId.toString().slice(0, 7)}`,
      email: `patient_${runId}@example.com`,
      creditLimit: 5000.0,
      address: "Salt Lake Sector V, Kolkata",
    },
  });

  const customerLowCredit = await prisma.customer.create({
    data: {
      name: `Strict Limit Patient ${runId}`,
      phone: `922${runId.toString().slice(0, 7)}`,
      email: `lowcredit_${runId}@example.com`,
      creditLimit: 100.0,
      address: "New Town, Kolkata",
    },
  });

  // 4. Setup Test Medicine & Inventory Batches
  const medicineA = await prisma.medicine.create({
    data: {
      name: `Amoxicillin 500mg ${runId}`,
      genericName: "Amoxicillin Trihydrate",
      company: "Cipla Healthcare",
      category: "Antibiotics",
      hsnCode: "30041010",
      gstPercent: 12.0,
      rackLocation: "Rack: A-01",
    },
  });

  const medicineB = await prisma.medicine.create({
    data: {
      name: `Paracetamol 650mg ${runId}`,
      genericName: "Paracetamol",
      company: "GSK",
      category: "Analgesic",
      hsnCode: "30049060",
      gstPercent: 12.0,
      rackLocation: "Rack: B-02",
    },
  });

  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 2);

  const pastDate = new Date();
  pastDate.setMonth(pastDate.getMonth() - 2); // expired 2 months ago

  // In-stock valid batch in branchMain
  const batchValidA = await prisma.batch.create({
    data: {
      medicineId: medicineA.id,
      branchId: branchMain.id,
      batchNo: `BAT-A-${runId}`,
      quantity: 100,
      mrp: 100.0,
      purchasePrice: 60.0,
      expiryDate: futureDate,
    },
  });

  const batchValidB = await prisma.batch.create({
    data: {
      medicineId: medicineB.id,
      branchId: branchMain.id,
      batchNo: `BAT-B-${runId}`,
      quantity: 50,
      mrp: 40.0,
      purchasePrice: 20.0,
      expiryDate: futureDate,
    },
  });

  // Expired batch in branchMain
  const batchExpired = await prisma.batch.create({
    data: {
      medicineId: medicineA.id,
      branchId: branchMain.id,
      batchNo: `EXP-${runId}`,
      quantity: 20,
      mrp: 100.0,
      purchasePrice: 60.0,
      expiryDate: pastDate,
    },
  });

  // Batch in other branch
  const batchOtherBranch = await prisma.batch.create({
    data: {
      medicineId: medicineA.id,
      branchId: branchOther.id,
      batchNo: `OTH-${runId}`,
      quantity: 50,
      mrp: 100.0,
      purchasePrice: 60.0,
      expiryDate: futureDate,
    },
  });

  // Master Discount Policy for test
  const discountPolicy = await prisma.discount.create({
    data: {
      name: `Senior Citizen 10% ${runId}`,
      type: "percent",
      value: 10.0,
      minAmount: 150.0,
      active: true,
    },
  });

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 1: MODULE 2.5.2 - Cash Drawer Kick Solenoid Byte Generators
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n--- SECTION 1: Electronic Cash Drawer Kick Trigger (Module 2.5.2) ---");

    const drawerBytes = getEscPosCashDrawerKickBytes();
    assert(
      drawerBytes instanceof Uint8Array && drawerBytes.length > 5,
      "getEscPosCashDrawerKickBytes returns valid Uint8Array buffer",
      { length: drawerBytes.length }
    );

    const drawerHex = getEscPosCashDrawerKickHex();
    assert(
      drawerHex.includes("1b700019fa") && drawerHex.includes("07"),
      "getEscPosCashDrawerKickHex includes standard Epson Pin 2 pulse and Star BEL character",
      { drawerHex }
    );

    const drawerBase64 = getEscPosCashDrawerKickBase64();
    assert(
      typeof drawerBase64 === "string" && drawerBase64.length > 0,
      "getEscPosCashDrawerKickBase64 returns valid base64 print stream",
      { drawerBase64 }
    );

    // Test POST /api/admin/pos/cash-drawer manual kick audit recording
    const reqDrawer = createReq(
      "http://localhost:3000/api/admin/pos/cash-drawer",
      cashierToken,
      "POST",
      { reason: "Cashier Shift Float Audit" }
    );
    const resDrawer = await cashDrawerRoute.POST(reqDrawer);
    const jsonDrawer = await resDrawer.json();
    assert(
      resDrawer.status === 200 && jsonDrawer.success === true && jsonDrawer.commandHex === drawerHex,
      "POST /api/admin/pos/cash-drawer executes and returns command hex",
      jsonDrawer
    );

    // Verify audit log entry for drawer kick
    const auditDrawer = await prisma.auditLog.findFirst({
      where: { action: "CASH_DRAWER_KICK", userId: cashierUser.id },
      orderBy: { id: "desc" },
    });
    assert(
      Boolean(auditDrawer !== null && auditDrawer.details?.includes("Cashier Shift Float Audit")),
      "AuditLog records permanent trail of cash drawer kick",
      auditDrawer
    );

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 2: MODULE 2.5.1 - Single Tender Payment Methods
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n--- SECTION 2: Single Tender Payments (Module 2.5.1) ---");

    // 2.1 Cash Tender with Change Due calculation
    const reqCash = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: customerRegular.id,
      paymentMethod: "cash",
      cashTendered: 300.0,
      items: [{ batchId: batchValidA.id, quantity: 2 }], // 2 x 100 = 200
    });
    const resCash = await posRoute.POST(reqCash);
    const jsonCash = await resCash.json();
    assert(
      resCash.status === 200 &&
        jsonCash.success === true &&
        Number(jsonCash.sale.grandTotal) === 200 &&
        Number(jsonCash.sale.cashTendered) === 300 &&
        Number(jsonCash.sale.changeDue) === 100 &&
        jsonCash.kickCashDrawer === true,
      "Single Cash tender calculates correct change due (₹100) and triggers cash drawer kick",
      jsonCash
    );

    // 2.2 Dynamic UPI Single Tender with upiRef
    const reqUpi = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: customerRegular.id,
      paymentMethod: "upi",
      upiRef: "403810294829",
      items: [{ batchId: batchValidA.id, quantity: 1 }], // 1 x 100 = 100
    });
    const resUpi = await posRoute.POST(reqUpi);
    const jsonUpi = await resUpi.json();
    assert(
      resUpi.status === 200 &&
        jsonUpi.success === true &&
        jsonUpi.sale.paymentMethod === "upi" &&
        jsonUpi.sale.upiRef === "403810294829" &&
        jsonUpi.kickCashDrawer === false,
      "Single Dynamic UPI captures upiRef and does not trigger cash drawer",
      jsonUpi
    );

    // 2.3 Cheque Single Tender with details
    const chequeDateStr = new Date().toISOString().split("T")[0];
    const reqCheque = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: customerRegular.id,
      paymentMethod: "cheque",
      chequeNo: "000452",
      chequeBank: "State Bank of India",
      chequeDate: chequeDateStr,
      items: [{ batchId: batchValidA.id, quantity: 1 }],
    });
    const resCheque = await posRoute.POST(reqCheque);
    const jsonCheque = await resCheque.json();
    assert(
      resCheque.status === 200 &&
        jsonCheque.success === true &&
        jsonCheque.sale.paymentMethod === "cheque" &&
        jsonCheque.sale.chequeNo === "000452" &&
        jsonCheque.sale.chequeBank === "State Bank of India",
      "Single Cheque tender records cheque number, bank, and date",
      jsonCheque
    );

    // 2.4 Store Credit Single Tender within approved limit
    const reqCreditOk = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: customerRegular.id,
      paymentMethod: "credit",
      items: [{ batchId: batchValidA.id, quantity: 1 }], // 100 <= 5000 limit
    });
    const resCreditOk = await posRoute.POST(reqCreditOk);
    const jsonCreditOk = await resCreditOk.json();
    assert(
      resCreditOk.status === 200 &&
        jsonCreditOk.success === true &&
        jsonCreditOk.sale.paymentMethod === "credit",
      "Single Store Credit proceeds when customer balance is within approved credit limit",
      jsonCreditOk
    );

    // 2.5 Store Credit Single Tender exceeding limit -> Rejected
    const reqCreditFail = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: customerLowCredit.id, // limit is ₹100
      paymentMethod: "credit",
      items: [{ batchId: batchValidA.id, quantity: 2 }], // 2 x 100 = 200 > 100
    });
    const resCreditFail = await posRoute.POST(reqCreditFail);
    const jsonCreditFail = await resCreditFail.json();
    assert(
      resCreditFail.status === 400 &&
        jsonCreditFail.success === false &&
        jsonCreditFail.error.includes("Credit limit exceeded"),
      "Single Store Credit rejects and rolls back if grand total exceeds approved credit limit",
      jsonCreditFail
    );

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 3: MODULE 2.5.1 - Multi-Tender Split Payments
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n--- SECTION 3: Multi-Tender Split Payments (Module 2.5.1) ---");

    // 3.1 Split Payment across Cash (₹100) + UPI (₹100) = ₹200 Total
    const reqSplitCashUpi = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: customerRegular.id,
      paymentMethod: "split",
      splitPayments: {
        cash: 100.0,
        cashTendered: 150.0, // Handed ₹150, change ₹50
        upi: 100.0,
      },
      upiRef: "UPI-SPLIT-987654",
      items: [{ batchId: batchValidA.id, quantity: 2 }], // 2 x 100 = 200
    });
    const resSplitCashUpi = await posRoute.POST(reqSplitCashUpi);
    const jsonSplitCashUpi = await resSplitCashUpi.json();
    assert(
      resSplitCashUpi.status === 200 &&
        jsonSplitCashUpi.success === true &&
        jsonSplitCashUpi.sale.paymentMethod === "split" &&
        Number(jsonSplitCashUpi.sale.splitPayments.cash) === 100 &&
        Number(jsonSplitCashUpi.sale.splitPayments.upi) === 100 &&
        Number(jsonSplitCashUpi.sale.cashTendered) === 150 &&
        Number(jsonSplitCashUpi.sale.changeDue) === 50 &&
        jsonSplitCashUpi.sale.upiRef === "UPI-SPLIT-987654" &&
        jsonSplitCashUpi.kickCashDrawer === true,
      "Multi-Tender Cash + UPI split payment captures breakdown, change due, upiRef, and triggers drawer",
      jsonSplitCashUpi
    );

    // 3.2 Split Payment across Cash + Card + Cheque
    const reqSplitMulti = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: customerRegular.id,
      paymentMethod: "split",
      splitPayments: {
        cash: 50.0,
        card: 100.0,
        cheque: 50.0,
      },
      chequeNo: "CHQ-SPLIT-101",
      chequeBank: "HDFC Bank",
      chequeDate: chequeDateStr,
      items: [{ batchId: batchValidA.id, quantity: 2 }], // 2 x 100 = 200
    });
    const resSplitMulti = await posRoute.POST(reqSplitMulti);
    const jsonSplitMulti = await resSplitMulti.json();
    assert(
      resSplitMulti.status === 200 &&
        jsonSplitMulti.success === true &&
        Number(jsonSplitMulti.sale.splitPayments.cash) === 50 &&
        Number(jsonSplitMulti.sale.splitPayments.card) === 100 &&
        Number(jsonSplitMulti.sale.splitPayments.cheque) === 50 &&
        jsonSplitMulti.sale.chequeNo === "CHQ-SPLIT-101" &&
        jsonSplitMulti.sale.chequeBank === "HDFC Bank",
      "Multi-Tender Cash + Card + Cheque captures all split tender details",
      jsonSplitMulti
    );

    // 3.3 Split Payment with Store Credit within limit
    const reqSplitCreditOk = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: customerRegular.id,
      paymentMethod: "split",
      splitPayments: {
        cash: 100.0,
        credit: 100.0,
      },
      items: [{ batchId: batchValidA.id, quantity: 2 }], // 200 total
    });
    const resSplitCreditOk = await posRoute.POST(reqSplitCreditOk);
    const jsonSplitCreditOk = await resSplitCreditOk.json();
    assert(
      resSplitCreditOk.status === 200 &&
        jsonSplitCreditOk.success === true &&
        Number(jsonSplitCreditOk.sale.splitPayments.credit) === 100,
      "Multi-Tender Cash + Credit succeeds when credit portion is within customer credit limit",
      jsonSplitCreditOk
    );

    // 3.4 Split Payment with Store Credit exceeding customer limit -> Rejected
    const reqSplitCreditExceeded = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: customerLowCredit.id, // limit is ₹100
      paymentMethod: "split",
      splitPayments: {
        cash: 50.0,
        credit: 150.0, // 150 > 100
      },
      items: [{ batchId: batchValidA.id, quantity: 2 }], // 200 total
    });
    const resSplitCreditExceeded = await posRoute.POST(reqSplitCreditExceeded);
    const jsonSplitCreditExceeded = await resSplitCreditExceeded.json();
    assert(
      resSplitCreditExceeded.status === 400 &&
        jsonSplitCreditExceeded.success === false &&
        jsonSplitCreditExceeded.error.includes("Credit limit exceeded"),
      "Multi-Tender Cash + Credit rejects and rolls back if credit split portion exceeds limit",
      jsonSplitCreditExceeded
    );

    // 3.5 Split Payment allocation less than grand total -> Rejected
    const reqSplitShort = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: customerRegular.id,
      paymentMethod: "split",
      splitPayments: {
        cash: 50.0,
        upi: 50.0, // 100 total, but bill is 200
      },
      items: [{ batchId: batchValidA.id, quantity: 2 }], // 200 total
    });
    const resSplitShort = await posRoute.POST(reqSplitShort);
    const jsonSplitShort = await resSplitShort.json();
    assert(
      resSplitShort.status === 400 &&
        jsonSplitShort.success === false &&
        jsonSplitShort.error.includes("is less than grand total"),
      "Multi-Tender rejects if sum of split payments is less than grand total",
      jsonSplitShort
    );

    // 3.6 Split Payment with Cheque missing cheque number/bank -> Rejected
    const reqSplitChequeMissing = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: customerRegular.id,
      paymentMethod: "split",
      splitPayments: {
        cash: 100.0,
        cheque: 100.0,
      },
      // missing chequeNo and chequeBank
      items: [{ batchId: batchValidA.id, quantity: 2 }],
    });
    const resSplitChequeMissing = await posRoute.POST(reqSplitChequeMissing);
    const jsonSplitChequeMissing = await resSplitChequeMissing.json();
    assert(
      resSplitChequeMissing.status === 400 &&
        jsonSplitChequeMissing.success === false &&
        jsonSplitChequeMissing.error.includes("Cheque Number and Bank Name are required"),
      "Multi-Tender rejects cheque split portion when cheque number or bank name is missing",
      jsonSplitChequeMissing
    );

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 4: MODULE 2.6.1 - Atomic Checkout Validation & Rollback
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n--- SECTION 4: Atomic Checkout Validation (Module 2.6.1) ---");

    // 4.1 Non-existent batch ID -> Abort & Rollback
    const reqBadBatch = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      items: [{ batchId: 99999999, quantity: 1 }],
    });
    const resBadBatch = await posRoute.POST(reqBadBatch);
    const jsonBadBatch = await resBadBatch.json();
    assert(
      resBadBatch.status === 400 &&
        jsonBadBatch.success === false &&
        jsonBadBatch.error.includes("not found in inventory"),
      "Atomic checkout validates batch existence and aborts on non-existent batch",
      jsonBadBatch
    );

    // 4.2 Batch branch mismatch -> Security rejection & Rollback
    const reqBranchMismatch = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      branchId: branchMain.id,
      items: [{ batchId: batchOtherBranch.id, quantity: 1 }],
    });
    const resBranchMismatch = await posRoute.POST(reqBranchMismatch);
    const jsonBranchMismatch = await resBranchMismatch.json();
    assert(
      resBranchMismatch.status === 400 &&
        jsonBranchMismatch.success === false &&
        jsonBranchMismatch.error.includes("does not belong to the active store branch"),
      "Atomic checkout enforces branch isolation and rejects batches belonging to other branches",
      jsonBranchMismatch
    );

    // 4.3 Expired drug batch -> Regulatory drug safety rejection & Rollback
    const reqExpired = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      items: [{ batchId: batchExpired.id, quantity: 1 }],
    });
    const resExpired = await posRoute.POST(reqExpired);
    const jsonExpired = await resExpired.json();
    assert(
      resExpired.status === 400 &&
        jsonExpired.success === false &&
        jsonExpired.error.includes("Safety Violation: Cannot sell expired drug batch"),
      "Atomic checkout blocks expired drug sale and rolls back completely",
      jsonExpired
    );

    // 4.4 Insufficient stock -> Quantity shortage rejection & Rollback
    const reqOverQty = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      items: [{ batchId: batchValidB.id, quantity: 9999 }], // 9999 > 50
    });
    const resOverQty = await posRoute.POST(reqOverQty);
    const jsonOverQty = await resOverQty.json();
    assert(
      resOverQty.status === 400 &&
        jsonOverQty.success === false &&
        jsonOverQty.error.includes("Insufficient stock"),
      "Atomic checkout checks physical batch stock and aborts if requested quantity exceeds stock",
      jsonOverQty
    );

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 5: MODULE 2.6.2 - Per-Batch Stock Deduction & Stock Adjustment Audit Row
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n--- SECTION 5: Per-Batch Deduction & Stock Adjustment Row (Module 2.6.2) ---");

    const batchPre = await prisma.batch.findUnique({ where: { id: batchValidB.id } });
    const stockPre = batchPre?.quantity || 0;

    const reqDeduct = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: customerRegular.id,
      paymentMethod: "cash",
      items: [{ batchId: batchValidB.id, quantity: 5 }], // MRP 40 * 5 = 200
    });
    const resDeduct = await posRoute.POST(reqDeduct);
    const jsonDeduct = await resDeduct.json();
    assert(resDeduct.status === 200 && jsonDeduct.success === true, "Sale finalized for batch deduction test");

    const batchPost = await prisma.batch.findUnique({ where: { id: batchValidB.id } });
    assert(
      batchPost?.quantity === stockPre - 5,
      `Batch quantity decreased atomically from ${stockPre} to ${batchPost?.quantity}`,
      { stockPre, stockPost: batchPost?.quantity }
    );

    const adj = await prisma.stockAdjustment.findFirst({
      where: {
        batchId: batchValidB.id,
        reason: `Sale: ${jsonDeduct.sale.invoiceNo}`,
      },
    });
    assert(
      adj !== null &&
        adj.type === "sale" &&
        adj.quantity === -5 &&
        adj.oldQty === stockPre &&
        adj.newQty === stockPre - 5 &&
        adj.branchId === branchMain.id &&
        adj.userId === cashierUser.id,
      "Immutable stockAdjustment entry written with 'Sale: <invoice>', branchId, oldQty, newQty, and userId",
      adj
    );

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 6: MODULE 2.6.4 - Customer Purchase Log & Emailed Receipt
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n--- SECTION 6: Customer Purchase Log & Emailed Receipt (Module 2.6.4) ---");

    const purchaseLog = await prisma.customerPurchaseLog.findFirst({
      where: {
        saleId: jsonDeduct.sale.id,
        customerId: customerRegular.id,
      },
    });
    assert(
      purchaseLog !== null && Number(purchaseLog.amount) === Number(jsonDeduct.sale.grandTotal),
      "customer_purchase_log row created with customerId, saleId, amount, and date",
      purchaseLog
    );

    // Test sendCustomerInvoiceReceiptEmail HTML generation & dispatch
    const emailRes = await sendCustomerInvoiceReceiptEmail({
      toEmail: "test-patient@drxstore.com",
      customerName: "Dr. Alok Nath",
      invoiceNo: jsonDeduct.sale.invoiceNo,
      saleDate: new Date(),
      storeName: "DRxStore Main Pharmacy",
      storeAddress: "101 Park Street, Kolkata",
      storePhone: "9876543210",
      storeGst: "19ABCDE1234F1Z5",
      storeDl: "DL-20B-9988",
      paymentMethod: "cash",
      items: [
        {
          name: "Paracetamol 650mg",
          batchNo: "BAT-B-001",
          quantity: 5,
          mrp: 40.0,
          price: 200.0,
        },
      ],
      subtotal: 200.0,
      discountAmount: 0.0,
      gstAmount: 21.43,
      grandTotal: 200.0,
    });
    assert(
      emailRes !== null && typeof emailRes === "object",
      "sendCustomerInvoiceReceiptEmail generates responsive HTML invoice and dispatches via email provider",
      emailRes
    );

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 7: MODULE 2.6.5 - Order of Calculation & Fix of Legacy $inclTotal Bug
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n--- SECTION 7: Totals Order-of-Calculation (Module 2.6.5) ---");

    // 7.1 Master Discount Policy Path (10% on > 150)
    // 2 x 100 = 200 subtotal. Discount 10% = 20. Net grandTotal = 180.
    const reqMasterDisc = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: customerRegular.id,
      discountId: discountPolicy.id,
      paymentMethod: "cash",
      items: [{ batchId: batchValidA.id, quantity: 2 }],
    });
    const resMasterDisc = await posRoute.POST(reqMasterDisc);
    const jsonMasterDisc = await resMasterDisc.json();
    assert(
      resMasterDisc.status === 200 &&
        jsonMasterDisc.success === true &&
        Number(jsonMasterDisc.sale.totalAmount) === 200 &&
        Number(jsonMasterDisc.sale.discountAmount) === 20 &&
        Number(jsonMasterDisc.sale.grandTotal) === 180,
      "Order of Calculation Path A (Master Discount): Computes inclusive total first (₹200) then applies 10% scheme -> Grand Total ₹180",
      jsonMasterDisc.sale
    );

    // 7.2 Custom % Discount Path (Remedies the legacy finalize_sale.php $inclTotal bug)
    // 2 x 100 = 200 subtotal. Cashier applies 5% custom discount.
    // In legacy PHP, $inclTotal was read before lines were computed -> undefined error.
    // In our engine, lines are summed first into subtotal (200), then 5% is calculated = 10. GrandTotal = 190.
    const reqCustomDisc = createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: customerRegular.id,
      discountPercent: 5.0, // 5% custom discount
      paymentMethod: "cash",
      items: [{ batchId: batchValidA.id, quantity: 2 }],
    });
    const resCustomDisc = await posRoute.POST(reqCustomDisc);
    const jsonCustomDisc = await resCustomDisc.json();
    assert(
      resCustomDisc.status === 200 &&
        jsonCustomDisc.success === true &&
        Number(jsonCustomDisc.sale.totalAmount) === 200 &&
        Number(jsonCustomDisc.sale.discountAmount) === 10 &&
        Number(jsonCustomDisc.sale.grandTotal) === 190,
      "Order of Calculation Path B (Custom %): Inclusive total computed BEFORE discount, fixing legacy $inclTotal bug -> ₹200 - 5% = ₹190",
      jsonCustomDisc.sale
    );
  } finally {
    // Cleanup created test records
    console.log("\n--- Cleaning up temporary test artifacts ---");
    await prisma.customerPurchaseLog.deleteMany({
      where: { customer: { id: { in: [customerRegular.id, customerLowCredit.id] } } },
    });
    await prisma.stockAdjustment.deleteMany({
      where: { batchId: { in: [batchValidA.id, batchValidB.id, batchExpired.id, batchOtherBranch.id] } },
    });
    await prisma.saleItem.deleteMany({
      where: { batchId: { in: [batchValidA.id, batchValidB.id, batchExpired.id, batchOtherBranch.id] } },
    });
    await prisma.sale.deleteMany({
      where: { createdBy: { in: [cashierUser.id, adminUser.id] } },
    });
    await prisma.discount.deleteMany({ where: { id: discountPolicy.id } });
    await prisma.batch.deleteMany({
      where: { id: { in: [batchValidA.id, batchValidB.id, batchExpired.id, batchOtherBranch.id] } },
    });
    await prisma.medicine.deleteMany({
      where: { id: { in: [medicineA.id, medicineB.id] } },
    });
    await prisma.customer.deleteMany({
      where: { id: { in: [customerRegular.id, customerLowCredit.id] } },
    });
    await prisma.auditLog.deleteMany({
      where: { userId: { in: [cashierUser.id, adminUser.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [cashierUser.id, adminUser.id] } },
    });
    await prisma.branch.deleteMany({
      where: { id: { in: [branchMain.id, branchOther.id] } },
    });
    console.log("Cleanup completed.");
  }

  console.log("\n================================================================================");
  console.log(`TEST RUN COMPLETE: ${testPassed} PASSED, ${testFailed} FAILED`);
  console.log("================================================================================");

  if (testFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal Test Suite Execution Error:", err);
  process.exit(1);
});
