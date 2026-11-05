import { PrismaClient } from "@prisma/client";
import { createSessionToken, buildUserSessionPayload } from "../src/lib/auth";

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✔ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✖ FAIL: ${message}`);
    failedTests++;
  }
}

async function runTests() {
  console.log("\n========================================================");
  console.log(" REAL HTTP API INTEGRATION TESTS: MODULE 1.9 (ADJUSTMENTS)");
  console.log("========================================================\n");

  const testRunId = Date.now().toString();

  // 1. Setup Super Admin
  let admin = await prisma.user.findFirst({
    where: { role: "admin", active: true },
    include: { branch: true },
  });
  if (!admin) throw new Error("No active admin user found.");

  const testStoreId = admin.storeId ?? 1;

  // 2. Setup Main and Secondary Branches
  let mainBranch = await prisma.branch.findFirst({
    where: { isMain: true, active: true },
  });
  if (!mainBranch) {
    mainBranch = await prisma.branch.findFirst({
      where: { storeId: testStoreId, active: true },
    });
  }
  if (!mainBranch) {
    mainBranch = await prisma.branch.create({
      data: {
        code: `MAIN-${testRunId.slice(-4)}`,
        name: "Main Pharmacy Store",
        storeId: testStoreId,
        isMain: true,
        active: true,
      },
    });
  }

  let secBranch = await prisma.branch.findFirst({
    where: { storeId: testStoreId, id: { not: mainBranch.id }, active: true },
  });
  if (!secBranch) {
    secBranch = await prisma.branch.create({
      data: {
        code: `BR-TEST-${testRunId.slice(-4)}`,
        name: "Secondary Test Branch",
        storeId: testStoreId,
        isMain: false,
        active: true,
      },
    });
  }

  const adminSession = buildUserSessionPayload(admin);
  const adminToken = createSessionToken(adminSession);
  const adminCookie = `med_pos_admin_session=${adminToken}`;

  // 3. Setup Pharmacist User (has manage_stock_adjustments, but lacks view_cost_price)
  const pharmacist = await prisma.user.create({
    data: {
      username: `pharma_${testRunId}`,
      email: `pharma_${testRunId}@test.local`,
      name: "Test Pharmacist",
      password: "hashed_dummy_password",
      role: "pharmacist",
      permissions: JSON.stringify({
        grantedPermissions: ["manage_stock_adjustments"],
        revokedPermissions: ["view_cost_price"],
      }),
      storeId: testStoreId,
      branchId: mainBranch.id,
      active: true,
    },
  });
  const pharmaSession = buildUserSessionPayload(pharmacist);
  const pharmaToken = createSessionToken(pharmaSession);
  const pharmaCookie = `med_pos_admin_session=${pharmaToken}`;

  // 4. Setup Cashier User (lacks manage_stock_adjustments)
  const cashier = await prisma.user.create({
    data: {
      username: `cashier_${testRunId}`,
      email: `cashier_${testRunId}@test.local`,
      name: "Test Cashier",
      password: "hashed_dummy_password",
      role: "cashier",
      permissions: JSON.stringify({
        grantedPermissions: ["manage_customers"],
        revokedPermissions: ["manage_stock_adjustments", "view_cost_price"],
      }),
      storeId: testStoreId,
      branchId: mainBranch.id,
      active: true,
    },
  });
  const cashierSession = buildUserSessionPayload(cashier);
  const cashierToken = createSessionToken(cashierSession);
  const cashierCookie = `med_pos_admin_session=${cashierToken}`;

  // 5. Create Test Medicine and Initial Batch
  const testMed = await prisma.medicine.create({
    data: {
      name: `Amoxicillin Test ${testRunId}`,
      genericName: "Amoxicillin 500mg",
      company: "Apex Pharmaceuticals",
      category: "Capsule",
      gstPercent: 12.0,
      rackLocation: "Rack: B-2 • Shelf: 1",
    },
  });

  const futureExpiry = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const initialBatch = await prisma.batch.create({
    data: {
      medicineId: testMed.id,
      batchNo: `AMX-${testRunId.slice(-6)}`,
      expiryDate: new Date(futureExpiry),
      quantity: 10, // Initial stock = 10 units
      mrp: 150.0,
      purchasePrice: 95.0,
      branchId: mainBranch.id,
    },
  });

  console.log("Environment initialized:");
  console.log(`- Super Admin: ${admin.username} (Store: ${testStoreId})`);
  console.log(`- Main Branch: ${mainBranch.name} (ID: ${mainBranch.id})`);
  console.log(`- Sec Branch: ${secBranch.name} (ID: ${secBranch.id})`);
  console.log(`- Test Medicine: ${testMed.name} (ID: ${testMed.id})`);
  console.log(`- Initial Batch: ${initialBatch.batchNo} (Qty: 10, ID: ${initialBatch.id})\n`);

  try {
    // ─────────────────────────────────────────────────────────────
    // TEST 1: AUTHENTICATION & ACCESS CONTROL GUARDS
    // ─────────────────────────────────────────────────────────────
    console.log("--- [TEST 1] Authentication & Access Control Guards ---");
    const unauthGet = await fetch(`${BASE_URL}/api/admin/adjustments`);
    assert(unauthGet.status === 401, "GET /api/admin/adjustments without auth returns HTTP 401");

    const unauthPost = await fetch(`${BASE_URL}/api/admin/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId: initialBatch.id, type: "add", quantity: 5, reason: "Audit" }),
    });
    assert(unauthPost.status === 401, "POST /api/admin/adjustments without auth returns HTTP 401");

    const cashierForbidden = await fetch(`${BASE_URL}/api/admin/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cashierCookie },
      body: JSON.stringify({ batchId: initialBatch.id, type: "add", quantity: 5, reason: "Audit" }),
    });
    assert(
      cashierForbidden.status === 403,
      "Cashier lacking 'manage_stock_adjustments' returns HTTP 403 Forbidden"
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 2: INPUT VALIDATION & ADVERSARIAL BOUNDARIES
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [TEST 2] Input Validation & Adversarial Boundaries ---");
    // Missing batchId
    const missingBatch = await fetch(`${BASE_URL}/api/admin/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ type: "add", quantity: 5, reason: "Physical Audit Variance" }),
    });
    assert(missingBatch.status === 400, "Missing batchId returns HTTP 400 Bad Request");

    // Non-existent batchId
    const nonExistentBatch = await fetch(`${BASE_URL}/api/admin/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ batchId: 9999999, type: "add", quantity: 5, reason: "Physical Audit Variance" }),
    });
    assert(nonExistentBatch.status === 404, "Non-existent batchId returns HTTP 404 Not Found");

    // Invalid type
    const invalidType = await fetch(`${BASE_URL}/api/admin/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ batchId: initialBatch.id, type: "destroy_hack", quantity: 5, reason: "Audit" }),
    });
    assert(invalidType.status === 400, "Invalid adjustment type returns HTTP 400 Bad Request");

    // Zero quantity
    const zeroQty = await fetch(`${BASE_URL}/api/admin/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ batchId: initialBatch.id, type: "add", quantity: 0, reason: "Physical Audit" }),
    });
    assert(zeroQty.status === 400, "Quantity: 0 returns HTTP 400 Bad Request");

    // Negative quantity
    const negativeQty = await fetch(`${BASE_URL}/api/admin/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ batchId: initialBatch.id, type: "add", quantity: -10, reason: "Physical Audit" }),
    });
    assert(negativeQty.status === 400, "Negative quantity returns HTTP 400 Bad Request");

    // Fractional / decimal quantity
    const decimalQty = await fetch(`${BASE_URL}/api/admin/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ batchId: initialBatch.id, type: "add", quantity: 5.5, reason: "Physical Audit" }),
    });
    assert(decimalQty.status === 400, "Fractional quantity (5.5) returns HTTP 400 Bad Request");

    // Blank reason
    const blankReason = await fetch(`${BASE_URL}/api/admin/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ batchId: initialBatch.id, type: "add", quantity: 5, reason: "   " }),
    });
    assert(blankReason.status === 400, "Blank reason returns HTTP 400 Bad Request");

    // ─────────────────────────────────────────────────────────────
    // TEST 3: STOCK ADDITION WORKFLOW (+ ADD STOCK)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [TEST 3] Stock Addition Workflow (+ Add Stock) ---");
    const addRes = await fetch(`${BASE_URL}/api/admin/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        batchId: initialBatch.id,
        type: "add",
        quantity: 15,
        reason: "Physical Audit Variance",
        notes: "Found extra box in storage rack B-2",
      }),
    });
    assert(addRes.status === 200, "POST stock addition returns HTTP 200");
    const addJson = await addRes.json();
    assert(addJson.success === true, "Stock addition reports success: true");
    assert(addJson.data?.newQuantity === 25, "New quantity is 25 (10 + 15)");
    assert(addJson.data?.oldQuantity === 10, "Old quantity was 10");

    // Assert Database State Mutation
    const dbBatchAfterAdd = await prisma.batch.findUnique({ where: { id: initialBatch.id } });
    assert(dbBatchAfterAdd?.quantity === 25, "Database state integrity: Batch quantity is updated to 25");

    // Assert StockAdjustment row created
    const adjRowAdd = await prisma.stockAdjustment.findFirst({
      where: { batchId: initialBatch.id, type: "add" },
      orderBy: { id: "desc" },
    });
    assert(adjRowAdd !== null, "StockAdjustment record exists in database");
    assert(adjRowAdd?.oldQty === 10, "StockAdjustment oldQty is 10");
    assert(adjRowAdd?.newQty === 25, "StockAdjustment newQty is 25");
    assert(adjRowAdd?.quantity === 15, "StockAdjustment quantity is +15");
    assert(
      adjRowAdd?.reason.includes("Physical Audit Variance") === true,
      "StockAdjustment reason preserved"
    );

    // Assert Audit Log Entry
    const auditAdd = await prisma.auditLog.findFirst({
      where: { action: "STOCK_ADJUSTMENT", entityId: adjRowAdd?.id },
    });
    assert(auditAdd !== null, "AuditLog row recorded with action: STOCK_ADJUSTMENT");

    // ─────────────────────────────────────────────────────────────
    // TEST 4: STOCK REDUCTION BOUNDARY GUARD (CANNOT REDUCE BELOW 0)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [TEST 4] Stock Reduction Boundary Guard (Cannot Reduce Below 0) ---");
    // Current stock is 25. Attempting to remove 30 units
    const overRemoveRes = await fetch(`${BASE_URL}/api/admin/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        batchId: initialBatch.id,
        type: "remove",
        quantity: 30,
        reason: "Breakage/Spillage",
      }),
    });
    assert(overRemoveRes.status === 400, "Removing 30 from 25 units returns HTTP 400 Bad Request");
    const overRemoveJson = await overRemoveRes.json();
    assert(overRemoveJson.success === false, "Over-reduction rejected");
    assert(
      overRemoveJson.message.toLowerCase().includes("cannot reduce stock below 0"),
      "Error specifies boundary cannot reduce stock below 0"
    );

    // Assert Database State Unchanged
    const dbBatchAfterOverRemove = await prisma.batch.findUnique({ where: { id: initialBatch.id } });
    assert(dbBatchAfterOverRemove?.quantity === 25, "Database state integrity: Stock remains 25 units");

    // ─────────────────────────────────────────────────────────────
    // TEST 5: STOCK REDUCTION & DAMAGE WRITE-OFF WORKFLOW (- REMOVE)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [TEST 5] Stock Reduction & Damage Write-off Workflow ---");
    // Current stock: 25. Remove 5 units (e.g. damaged)
    const removeRes = await fetch(`${BASE_URL}/api/admin/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        batchId: initialBatch.id,
        type: "remove",
        quantity: 5,
        reason: "Breakage/Spillage",
        notes: "Dropped 5 capsules during handling",
      }),
    });
    assert(removeRes.status === 200, "POST stock reduction returns HTTP 200");
    const removeJson = await removeRes.json();
    assert(removeJson.success === true, "Stock reduction reports success: true");
    assert(removeJson.data?.newQuantity === 20, "New quantity is 20 (25 - 5)");

    const dbBatchAfterRemove = await prisma.batch.findUnique({ where: { id: initialBatch.id } });
    assert(dbBatchAfterRemove?.quantity === 20, "Database state integrity: Batch quantity is updated to 20");

    const adjRowRemove = await prisma.stockAdjustment.findFirst({
      where: { batchId: initialBatch.id, type: "remove" },
      orderBy: { id: "desc" },
    });
    assert(adjRowRemove?.quantity === -5, "StockAdjustment negative delta recorded (-5)");
    assert(adjRowRemove?.newQty === 20, "StockAdjustment newQty is 20");

    // ─────────────────────────────────────────────────────────────
    // TEST 6: EXACT BOUNDARY ZERO-OUT (WRITE-OFF REMAINING STOCK TO 0)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [TEST 6] Exact Boundary Zero-Out (Write-off Remaining Stock to 0) ---");
    // Current stock: 20. Remove all 20 units
    const zeroOutRes = await fetch(`${BASE_URL}/api/admin/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        batchId: initialBatch.id,
        type: "remove",
        quantity: 20,
        reason: "Expired Discard",
        notes: "Damaged packaging written off to zero",
      }),
    });
    assert(zeroOutRes.status === 200, "Exact zero-out returns HTTP 200");
    const zeroOutJson = await zeroOutRes.json();
    assert(zeroOutJson.data?.newQuantity === 0, "New quantity is exactly 0");

    const dbBatchZero = await prisma.batch.findUnique({ where: { id: initialBatch.id } });
    assert(dbBatchZero?.quantity === 0, "Boundary check: quantity preserved as 0 (not null or fallback)");

    // ─────────────────────────────────────────────────────────────
    // TEST 7: INTER-BRANCH TRANSFER VALIDATION GUARDS
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [TEST 7] Inter-Branch Transfer Validation Guards ---");
    // Add 50 units for transfer tests
    await prisma.batch.update({
      where: { id: initialBatch.id },
      data: { quantity: 50 },
    });

    // Missing toBranchId
    const missingToBranch = await fetch(`${BASE_URL}/api/admin/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        batchId: initialBatch.id,
        type: "transfer",
        quantity: 10,
        reason: "Inter-Branch Stock Transfer",
      }),
    });
    assert(missingToBranch.status === 400, "Transfer without toBranchId returns HTTP 400 Bad Request");

    // Transfer to same branch
    const sameBranchTransfer = await fetch(`${BASE_URL}/api/admin/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        batchId: initialBatch.id,
        type: "transfer",
        quantity: 10,
        toBranchId: mainBranch.id, // Same branch!
        reason: "Inter-Branch Stock Transfer",
      }),
    });
    assert(sameBranchTransfer.status === 400, "Transfer to same branch returns HTTP 400 Bad Request");

    // Transfer more than available stock
    const excessTransfer = await fetch(`${BASE_URL}/api/admin/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        batchId: initialBatch.id,
        type: "transfer",
        quantity: 100, // Available is 50
        toBranchId: secBranch.id,
        reason: "Inter-Branch Stock Transfer",
      }),
    });
    assert(excessTransfer.status === 400, "Transfer exceeding available stock returns HTTP 400 Bad Request");

    // ─────────────────────────────────────────────────────────────
    // TEST 8: ATOMIC ACID INTER-BRANCH STOCK TRANSFER
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [TEST 8] Atomic ACID Inter-Branch Stock Transfer ---");
    // Transfer 20 units from Main Branch (initialBatch) to Secondary Branch
    const transferRes = await fetch(`${BASE_URL}/api/admin/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        batchId: initialBatch.id,
        type: "transfer",
        quantity: 20,
        toBranchId: secBranch.id,
        reason: "Inter-Branch Stock Transfer",
        notes: "Restocking City Hospital counter",
      }),
    });
    assert(transferRes.status === 200, "POST inter-branch transfer returns HTTP 200");
    const transferJson = await transferRes.json();
    assert(transferJson.success === true, "Transfer reports success: true");

    // Source batch stock should be 50 - 20 = 30
    const dbSourceBatch = await prisma.batch.findUnique({ where: { id: initialBatch.id } });
    assert(dbSourceBatch?.quantity === 30, "Database state integrity: Source batch reduced from 50 to 30");

    // Destination batch in secBranch should exist with quantity 20
    const dbDestBatch = await prisma.batch.findUnique({
      where: {
        uk_medicine_batch_branch: {
          medicineId: testMed.id,
          batchNo: initialBatch.batchNo,
          branchId: secBranch.id,
        },
      },
    });
    assert(dbDestBatch !== null, "Destination batch created in secondary branch");
    assert(dbDestBatch?.quantity === 20, "Destination batch stock is 20 units");
    assert(Number(dbDestBatch?.mrp) === Number(initialBatch.mrp), "Destination batch preserves MRP");

    // Assert 2 linked adjustment records
    const sourceTransferAdj = await prisma.stockAdjustment.findFirst({
      where: { batchId: initialBatch.id, type: "transfer" },
      orderBy: { id: "desc" },
    });
    assert(sourceTransferAdj?.quantity === -20, "Source adjustment record has quantity: -20");

    const destTransferAdj = await prisma.stockAdjustment.findFirst({
      where: { batchId: dbDestBatch?.id, type: "transfer" },
      orderBy: { id: "desc" },
    });
    assert(destTransferAdj?.quantity === 20, "Destination adjustment record has quantity: +20");

    // Assert Audit Log for Transfer
    const transferAudit = await prisma.auditLog.findFirst({
      where: { action: "STOCK_TRANSFER", entityId: sourceTransferAdj?.id },
    });
    assert(transferAudit !== null, "AuditLog row recorded with action: STOCK_TRANSFER");

    // ─────────────────────────────────────────────────────────────
    // TEST 9: RBAC COST PRICE REDACTION & FILTER QUERY
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [TEST 9] RBAC Cost Price Redaction & Filter Query ---");
    // Admin query
    const adminGet = await fetch(
      `${BASE_URL}/api/admin/adjustments?medicineId=${testMed.id}`,
      { headers: { Cookie: adminCookie } }
    );
    assert(adminGet.status === 200, "Admin GET adjustments returns HTTP 200");
    const adminGetJson = await adminGet.json();
    assert(adminGetJson.canViewCostPrice === true, "Admin canViewCostPrice is true");
    const sampleAdminRecord = adminGetJson.data?.find((d: any) => d.batch.id === initialBatch.id);
    assert(sampleAdminRecord?.batch.purchasePrice === 95.0, "Admin receives actual purchasePrice (95.00)");

    // Pharmacist query (revoked view_cost_price)
    const pharmaGet = await fetch(
      `${BASE_URL}/api/admin/adjustments?medicineId=${testMed.id}`,
      { headers: { Cookie: pharmaCookie } }
    );
    assert(pharmaGet.status === 200, "Pharmacist GET adjustments returns HTTP 200");
    const pharmaGetJson = await pharmaGet.json();
    assert(pharmaGetJson.canViewCostPrice === false, "Pharmacist canViewCostPrice is false");
    const samplePharmaRecord = pharmaGetJson.data?.find((d: any) => d.batch.id === initialBatch.id);
    assert(samplePharmaRecord?.batch.purchasePrice === null, "Pharmacist purchasePrice is sanitized to null");
    assert(samplePharmaRecord?.batch.mrp === 150.0, "Pharmacist can still view MRP (150.00)");

    // Filter by type=transfer
    const filterTransferGet = await fetch(
      `${BASE_URL}/api/admin/adjustments?medicineId=${testMed.id}&type=transfer`,
      { headers: { Cookie: adminCookie } }
    );
    const filterTransferJson = await filterTransferGet.json();
    assert(filterTransferJson.data?.length >= 2, "Filter type=transfer returns both transfer legs");

    // Branch-Scoped KPI Summary Metrics (Bug 1.9-C)
    const secBranchKpiRes = await fetch(
      `${BASE_URL}/api/admin/adjustments?branchId=${secBranch.id}`,
      { headers: { Cookie: adminCookie } }
    );
    assert(secBranchKpiRes.status === 200, "GET adjustments scoped to destination branch returns HTTP 200");
    const secBranchKpiJson = await secBranchKpiRes.json();
    assert(secBranchKpiJson.summary?.transfersCount >= 1, "Branch summary correctly counts inward transfer event");
    assert(secBranchKpiJson.summary?.netUnitsAdded >= 20, "Branch summary counts inward transfer units in netUnitsAdded");

    // Date Range Filter Verification (Bug 1.9-F)
    const emptyDateFilterRes = await fetch(
      `${BASE_URL}/api/admin/adjustments?medicineId=${testMed.id}&startDate=2020-01-01&endDate=2020-01-02`,
      { headers: { Cookie: adminCookie } }
    );
    const emptyDateFilterJson = await emptyDateFilterRes.json();
    assert(emptyDateFilterJson.data?.length === 0, "Date range filter with historical past dates returns 0 rows");

    const todayStr = new Date().toISOString().split("T")[0];
    const todayDateFilterRes = await fetch(
      `${BASE_URL}/api/admin/adjustments?medicineId=${testMed.id}&startDate=${todayStr}&endDate=${todayStr}`,
      { headers: { Cookie: adminCookie } }
    );
    const todayDateFilterJson = await todayDateFilterRes.json();
    assert(todayDateFilterJson.data?.length >= 2, "Date range filter with today's date returns today's adjustment records");

    // ─────────────────────────────────────────────────────────────
    // TEST 10: MULTI-BRANCH ISOLATION & CSV EXPORT
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [TEST 10] Multi-Branch Isolation & CSV Export ---");
    // Pharmacist is bound to mainBranch. Querying secBranch must return 403 Forbidden!
    const crossBranchPharma = await fetch(
      `${BASE_URL}/api/admin/adjustments?branchId=${secBranch.id}`,
      { headers: { Cookie: pharmaCookie } }
    );
    assert(
      crossBranchPharma.status === 403,
      "Staff querying another branch without permission returns HTTP 403 Forbidden"
    );

    // CSV Export
    const exportRes = await fetch(
      `${BASE_URL}/api/admin/adjustments/export?medicineId=${testMed.id}`,
      { headers: { Cookie: adminCookie } }
    );
    assert(exportRes.status === 200, "GET /api/admin/adjustments/export returns HTTP 200");
    assert(
      exportRes.headers.get("Content-Type")?.includes("text/csv") === true,
      "Content-Type is text/csv"
    );
    const rawBuf = Buffer.from(await exportRes.arrayBuffer());
    const exportText = rawBuf.toString("utf8");
    const hasBom = rawBuf[0] === 0xef && rawBuf[1] === 0xbb && rawBuf[2] === 0xbf;
    assert(hasBom, "Export CSV raw byte payload includes UTF-8 BOM (0xEF, 0xBB, 0xBF) for Excel");
    assert(
      exportText.includes("Adjustment ID") && exportText.includes("Medicine Name"),
      "Export CSV contains expected table headers"
    );
    assert(exportText.includes(testMed.name), "Export CSV contains test medicine records");

    // Cleanup
    console.log("\nCleaning up test artifacts from database...");
    await prisma.stockAdjustment.deleteMany({ where: { medicineId: testMed.id } });
    if (dbDestBatch) {
      await prisma.batch.delete({ where: { id: dbDestBatch.id } });
    }
    await prisma.batch.delete({ where: { id: initialBatch.id } });
    await prisma.medicine.delete({ where: { id: testMed.id } });
    await prisma.user.delete({ where: { id: pharmacist.id } });
    await prisma.user.delete({ where: { id: cashier.id } });
    console.log("Cleanup complete.");

    // Summary
    console.log("\n========================================================");
    console.log(`TOTAL HTTP TESTS EXECUTED : ${totalTests}`);
    console.log(`TOTAL PASSED              : ${passedTests}`);
    console.log(`TOTAL FAILED              : ${failedTests}`);
    console.log(`SUCCESS RATE              : ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log("========================================================");

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution encountered unexpected error:", err);
    process.exit(1);
  }
}

runTests();
