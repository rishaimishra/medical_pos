import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { createSessionToken, hashPassword } from "../src/lib/auth";
import * as salesRoute from "../src/app/api/admin/sales/route";
import * as saleDetailRoute from "../src/app/api/admin/sales/[id]/route";
import * as shareRoute from "../src/app/api/admin/sales/[id]/share/route";
import * as exportRoute from "../src/app/api/admin/sales/export/route";
import * as returnsLookupRoute from "../src/app/api/admin/returns/lookup/route";
import * as returnsRoute from "../src/app/api/admin/returns/route";
import * as returnDetailRoute from "../src/app/api/admin/returns/[id]/route";

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
  console.log("INTEGRATION TEST SUITE: MODULE 2.9 & MODULE 2.10");
  console.log("Sales History, Digital Invoices (WhatsApp/SMS), Returns & Restock Engine");
  console.log("================================================================================");

  const runId = Math.floor(Math.random() * 900000) + 100000;
  const currentStore = await prisma.settings.findFirst();
  const storeId = currentStore?.id || 1;

  // 1. Setup Test Branch & Admin User
  const testBranch = await prisma.branch.create({
    data: {
      storeId,
      code: `BR-S9-${runId}`,
      name: `City Apollo Pharmacy ${runId}`,
      address: `Sector 5, Salt Lake, Kolkata - ${runId}`,
      phone: `98300${runId.toString().slice(0, 5)}`,
      gstNo: `19AAAC${runId}F1Z5`,
      dlNo: `DL-20B/21B-${runId}`,
      isMain: false,
    },
  });

  const adminPasswordHash = await hashPassword("Admin123!");
  const testAdminUser = await prisma.user.create({
    data: {
      name: `Admin Officer ${runId}`,
      username: `admin_s9_${runId}`,
      email: `admin_s9_${runId}@pharmacy.local`,
      password: adminPasswordHash,
      role: "admin",
      permissions: JSON.stringify(["manage_medicines", "manage_customers"]),
      branchId: testBranch.id,
      storeId,
      active: true,
    },
  });

  const adminToken = createSessionToken({
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

  // 2. Setup Customer & Inventory
  const testCustomer = await prisma.customer.create({
    data: {
      name: `Vikram Sengupta ${runId}`,
      phone: `98741${runId.toString().slice(0, 5)}`,
      email: `vikram_${runId}@gmail.com`,
      address: `14 Lake View Road, Kolkata`,
    },
  });

  const medicineA = await prisma.medicine.create({
    data: {
      name: `Azithromycin 500mg ${runId}`,
      genericName: "Azithromycin",
      company: "Zithro Care",
      category: "Tablet",
      hsnCode: "30042010",
      scheduleType: "schedule_h",
    },
  });

  const batchA = await prisma.batch.create({
    data: {
      medicineId: medicineA.id,
      branchId: testBranch.id,
      batchNo: `BAT-AZ-${runId}`,
      quantity: 100,
      expiryDate: new Date("2028-06-30"),
      mrp: 100.0,
      purchasePrice: 60.0,
    },
  });

  const medicineB = await prisma.medicine.create({
    data: {
      name: `Cough Syrup 100ml ${runId}`,
      genericName: "Dextromethorphan",
      company: "Kof Cure",
      category: "Syrup",
      hsnCode: "30049090",
      scheduleType: "general",
    },
  });

  const batchB = await prisma.batch.create({
    data: {
      medicineId: medicineB.id,
      branchId: testBranch.id,
      batchNo: `BAT-KF-${runId}`,
      quantity: 50,
      expiryDate: new Date("2027-12-31"),
      mrp: 80.0,
      purchasePrice: 45.0,
    },
  });

  // 3. Create Sample Sale:
  // Item A: 5 units @ 100 = 500
  // Item B: 2 units @ 80 = 160
  // Subtotal = 660, Discount = 66 (10%), Grand Total = 594
  const invoiceNo = `INV-TEST-${runId}`;
  const testSale = await prisma.sale.create({
    data: {
      invoiceNo,
      customerId: testCustomer.id,
      branchId: testBranch.id,
      createdBy: testAdminUser.id,
      saleDate: new Date(),
      totalAmount: 660.0,
      discountAmount: 66.0, // 10% discount
      gstAmount: 63.64,
      grandTotal: 594.0,
      paymentMethod: "upi",
      upiRef: `UPI-UTR-${runId}`,
      doctorName: "Dr. B. C. Roy",
      doctorRegNo: "MCI-45892",
      items: {
        create: [
          {
            medicineId: medicineA.id,
            batchId: batchA.id,
            quantity: 5,
            mrp: 100.0,
            price: 500.0,
            gstPercent: 12.0,
            taxableBase: 446.43,
            gstAmount: 53.57,
          },
          {
            medicineId: medicineB.id,
            batchId: batchB.id,
            quantity: 2,
            mrp: 80.0,
            price: 160.0,
            gstPercent: 12.0,
            taxableBase: 142.86,
            gstAmount: 17.14,
          },
        ],
      },
    },
  });

  console.log(`  * Created Sale Invoice: ${testSale.invoiceNo} (ID: ${testSale.id})`);

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 1: Sales History & Archive API (Module 2.9.1)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SUITE 1: Sales History Listing, Filtering & KPIs (2.9.1) ---");

  // 1.1 List Sales with Branch Filter
  const listReq = createReq(
    `http://localhost:3000/api/admin/sales?branchId=${testBranch.id}`,
    adminToken
  );
  const listRes = await salesRoute.GET(listReq);
  const listJson = await listRes.json();
  assert(
    listRes.status === 200 && listJson.success === true,
    "GET /api/admin/sales returns 200 and success",
    listJson
  );
  assert(
    listJson.data.some((s: any) => s.invoiceNo === invoiceNo),
    "Sales list includes created test invoice",
    invoiceNo
  );
  assert(
    listJson.summary.totalInvoices >= 1 && listJson.summary.netSales >= 594,
    "Summary KPI cards aggregate invoices count and net sales correctly",
    listJson.summary
  );

  // 1.2 Search by Customer Phone
  const searchReq = createReq(
    `http://localhost:3000/api/admin/sales?search=${testCustomer.phone}`,
    adminToken
  );
  const searchRes = await salesRoute.GET(searchReq);
  const searchJson = await searchRes.json();
  assert(
    searchJson.data.length >= 1 && searchJson.data[0].customer.phone === testCustomer.phone,
    "Search by customer phone returns matching sales record",
    searchJson.data[0]?.customer
  );

  // 1.3 Detailed Sale Lookup
  const detailReq = createReq(
    `http://localhost:3000/api/admin/sales/${testSale.id}`,
    adminToken
  );
  const detailRes = await saleDetailRoute.GET(detailReq, {
    params: Promise.resolve({ id: String(testSale.id) }),
  });
  const detailJson = await detailRes.json();
  assert(
    detailRes.status === 200 && detailJson.sale.invoiceNo === invoiceNo,
    "GET /api/admin/sales/[id] returns full sale record with items",
    detailJson.sale?.invoiceNo
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 2: Digital Invoice Delivery (WhatsApp & SMS - Module 2.9.2)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SUITE 2: Digital Invoice Sharing (WhatsApp & SMS - 2.9.2) ---");

  const shareReq = createReq(
    `http://localhost:3000/api/admin/sales/${testSale.id}/share`,
    adminToken,
    "POST",
    { channel: "whatsapp" }
  );
  const shareRes = await shareRoute.POST(shareReq, {
    params: Promise.resolve({ id: String(testSale.id) }),
  });
  const shareJson = await shareRes.json();
  assert(
    shareRes.status === 200 && shareJson.success === true,
    "POST /api/admin/sales/[id]/share returns 200 and success payload",
    shareJson
  );
  assert(
    shareJson.delivery.whatsapp.shareUrl.includes("wa.me") &&
      shareJson.delivery.whatsapp.message.includes(invoiceNo),
    "WhatsApp delivery payload generates clean wa.me direct link with invoice number",
    shareJson.delivery.whatsapp
  );
  assert(
    shareJson.delivery.sms.message.includes("594.00"),
    "SMS text payload includes customer greeting and net payable amount",
    shareJson.delivery.sms.message
  );

  // 1.4 Sales Export to CSV
  const exportReq = createReq(
    `http://localhost:3000/api/admin/sales/export?branchId=${testBranch.id}`,
    adminToken
  );
  const exportRes = await exportRoute.GET(exportReq);
  const exportText = await exportRes.text();
  assert(
    exportRes.status === 200 &&
      exportText.includes("Invoice No") &&
      exportText.includes(invoiceNo),
    "GET /api/admin/sales/export returns CSV with invoice data",
    exportText.slice(0, 150)
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 3: Invoice-Linked Return Lookup & Valuation (Module 2.10.1 & 2.11)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SUITE 3: Invoice Returns Lookup & Valuation (2.10.1 & 2.11) ---");

  const lookupReq = createReq(
    `http://localhost:3000/api/admin/returns/lookup?invoiceNo=${invoiceNo}`,
    adminToken
  );
  const lookupRes = await returnsLookupRoute.GET(lookupReq);
  const lookupJson = await lookupRes.json();
  assert(
    lookupRes.status === 200 && lookupJson.success === true,
    "GET /api/admin/returns/lookup returns 200 for valid invoice number",
    lookupJson
  );

  const lookupItemA = lookupJson.sale.items.find((i: any) => i.medicineId === medicineA.id);
  const lookupItemB = lookupJson.sale.items.find((i: any) => i.medicineId === medicineB.id);

  assert(
    lookupItemA.purchasedQty === 5 && lookupItemA.remainingReturnableQty === 5,
    "Item A purchased 5 units, 0 returned, 5 remaining returnable",
    lookupItemA
  );

  // Check 10% discount-proportional refund valuation (Module 2.11.3)
  // Item A: 100 gross - 10% = 90 refund per unit
  // Item B: 80 gross - 10% = 72 refund per unit
  assert(
    lookupItemA.unitRefundPrice === 90 && lookupItemB.unitRefundPrice === 72,
    "Unit refund price accurately accounts for 10% bill discount (100 -> 90, 80 -> 72)",
    { itemA: lookupItemA.unitRefundPrice, itemB: lookupItemB.unitRefundPrice }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 4: Sales Returns Processing & Restock Workflow (Module 2.10 & 2.11)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SUITE 4: Return Processing & Already-Returned Guard (2.10 & 2.11) ---");

  // 4.1 Attempt to return MORE than purchased -> BLOCKED by Already-Returned Guard
  const overReturnReq = createReq(
    `http://localhost:3000/api/admin/returns`,
    adminToken,
    "POST",
    {
      saleId: testSale.id,
      reason: "Customer bought too many",
      refundMethod: "cash",
      items: [
        {
          saleItemId: lookupItemA.saleItemId,
          quantity: 10, // Only 5 purchased!
          restockAction: "restock",
        },
      ],
    }
  );
  const overReturnRes = await returnsRoute.POST(overReturnReq);
  const overReturnJson = await overReturnRes.json();
  assert(
    overReturnRes.status === 400 && overReturnJson.success === false,
    "Already-Returned Guard blocks returning 10 units when only 5 were purchased",
    overReturnJson.message
  );

  // 4.2 Process Valid Partial Return of Item A (2 units) with RESTOCK
  const initialBatchAQty = (await prisma.batch.findUnique({ where: { id: batchA.id } }))?.quantity || 0;

  const validReturnReq1 = createReq(
    `http://localhost:3000/api/admin/returns`,
    adminToken,
    "POST",
    {
      saleId: testSale.id,
      reason: "Patient dosage reduced by doctor",
      refundMethod: "cash",
      items: [
        {
          saleItemId: lookupItemA.saleItemId,
          quantity: 2, // Return 2 units @ 90 = 180 refund
          restockAction: "restock",
        },
      ],
    }
  );
  const validReturnRes1 = await returnsRoute.POST(validReturnReq1);
  const validReturnJson1 = await validReturnRes1.json();
  assert(
    validReturnRes1.status === 200 && validReturnJson1.success === true,
    "First return (2 units of Item A) processed successfully",
    validReturnJson1
  );

  // Verify batch inventory incremented by 2
  const postBatchAQty = (await prisma.batch.findUnique({ where: { id: batchA.id } }))?.quantity || 0;
  assert(
    postBatchAQty === initialBatchAQty + 2,
    "Restock action successfully added 2 units back to active salable batch inventory",
    { before: initialBatchAQty, after: postBatchAQty }
  );

  // Verify stock adjustment row created
  const adjRow1 = await prisma.stockAdjustment.findFirst({
    where: {
      batchId: batchA.id,
      type: "return",
    },
    orderBy: { id: "desc" },
  });
  assert(
    Boolean(adjRow1 && adjRow1.quantity === 2 && adjRow1.reason.includes("Restocked")),
    "StockAdjustment row logged with type 'return' and matching quantity",
    adjRow1
  );

  // 4.3 Process Second Return of Item A (1 unit) with DAMAGED_WRITE_OFF
  const validReturnReq2 = createReq(
    `http://localhost:3000/api/admin/returns`,
    adminToken,
    "POST",
    {
      saleId: testSale.id,
      reason: "Broken blister pack / damaged seal",
      refundMethod: "upi",
      items: [
        {
          saleItemId: lookupItemA.saleItemId,
          quantity: 1, // Return 1 unit @ 90 = 90 refund
          restockAction: "damaged_write_off",
        },
      ],
    }
  );
  const validReturnRes2 = await returnsRoute.POST(validReturnReq2);
  const validReturnJson2 = await validReturnRes2.json();
  assert(
    validReturnRes2.status === 200 && validReturnJson2.success === true,
    "Second return (1 unit damaged write-off) processed successfully",
    validReturnJson2
  );

  // Verify batch inventory did NOT increment for damaged write-off
  const postBatchAQty2 = (await prisma.batch.findUnique({ where: { id: batchA.id } }))?.quantity || 0;
  assert(
    postBatchAQty2 === postBatchAQty,
    "Damaged write-off did NOT increase active salable batch inventory",
    { before: postBatchAQty, after: postBatchAQty2 }
  );

  // Verify stock adjustment row for write-off
  const adjRow2 = await prisma.stockAdjustment.findFirst({
    where: {
      batchId: batchA.id,
      type: "remove",
    },
    orderBy: { id: "desc" },
  });
  assert(
    Boolean(adjRow2 && adjRow2.quantity === 1 && adjRow2.reason.includes("Damaged")),
    "StockAdjustment row logged with type 'remove' for write-off",
    adjRow2
  );

  // 4.4 Check updated lookup: Item A purchased 5, returned 3 (2 restocked + 1 damaged), 2 remaining returnable
  const lookupReq2 = createReq(
    `http://localhost:3000/api/admin/returns/lookup?invoiceNo=${invoiceNo}`,
    adminToken
  );
  const lookupRes2 = await returnsLookupRoute.GET(lookupReq2);
  const lookupJson2 = await lookupRes2.json();
  const updatedItemA = lookupJson2.sale.items.find((i: any) => i.medicineId === medicineA.id);
  assert(
    updatedItemA.alreadyReturnedQty === 3 && updatedItemA.remainingReturnableQty === 2,
    "Updated lookup accurately reflects 3 returned and 2 remaining returnable units",
    updatedItemA
  );

  // 4.5 Attempt to return 3 units of Item A -> BLOCKED because only 2 remain!
  const excessReturnReq = createReq(
    `http://localhost:3000/api/admin/returns`,
    adminToken,
    "POST",
    {
      saleId: testSale.id,
      reason: "Attempt excess return",
      refundMethod: "cash",
      items: [
        {
          saleItemId: lookupItemA.saleItemId,
          quantity: 3, // Only 2 remaining!
          restockAction: "restock",
        },
      ],
    }
  );
  const excessReturnRes = await returnsRoute.POST(excessReturnReq);
  const excessReturnJson = await excessReturnRes.json();
  assert(
    excessReturnRes.status === 400 && excessReturnJson.success === false,
    "Already-Returned Guard blocks returning 3 units when only 2 remain returnable",
    excessReturnJson.message
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 5: Returns Listing & Credit Note API (Module 2.10 & 2.11)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SUITE 5: Returns Listing & Credit Note Voucher ---");

  const retListReq = createReq(
    `http://localhost:3000/api/admin/returns?branchId=${testBranch.id}`,
    adminToken
  );
  const retListRes = await returnsRoute.GET(retListReq);
  const retListJson = await retListRes.json();
  assert(
    retListRes.status === 200 && retListJson.data.length >= 2,
    "Returns history list displays processed returns for branch",
    retListJson.data.length
  );
  assert(
    retListJson.summary.totalRefundAmount >= 270,
    "Total refund amount KPI correctly sums both returns (180 + 90 = 270)",
    retListJson.summary
  );

  // Detailed Credit Note lookup
  const creditNoteId = validReturnJson1.return.id;
  const noteReq = createReq(
    `http://localhost:3000/api/admin/returns/${creditNoteId}`,
    adminToken
  );
  const noteRes = await returnDetailRoute.GET(noteReq, {
    params: Promise.resolve({ id: String(creditNoteId) }),
  });
  const noteJson = await noteRes.json();
  assert(
    noteRes.status === 200 && noteJson.return.returnNumber === validReturnJson1.return.returnNumber,
    "GET /api/admin/returns/[id] returns credit note voucher data with items and customer",
    noteJson.return
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Cleanup Test Data
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- Cleanup Test Data ---");
  await prisma.returnItem.deleteMany({
    where: { returnReturn: { saleId: testSale.id } },
  });
  await prisma.return.deleteMany({
    where: { saleId: testSale.id },
  });
  await prisma.stockAdjustment.deleteMany({
    where: { batchId: { in: [batchA.id, batchB.id] } },
  });
  await prisma.saleItem.deleteMany({ where: { saleId: testSale.id } });
  await prisma.sale.delete({ where: { id: testSale.id } });
  await prisma.batch.deleteMany({ where: { id: { in: [batchA.id, batchB.id] } } });
  await prisma.medicine.deleteMany({ where: { id: { in: [medicineA.id, medicineB.id] } } });
  await prisma.customer.delete({ where: { id: testCustomer.id } });
  await prisma.user.delete({ where: { id: testAdminUser.id } });
  await prisma.branch.delete({ where: { id: testBranch.id } });
  console.log("  ✔ Cleaned up temporary test branch, user, medicines, batches, sales, and returns");

  console.log("\n================================================================================");
  console.log(`TEST SUITE RESULTS: ${testPassed} PASSED, ${testFailed} FAILED`);
  console.log("================================================================================");

  if (testFailed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Fatal test suite error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
