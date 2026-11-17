/**
 * Integration Test Suite for MODULE 2.14 & MODULE 2.15
 * 
 * MODULE 2.14:
 * - 2.14.1: Schedule H / H1 / X Prescription Drug Audit Register (Form 35 compliance)
 * - 2.14.2: GST Outward & Inward Summary Reports (GSTR-1 HSN & GSTR-3B ITC)
 * 
 * MODULE 2.15:
 * - 2.15.1: Real-Time Performance Analytics Dashboard (Trends, Top 10, Payment Modes)
 * - 2.15.2: Profit & Loss (P&L) Engine (COGS, Gross Profit, Operating Overhead Netting)
 * - 2.15.3: Dead Stock & Slow-Moving Inventory Identification (Blocked Capital, Aging)
 */

import { prisma } from "../src/lib/prisma";
import { GET as getScheduleDrugs } from "../src/app/api/admin/reports/schedule-drugs/route";
import { GET as exportScheduleDrugs } from "../src/app/api/admin/reports/schedule-drugs/export/route";
import { GET as getGstReport } from "../src/app/api/admin/reports/gst/route";
import { GET as exportGstReport } from "../src/app/api/admin/reports/gst/export/route";
import { GET as getAnalytics } from "../src/app/api/admin/reports/analytics/route";
import { GET as getProfitLoss } from "../src/app/api/admin/reports/profit-loss/route";
import { GET as getDeadStock } from "../src/app/api/admin/reports/dead-stock/route";
import { GET as exportDeadStock } from "../src/app/api/admin/reports/dead-stock/export/route";
import { createSessionToken, hashPassword } from "../src/lib/auth";
import { NextRequest } from "next/server";

let currentToken = "";

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
  console.log("INTEGRATION TEST SUITE: MODULE 2.14 & MODULE 2.15");
  console.log("Regulatory Drug Registers, GSTR Tax Engine, BI Analytics, P&L & Dead Stock");
  console.log("================================================================================");

  const runId = Math.floor(Math.random() * 900000) + 100000;

  // 1. Setup Test Store & Branch
  const currentStore = await prisma.settings.findFirst({ orderBy: { id: "asc" } });
  const storeId = currentStore?.id || 1;

  const testBranch = await prisma.branch.create({
    data: {
      code: `TB${runId.toString().slice(-4)}`,
      name: `City Compliance Outlet ${runId}`,
      storeId,
      isMain: false,
      active: true,
    },
  });

  const adminPasswordHash = await hashPassword("Admin123!");
  const testAdminUser = await prisma.user.create({
    data: {
      name: `Chief Auditor ${runId}`,
      username: `auditor_${runId}`,
      email: `auditor_${runId}@pharmacy.local`,
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

  // 2. Setup Medicines:
  // Med A: Schedule H (Amoxicillin 500mg, HSN: 30041010)
  const medScheduleH = await prisma.medicine.create({
    data: {
      name: `AmoxiGuard 500 ${runId}`,
      genericName: "Amoxicillin Trihydrate 500mg",
      company: "Abbott Pharma",
      category: "Antibiotics",
      hsnCode: "30041010",
      gstPercent: 12.0,
      scheduleType: "schedule_h",
    },
  });

  // Med B: Schedule H1 (Alprazolam 0.5mg, HSN: 30049099)
  const medScheduleH1 = await prisma.medicine.create({
    data: {
      name: `AlpraZen 0.5 ${runId}`,
      genericName: "Alprazolam 0.5mg",
      company: "Torrent Pharmaceuticals",
      category: "Sedatives",
      hsnCode: "30049099",
      gstPercent: 12.0,
      scheduleType: "schedule_h1",
    },
  });

  // Med C: Dead Stock Item (Never sold in 120 days)
  const medDeadStock = await prisma.medicine.create({
    data: {
      name: `StagnantGel 50g ${runId}`,
      genericName: "Diclofenac Sodium Gel",
      company: "Lupin Life",
      category: "Topical",
      hsnCode: "30049099",
      gstPercent: 18.0,
      rackLocation: "Rack-Z-Backstore",
      scheduleType: "normal",
    },
  });

  // Batches
  const batchH = await prisma.batch.create({
    data: {
      medicineId: medScheduleH.id,
      branchId: testBranch.id,
      batchNo: `AMX-${runId}`,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      quantity: 50,
      purchasePrice: 60.0,
      mrp: 100.0,
    },
  });

  const batchH1 = await prisma.batch.create({
    data: {
      medicineId: medScheduleH1.id,
      branchId: testBranch.id,
      batchNo: `ALP-${runId}`,
      expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 6 months
      quantity: 30,
      purchasePrice: 35.0,
      mrp: 65.0,
    },
  });

  const batchDead = await prisma.batch.create({
    data: {
      medicineId: medDeadStock.id,
      branchId: testBranch.id,
      batchNo: `DED-${runId}`,
      expiryDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days -> High Expiry Risk!
      quantity: 25,
      purchasePrice: 40.0, // 25 x 40 = 1000 blocked capital
      mrp: 75.0,
      createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000), // inwarded 120 days ago
    },
  });

  // Customer & Sales
  const testCustomer = await prisma.customer.create({
    data: {
      name: `Dr. Subhash Sen Patient ${runId}`,
      phone: `98311${runId.toString().slice(0, 5)}`,
      address: `45/A Lake View Road, South Kolkata, PIN-700029`,
    },
  });

  // Create Sale with Doctor Prescription Info
  const testSale = await prisma.sale.create({
    data: {
      invoiceNo: `INV-${new Date().getFullYear()}-${runId.toString().slice(-5)}`,
      customerId: testCustomer.id,
      saleDate: new Date(),
      totalAmount: 1650,
      gstAmount: 176.79,
      grandTotal: 1650,
      paymentMethod: "cash",
      branchId: testBranch.id,
      createdBy: userId,
      doctorName: "Dr. Anirban Mukherjee, MD",
      doctorRegNo: `WBMC-2015-${runId.toString().slice(-4)}`,
    },
  });

  // Sale Items
  await prisma.saleItem.create({
    data: {
      saleId: testSale.id,
      medicineId: medScheduleH.id,
      batchId: batchH.id,
      quantity: 10,
      mrp: 100.0,
      taxableBase: 892.86,
      gstPercent: 12.0,
      gstAmount: 107.14,
      price: 1000.0,
    },
  });

  await prisma.saleItem.create({
    data: {
      saleId: testSale.id,
      medicineId: medScheduleH1.id,
      batchId: batchH1.id,
      quantity: 10,
      mrp: 65.0,
      taxableBase: 580.36,
      gstPercent: 12.0,
      gstAmount: 69.64,
      price: 650.0,
    },
  });

  // Create Verified Supplier Purchase Order for GSTR-3B ITC
  const testSupplier = await prisma.supplier.create({
    data: {
      name: `Bengal Pharma Distributor ${runId}`,
      phone: `98765${runId.toString().slice(0, 5)}`,
      gstNo: `19AAACB${runId}F1Z3`,
    },
  });

  const testPO = await prisma.purchaseOrder.create({
    data: {
      poNumber: `PO-${new Date().getFullYear()}-${runId.toString().slice(-5)}`,
      supplierId: testSupplier.id,
      branchId: testBranch.id,
      poDate: new Date(),
      status: "received",
      total: 3000,
      paidAmount: 3000,
      createdBy: userId,
    },
  });

  await prisma.pOItem.create({
    data: {
      poId: testPO.id,
      medicineId: medScheduleH.id,
      quantity: 30,
      price: 60.0,
      mrp: 100.0,
    },
  });

  // =========================================================================
  // SUITE 1: Schedule H / H1 / X Prescription Drug Audit Register (2.14.1)
  // =========================================================================
  console.log("\n--- SUITE 1: Schedule H / H1 / X Compliance Register (2.14.1) ---");

  const schedReq = mockRequest(`http://localhost:3000/api/admin/reports/schedule-drugs?branchId=${testBranch.id}`);
  const schedRes = await getScheduleDrugs(schedReq);
  const schedData = await schedRes.json();

  assert(schedRes.status === 200 && schedData.success, "GET /api/admin/reports/schedule-drugs returns 200");
  assert(schedData.records.length === 2, `Register captured both Schedule H and H1 lines (Found: ${schedData.records.length})`);
  assert(schedData.records[0].doctor.name.includes("Dr. Anirban Mukherjee"), "Prescribing doctor name captured accurately");
  assert(schedData.records[0].doctor.regNo.includes("WBMC"), "Doctor medical registration number captured for compliance");
  assert(schedData.records[0].patient.address.includes("Lake View Road"), "Patient address captured for Form 35 register");
  assert(schedData.summary.countScheduleH === 10 && schedData.summary.countScheduleH1 === 10, "Schedule H vs H1 unit breakdown is exact (10 each)");

  // Filter specifically for Schedule H1
  const h1Req = mockRequest(`http://localhost:3000/api/admin/reports/schedule-drugs?branchId=${testBranch.id}&scheduleType=schedule_h1`);
  const h1Res = await getScheduleDrugs(h1Req);
  const h1Data = await h1Res.json();
  assert(h1Data.records.length === 1 && h1Data.records[0].medicine.name.includes("AlpraZen"), "Schedule H1 filter restricts to sedatives / high-risk drugs");

  // =========================================================================
  // SUITE 2: GST Outward & Inward Reports (GSTR-1 & GSTR-3B) (2.14.2)
  // =========================================================================
  console.log("\n--- SUITE 2: GST Outward & Inward Reports (2.14.2) ---");

  const gstReq = mockRequest(`http://localhost:3000/api/admin/reports/gst?branchId=${testBranch.id}`);
  const gstRes = await getGstReport(gstReq);
  const gstData = await gstRes.json();

  assert(gstRes.status === 200 && gstData.success, "GET /api/admin/reports/gst returns 200");
  assert(gstData.gstr1.hsnBreakdown.length >= 2, `GSTR-1 groups sales by HSN code (HSN count: ${gstData.gstr1.hsnBreakdown.length})`);
  assert(gstData.gstr1.summary.totalTurnover === 1650, `GSTR-1 Outward gross turnover is ₹1650 (Got: ${gstData.gstr1.summary.totalTurnover})`);
  assert(gstData.gstr1.summary.totalGst > 0, `Output GST calculated (> 0: ₹${gstData.gstr1.summary.totalGst})`);
  assert(gstData.gstr3b.eligibleITC.verifiedPOCount === 1, "GSTR-3B identifies 1 verified inward Purchase Order for ITC");
  assert(gstData.gstr3b.eligibleITC.totalCredit > 0, `Eligible Input Tax Credit calculated (> 0: ₹${gstData.gstr3b.eligibleITC.totalCredit})`);

  // =========================================================================
  // SUITE 3: Real-Time Performance Analytics & BI (2.15.1)
  // =========================================================================
  console.log("\n--- SUITE 3: Real-Time Performance Analytics & BI (2.15.1) ---");

  const analyticsReq = mockRequest(`http://localhost:3000/api/admin/reports/analytics?branchId=${testBranch.id}&range=month`);
  const analyticsRes = await getAnalytics(analyticsReq);
  const analyticsData = await analyticsRes.json();

  assert(analyticsRes.status === 200 && analyticsData.success, "GET /api/admin/reports/analytics returns 200");
  assert(analyticsData.summary.grossSales === 1650, `Analytics gross sales turnover matches ₹1650`);
  assert(analyticsData.topRevenueMedicines.length >= 2, `Top revenue medicines list generated (${analyticsData.topRevenueMedicines.length} meds)`);
  assert(analyticsData.topRevenueMedicines[0].name.includes("AmoxiGuard"), "Highest revenue product accurately identified");
  assert(analyticsData.paymentBreakdown.some((p: any) => p.mode === "CASH" && p.amount === 1650), "Payment mode breakdown records ₹1650 in CASH");

  // =========================================================================
  // SUITE 4: Profit & Loss (P&L) Engine (2.15.2)
  // =========================================================================
  console.log("\n--- SUITE 4: Profit & Loss (P&L) Engine (2.15.2) ---");

  // Revenue = 1650.
  // COGS = (10 x 60) + (10 x 35) = 600 + 350 = 950.
  // Gross Profit = 1650 - 950 = 700.
  const pnlReq = mockRequest(`http://localhost:3000/api/admin/reports/profit-loss?branchId=${testBranch.id}`);
  const pnlRes = await getProfitLoss(pnlReq);
  const pnlData = await pnlRes.json();

  assert(pnlRes.status === 200 && pnlData.success, "GET /api/admin/reports/profit-loss returns 200");
  assert(pnlData.statement.netTurnover === 1650, "P&L Net Turnover is ₹1650");
  assert(pnlData.statement.cogs === 950, `COGS computed based on batch acquisition prices (Expected: 950, Got: ${pnlData.statement.cogs})`);
  assert(pnlData.statement.grossProfit === 700, `Gross Profit computed as ₹700 [1650 - 950] (Got: ${pnlData.statement.grossProfit})`);
  assert(pnlData.statement.grossMarginPercent === 42.42, `Gross margin percent computed as 42.42% (Got: ${pnlData.statement.grossMarginPercent}%)`);
  assert(pnlData.statement.status === "profitable", "Store operation evaluated as 'profitable'");

  // =========================================================================
  // SUITE 5: Dead Stock & Stagnant Inventory (2.15.3)
  // =========================================================================
  console.log("\n--- SUITE 5: Dead Stock & Stagnant Inventory (2.15.3) ---");

  // Threshold: 60 days. batchDead has 25 units x 40 = 1000 blocked capital, zero sales in 120 days.
  const deadReq = mockRequest(`http://localhost:3000/api/admin/reports/dead-stock?branchId=${testBranch.id}&thresholdDays=60`);
  const deadRes = await getDeadStock(deadReq);
  const deadData = await deadRes.json();

  assert(deadRes.status === 200 && deadData.success, "GET /api/admin/reports/dead-stock returns 200");
  assert(deadData.records.length >= 1, `Dead stock detected (Found: ${deadData.records.length} stagnant batches)`);
  
  const foundDeadBatch = deadData.records.find((b: any) => b.batchNumber === `DED-${runId}`);
  assert(!!foundDeadBatch, "Specific stagnant batch identified in dead stock report");
  assert(foundDeadBatch?.blockedCapital === 1000, `Blocked capital calculated as 25 x ₹40 = ₹1000 (Got: ${foundDeadBatch?.blockedCapital})`);
  assert(foundDeadBatch?.isHighExpiryRisk === true, "Batch expiring in 45 days flagged as High Expiry Risk");
  assert(foundDeadBatch?.agingCategory.includes("Stagnant"), "Aging category classified appropriately");

  // =========================================================================
  // Cleanup Test Entities
  // =========================================================================
  console.log("\n--- Cleanup Test Data ---");
  await prisma.pOItem.deleteMany({ where: { poId: testPO.id } });
  await prisma.purchaseOrder.deleteMany({ where: { id: testPO.id } });
  await prisma.supplier.deleteMany({ where: { id: testSupplier.id } });
  await prisma.saleItem.deleteMany({ where: { saleId: testSale.id } });
  await prisma.sale.deleteMany({ where: { id: testSale.id } });
  await prisma.customer.deleteMany({ where: { id: testCustomer.id } });
  await prisma.batch.deleteMany({ where: { branchId: testBranch.id } });
  await prisma.medicine.deleteMany({ where: { id: { in: [medScheduleH.id, medScheduleH1.id, medDeadStock.id] } } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.branch.delete({ where: { id: testBranch.id } });
  console.log("  ✔ Cleaned up temporary test branch, user, medicines, batches, sales, and POs");

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
