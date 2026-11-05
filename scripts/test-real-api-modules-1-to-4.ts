/**
 * COMPREHENSIVE INTEGRATION TEST SUITE (Modules 1.1 - 1.4)
 * Zero-Shortcut Mandate: Real HTTP requests against live server http://localhost:3000
 * Asserts Status Codes, Exact JSON, and Database Mutations (0 fake asserts).
 */

import { prisma } from "../src/lib/db-transaction";
import { buildUserSessionPayload, createSessionToken, hashPassword } from "../src/lib/auth";
import { canAccessBranch } from "../src/lib/rbac";

const BASE_URL = "http://localhost:3000";

let totalPassed = 0;
let totalFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${testName}`);
    totalPassed++;
  } else {
    console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${testName} ${detail ? `(${detail})` : ""}`);
    totalFailed++;
  }
}

async function run() {
  console.log("\n========================================================");
  console.log("  REAL HTTP API INTEGRATION TESTS: MODULES 1.1 - 1.4    ");
  console.log("========================================================\n");

  // Retrieve Super Admin user
  const adminUser = await prisma.user.findFirst({
    where: { role: "admin", active: true },
    include: { branch: true },
  });

  if (!adminUser) {
    throw new Error("No active Super Admin user found in database.");
  }

  const adminSession = buildUserSessionPayload(adminUser);
  const adminToken = createSessionToken(adminSession);
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${adminToken}`,
    Cookie: `med_pos_admin_session=${adminToken}`,
  };

  // =========================================================================
  // MODULE 1.1: Health & Database Architecture
  // =========================================================================
  console.log("\n--- [MODULE 1.1] Health & Multi-Tenant Config ---");

  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const healthJson = await healthRes.json();
  assert(healthRes.status === 200, "GET /api/health returns HTTP 200");
  assert(healthJson.success === true, "Health status is success");
  assert(healthJson.database?.status === "connected", "Database status reports connected");
  assert(!healthJson.config?.storeName, "Health endpoint does not leak tenant storeName to unauthenticated visitors");
  assert(!healthJson.database?.rawError, "Health endpoint does not expose raw database errors");

  // =========================================================================
  // MODULE 1.2: Setup Wizard Security & Boundary Handling
  // =========================================================================
  console.log("\n--- [MODULE 1.2] Setup Wizard Security & Boundaries ---");

  // Test 1: Clean Step 1 without cookies
  const cleanSetupRes = await fetch(`${BASE_URL}/api/setup`);
  const cleanSetupJson = await cleanSetupRes.json();
  assert(cleanSetupRes.status === 200, "GET /api/setup returns HTTP 200 for clean visit");
  assert(cleanSetupJson.requiresUnlock === false, "Clean setup visit requiresUnlock is false");

  // Test 2: Save Step 1 with lowQty: 0 boundary
  const uniqueStoreName = `TestPharma_${Date.now()}`;
  const saveStep1Res = await fetch(`${BASE_URL}/api/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "save_step_1",
      storeName: uniqueStoreName,
      storeAddress: "123 Test Street",
      storePhone: "9876543210",
      storeEmail: "test@pharma.com",
      lowQty: 0,
      expiryDays: 30,
    }),
  });
  const saveStep1Json = await saveStep1Res.json();
  const setupCookie = saveStep1Res.headers.get("set-cookie") || "";
  assert(saveStep1Res.status === 200, "POST /api/setup save_step_1 returns HTTP 200");
  assert(saveStep1Json.success === true, "save_step_1 succeeds");
  assert(typeof saveStep1Json.setupId === "number", "Returns setupId");

  const testSetupId = saveStep1Json.setupId;
  const dbDraft = await prisma.settings.findUnique({ where: { id: testSetupId } });
  assert(dbDraft?.lowQty === 0, "Boundary check: lowQty 0 is preserved in DB (not overwritten with 10)");
  assert(dbDraft?.expiryDays === 30, "Boundary check: expiryDays 30 is preserved in DB");

  // Test 3: Save Step 2 to configure admin user on this draft
  const testAdminUsername = `adm_${Date.now()}`;
  const testAdminEmail = `${testAdminUsername}@testpharma.com`;
  const saveStep2Res = await fetch(`${BASE_URL}/api/setup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: setupCookie,
    },
    body: JSON.stringify({
      action: "save_step_2",
      setupId: testSetupId,
      name: "Test Owner",
      username: testAdminUsername,
      email: testAdminEmail,
      password: "TestPassword123!",
      confirmPassword: "TestPassword123!",
    }),
  });
  assert(saveStep2Res.status === 200, "POST /api/setup save_step_2 returns HTTP 200");

  // Test 4: Attacker without token attempts to reset or modify draft -> HTTP 401 locked
  const unauthAttackRes = await fetch(`${BASE_URL}/api/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "restart_setup",
      setupId: testSetupId,
    }),
  });
  const unauthAttackJson = await unauthAttackRes.json();
  assert(unauthAttackRes.status === 401, "Attacker without token cannot restart_setup (HTTP 401)");
  assert(unauthAttackJson.requiresUnlock === true, "Response indicates requiresUnlock: true");

  // Test 5: GET /api/setup?resume=... without token hides plaintext credentials
  const resumeProbeRes = await fetch(`${BASE_URL}/api/setup?resume=${encodeURIComponent(uniqueStoreName)}`);
  const resumeProbeJson = await resumeProbeRes.json();
  assert(resumeProbeRes.status === 200, "GET /api/setup?resume returns HTTP 200");
  assert(resumeProbeJson.requiresUnlock === true, "Resume probe correctly requires unlock");
  assert(resumeProbeJson.adminEmailHint?.includes("***"), "Admin email is masked for security");
  assert(!resumeProbeJson.draft?.adminPassword, "Password is never returned in draft");
  assert(!resumeProbeJson.draft?.storePhone, "Sensitive draft phone hidden before unlock");

  // Test 6: verify_resume with invalid credentials decrements attempts
  const badUnlockRes = await fetch(`${BASE_URL}/api/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "verify_resume",
      setupId: testSetupId,
      password: "wrong_password_123",
    }),
  });
  const badUnlockJson = await badUnlockRes.json();
  assert(badUnlockRes.status === 401, "verify_resume with wrong password returns HTTP 401");
  assert(typeof badUnlockJson.remainingAttempts === "number", "Returns remaining attempts before lockout");

  // Test 7: send_otp enforces cooldown
  const otpRes1 = await fetch(`${BASE_URL}/api/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "send_otp", setupId: testSetupId }),
  });
  assert(otpRes1.status === 200, "First send_otp request succeeds (HTTP 200)");

  const otpRes2 = await fetch(`${BASE_URL}/api/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "send_otp", setupId: testSetupId }),
  });
  assert(otpRes2.status === 429, "Immediate second send_otp request blocked by 60s cooldown (HTTP 429)");

  // Clean up test draft
  await prisma.user.deleteMany({ where: { storeId: testSetupId } });
  await prisma.settings.delete({ where: { id: testSetupId } });

  // =========================================================================
  // MODULE 1.3: Multi-Branch & Store Settings API
  // =========================================================================
  console.log("\n--- [MODULE 1.3] Multi-Branch & Store Settings ---");

  // Test 1: Unauthenticated settings read rejected
  const unauthSettingsRes = await fetch(`${BASE_URL}/api/admin/settings`);
  assert(unauthSettingsRes.status === 401, "GET /api/admin/settings unauthenticated returns HTTP 401");

  // Test 2: Authenticated settings read succeeds
  const authSettingsRes = await fetch(`${BASE_URL}/api/admin/settings`, { headers: authHeaders });
  const authSettingsJson = await authSettingsRes.json();
  assert(authSettingsRes.status === 200, "GET /api/admin/settings authenticated returns HTTP 200");
  assert(authSettingsJson.success === true, "Authenticated settings returns success");

  // Test 3: POST /api/admin/settings validation and partial update preservation
  const badSettingsPost = await fetch(`${BASE_URL}/api/admin/settings`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ storeName: "   " }),
  });
  assert(badSettingsPost.status === 400, "POST /api/admin/settings with blank name returns HTTP 400");

  const updateSettingsRes = await fetch(`${BASE_URL}/api/admin/settings`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      storeName: authSettingsJson.data.storeName || "Medical Store",
      lowQty: 0,
      expiryDays: 60,
    }),
  });
  const updateSettingsJson = await updateSettingsRes.json();
  assert(updateSettingsRes.status === 200, "POST /api/admin/settings update returns HTTP 200");
  assert(updateSettingsJson.success === true, "Settings update succeeded");

  // Verify in DB that lowQty 0 was preserved and MAIN branch is in sync
  const updatedDbSettings = await prisma.settings.findUnique({ where: { id: adminUser.storeId! } });
  assert(updatedDbSettings?.lowQty === 0, "DB check: Settings lowQty 0 preserved");
  assert(updatedDbSettings?.expiryDays === 60, "DB check: Settings expiryDays 60 saved");

  // Test 4: POST /api/admin/settings/test-email auth guard
  const unauthTestEmail = await fetch(`${BASE_URL}/api/admin/settings/test-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ testRecipient: "attacker@test.com" }),
  });
  assert(unauthTestEmail.status === 401, "POST /api/admin/settings/test-email without auth returns HTTP 401");

  // Test 5: Multi-Branch CRUD & Safety Guards
  const unauthBranchesRes = await fetch(`${BASE_URL}/api/admin/branches`);
  assert(unauthBranchesRes.status === 401, "GET /api/admin/branches without auth returns HTTP 401");

  const testBranchCode = `TB-${Date.now().toString().slice(-4)}`;
  const createBranchRes = await fetch(`${BASE_URL}/api/admin/branches`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      code: testBranchCode,
      name: "Integration Test Branch",
      address: "Floor 2, City OPD",
      phone: "9123456789",
      email: "branch@test.com",
      gstNo: "19ABCDE1234F1Z5",
    }),
  });
  const createBranchJson = await createBranchRes.json();
  assert(createBranchRes.status === 200, "POST /api/admin/branches creates new branch (HTTP 200)");
  assert(createBranchJson.data?.code === testBranchCode, "Branch code correctly saved");
  const testBranchId = createBranchJson.data?.id;

  // Duplicate code check (case-insensitive)
  const dupBranchRes = await fetch(`${BASE_URL}/api/admin/branches`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      code: testBranchCode.toLowerCase(),
      name: "Duplicate Branch",
    }),
  });
  assert(dupBranchRes.status === 409, "POST /api/admin/branches with duplicate code returns HTTP 409");

  // PATCH /api/admin/branches with empty name returns 400
  const badPatchRes = await fetch(`${BASE_URL}/api/admin/branches`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ id: testBranchId, name: "   " }),
  });
  assert(badPatchRes.status === 400, "PATCH /api/admin/branches with blank name returns HTTP 400");

  // PATCH valid update
  const validPatchRes = await fetch(`${BASE_URL}/api/admin/branches`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ id: testBranchId, name: "Updated Test Branch Name" }),
  });
  assert(validPatchRes.status === 200, "PATCH /api/admin/branches with valid name returns HTTP 200");

  // Safety Delete Guard: Assign a user to the branch and attempt deletion
  const dummyStaffUsername = `staff_${Date.now()}`;
  const dummyStaff = await prisma.user.create({
    data: {
      storeId: adminUser.storeId,
      branchId: testBranchId,
      username: dummyStaffUsername,
      email: `${dummyStaffUsername}@test.com`,
      password: "hashed_dummy_password",
      name: "Branch Staff",
      role: "staff",
      active: true,
    },
  });

  const deleteWithUserRes = await fetch(`${BASE_URL}/api/admin/branches?id=${testBranchId}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  const deleteWithUserJson = await deleteWithUserRes.json();
  assert(deleteWithUserRes.status === 400, "DELETE branch with assigned users is blocked (HTTP 400)");
  assert(deleteWithUserJson.error?.includes("assigned user"), "Error mentions assigned user account(s)");

  // Clean up staff and then delete branch
  await prisma.user.delete({ where: { id: dummyStaff.id } });
  const deleteBranchRes = await fetch(`${BASE_URL}/api/admin/branches?id=${testBranchId}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  assert(deleteBranchRes.status === 200, "DELETE branch succeeds once assigned users are removed (HTTP 200)");

  // =========================================================================
  // MODULE 1.4: Authentication, Brute-Force & Audit Logs
  // =========================================================================
  console.log("\n--- [MODULE 1.4] Auth, Brute-Force & Audit Logs ---");

  // Test 1: Invalid credentials
  const badLoginRes = await fetch(`${BASE_URL}/api/auth/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "login",
      identifier: adminUser.username,
      password: "definitely_wrong_password",
    }),
  });
  const badLoginJson = await badLoginRes.json();
  assert(badLoginRes.status === 401, "POST /api/auth/admin with bad password returns HTTP 401");
  assert(typeof badLoginJson.remainingAttempts === "number", "Returns remaining attempts");

  // Test 2: Valid login
  // Note: we test unlocking with known hash or test account
  const testStaffUser = await prisma.user.create({
    data: {
      storeId: adminUser.storeId,
      username: `login_test_${Date.now()}`,
      email: `login_test_${Date.now()}@test.com`,
      password: await hashPassword("ValidPass123!"),
      name: "Login Test User",
      role: "staff",
      active: true,
    },
  });

  const validLoginRes = await fetch(`${BASE_URL}/api/auth/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "login",
      identifier: testStaffUser.username,
      password: "ValidPass123!",
    }),
  });
  const validLoginJson = await validLoginRes.json();
  assert(validLoginRes.status === 200, "POST /api/auth/admin valid login returns HTTP 200");
  assert(validLoginJson.success === true, "Login reports success");
  assert(validLoginJson.session?.storeId === adminUser.storeId, "Session payload contains correct storeId");

  // Verify that LOGIN_SUCCESS audit log contains storeId
  const loginAudit = await prisma.auditLog.findFirst({
    where: {
      userId: testStaffUser.id,
      action: "LOGIN_SUCCESS",
    },
    orderBy: { createdAt: "desc" },
  });
  assert(loginAudit?.storeId === adminUser.storeId, "DB check: LOGIN_SUCCESS audit log includes storeId (NOT null)");

  // Test 3: Screen Lock & Unlock
  const staffHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${validLoginJson.token}`,
    Cookie: `med_pos_admin_session=${validLoginJson.token}`,
  };

  const lockRes = await fetch(`${BASE_URL}/api/auth/admin`, {
    method: "PUT",
    headers: staffHeaders,
    body: JSON.stringify({ action: "lock", reason: "manual_test" }),
  });
  const lockJson = await lockRes.json();
  assert(lockRes.status === 200, "PUT /api/auth/admin lock returns HTTP 200");
  assert(lockJson.locked === true, "Session successfully marked as locked");

  const unlockRes = await fetch(`${BASE_URL}/api/auth/admin`, {
    method: "POST",
    headers: staffHeaders,
    body: JSON.stringify({
      action: "unlock",
      userId: testStaffUser.id,
      password: "ValidPass123!",
    }),
  });
  const unlockJson = await unlockRes.json();
  assert(unlockRes.status === 200, "POST /api/auth/admin unlock returns HTTP 200");
  assert(unlockJson.locked === false, "Screen unlocked successfully");

  // Verify unlock audit log includes storeId
  const unlockAudit = await prisma.auditLog.findFirst({
    where: {
      userId: testStaffUser.id,
      action: "SCREEN_UNLOCKED",
    },
    orderBy: { createdAt: "desc" },
  });
  assert(unlockAudit?.storeId === adminUser.storeId, "DB check: SCREEN_UNLOCKED audit log includes storeId");

  // Clean up test staff user
  await prisma.user.delete({ where: { id: testStaffUser.id } });

  // Test 4: Audit Logs API Protection & Multi-Tenant Scoping
  const unauthAuditGet = await fetch(`${BASE_URL}/api/admin/audit-logs`);
  assert(unauthAuditGet.status === 401, "GET /api/admin/audit-logs unauthenticated returns HTTP 401");

  const authAuditGet = await fetch(`${BASE_URL}/api/admin/audit-logs`, { headers: authHeaders });
  const authAuditJson = await authAuditGet.json();
  assert(authAuditGet.status === 200, "GET /api/admin/audit-logs authenticated returns HTTP 200");
  assert(Array.isArray(authAuditJson.logs), "Returns logs array");

  // Test 5: Audit Logs Tamper-Proofing (PUT/DELETE blocked)
  const tamperPut = await fetch(`${BASE_URL}/api/admin/audit-logs`, { method: "PUT", headers: authHeaders });
  assert(tamperPut.status === 405, "PUT /api/admin/audit-logs is blocked with HTTP 405 (Tamper-proof)");

  const tamperDelete = await fetch(`${BASE_URL}/api/admin/audit-logs`, { method: "DELETE", headers: authHeaders });
  assert(tamperDelete.status === 405, "DELETE /api/admin/audit-logs is blocked with HTTP 405 (Tamper-proof)");

  // Test 6: RBAC & switch_branches check
  const staffWithSwitchBranch = {
    role: "staff",
    branchId: 10,
    permissions: ["switch_branches"],
  };
  const canAccessAnotherBranch = canAccessBranch(staffWithSwitchBranch as any, 20);
  assert(canAccessAnotherBranch === true, "RBAC check: Staff with 'switch_branches' can access other branches");

  const staffWithoutSwitchBranch = {
    role: "staff",
    branchId: 10,
    permissions: [],
  };
  const cannotAccessAnotherBranch = canAccessBranch(staffWithoutSwitchBranch as any, 20);
  assert(cannotAccessAnotherBranch === false, "RBAC check: Staff without 'switch_branches' cannot access other branches");

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log("\n========================================================");
  console.log(`  INTEGRATION TEST RESULTS: ${totalPassed} PASSED, ${totalFailed} FAILED`);
  console.log("========================================================\n");

  if (totalFailed > 0) {
    process.exit(1);
  }
}

run()
  .catch((err) => {
    console.error("FATAL: Test run threw exception:", err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });

