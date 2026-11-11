import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db-transaction";
import { hashPassword, createSessionToken, SESSION_COOKIE_NAME } from "../src/lib/auth";
import * as posRoute from "../src/app/api/admin/pos/route";
import * as posSearchRoute from "../src/app/api/admin/pos/search/route";
import * as notificationsRoute from "../src/app/api/admin/notifications/route";
import * as batchesRoute from "../src/app/api/admin/batches/route";
import * as customersRoute from "../src/app/api/admin/customers/route";

let testPassed = 0;
let testFailed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✔ [PASS] ${msg}`);
    testPassed++;
  } else {
    console.error(`  ✖ [FAIL] ${msg}`);
    testFailed++;
  }
}

async function main() {
  console.log("================================================================================");
  console.log("INTEGRATION TEST SUITE: MODULE 2.1 & MODULE 2.2");
  console.log("Frontend UI Shell, Searchable Select, FEFO Batch Picker, and High-Speed POS Terminal");
  console.log("================================================================================\n");

  const runId = Math.floor(Math.random() * 900000) + 100000;

  const currentStore = await prisma.settings.findFirst();
  const storeId = currentStore?.id || 4;

  // 1. Setup Test Branch, Admin User, and Staff Cashier
  const branch1 = await prisma.branch.upsert({
    where: { uk_store_branch_code: { storeId, code: `BR-POS-${runId}` } },
    update: { active: true },
    create: {
      storeId,
      code: `BR-POS-${runId}`,
      name: `POS Test Outlet ${runId}`,
      address: "123 Healthcare Blvd, MedCity",
      phone: "9876543210",
      gstNo: "19AABCB1234F1Z5",
      dlNo: "DL-POS-998811",
      active: true,
      isMain: true,
    },
  });

  const branch2 = await prisma.branch.upsert({
    where: { uk_store_branch_code: { storeId, code: `BR-ISO-${runId}` } },
    update: { active: true },
    create: {
      storeId,
      code: `BR-ISO-${runId}`,
      name: `Isolated Outlet ${runId}`,
      active: true,
      isMain: false,
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { username: `admin_pos_${runId}` },
    update: { active: true },
    create: {
      username: `admin_pos_${runId}`,
      name: "POS Super Admin",
      email: `admin_pos_${runId}@example.com`,
      password: await hashPassword("AdminPass123!"),
      role: "admin",
      active: true,
    },
  });

  const cashierUser = await prisma.user.upsert({
    where: { username: `cashier_pos_${runId}` },
    update: { active: true },
    create: {
      username: `cashier_pos_${runId}`,
      name: "Counter Cashier",
      email: `cashier_pos_${runId}@example.com`,
      password: await hashPassword("CashierPass123!"),
      role: "cashier",
      branchId: branch1.id, // Bound to Branch 1
      active: true,
    },
  });

  const adminToken = createSessionToken({
    userId: adminUser.id,
    username: adminUser.username,
    name: adminUser.name,
    email: adminUser.email,
    role: "admin",
    branchId: null,
    permissions: ["manage_purchases", "manage_medicines", "manage_customers"],
    allowedPages: ["*"],
    maxDiscountPercent: 100,
    issuedAt: Date.now(),
    lastActive: Date.now(),
  });

  const cashierToken = createSessionToken({
    userId: cashierUser.id,
    username: cashierUser.username,
    name: cashierUser.name,
    email: cashierUser.email,
    role: "cashier",
    branchId: branch1.id,
    permissions: ["manage_customers"],
    allowedPages: ["/admin/pos"],
    maxDiscountPercent: 10,
    issuedAt: Date.now(),
    lastActive: Date.now(),
  });

  const createReq = (
    url: string,
    token: string,
    method: string = "GET",
    body?: any
  ) => {
    return new NextRequest(new URL(url, "http://localhost:3000"), {
      method,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  // 2. Setup Test Medicine with Rack Location and Multiple Batches (FEFO testing)
  const category = await prisma.category.upsert({
    where: { name: `Antibiotics-${runId}` },
    update: {},
    create: { name: `Antibiotics-${runId}` },
  });

  const med1 = await prisma.medicine.create({
    data: {
      name: `Amox-Clav-625-${runId}`,
      genericName: "Amoxicillin and Potassium Clavulanate",
      company: "HealthCorp Pharma",
      category: category.name,
      hsnCode: "30049011",
      gstPercent: 12.0,
      rackLocation: "Rack: B-02 / Shelf: 4",
      scheduleType: "schedule_h",
    },
  });

  // Batch 1 (Expires soonest: in 45 days) -> Top FEFO Priority
  const expDateSoon = new Date();
  expDateSoon.setDate(expDateSoon.getDate() + 45);

  const batch1 = await prisma.batch.create({
    data: {
      medicineId: med1.id,
      batchNo: `BAT-FEFO-1-${runId}`,
      expiryDate: expDateSoon,
      quantity: 50,
      mrp: 120.0,
      purchasePrice: 80.0,
      branchId: branch1.id,
    },
  });

  // Batch 2 (Expires later: in 180 days) -> Alternative Batch
  const expDateLate = new Date();
  expDateLate.setDate(expDateLate.getDate() + 180);

  const batch2 = await prisma.batch.create({
    data: {
      medicineId: med1.id,
      batchNo: `BAT-FEFO-2-${runId}`,
      expiryDate: expDateLate,
      quantity: 100,
      mrp: 130.0,
      purchasePrice: 85.0,
      branchId: branch1.id,
    },
  });

  // Batch 3 (Expired: 5 days ago) -> Must be blocked from sale
  const expDatePast = new Date();
  expDatePast.setDate(expDatePast.getDate() - 5);

  const batchExpired = await prisma.batch.create({
    data: {
      medicineId: med1.id,
      batchNo: `BAT-EXPIRED-${runId}`,
      expiryDate: expDatePast,
      quantity: 20,
      mrp: 100.0,
      purchasePrice: 60.0,
      branchId: branch1.id,
    },
  });

  // 3. Setup Customer with Credit Limit (Baki Khata)
  const cust1 = await prisma.customer.create({
    data: {
      name: `Sharma Ji-${runId}`,
      phone: `98765${runId.toString().slice(0, 5)}`,
      email: `sharma_${runId}@example.com`,
      creditLimit: 1500.0,
      isChronic: true,
      chronicDiseases: "Diabetes Type 2",
    },
  });

  // 4. Setup Master Discount Scheme
  const discount1 = await prisma.discount.create({
    data: {
      name: `Senior Citizen 10% - ${runId}`,
      type: "percent",
      value: 10.0,
      minAmount: 200.0,
      active: true,
    },
  });

  console.log("--- TEST GROUP 1: MODULE 2.1 (FRONTEND BEHAVIOURS & SHARED UI SHELL) ---");

  // Test 1: Notifications API returns critical alerts
  const notifRes = await notificationsRoute.GET(
    createReq("http://localhost:3000/api/admin/notifications", adminToken)
  );
  const notifJson = await notifRes.json();
  assert(notifRes.status === 200 && notifJson.success, "2.1.3: Notifications endpoint returns valid store alerts");
  assert(Array.isArray(notifJson.notifications), "2.1.3: Notifications list is properly structured array");

  // Test 2: POS Bootstrap endpoint returns store header and active discounts
  const bootstrapRes = await posRoute.GET(
    createReq(`http://localhost:3000/api/admin/pos?branchId=${branch1.id}`, adminToken)
  );
  const bootstrapJson = await bootstrapRes.json();
  assert(bootstrapRes.status === 200 && bootstrapJson.success, "2.1.3: POS bootstrap returns store header and branch metadata");
  assert(bootstrapJson.store.name.includes("POS Test Outlet") || bootstrapJson.store.name.includes("DRxStore"), "2.1.3: Store outlet name correctly scoped");
  assert(bootstrapJson.discounts.some((d: any) => d.id === discount1.id), "2.1.4: Active discounts included in POS bootstrap");

  console.log("\n--- TEST GROUP 2: MODULE 2.2 (INTELLIGENT MEDICINE & COMPOSITION SEARCH) ---");

  // Test 3: Search by Brand Name
  const searchBrandRes = await posSearchRoute.GET(
    createReq(`http://localhost:3000/api/admin/pos/search?q=Amox-Clav&branchId=${branch1.id}`, cashierToken)
  );
  const searchBrandJson = await searchBrandRes.json();
  assert(searchBrandRes.status === 200 && searchBrandJson.success, "2.2.3: Brand name search succeeds");
  assert(searchBrandJson.results.some((m: any) => m.id === med1.id), "2.2.3: Target medicine matched by brand name");

  // Test 4: Search by Generic Chemical Composition
  const searchGenRes = await posSearchRoute.GET(
    createReq(`http://localhost:3000/api/admin/pos/search?q=Clavulanate&branchId=${branch1.id}`, cashierToken)
  );
  const searchGenJson = await searchGenRes.json();
  assert(searchGenRes.status === 200 && searchGenJson.results.some((m: any) => m.id === med1.id), "2.2.3: Generic composition search succeeds");

  // Test 5: Live Rack Location Displayed on Search Result
  const matchedMed = searchBrandJson.results.find((m: any) => m.id === med1.id);
  assert(matchedMed?.rackLocation === "Rack: B-02 / Shelf: 4", "2.2.3: Live rack & shelf location displayed on search row");

  // Test 6: FEFO Priority Auto-Recommendation in Search
  // (Batch 1 expires in 45 days, Batch 2 expires in 180 days -> Batch 1 must be recommended!)
  assert(matchedMed?.recommendedBatch?.id === batch1.id, "2.2.4: Earliest expiring batch auto-suggested (FEFO priority)");
  assert(matchedMed?.totalBranchStock === 150, "2.1.5: Total branch stock correctly sums unexpired batches (50 + 100)");

  // Test 7: Expired Batches are Excluded from Search Recommendations
  const expiredBatchFound = matchedMed?.batches.some((b: any) => b.id === batchExpired.id);
  assert(!expiredBatchFound, "2.2.4: Expired batches strictly excluded from POS recommendations");

  console.log("\n--- TEST GROUP 3: POS FINALIZATION & PAYMENT-METHOD DYNAMIC FIELDS ---");

  // Test 8: Cash Payment with Change Due
  const cashSaleRes = await posRoute.POST(
    createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: null,
      paymentMethod: "cash",
      branchId: branch1.id,
      items: [{ batchId: batch1.id, quantity: 2 }],
      discountAmount: 0,
    })
  );
  const cashSaleJson = await cashSaleRes.json();
  assert(cashSaleRes.status === 200 && cashSaleJson.success, "2.1.4: Cash counter sale completed successfully");
  assert(cashSaleJson.sale.invoiceNo.startsWith("DRX-"), "2.2.1: Sequential invoice number generated");
  assert(Number(cashSaleJson.sale.grandTotal) === 240.0, "2.2.1: Accurate line total calculation (2 x 120.00)");
  assert(cashSaleJson.sale.branchId === branch1.id, "2.2.1: Sale properly scoped to active branch");

  // Test 9: Verify Stock Deduction & Audit Row
  const updatedBatch1 = await prisma.batch.findUnique({ where: { id: batch1.id } });
  assert(updatedBatch1?.quantity === 48, "2.1.5: Batch quantity deducted by 2 (50 -> 48)");

  const stockAdj = await prisma.stockAdjustment.findFirst({
    where: { batchId: batch1.id, reason: { contains: cashSaleJson.sale.invoiceNo } },
  });
  assert(stockAdj?.quantity === -2 && stockAdj.branchId === branch1.id, "2.2.1: Stock adjustment audit row written with branchId");

  // Test 10: Dynamic UPI Payment with upiRef
  const upiSaleRes = await posRoute.POST(
    createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: null,
      paymentMethod: "upi",
      branchId: branch1.id,
      upiRef: `UPI-UTR-${runId}`,
      items: [{ batchId: batch1.id, quantity: 1 }],
    })
  );
  const upiSaleJson = await upiSaleRes.json();
  assert(upiSaleRes.status === 200 && upiSaleJson.sale.upiRef === `UPI-UTR-${runId}`, "2.1.4: Dynamic UPI payment captures UTR reference");

  // Test 11: Cheque Payment with Cheque Details
  const chequeSaleRes = await posRoute.POST(
    createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: null,
      paymentMethod: "cheque",
      branchId: branch1.id,
      chequeNo: "CHQ-001928",
      chequeBank: "State Bank of India",
      chequeDate: new Date().toISOString(),
      items: [{ batchId: batch2.id, quantity: 1 }],
    })
  );
  const chequeSaleJson = await chequeSaleRes.json();
  assert(chequeSaleRes.status === 200 && chequeSaleJson.sale.chequeNo === "CHQ-001928", "2.1.4: Cheque payment captures cheque number and bank");

  // Test 12: Baki Khata / Store Credit within Approved Limit
  const creditSaleRes = await posRoute.POST(
    createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: cust1.id,
      paymentMethod: "credit",
      branchId: branch1.id,
      items: [{ batchId: batch2.id, quantity: 5 }], // 5 x 130 = 650 <= 1500 limit
    })
  );
  const creditSaleJson = await creditSaleRes.json();
  assert(creditSaleRes.status === 200 && creditSaleJson.sale.paymentMethod === "credit", "2.1.4: Credit sale approved within approved Baki Khata limit");

  // Test 13: Baki Khata / Store Credit EXCEEDING Limit (Must Be Blocked)
  const overCreditRes = await posRoute.POST(
    createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: cust1.id,
      paymentMethod: "credit",
      branchId: branch1.id,
      items: [{ batchId: batch2.id, quantity: 20 }], // 20 x 130 = 2600 + 650 = 3250 > 1500 limit!
    })
  );
  const overCreditJson = await overCreditRes.json();
  assert(overCreditRes.status === 400 && overCreditJson.error.includes("Credit limit exceeded"), "2.1.4: Credit sale exceeding approved limit is strictly blocked");

  // Test 14: Walk-in Attempting Credit without Customer (Must Be Blocked)
  const noCustCreditRes = await posRoute.POST(
    createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: null,
      paymentMethod: "credit",
      branchId: branch1.id,
      items: [{ batchId: batch1.id, quantity: 1 }],
    })
  );
  assert(noCustCreditRes.status === 400, "2.1.4: Credit sale without customer selection is strictly blocked");

  // Test 15: Bill-Level Discount Application
  const discountSaleRes = await posRoute.POST(
    createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: null,
      paymentMethod: "cash",
      branchId: branch1.id,
      items: [{ batchId: batch2.id, quantity: 2 }], // 2 x 130 = 260
      discountAmount: 26.0, // 10% discount
      discountId: discount1.id,
    })
  );
  const discountSaleJson = await discountSaleRes.json();
  assert(discountSaleRes.status === 200 && Number(discountSaleJson.sale.grandTotal) === 234.0, "2.2.1: Bill-level discount correctly deducted from total (260 - 26 = 234)");

  // Test 16: Selling Expired Drug Must Be Blocked (Safety Violation)
  const expiredSaleRes = await posRoute.POST(
    createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: null,
      paymentMethod: "cash",
      branchId: branch1.id,
      items: [{ batchId: batchExpired.id, quantity: 1 }],
    })
  );
  assert(expiredSaleRes.status === 400, "2.1.5: Selling expired drug batch is strictly blocked by atomic validator");

  // Test 17: Selling Quantity Beyond Stock Cap Must Be Blocked
  const overStockSaleRes = await posRoute.POST(
    createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: null,
      paymentMethod: "cash",
      branchId: branch1.id,
      items: [{ batchId: batch1.id, quantity: 9999 }],
    })
  );
  assert(overStockSaleRes.status === 400, "2.1.5: Selling quantity exceeding batch stock cap is strictly blocked");

  // Test 18: Multi-Branch Isolation (Cashier bound to Branch 1 cannot bill from Branch 2)
  const crossBranchSaleRes = await posRoute.POST(
    createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: null,
      paymentMethod: "cash",
      branchId: branch2.id, // Unauthorized branch
      items: [{ batchId: batch1.id, quantity: 1 }],
    })
  );
  assert(crossBranchSaleRes.status === 403, "2.1.3: Cashier cross-branch IDOR billing is strictly rejected (403)");

  console.log("\n================================================================================");
  console.log(`FINAL OUTCOME: ${testPassed} Passed | ${testFailed} Failed`);
  console.log("================================================================================");

  if (testFailed > 0) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("Test execution threw error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
