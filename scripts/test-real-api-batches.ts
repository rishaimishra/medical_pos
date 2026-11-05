import { prisma } from "../src/lib/db-transaction";
import { createSessionToken, hashPassword, buildUserSessionPayload } from "../src/lib/auth";

const BASE_URL = "http://localhost:3000";

let testRunId = Date.now();
let superAdminCookie = "";
let cashierCookie = "";
let testStoreId: number;
let mainBranchId: number;
let secondaryBranchId: number;
let testMedicineId: number;
let batchZeroId: number;
let batchAId: number;
let batchBId: number;
let batchCId: number;
let staffUserId: number;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, description: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✔ PASS: ${description}`);
  } else {
    failedTests++;
    console.error(`  ✖ FAIL: ${description}`);
  }
}

async function setup() {
  console.log("========================================================");
  console.log("  REAL HTTP API INTEGRATION TESTS: MODULE 1.8 (BATCHES) ");
  console.log("========================================================");
  console.log("Setting up multi-tenant test environment...\n");

  // 1. Ensure Super Admin exists
  let admin = await prisma.user.findFirst({
    where: { role: "admin", active: true },
    include: { branch: true },
  });

  if (!admin) {
    const pwd = await hashPassword("AdminSecret123!");
    admin = await prisma.user.create({
      data: {
        username: `admin_batch_${testRunId}`,
        name: "Batch Super Admin",
        email: `admin_batch_${testRunId}@test.com`,
        password: pwd,
        role: "admin",
        active: true,
      },
      include: { branch: true },
    });
  }

  testStoreId = admin.storeId ?? 1;

  // 2. Ensure Main and Secondary Branches exist
  let mainBranch = await prisma.branch.findFirst({
    where: { isMain: true, active: true },
  });
  if (!mainBranch) {
    mainBranch = await prisma.branch.create({
      data: {
        code: `MAIN-${testRunId}`,
        name: "Main Test Branch",
        isMain: true,
        active: true,
        storeId: testStoreId,
      },
    });
  }
  mainBranchId = mainBranch.id;

  let secBranch = await prisma.branch.findFirst({
    where: { isMain: false, active: true },
  });
  if (!secBranch) {
    secBranch = await prisma.branch.create({
      data: {
        code: `SEC-${testRunId}`,
        name: "Secondary Test Branch",
        isMain: false,
        active: true,
        storeId: testStoreId,
      },
    });
  }
  secondaryBranchId = secBranch.id;

  // 3. Issue Super Admin Session Cookie
  const adminSession = buildUserSessionPayload(admin);
  const adminToken = createSessionToken(adminSession);
  superAdminCookie = `med_pos_admin_session=${adminToken}`;

  // 4. Create Cashier User without 'view_cost_price' permission
  const cashierPwd = await hashPassword("Cashier123!");
  const cashierUser = await prisma.user.create({
    data: {
      username: `cashier_${testRunId}`,
      name: "Counter Cashier",
      email: `cashier_${testRunId}@test.com`,
      password: cashierPwd,
      role: "cashier",
      branchId: mainBranchId,
      active: true,
      permissions: JSON.stringify({
        grantedPermissions: ["manage_medicines"],
        revokedPermissions: ["view_cost_price"],
      }),
    },
    include: { branch: true },
  });
  staffUserId = cashierUser.id;

  const cashierSession = buildUserSessionPayload(cashierUser);
  const cashierToken = createSessionToken(cashierSession);
  cashierCookie = `med_pos_admin_session=${cashierToken}`;

  // 5. Create Test Medicine
  const med = await prisma.medicine.create({
    data: {
      name: `Paracetamol Test ${testRunId}`,
      genericName: "Acetaminophen 500mg",
      company: "Apex Labs",
      category: "Tablet",
      gstPercent: 12.0,
      rackLocation: "Rack: A-1 • Shelf: 2 • Box: B-4",
      description: "<!--PACK_META:{\"packUnit\":\"Strip\",\"looseUnit\":\"Tablet\",\"unitsPerPack\":10,\"minStockLevel\":10}-->",
    },
  });
  testMedicineId = med.id;

  console.log(`Environment ready:`);
  console.log(`- Super Admin: ${admin.username} (Store: ${testStoreId})`);
  console.log(`- Main Branch: ${mainBranch.name} (ID: ${mainBranchId})`);
  console.log(`- Sec Branch: ${secBranch.name} (ID: ${secondaryBranchId})`);
  console.log(`- Test Medicine: ${med.name} (ID: ${testMedicineId})\n`);
}

async function runTests() {
  await setup();

  // ─────────────────────────────────────────────────────────────
  // TEST GROUP 1: AUTHENTICATION & ACCESS CONTROL GUARDS
  // ─────────────────────────────────────────────────────────────
  console.log("--- [TEST 1] Authentication Guard ---");
  const unauthGet = await fetch(`${BASE_URL}/api/admin/batches`);
  assert(unauthGet.status === 401, "GET /api/admin/batches without auth returns HTTP 401");

  const unauthPost = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ medicineId: testMedicineId, batchNo: "UNAUTH" }),
  });
  assert(unauthPost.status === 401, "POST /api/admin/batches without auth returns HTTP 401");

  // ─────────────────────────────────────────────────────────────
  // TEST GROUP 2: BATCH CREATION & FALSY ZERO PRESERVATION (1.8.1)
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [TEST 2] Batch Creation & Falsy Zero Preservation (0 Qty, 0 Cost) ---");
  const futureExpiry = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]; // +180 days (Safe)

  const createRes = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: superAdminCookie,
    },
    body: JSON.stringify({
      medicineId: testMedicineId,
      batchNo: "BATCH-ZERO-TEST",
      expiryDate: futureExpiry,
      quantity: 0, // Valid 0 units!
      purchasePrice: 0, // Valid 0 cost!
      mrp: 120.5,
      branchId: mainBranchId,
    }),
  });

  assert(createRes.status === 200, "POST /api/admin/batches returns HTTP 200");
  const createJson = await createRes.json();
  assert(createJson.success === true, "Response reports success: true");
  assert(createJson.data?.id > 0, "Response returns created batch ID");
  batchZeroId = createJson.data?.id;

  // Verify in Database
  const dbBatchZero = await prisma.batch.findUnique({ where: { id: batchZeroId } });
  assert(dbBatchZero !== null, "Batch exists in database");
  assert(dbBatchZero?.quantity === 0, "Boundary check: quantity is preserved as 0 (not overwritten)");
  assert(Number(dbBatchZero?.purchasePrice) === 0, "Boundary check: purchasePrice is preserved as 0.00");
  assert(Number(dbBatchZero?.mrp) === 120.5, "MRP is saved as 120.50");

  // ─────────────────────────────────────────────────────────────
  // TEST GROUP 3: INPUT VALIDATION & ADVERSARIAL BOUNDARIES
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [TEST 3] Input Validation & Adversarial Boundaries ---");

  // Missing batch number
  const noBatchRes = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({ medicineId: testMedicineId, batchNo: "   ", expiryDate: futureExpiry }),
  });
  assert(noBatchRes.status === 400, "Blank batchNo returns HTTP 400");

  // Missing expiry date
  const noExpiryRes = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({ medicineId: testMedicineId, batchNo: "B-TEST-2", quantity: 10, mrp: 50 }),
  });
  assert(noExpiryRes.status === 400, "Missing expiryDate returns HTTP 400");

  // Mfg date > Expiry date
  const badDateRes = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({
      medicineId: testMedicineId,
      batchNo: "B-TEST-BAD-DATE",
      mfgDate: "2027-01-01",
      expiryDate: "2026-01-01",
      quantity: 10,
      mrp: 50,
      branchId: mainBranchId,
    }),
  });
  assert(badDateRes.status === 400, "Mfg date after expiry date returns HTTP 400");

  // Non-existent medicine ID
  const badMedRes = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({
      medicineId: 99999999,
      batchNo: "B-TEST-BAD-MED",
      expiryDate: futureExpiry,
      quantity: 10,
      mrp: 50,
      branchId: mainBranchId,
    }),
  });
  assert(badMedRes.status === 404, "Non-existent medicineId returns HTTP 404");

  // Adversarial Boundary Tests (Negative / Fractional Numbers - Bug 1.8-C)
  const negQtyRes = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({
      medicineId: testMedicineId,
      batchNo: "B-TEST-NEG-QTY",
      expiryDate: futureExpiry,
      quantity: -10,
      mrp: 50,
      branchId: mainBranchId,
    }),
  });
  assert(negQtyRes.status === 400, "Negative quantity on POST returns HTTP 400");

  const fracQtyRes = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({
      medicineId: testMedicineId,
      batchNo: "B-TEST-FRAC-QTY",
      expiryDate: futureExpiry,
      quantity: 4.5,
      mrp: 50,
      branchId: mainBranchId,
    }),
  });
  assert(fracQtyRes.status === 400, "Fractional quantity (4.5) on POST returns HTTP 400");

  const negMrpRes = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({
      medicineId: testMedicineId,
      batchNo: "B-TEST-NEG-MRP",
      expiryDate: futureExpiry,
      quantity: 10,
      mrp: -50,
      branchId: mainBranchId,
    }),
  });
  assert(negMrpRes.status === 400, "Negative MRP on POST returns HTTP 400");

  const negCostRes = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({
      medicineId: testMedicineId,
      batchNo: "B-TEST-NEG-COST",
      expiryDate: futureExpiry,
      quantity: 10,
      mrp: 50,
      purchasePrice: -20,
      branchId: mainBranchId,
    }),
  });
  assert(negCostRes.status === 400, "Negative purchasePrice on POST returns HTTP 400");

  // ─────────────────────────────────────────────────────────────
  // TEST GROUP 4: CASE-INSENSITIVE DUPLICATE REJECTION (1.8.1)
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [TEST 4] Case-Insensitive Duplicate Batch Prevention ---");
  const dupRes = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({
      medicineId: testMedicineId,
      batchNo: "batch-zero-test", // Lowercase variant of existing "BATCH-ZERO-TEST"
      expiryDate: futureExpiry,
      quantity: 10,
      mrp: 120.5,
      branchId: mainBranchId,
    }),
  });

  assert(dupRes.status === 409, "Duplicate batch number in same branch returns HTTP 409 Conflict");
  const dupJson = await dupRes.json();
  assert(dupJson.success === false, "Duplicate creation fails");

  // ─────────────────────────────────────────────────────────────
  // TEST GROUP 5: MULTI-TIER EXPIRY CLASSIFICATION (1.8.3)
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [TEST 5] 4-Tier Expiry Classification & FEFO Generation ---");

  // Batch A: Expiring in 10 days (Critical < 30d)
  const exp10d = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const resA = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({
      medicineId: testMedicineId,
      batchNo: `BATCH-CRITICAL-10D-${testRunId}`,
      expiryDate: exp10d,
      quantity: 25,
      purchasePrice: 40.0,
      mrp: 60.0,
      branchId: mainBranchId,
    }),
  });
  const jsonA = await resA.json();
  batchAId = jsonA.data?.id;
  assert(resA.status === 200, "Created Critical Batch A (10 days remaining)");
  assert(jsonA.data?.tier === "critical_30", "Batch A is classified as 'critical_30'");

  // Batch B: Expiring in 60 days (Warning < 90d)
  const exp60d = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const resB = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({
      medicineId: testMedicineId,
      batchNo: `BATCH-WARNING-60D-${testRunId}`,
      expiryDate: exp60d,
      quantity: 50,
      purchasePrice: 35.0,
      mrp: 55.0,
      branchId: mainBranchId,
    }),
  });
  const jsonB = await resB.json();
  batchBId = jsonB.data?.id;
  assert(resB.status === 200, "Created Warning Batch B (60 days remaining)");
  assert(jsonB.data?.tier === "warning_90", "Batch B is classified as 'warning_90'");

  // Batch C: Expired Yesterday (-1 day) (Expired Tier)
  const expYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const resC = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({
      medicineId: testMedicineId,
      batchNo: `BATCH-EXPIRED-YEST-${testRunId}`,
      expiryDate: expYesterday,
      quantity: 15,
      purchasePrice: 50.0,
      mrp: 80.0,
      branchId: mainBranchId,
    }),
  });
  const jsonC = await resC.json();
  batchCId = jsonC.data?.id;
  assert(resC.status === 200, "Created Expired Batch C");
  assert(jsonC.data?.tier === "expired", "Batch C is classified as 'expired'");
  assert(jsonC.data?.isExpired === true, "Batch C has isExpired: true");

  // ─────────────────────────────────────────────────────────────
  // TEST GROUP 6: FEFO RECOMMENDATION ALGORITHM (1.8.2)
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [TEST 6] FEFO Recommendation Algorithm & POS Dispense Lock ---");

  // Query FEFO sorted list
  const fefoListRes = await fetch(`${BASE_URL}/api/admin/batches?medicineId=${testMedicineId}&fefo=true`, {
    headers: { Cookie: superAdminCookie },
  });
  assert(fefoListRes.status === 200, "GET /api/admin/batches?fefo=true returns HTTP 200");
  const fefoListJson = await fefoListRes.json();
  assert(fefoListJson.data.length >= 3, "Returns all batches for medicine");
  // In FEFO sort, earlier expiry comes first
  assert(
    new Date(fefoListJson.data[0].expiryDate) <= new Date(fefoListJson.data[1].expiryDate),
    "Batches are ordered by expiryDate ascending (FEFO)"
  );

  // Single Recommendation for POS Dispense:
  // Expired batches (Batch C) MUST NOT be recommended! It must recommend Batch A (earliest unexpired)
  const recRes = await fetch(
    `${BASE_URL}/api/admin/batches?medicineId=${testMedicineId}&recommend=true&branchId=${mainBranchId}`,
    { headers: { Cookie: superAdminCookie } }
  );
  assert(recRes.status === 200, "GET /api/admin/batches?recommend=true returns HTTP 200");
  const recJson = await recRes.json();
  assert(recJson.success === true, "Recommendation returns success");
  assert(recJson.data?.id === batchAId, "Recommends Batch A (earliest unexpired in stock)");
  assert(recJson.data?.locked === false, "Recommended batch is not locked");

  // ─────────────────────────────────────────────────────────────
  // TEST GROUP 7: RBAC COST PRICE REDACTION (1.4.3 & 1.8)
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [TEST 7] RBAC Cost Price Redaction (view_cost_price) ---");

  // 1. Super Admin request (has view_cost_price)
  const adminGetRes = await fetch(`${BASE_URL}/api/admin/batches?medicineId=${testMedicineId}`, {
    headers: { Cookie: superAdminCookie },
  });
  const adminGetJson = await adminGetRes.json();
  assert(adminGetJson.canViewCostPrice === true, "Super Admin canViewCostPrice is true");
  const targetBatchAdmin = adminGetJson.data.find((b: any) => b.id === batchAId);
  assert(targetBatchAdmin?.purchasePrice === 40, "Super Admin receives actual purchasePrice (40.00)");

  // 2. Cashier request (revoked view_cost_price)
  const cashierGetRes = await fetch(`${BASE_URL}/api/admin/batches?medicineId=${testMedicineId}`, {
    headers: { Cookie: cashierCookie },
  });
  const cashierGetJson = await cashierGetRes.json();
  assert(cashierGetJson.canViewCostPrice === false, "Cashier canViewCostPrice is false");
  const targetBatchCashier = cashierGetJson.data.find((b: any) => b.id === batchAId);
  assert(targetBatchCashier?.purchasePrice === null, "Cashier cannot see purchasePrice (sanitized to null)");
  assert(targetBatchCashier?.mrp === 60, "Cashier can still view MRP (60.00)");

  // ─────────────────────────────────────────────────────────────
  // TEST GROUP 8: PARTIAL UPDATES (PUT) & ZERO PRESERVATION
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [TEST 8] Partial Updates (PUT) & IDOR Protection ---");

  const putRes = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({
      id: batchZeroId,
      mrp: 145.0, // update MRP only
      quantity: 0, // ensure 0 quantity remains 0
    }),
  });

  assert(putRes.status === 200, "PUT /api/admin/batches returns HTTP 200");
  const putJson = await putRes.json();
  assert(putJson.success === true, "Partial update succeeded");
  assert(Number(putJson.data?.mrp) === 145, "MRP updated to 145.00");
  assert(putJson.data?.quantity === 0, "0 quantity preserved on partial update");
  assert(putJson.data?.batchNo === "BATCH-ZERO-TEST", "Original batchNo preserved");

  // IDOR check: Attempting to update non-existent batch ID
  const idorRes = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({ id: 99999999, mrp: 200 }),
  });
  assert(idorRes.status === 404, "Invalid batch ID on PUT returns HTTP 404");

  // Adversarial Boundary Tests for PUT (Bug 1.8-C)
  const negPutQtyRes = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({ id: batchZeroId, quantity: -5 }),
  });
  assert(negPutQtyRes.status === 400, "Negative quantity on PUT returns HTTP 400");

  const fracPutQtyRes = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({ id: batchZeroId, quantity: 2.7 }),
  });
  assert(fracPutQtyRes.status === 400, "Fractional quantity (2.7) on PUT returns HTTP 400");

  const negPutMrpRes = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({ id: batchZeroId, mrp: -10 }),
  });
  assert(negPutMrpRes.status === 400, "Negative MRP on PUT returns HTTP 400");

  // Cost Price Preservation on PUT without view_cost_price permission (Bug 1.8-A & 1.8-B)
  const cashierPutRes = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cashierCookie },
    body: JSON.stringify({ id: batchAId, mrp: 65 }),
  });
  assert(cashierPutRes.status === 200, "Staff without view_cost_price can update allowed batch fields (HTTP 200)");
  const cashierPutJson = await cashierPutRes.json();
  assert(cashierPutJson.data?.purchasePrice === null, "Staff response sanitizes purchasePrice to null");
  const dbBatchAAfterCashier = await prisma.batch.findUnique({ where: { id: batchAId } });
  assert(Number(dbBatchAAfterCashier?.purchasePrice) === 40, "Staff update did not clobber purchasePrice; preserved as 40.00 in DB");

  // Stock Adjustment Audit Trail on Batch Quantity PUT (Bug 1.8-D)
  const prevBatchAQty = dbBatchAAfterCashier?.quantity || 50;
  const adminPutQtyRes = await fetch(`${BASE_URL}/api/admin/batches`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    body: JSON.stringify({ id: batchAId, quantity: prevBatchAQty - 5 }),
  });
  assert(adminPutQtyRes.status === 200, "Admin batch quantity modification returns HTTP 200");
  const autoAdjustment = await prisma.stockAdjustment.findFirst({
    where: { batchId: batchAId, type: "remove" },
    orderBy: { id: "desc" },
  });
  assert(autoAdjustment !== null, "StockAdjustment audit record automatically created on batch quantity change");
  assert(autoAdjustment?.oldQty === prevBatchAQty, "StockAdjustment oldQty matches previous batch quantity");
  assert(autoAdjustment?.newQty === prevBatchAQty - 5, "StockAdjustment newQty matches updated batch quantity");

  // ─────────────────────────────────────────────────────────────
  // TEST GROUP 9: SAFETY DELETION BLOCK (1.8.1)
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [TEST 9] Safety Deletion Block (Linked Historical Sales) ---");

  // 1. Link a dummy sale item to Batch A
  const testSale = await prisma.sale.create({
    data: {
      invoiceNo: `INV-TEST-${testRunId}`,
      totalAmount: 60.0,
      gstAmount: 0.0,
      grandTotal: 60.0,
      paymentMethod: "cash",
      branchId: mainBranchId,
      items: {
        create: {
          medicineId: testMedicineId,
          batchId: batchAId,
          quantity: 1,
          mrp: 60.0,
          taxableBase: 60.0,
          gstPercent: 0.0,
          gstAmount: 0.0,
          price: 60.0,
        },
      },
    },
  });

  // 2. Attempt to delete Batch A (MUST be blocked!)
  const blockedDeleteRes = await fetch(`${BASE_URL}/api/admin/batches?id=${batchAId}`, {
    method: "DELETE",
    headers: { Cookie: superAdminCookie },
  });
  assert(blockedDeleteRes.status === 400, "DELETE batch with linked sales returns HTTP 400 Bad Request");
  const blockedDeleteJson = await blockedDeleteRes.json();
  assert(blockedDeleteJson.success === false, "Deletion rejected");
  assert(
    blockedDeleteJson.message.toLowerCase().includes("linked sale"),
    "Error explains linked sale records and suggests stock adjustment"
  );

  // Assert Batch A still exists in DB
  const dbBatchA = await prisma.batch.findUnique({ where: { id: batchAId } });
  assert(dbBatchA !== null, "Database state integrity: Batch A was NOT deleted");

  // 3. Delete Batch B (0 linked sales, safe to delete)
  const safeDeleteRes = await fetch(`${BASE_URL}/api/admin/batches?id=${batchBId}`, {
    method: "DELETE",
    headers: { Cookie: superAdminCookie },
  });
  assert(safeDeleteRes.status === 200, "DELETE batch without sales returns HTTP 200 OK");
  const dbBatchB = await prisma.batch.findUnique({ where: { id: batchBId } });
  assert(dbBatchB === null, "Database state integrity: Batch B successfully deleted");

  // ─────────────────────────────────────────────────────────────
  // TEST GROUP 10: MULTI-BRANCH ISOLATION
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [TEST 10] Multi-Branch Isolation ---");

  // Cashier is assigned to mainBranchId. Attempting to query secondaryBranchId
  const crossBranchRes = await fetch(`${BASE_URL}/api/admin/batches?branchId=${secondaryBranchId}`, {
    headers: { Cookie: cashierCookie },
  });
  assert(crossBranchRes.status === 403, "Staff querying another branch without permission returns HTTP 403 Forbidden");

  // Cleanup test artifacts
  console.log("\nCleaning up test artifacts from database...");
  await prisma.saleItem.deleteMany({ where: { batchId: batchAId } });
  await prisma.sale.delete({ where: { id: testSale.id } });
  await prisma.stockAdjustment.deleteMany({
    where: { batchId: { in: [batchZeroId, batchAId, batchCId] } },
  });
  await prisma.batch.deleteMany({
    where: { id: { in: [batchZeroId, batchAId, batchCId] } },
  });
  await prisma.medicine.delete({ where: { id: testMedicineId } });
  await prisma.user.delete({ where: { id: staffUserId } });
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
}

runTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
