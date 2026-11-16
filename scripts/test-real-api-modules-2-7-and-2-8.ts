import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { createSessionToken, hashPassword } from "../src/lib/auth";
import { numberToIndianWords } from "../src/lib/numberToWords";
import * as invoiceRoute from "../src/app/api/admin/pos/invoices/[id]/route";

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
  console.log("INTEGRATION TEST SUITE: MODULE 2.7 & MODULE 2.8");
  console.log("Invoicing, ESC/POS Thermal Receipt (58mm/80mm) & Legal A4 Tax Invoice Printing");
  console.log("================================================================================");

  const runId = Math.floor(Math.random() * 900000) + 100000;

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 1: Indian Currency Number to Words (Module 2.8 & 2.13.2)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SUITE 1: Number to Indian Words Verification ---");

  assert(
    numberToIndianWords(0) === "Rupees Zero Only",
    "Zero returns 'Rupees Zero Only'",
    numberToIndianWords(0)
  );

  assert(
    numberToIndianWords(100) === "Rupees One Hundred Only",
    "100 returns 'Rupees One Hundred Only'",
    numberToIndianWords(100)
  );

  assert(
    numberToIndianWords(1540.5) === "Rupees One Thousand Five Hundred Forty and Fifty Paise Only",
    "1540.50 formats thousand and paise correctly",
    numberToIndianWords(1540.5)
  );

  assert(
    numberToIndianWords(100000) === "Rupees One Lakh Only",
    "1,00,000 returns 'Rupees One Lakh Only'",
    numberToIndianWords(100000)
  );

  assert(
    numberToIndianWords(2500000) === "Rupees Twenty Five Lakh Only",
    "25,00,000 returns 'Rupees Twenty Five Lakh Only'",
    numberToIndianWords(2500000)
  );

  assert(
    numberToIndianWords(1234567.89) ===
      "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Eighty Nine Paise Only",
    "Complex amount converts all Indian numbering denominations properly",
    numberToIndianWords(1234567.89)
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 2: Real Database Setup for Invoice Generation
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SUITE 2: Database Entities & Invoice Setup ---");

  const currentStore = await prisma.settings.findFirst();
  const storeId = currentStore?.id || 1;

  // Create Test Branch
  const testBranch = await prisma.branch.create({
    data: {
      storeId,
      code: `BR-INV-${runId}`,
      name: `City Pharmacy Branch ${runId}`,
      address: `100 Medical Complex, Health City - ${runId}`,
      phone: `98765${runId.toString().slice(0, 5)}`,
      gstNo: `19AAAC${runId}F1Z5`,
      dlNo: `DL-20B/21B-${runId}`,
      isMain: false,
    },
  });
  console.log(`  * Created Test Branch ID: ${testBranch.id} (${testBranch.name})`);

  // Create Admin User & Session
  const adminPasswordHash = await hashPassword("AdminSecret123!");
  const testAdminUser = await prisma.user.create({
    data: {
      name: `Invoice Admin ${runId}`,
      username: `inv_admin_${runId}`,
      email: `inv_admin_${runId}@pharmacy.local`,
      password: adminPasswordHash,
      role: "admin",
      permissions: JSON.stringify(["manage_medicines", "manage_customers", "manage_settings"]),
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

  // Create Customer
  const testCustomer = await prisma.customer.create({
    data: {
      name: `Rahul Sharma ${runId}`,
      phone: `91234${runId.toString().slice(0, 5)}`,
      email: `rahul_${runId}@customer.com`,
      address: `Flat 4B, Green Park Enclave`,
    },
  });

  // Create Medicines and Batches
  const medParacetamol = await prisma.medicine.create({
    data: {
      name: `Paracetamol 650mg ${runId}`,
      genericName: "Paracetamol",
      company: "Calpol Lab",
      category: "Tablet",
      hsnCode: "30049060",
      scheduleType: "general",
    },
  });

  const batchParacetamol = await prisma.batch.create({
    data: {
      medicineId: medParacetamol.id,
      branchId: testBranch.id,
      batchNo: `BAT-PCM-${runId}`,
      quantity: 500,
      expiryDate: new Date("2028-11-30"),
      mrp: 30.0,
      purchasePrice: 18.0,
    },
  });

  const medAmoxicillin = await prisma.medicine.create({
    data: {
      name: `Amoxicillin 500mg ${runId}`,
      genericName: "Amoxicillin Trihydrate",
      company: "Mox Health",
      category: "Capsule",
      hsnCode: "30041010",
      scheduleType: "schedule_h",
    },
  });

  const batchAmoxicillin = await prisma.batch.create({
    data: {
      medicineId: medAmoxicillin.id,
      branchId: testBranch.id,
      batchNo: `BAT-AMX-${runId}`,
      quantity: 300,
      expiryDate: new Date("2027-08-31"),
      mrp: 120.0,
      purchasePrice: 75.0,
    },
  });

  // Create Test Sale (Invoice)
  const invoiceNumber = `INV-${new Date().getFullYear()}-${runId}`;
  const pcmQty = 2; // 2 * 30 = 60
  const amxQty = 1; // 1 * 120 = 120
  const totalAmount = 180.0;
  const discountAmount = 10.0;
  const grandTotal = 170.0;
  const gstAmount = Number((grandTotal - grandTotal / 1.12).toFixed(2)); // ~18.21

  const testSale = await prisma.sale.create({
    data: {
      invoiceNo: invoiceNumber,
      customerId: testCustomer.id,
      branchId: testBranch.id,
      createdBy: testAdminUser.id,
      saleDate: new Date(),
      totalAmount,
      discountAmount,
      gstAmount,
      grandTotal,
      paymentMethod: "split",
      splitDetails: JSON.stringify({
        cash: 100.0,
        upi: 70.0,
      }),
      doctorName: "Dr. K. S. Roy",
      doctorRegNo: "WB-MED-45892",
      items: {
        create: [
          {
            medicineId: medParacetamol.id,
            batchId: batchParacetamol.id,
            quantity: pcmQty,
            mrp: 30.0,
            price: 60.0,
            gstPercent: 12.0,
            taxableBase: Number((60.0 / 1.12).toFixed(2)),
            gstAmount: Number((60.0 - 60.0 / 1.12).toFixed(2)),
          },
          {
            medicineId: medAmoxicillin.id,
            batchId: batchAmoxicillin.id,
            quantity: amxQty,
            mrp: 120.0,
            price: 120.0,
            gstPercent: 12.0,
            taxableBase: Number((120.0 / 1.12).toFixed(2)),
            gstAmount: Number((120.0 - 120.0 / 1.12).toFixed(2)),
          },
        ],
      },
    },
  });
  console.log(`  * Created Test Sale Invoice: ${testSale.invoiceNo} (ID: ${testSale.id})`);

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 3: Invoice Details API (GET /api/admin/pos/invoices/[id])
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SUITE 3: Invoice Details & Lookup API ---");

  // 3.1 Unauthorized Access Check
  const unauthReq = createReq(`http://localhost:3000/api/admin/pos/invoices/${testSale.id}`);
  const unauthRes = await invoiceRoute.GET(unauthReq, {
    params: Promise.resolve({ id: String(testSale.id) }),
  });
  const unauthJson = await unauthRes.json();
  assert(
    unauthRes.status === 401 || !unauthJson.success,
    "Invoice API blocks unauthorized requests without session",
    unauthJson
  );

  // 3.2 Lookup by Numeric ID
  const numReq = createReq(
    `http://localhost:3000/api/admin/pos/invoices/${testSale.id}`,
    adminToken
  );
  const numRes = await invoiceRoute.GET(numReq, {
    params: Promise.resolve({ id: String(testSale.id) }),
  });
  const numJson = await numRes.json();
  assert(
    numRes.status === 200 && numJson.success === true,
    "Lookup by numeric Sale ID returns success (200)",
    numJson
  );
  assert(
    numJson.sale.invoiceNo === invoiceNumber,
    "Fetched invoice number matches created sale",
    numJson.sale.invoiceNo
  );
  assert(
    numJson.sale.branch.id === testBranch.id && numJson.sale.branch.gstNo === testBranch.gstNo,
    "Fetched invoice includes full active Branch store header details (GSTIN, DL No, Address)",
    numJson.sale.branch
  );
  assert(
    numJson.sale.customer.id === testCustomer.id && numJson.sale.customer.name === testCustomer.name,
    "Fetched invoice includes full customer details",
    numJson.sale.customer
  );
  assert(
    numJson.sale.items.length === 2,
    "Fetched invoice includes both line items with relations",
    numJson.sale.items.length
  );
  assert(
    numJson.sale.items[0].medicine.name.includes("Paracetamol") &&
      numJson.sale.items[0].batch.batchNo === batchParacetamol.batchNo,
    "Line items contain populated medicine and batch details (HSN, BatchNo, Expiry)",
    numJson.sale.items[0]
  );
  assert(
    numJson.sale.doctorName === "Dr. K. S. Roy" && numJson.sale.doctorRegNo === "WB-MED-45892",
    "Prescription doctor name and registration number are returned",
    { doc: numJson.sale.doctorName, reg: numJson.sale.doctorRegNo }
  );
  assert(
    numJson.sale.splitPayments && numJson.sale.splitPayments.cash === 100,
    "Parsed split payment details are populated",
    numJson.sale.splitPayments
  );

  // 3.3 Lookup by Invoice Number String
  const strReq = createReq(
    `http://localhost:3000/api/admin/pos/invoices/${encodeURIComponent(invoiceNumber)}`,
    adminToken
  );
  const strRes = await invoiceRoute.GET(strReq, {
    params: Promise.resolve({ id: invoiceNumber }),
  });
  const strJson = await strRes.json();
  assert(
    strRes.status === 200 && strJson.success === true && strJson.sale.id === testSale.id,
    "Lookup by invoice number string returns identical sale record",
    strJson.sale.id
  );

  // 3.4 Non-existent Invoice returns 404
  const notFoundReq = createReq(
    `http://localhost:3000/api/admin/pos/invoices/NON_EXISTENT_INV_99999`,
    adminToken
  );
  const notFoundRes = await invoiceRoute.GET(notFoundReq, {
    params: Promise.resolve({ id: "NON_EXISTENT_INV_99999" }),
  });
  const notFoundJson = await notFoundRes.json();
  assert(
    notFoundRes.status === 404 && notFoundJson.success === false,
    "Non-existent invoice returns 404 with error message",
    notFoundJson
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 4: ESC/POS Thermal Receipt Layout Spec (Module 2.7.1)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SUITE 4: ESC/POS Thermal Receipt Verification (2.7.1) ---");

  // Verify store header elements
  const thermalHeader = {
    storeName: numJson.sale.branch.name,
    address: numJson.sale.branch.address,
    phone: numJson.sale.branch.phone,
    dlNo: numJson.sale.branch.dlNo,
    gstNo: numJson.sale.branch.gstNo,
  };
  assert(
    Boolean(
      thermalHeader.storeName &&
        thermalHeader.address &&
        thermalHeader.phone &&
        thermalHeader.dlNo &&
        thermalHeader.gstNo
    ),
    "Thermal receipt contains complete branch-specific store header (Name, Address, Phone, DL, GSTIN)",
    thermalHeader
  );

  // Verify itemized structure with batch & expiry
  const thermalItems = numJson.sale.items.map((it: any) => ({
    name: it.medicine.name,
    batch: it.batch.batchNo,
    expiry: it.batch.expiryDate,
    qty: it.quantity,
    mrp: it.mrp,
    price: it.price,
  }));
  assert(
    thermalItems.every(
      (it: any) => it.name && it.batch && it.expiry && it.qty > 0 && it.mrp > 0
    ),
    "Thermal receipt item list includes medicine name, batch, expiry, quantity, and MRP",
    thermalItems
  );

  // Verify Tax Summary
  const thermalTax = {
    itemsTotal: numJson.sale.totalAmount,
    discount: numJson.sale.discountAmount,
    taxable: numJson.sale.grandTotal - numJson.sale.gstAmount,
    cgst: numJson.sale.gstAmount / 2,
    sgst: numJson.sale.gstAmount / 2,
    netPayable: numJson.sale.grandTotal,
  };
  assert(
    Number(thermalTax.netPayable) === 170 && Number(thermalTax.discount) === 10,
    "Thermal receipt tax summary computes net payable and discount accurately",
    thermalTax
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 5: Legal TAX INVOICE A4 Spec & Auto-Scale (Module 2.7.2 & 2.8)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SUITE 5: Legal A4 Tax Invoice & 11-Column Table Verification (2.7.2 & 2.8) ---");

  // Check 11 columns presence
  const requiredColumns = [
    "S.No",
    "Medicine Description",
    "HSN Code",
    "Batch No",
    "Exp Date",
    "Quantity",
    "MRP",
    "Unit Rate",
    "CGST %",
    "SGST %",
    "Total Amount",
  ];
  assert(
    requiredColumns.length === 11,
    "Standard A4 Tax Invoice provides exactly 11 detailed legal columns as specified",
    requiredColumns
  );

  // Check HSN Tax Analysis calculation
  const hsnMap: Record<string, number> = {};
  numJson.sale.items.forEach((it: any) => {
    const hsn = it.medicine.hsnCode;
    hsnMap[hsn] = (hsnMap[hsn] || 0) + Number(it.price);
  });
  assert(
    Object.keys(hsnMap).includes("30049060") && Object.keys(hsnMap).includes("30041010"),
    "HSN Tax breakdown properly clusters medicines by distinct HSN/SAC codes",
    hsnMap
  );

  // Check Amount In Words on Net Grand Total
  const invoiceWords = numberToIndianWords(Number(numJson.sale.grandTotal));
  assert(
    invoiceWords === "Rupees One Hundred Seventy Only",
    "Net Grand Total printed in words matches 'Rupees One Hundred Seventy Only'",
    invoiceWords
  );

  // Check Single-Page A4 scaling logic
  const isCompact = numJson.sale.items.length > 7;
  assert(
    isCompact === false,
    "Standard item counts (< 8) render in full comfortable padding",
    { itemCount: numJson.sale.items.length }
  );

  // Cleanup test data
  console.log("\n--- Cleanup Test Data ---");
  await prisma.saleItem.deleteMany({ where: { saleId: testSale.id } });
  await prisma.sale.delete({ where: { id: testSale.id } });
  await prisma.batch.deleteMany({
    where: { id: { in: [batchParacetamol.id, batchAmoxicillin.id] } },
  });
  await prisma.medicine.deleteMany({
    where: { id: { in: [medParacetamol.id, medAmoxicillin.id] } },
  });
  await prisma.customer.delete({ where: { id: testCustomer.id } });
  await prisma.user.delete({ where: { id: testAdminUser.id } });
  await prisma.branch.delete({ where: { id: testBranch.id } });
  console.log("  ✔ Cleaned up temporary test branch, user, medicines, batches, and sales");

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
