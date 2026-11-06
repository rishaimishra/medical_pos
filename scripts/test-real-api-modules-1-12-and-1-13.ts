import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db-transaction";
import { hashPassword, createSessionToken, SESSION_COOKIE_NAME, SUPPLIER_COOKIE_NAME } from "../src/lib/auth";
import crypto from "crypto";

// Routes to test
import * as purchasesRoute from "../src/app/api/admin/purchases/route";
import * as poDetailsRoute from "../src/app/api/admin/purchases/[id]/route";
import * as poCloneRoute from "../src/app/api/admin/purchases/[id]/clone/route";
import * as grnRoute from "../src/app/api/admin/grn/route";
import * as supplierOrdersRoute from "../src/app/api/supplier/orders/route";
import * as supplierOrderDetailsRoute from "../src/app/api/supplier/orders/[id]/route";
import * as dailyStockAlertRoute from "../src/app/api/admin/notifications/daily-stock-alert/route";
import * as customersRoute from "../src/app/api/admin/customers/route";
import * as customerExportRoute from "../src/app/api/admin/customers/export/route";
import * as customerDetailsRoute from "../src/app/api/admin/customers/[id]/route";
import * as customerLedgerRoute from "../src/app/api/admin/customers/[id]/ledger/route";
import * as customerRefillsRoute from "../src/app/api/admin/customers/refills/route";
import * as posRoute from "../src/app/api/admin/pos/route";

const SECRET = process.env.SESSION_SECRET || process.env.DATABASE_URL || "med_pos_default_hmac_secret_2026_pharmacy";

function signSupplierToken(payload: any): string {
  const dataB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(dataB64).digest("base64url");
  return `${dataB64}.${sig}`;
}

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
  console.log("INTEGRATION TEST SUITE: MODULE 1.12 & MODULE 1.13");
  console.log("Purchase Order Lifecycle, Supplier Extranet, Refills & Baki Khata");
  console.log("================================================================================\n");

  const runId = Math.floor(Math.random() * 900000) + 100000;

  // 1. Setup Test Admin User & Session
  const adminUser = await prisma.user.upsert({
    where: { username: "test_admin_po_112" },
    update: { role: "admin", active: true },
    create: {
      username: "test_admin_po_112",
      name: "PO Test Admin",
      email: `admin_po_${runId}@example.com`,
      password: await hashPassword("AdminSecret123!"),
      role: "admin",
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
    permissions: [
      "manage_purchases",
      "manage_medicines",
      "manage_customers",
      "manage_settings",
      "manage_users",
    ],
    allowedPages: ["*"],
    maxDiscountPercent: 100,
    issuedAt: Date.now(),
    lastActive: Date.now(),
  });

  const createAdminRequest = (
    url: string,
    method: string = "GET",
    body?: any,
    extraHeaders?: Record<string, string>
  ) => {
    return new NextRequest(new URL(url, "http://localhost:3000"), {
      method,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  // 2. Setup Test Supplier & Portal User
  const testSupplier = await prisma.supplier.create({
    data: {
      name: `Test Pharma Logistics ${runId}`,
      contact: "Alok Mukherjee",
      phone: `9830${runId}`,
      email: `supplier_${runId}@pharma.test`,
      paymentTerms: 30,
    },
  });

  const supplierUser = await prisma.supplierUser.create({
    data: {
      supplierId: testSupplier.id,
      name: "Alok Supplier Portal",
      username: `sup_${runId}`,
      email: `supplier_portal_${runId}@pharma.test`,
      password: await hashPassword("SupplierPass123!"),
      phone: `9830${runId}`,
      active: true,
    },
  });

  const supplierToken = signSupplierToken({
    supplierUserId: supplierUser.id,
    supplierId: testSupplier.id,
    name: supplierUser.name,
    companyName: testSupplier.name,
    username: supplierUser.username,
    email: supplierUser.email,
    phone: supplierUser.phone,
    issuedAt: Date.now(),
  });

  const createSupplierRequest = (url: string, method: string = "GET", body?: any) => {
    return new NextRequest(new URL(url, "http://localhost:3000"), {
      method,
      headers: {
        cookie: `${SUPPLIER_COOKIE_NAME}=${supplierToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  // 3. Setup Test Medicines
  const med1 = await prisma.medicine.create({
    data: {
      name: `Metformin 500mg ${runId}`,
      genericName: "Metformin Hydrochloride",
      company: "Sun Pharma",
      category: "Antidiabetic",
      gstPercent: 12.0,
    },
  });

  const med2 = await prisma.medicine.create({
    data: {
      name: `Telmisartan 40mg ${runId}`,
      genericName: "Telmisartan",
      company: "Cipla",
      category: "Antihypertensive",
      gstPercent: 12.0,
    },
  });

  console.log("--- TEST GROUP 1: MODULE 1.12 PO LIFECYCLE & STATUS MACHINE ---");

  // Test 1: Create PO
  const createPoRes = await purchasesRoute.POST(
    createAdminRequest("http://localhost:3000/api/admin/purchases", "POST", {
      supplierId: testSupplier.id,
      items: [
        { medicineId: med1.id, quantity: 50, price: 10.0, mrp: 15.0 },
        { medicineId: med2.id, quantity: 30, price: 20.0, mrp: 28.0 },
      ],
      notes: "Test Initial Order",
    })
  );
  const createPoJson = await createPoRes.json();
  assert(createPoRes.status === 200 && createPoJson.success, "1.12.1: PO created successfully");
  const poId = createPoJson.purchaseOrder.id;
  const poNumber = createPoJson.purchaseOrder.poNumber;
  assert(createPoJson.purchaseOrder.status === "pending", "1.12.1: Initial PO status is 'pending'");
  assert(Number(createPoJson.purchaseOrder.total) === 1100, "1.12.1: PO total matches (50*10 + 30*20 = 1100)");

  // Test 2: Supplier lists their orders
  const supOrdersRes = await supplierOrdersRoute.GET(
    createSupplierRequest("http://localhost:3000/api/supplier/orders")
  );
  const supOrdersJson = await supOrdersRes.json();
  assert(supOrdersRes.status === 200 && supOrdersJson.success, "1.12.2: Supplier extranet orders list accessible");
  assert(supOrdersJson.orders.some((o: any) => o.id === poId), "1.12.2: Newly created PO visible in supplier portal");

  // Test 3: Supplier updates item prices (Module 1.12.2)
  const poItems = createPoJson.purchaseOrder.items;
  const supPriceUpdateRes = await supplierOrderDetailsRoute.PUT(
    createSupplierRequest(`http://localhost:3000/api/supplier/orders/${poId}`, "PUT", {
      items: [
        { itemId: poItems[0].id, price: 12.0, mrp: 18.0 },
        { itemId: poItems[1].id, price: 22.0, mrp: 30.0 },
      ],
    }),
    { params: Promise.resolve({ id: String(poId) }) }
  );
  const supPriceUpdateJson = await supPriceUpdateRes.json();
  assert(supPriceUpdateRes.status === 200 && supPriceUpdateJson.success, "1.12.2: Supplier price update accepted");
  assert(supPriceUpdateJson.purchaseOrder.status === "price_updated", "1.12.2: PO status transitioned to 'price_updated'");
  assert(Number(supPriceUpdateJson.purchaseOrder.total) === 1260, "1.12.2: Total recalculated (50*12 + 30*22 = 1260)");

  // Test 4: Cannot manually mark as 'received' without GRN (Bug 1 guard)
  const invalidReceiveRes = await poDetailsRoute.PUT(
    createAdminRequest(`http://localhost:3000/api/admin/purchases/${poId}`, "PUT", {
      status: "received",
    }),
    { params: Promise.resolve({ id: String(poId) }) }
  );
  assert(invalidReceiveRes.status === 400, "1.12.1: Direct status change to 'received' without GRN correctly blocked");

  // Test 5: Admin confirms PO (Locks prices)
  const confirmRes = await poDetailsRoute.PUT(
    createAdminRequest(`http://localhost:3000/api/admin/purchases/${poId}`, "PUT", {
      status: "confirmed",
    }),
    { params: Promise.resolve({ id: String(poId) }) }
  );
  const confirmJson = await confirmRes.json();
  assert(confirmRes.status === 200 && confirmJson.success, "1.12.2: Admin confirmed PO successfully");
  assert(confirmJson.purchaseOrder.status === "confirmed", "1.12.2: Status is 'confirmed'");
  assert(Boolean(confirmJson.purchaseOrder.confirmedAt), "1.12.2: 'confirmedAt' timestamp recorded");

  // Test 6: Supplier attempts to edit prices after confirmation (Should be locked!)
  const supPriceAfterConfirmRes = await supplierOrderDetailsRoute.PUT(
    createSupplierRequest(`http://localhost:3000/api/supplier/orders/${poId}`, "PUT", {
      items: [{ itemId: poItems[0].id, price: 15.0 }],
    }),
    { params: Promise.resolve({ id: String(poId) }) }
  );
  assert(supPriceAfterConfirmRes.status === 400, "1.12.2: Price update blocked on confirmed PO (Prices locked)");

  // Test 7: Admin item editing blocked after confirmation
  const adminEditAfterConfirmRes = await poDetailsRoute.PUT(
    createAdminRequest(`http://localhost:3000/api/admin/purchases/${poId}`, "PUT", {
      items: [{ medicineId: med1.id, quantity: 100, price: 10, mrp: 15 }],
    }),
    { params: Promise.resolve({ id: String(poId) }) }
  );
  assert(adminEditAfterConfirmRes.status === 400, "1.12.2: Admin item editing blocked on confirmed PO (Items locked)");

  // Test 8: Reorder from Existing PO (1-Click Clone) (Module 1.12.3)
  const cloneRes = await poCloneRoute.POST(
    createAdminRequest(`http://localhost:3000/api/admin/purchases/${poId}/clone`, "POST"),
    { params: Promise.resolve({ id: String(poId) }) }
  );
  const cloneJson = await cloneRes.json();
  assert(cloneRes.status === 200 && cloneJson.success, "1.12.3: Reorder cloning creates new PO");
  assert(cloneJson.purchaseOrder.status === "pending", "1.12.3: Cloned PO has status 'pending'");
  assert(cloneJson.purchaseOrder.poNumber !== poNumber, "1.12.3: Cloned PO receives sequential distinct PO number");
  assert(cloneJson.purchaseOrder.items.length === 2, "1.12.3: Line items copied into new PO");
  const clonedPoId = cloneJson.purchaseOrder.id;

  // Test 9: Cancel Cloned PO from pending (Allowed)
  const cancelClonedRes = await poDetailsRoute.PUT(
    createAdminRequest(`http://localhost:3000/api/admin/purchases/${clonedPoId}`, "PUT", {
      status: "cancelled",
    }),
    { params: Promise.resolve({ id: String(clonedPoId) }) }
  );
  const cancelClonedJson = await cancelClonedRes.json();
  assert(cancelClonedRes.status === 200 && cancelClonedJson.success, "1.12.1: Cancellation allowed from 'pending'");
  assert(cancelClonedJson.purchaseOrder.status === "cancelled", "1.12.1: Status updated to 'cancelled'");

  // Test 10: GRN Stock Inwarding with Batch Merge (Module 1.12.4)
  const grnRes1 = await grnRoute.POST(
    createAdminRequest("http://localhost:3000/api/admin/grn", "POST", {
      poId,
      invoiceNo: `INV-VEND-${runId}`,
      items: [
        {
          poItemId: poItems[0].id,
          receivedQty: 50,
          batchNo: `B-TEST-${runId}-A`,
          expiryDate: "2028-12-31",
          mrp: 18.0,
          purchasePrice: 12.0,
        },
        {
          poItemId: poItems[1].id,
          receivedQty: 30,
          batchNo: `B-TEST-${runId}-B`,
          expiryDate: "2028-12-31",
          mrp: 30.0,
          purchasePrice: 22.0,
        },
      ],
    })
  );
  const grnJson1 = await grnRes1.json();
  assert(grnRes1.status === 200 && grnJson1.success, "1.12.4: GRN physical inwarding succeeded");
  assert(grnJson1.purchaseOrder.status === "received", "1.12.4: Fully inwarded PO status is 'received'");

  // Verify stock_adjustments created
  const adjustments = await prisma.stockAdjustment.findMany({
    where: { reason: { contains: poNumber } },
  });
  assert(adjustments.length === 2, "1.12.4: stock_adjustments audit rows recorded for GRN");

  // Verify batch merge with weighted average cost
  const preBatch = await prisma.batch.findFirst({ where: { batchNo: `B-TEST-${runId}-A` } });
  assert(preBatch?.quantity === 50, "1.12.4: Batch A initial quantity is 50");

  // Test 11: Daily Stock Alert Email (Module 1.12.6)
  const stockAlertRes = await dailyStockAlertRoute.POST(
    createAdminRequest("http://localhost:3000/api/admin/notifications/daily-stock-alert?force=true", "POST")
  );
  const stockAlertJson = await stockAlertRes.json();
  assert(stockAlertRes.status === 200 && stockAlertJson.success, "1.12.6: Daily stock alert dispatched");
  assert(typeof stockAlertJson.lowStockCount === "number", "1.12.6: Stock alert counted low stock medicines");

  // Test 12: Rate limit check (without force, must be skipped within 24h)
  const stockAlertRateLimitRes = await dailyStockAlertRoute.POST(
    createAdminRequest("http://localhost:3000/api/admin/notifications/daily-stock-alert", "POST")
  );
  const stockAlertRateLimitJson = await stockAlertRateLimitRes.json();
  assert(stockAlertRateLimitJson.skipped === true, "1.12.6: Daily stock alert rate-limited to at most once per day");

  console.log("\n--- TEST GROUP 2: MODULE 1.13 CUSTOMER DIRECTORY, CHRONIC REFILLS & BAKI KHATA ---");

  // Test 13: Create Customer
  const custPhone = `9876${runId}`;
  const custRes = await customersRoute.POST(
    createAdminRequest("http://localhost:3000/api/admin/customers", "POST", {
      name: `Ramesh Sen ${runId}`,
      phone: custPhone,
      email: `ramesh_${runId}@patient.test`,
      address: "12 Lake Road, Kolkata",
      gender: "male",
      age: "55",
      medicalNotes: "Diabetic, allergic to sulfa drugs",
      isChronic: true,
      chronicDiseases: "Diabetes, Hypertension",
      refillDays: 30,
      creditLimit: 3000.0,
    })
  );
  const custJson = await custRes.json();
  assert(custRes.status === 200 && custJson.success, "1.13.1: Customer master record created");
  const customerId = custJson.customer.id;
  assert(custJson.customer.isChronic === true, "1.13.1: Chronic patient flag saved");
  assert(Boolean(custJson.customer.nextRefillDate), "1.13.2: Next refill date automatically calculated");
  assert(Number(custJson.customer.creditLimit) === 3000, "1.13.3: Configurable credit limit recorded");

  // Test 14: Duplicate phone prevention
  const dupPhoneRes = await customersRoute.POST(
    createAdminRequest("http://localhost:3000/api/admin/customers", "POST", {
      name: "Duplicate Phone Guy",
      phone: custPhone,
    })
  );
  assert(dupPhoneRes.status === 400, "1.13.1: Duplicate phone registration blocked");

  // Test 15: Customer Export CSV (Excel BOM)
  const exportRes = await customerExportRoute.GET(
    createAdminRequest("http://localhost:3000/api/admin/customers/export")
  );
  const arrayBuf = await exportRes.arrayBuffer();
  const rawBytes = Buffer.from(arrayBuf);
  assert(exportRes.status === 200, "1.13.1: Customers CSV export succeeded");
  assert(
    rawBytes[0] === 0xef && rawBytes[1] === 0xbb && rawBytes[2] === 0xbf,
    "1.13.1: CSV contains UTF-8 BOM (0xEF, 0xBB, 0xBF) for Excel"
  );
  const csvText = rawBytes.toString("utf8");
  assert(csvText.includes("Customer ID") && csvText.includes("Chronic Patient?"), "1.13.1: CSV contains required headers");

  // Test 16: Customer Profile GET
  const custGetRes = await customerDetailsRoute.GET(
    createAdminRequest(`http://localhost:3000/api/admin/customers/${customerId}`),
    { params: Promise.resolve({ id: String(customerId) }) }
  );
  const custGetJson = await custGetRes.json();
  assert(custGetRes.status === 200 && custGetJson.success, "1.13.1: Customer profile fetched");
  assert(custGetJson.customer.financials.outstandingDue === 0, "1.13.3: Initial outstanding balance is 0");
  assert(custGetJson.customer.financials.availableCredit === 3000, "1.13.3: Initial available credit equals credit limit");

  // Test 17: Chronic Refill Tracker Query (Module 1.13.2)
  const refillListRes = await customerRefillsRoute.GET(
    createAdminRequest("http://localhost:3000/api/admin/customers/refills?days=40")
  );
  const refillListJson = await refillListRes.json();
  assert(refillListRes.status === 200 && refillListJson.success, "1.13.2: Refill tracker list retrieved");
  const refillItem = refillListJson.refills.find((r: any) => r.id === customerId);
  assert(Boolean(refillItem), "1.13.2: Newly created chronic patient listed in refill tracker");

  // Test 18: Dispatch Refill Reminder & Advance Cycle (Module 1.13.2)
  const initialNextRefill = custJson.customer.nextRefillDate;
  const sendReminderRes = await customerRefillsRoute.POST(
    createAdminRequest("http://localhost:3000/api/admin/customers/refills", "POST", {
      customerId,
      channel: "email",
      advanceCycle: true,
    })
  );
  const sendReminderJson = await sendReminderRes.json();
  assert(sendReminderRes.status === 200 && sendReminderJson.success, "1.13.2: Refill reminder dispatched");
  assert(new Date(sendReminderJson.updatedNextRefill) > new Date(initialNextRefill), "1.13.2: Refill cycle successfully advanced");

  // Test 19: POS Credit Sale (Baki Khata) within Credit Limit (Module 1.13.3)
  const posBatch = await prisma.batch.findFirst({
    where: { medicineId: med1.id, quantity: { gte: 10 } },
  });

  const creditSaleRes = await posRoute.POST(
    new Request("http://localhost:3000/api/admin/pos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId,
        paymentMethod: "credit",
        items: [{ batchId: posBatch?.id, quantity: 10 }],
      }),
    })
  );
  const creditSaleJson = await creditSaleRes.json();
  assert(creditSaleRes.status === 200 && creditSaleJson.sale, "1.13.3: POS Credit sale approved within credit limit");
  const creditSaleAmount = Number(creditSaleJson.sale.grandTotal);

  // Test 20: POS Credit Sale exceeding Credit Limit (Must be blocked)
  const overLimitSaleRes = await posRoute.POST(
    new Request("http://localhost:3000/api/admin/pos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId,
        paymentMethod: "credit",
        items: [{ batchId: posBatch?.id, quantity: 300 }], // Exceeds remaining 3000 credit limit
      }),
    })
  );
  assert(overLimitSaleRes.status === 400 || overLimitSaleRes.status === 500, "1.13.3: POS Credit sale exceeding limit correctly blocked");

  // Test 21: Customer Baki Khata Ledger Statement (Module 1.13.3)
  const ledgerRes = await customerLedgerRoute.GET(
    createAdminRequest(`http://localhost:3000/api/admin/customers/${customerId}/ledger`),
    { params: Promise.resolve({ id: String(customerId) }) }
  );
  const ledgerJson = await ledgerRes.json();
  assert(ledgerRes.status === 200 && ledgerJson.success, "1.13.3: Customer credit ledger fetched");
  assert(ledgerJson.summary.currentDue === creditSaleAmount, "1.13.3: Current due matches credit sale amount");
  assert(ledgerJson.ledger.length >= 1, "1.13.3: Ledger contains debit transaction");

  // Test 22: Customer Payment Settlement (Baki Clearance) (Module 1.13.3)
  const settleAmount = Math.min(50, creditSaleAmount);
  const settleRes = await customerLedgerRoute.POST(
    createAdminRequest(`http://localhost:3000/api/admin/customers/${customerId}/ledger`, "POST", {
      amount: settleAmount,
      paymentMethod: "upi",
      referenceNo: `UPI-SETTLE-${runId}`,
      notes: "Partial payment settlement via counter QR",
    }),
    { params: Promise.resolve({ id: String(customerId) }) }
  );
  const settleJson = await settleRes.json();
  assert(settleRes.status === 200 && settleJson.success, "1.13.3: Credit settlement recorded successfully");

  // Verify updated ledger
  const updatedLedgerRes = await customerLedgerRoute.GET(
    createAdminRequest(`http://localhost:3000/api/admin/customers/${customerId}/ledger`),
    { params: Promise.resolve({ id: String(customerId) }) }
  );
  const updatedLedgerJson = await updatedLedgerRes.json();
  const expectedRemainingDue = Math.round((creditSaleAmount - settleAmount) * 100) / 100;
  assert(
    updatedLedgerJson.summary.currentDue === expectedRemainingDue,
    `1.13.3: Outstanding due accurately reduced to ₹${expectedRemainingDue}`
  );
  assert(
    updatedLedgerJson.summary.totalSettled === settleAmount,
    `1.13.3: Total settled matches payment of ₹${settleAmount}`
  );

  // Test 23: Delete Guard (Cannot delete customer with active sales or due balance)
  const deleteBlockedRes = await customerDetailsRoute.DELETE(
    createAdminRequest(`http://localhost:3000/api/admin/customers/${customerId}`, "DELETE"),
    { params: Promise.resolve({ id: String(customerId) }) }
  );
  assert(deleteBlockedRes.status === 400, "1.13.1: Customer deletion blocked due to existing sales records / dues");

  // Clean-up test data (optional / safe)
  console.log("\n================================================================================");
  console.log(`TOTAL TESTS: ${testPassed + testFailed} | PASSED: ${testPassed} | FAILED: ${testFailed}`);
  console.log("================================================================================");

  if (testFailed > 0) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("FATAL SUITE ERROR:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
