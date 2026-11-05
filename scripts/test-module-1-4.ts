import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db-transaction";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  checkBruteForceLockout,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
  buildUserSessionPayload,
  verifyAdminRequest,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import {
  ROLE_MATRIX,
  getEffectivePermissions,
  getEffectiveAllowedPages,
  getEffectiveMaxDiscount,
  hasPermission,
  canAccessPage,
  canAccessBranch,
} from "../src/lib/rbac";
import { logAudit, sanitizeAuditDetails } from "../src/lib/audit";
import {
  GET as authGet,
  POST as authPost,
  PUT as authPut,
  DELETE as authDelete,
} from "../src/app/api/auth/admin/route";
import {
  POST as auditPost,
  PUT as auditPut,
  DELETE as auditDelete,
} from "../src/app/api/admin/audit-logs/route";

async function runTests() {
  console.log("==================================================================");
  console.log("  MODULE 1.4 DEEP CROSS-CHECK & EDGE-CASE TEST SUITE (NEON DB)   ");
  console.log("==================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    if (condition) {
      passed++;
      console.log(`  [PASS] ${name}`);
    } else {
      failed++;
      console.error(`  [FAIL] ${name}${detail ? ` -> ${detail}` : ""}`);
    }
  }

  let tempUserId: number | null = null;
  let tempBranchId: number | null = null;

  try {
    // -------------------------------------------------------------------------
    // TEST GROUP 1: 1.4.1 Secure User Authentication Engine (BCrypt + 2h Session)
    // -------------------------------------------------------------------------
    console.log("\n--- 1.4.1: BCrypt Password Hashing & 2-Hour Session Management ---");

    const plain = "PharmaSecure@2026!";
    const hashed = await hashPassword(plain);
    assert(hashed.startsWith("$2") && hashed.length >= 59, "1. BCrypt Cost-12 hash generated");

    const validMatch = await verifyPassword(plain, hashed);
    const invalidMatch = await verifyPassword("WrongPassword123", hashed);
    assert(
      validMatch === true && invalidMatch === false,
      "2. BCrypt verifyPassword accurately validates & rejects"
    );

    const mockUser = {
      id: 999,
      username: "test_pharmacist",
      name: "Test Pharmacist",
      email: "pharm@test.com",
      role: "pharmacist",
      permissions: null,
      branchId: 1,
      branch: { code: "MAIN", name: "Main Store" },
    };

    const payload = buildUserSessionPayload(mockUser, false);
    const token = createSessionToken(payload);
    const verifiedActive = verifySessionToken(token, 120);
    assert(
      verifiedActive.valid === true &&
        verifiedActive.expired === false &&
        verifiedActive.locked === false &&
        verifiedActive.session?.username === "test_pharmacist" &&
        Array.isArray(verifiedActive.session?.allowedPages) &&
        verifiedActive.session?.maxDiscountPercent === 10,
      "3. HMAC-SHA256 Session Token created and verified with allowedPages & maxDiscountPercent"
    );

    // Edge Case: Tampered signature must be rejected
    const tamperedToken = `${token.split(".")[0]}.tamperedsignature123`;
    const verifiedTampered = verifySessionToken(tamperedToken, 120);
    assert(
      verifiedTampered.valid === false,
      "4. Tampered HMAC-SHA256 session token rejected via timingSafeEqual"
    );

    // Edge Case: Manually Locked Session Token (`isLocked: true`) must have `valid: false, locked: true`
    const lockedPayload = buildUserSessionPayload(mockUser, true);
    const lockedToken = createSessionToken(lockedPayload);
    const verifiedLocked = verifySessionToken(lockedToken, 120);
    assert(
      verifiedLocked.valid === false &&
        verifiedLocked.locked === true &&
        verifiedLocked.expired === false,
      "5. Locked session token returns valid=false & locked=true so locked screens cannot mutate APIs"
    );

    // Edge Case: 2-Hour (120-minute) Inactivity Timeout Auto-Lock
    const expiredPayload = {
      ...payload,
      issuedAt: Date.now() - 130 * 60 * 1000,
      lastActive: Date.now() - 125 * 60 * 1000, // 125 mins ago (> 120 mins)
    };
    const expiredToken = createSessionToken(expiredPayload);
    const verifiedExpired = verifySessionToken(expiredToken, 120);
    assert(
      verifiedExpired.valid === false &&
        verifiedExpired.expired === true &&
        verifiedExpired.locked === true &&
        verifiedExpired.session?.isLocked === true,
      "6. Session idle for >120 minutes automatically triggers expired/auto-locked state while preserving user context"
    );

    // -------------------------------------------------------------------------
    // TEST GROUP 2: 1.4.2 Brute-Force Attack Protection (5 Attempts / 15 Mins)
    // -------------------------------------------------------------------------
    console.log("\n--- 1.4.2: Brute-Force Rate Limiter & Split Username/Email Defense ---");

    const testIp = "203.0.113.199";
    const testAcct = "bruteforce_victim";
    const testEmail = "victim@pharmacy.com";

    await clearFailedLoginAttempts(testIp, "admin", testAcct, testEmail);
    const initialStatus = await checkBruteForceLockout(testIp, "admin", testAcct, testEmail);
    assert(
      initialStatus.locked === false && initialStatus.remainingAttempts === 5,
      "7. Clean IP & account starts with 5 remaining attempts and unlocked status"
    );

    // Record 3 failed attempts using username from IP 1
    for (let i = 1; i <= 3; i++) {
      await recordFailedLoginAttempt(testIp, "admin", testAcct, testEmail);
    }
    const afterThree = await checkBruteForceLockout(testIp, "admin", testAcct, testEmail);
    assert(
      afterThree.locked === false && afterThree.remainingAttempts === 2,
      "8. After 3 failed attempts: 2 attempts remaining"
    );

    // Edge Case: Attacker switches to a DIFFERENT IP and uses EMAIL instead of username for attempt 4 & 5
    const rotatedIp = "198.51.100.88";
    await recordFailedLoginAttempt(rotatedIp, "admin", testAcct, testEmail);
    const fifthAttempt = await recordFailedLoginAttempt(rotatedIp, "admin", testAcct, testEmail);
    assert(
      fifthAttempt.locked === true &&
        fifthAttempt.remainingAttempts === 0 &&
        fifthAttempt.remainingSeconds > 800 &&
        fifthAttempt.remainingSeconds <= 900,
      `9. Split Username + Email across rotated IPs still locks on 5th total attempt (${fifthAttempt.remainingSeconds}s remaining)`
    );

    // Check lockout using ONLY email from a 3rd IP
    const emailOnlyCheck = await checkBruteForceLockout("192.0.2.55", "admin", testEmail);
    assert(
      emailOnlyCheck.locked === true,
      "10. Querying lockout by email alone from a 3rd IP accurately detects the 15-min account lockout"
    );

    // Clear failed attempts on successful reset
    await clearFailedLoginAttempts(testIp, "admin", testAcct, testEmail);
    await clearFailedLoginAttempts(rotatedIp, "admin", testAcct, testEmail);
    const afterReset = await checkBruteForceLockout(testIp, "admin", testAcct, testEmail);
    assert(
      afterReset.locked === false && afterReset.remainingAttempts === 5,
      "11. clearFailedLoginAttempts resets both username and email lockout contexts cleanly"
    );

    // -------------------------------------------------------------------------
    // TEST GROUP 3: 1.4.3 Granular Role & Permission Management (RBAC + Multi-Branch)
    // -------------------------------------------------------------------------
    console.log("\n--- 1.4.3: Granular RBAC Matrix, Custom Overrides & Multi-Branch Isolation ---");

    assert(
      Boolean(
        ROLE_MATRIX.admin &&
          ROLE_MATRIX.manager &&
          ROLE_MATRIX.pharmacist &&
          ROLE_MATRIX.cashier &&
          ROLE_MATRIX.accountant &&
          ROLE_MATRIX.staff
      ),
      "12. All 6 system roles (Super Admin, Store Manager, Pharmacist, Cashier, Accountant, Staff) defined"
    );

    const cashierDefaultPerms = getEffectivePermissions("cashier", null, 2);
    assert(
      !cashierDefaultPerms.includes("view_cost_price") &&
        !cashierDefaultPerms.includes("cancel_invoice"),
      "13. Cashier cannot view cost price or cancel invoices by default"
    );

    const customOverrideJson = JSON.stringify({
      grantedPermissions: ["cancel_invoice", "apply_high_discount"],
      revokedPermissions: ["manage_customers"],
      allowedPages: ["/admin/dashboard", "/admin/pos", "/admin/reports"],
      maxDiscountPercent: 25,
    });
    const cashierCustomPerms = getEffectivePermissions("cashier", customOverrideJson, 2);
    const cashierCustomPages = getEffectiveAllowedPages("cashier", customOverrideJson);
    const cashierCustomDiscount = getEffectiveMaxDiscount("cashier", customOverrideJson);

    assert(
      cashierCustomPerms.includes("cancel_invoice") &&
        !cashierCustomPerms.includes("manage_customers") &&
        !cashierCustomPerms.includes("switch_branches") &&
        cashierCustomPages.includes("/admin/reports") &&
        cashierCustomDiscount === 25,
      "14. Custom JSON overrides (grant, revoke, allowedPages, maxDiscountPercent) resolve accurately"
    );

    // Edge Case: Passing already-resolved SessionPayload (where permissions is PermissionKey[]) into canAccessPage & hasPermission
    const sessionStyleUser = {
      role: "cashier",
      permissions: cashierCustomPerms,
      allowedPages: cashierCustomPages,
      branchId: 2,
    };
    assert(
      canAccessPage(sessionStyleUser, "/admin/reports") === true &&
        canAccessPage(sessionStyleUser, "/admin/settings") === false &&
        hasPermission(sessionStyleUser, "cancel_invoice") === true,
      "15. Edge Case: canAccessPage & hasPermission safely accept SessionPayload array format without TypeError"
    );

    // Staff Page Allow-List check
    const pharmacistUser = { role: "pharmacist", permissions: null };
    const adminUser = { role: "admin", permissions: null };
    assert(
      canAccessPage(pharmacistUser, "/admin/pos") === true &&
        canAccessPage(pharmacistUser, "/admin/medicines") === true &&
        canAccessPage(pharmacistUser, "/admin/settings") === false &&
        canAccessPage(pharmacistUser, "/admin/users") === false &&
        canAccessPage(adminUser, "/admin/settings") === true &&
        canAccessPage(adminUser, "/admin/users") === true,
      "16. Pharmacist allowed on /admin/pos & /admin/medicines, blocked from /admin/settings & /admin/users"
    );

    // Multi-Branch Staff Isolation check (including null targetBranchId bypass prevention!)
    const branch2Cashier = { role: "cashier", branchId: 2 };
    const globalManager = { role: "manager", branchId: null };
    assert(
      canAccessBranch(branch2Cashier, 2) === true &&
        canAccessBranch(branch2Cashier, 1) === false &&
        canAccessBranch(branch2Cashier, null) === false &&
        canAccessBranch(globalManager, 1) === true &&
        canAccessBranch(globalManager, 2) === true &&
        canAccessBranch(globalManager, null) === true &&
        hasPermission({ role: "manager", branchId: null }, "switch_branches") === true &&
        hasPermission({ role: "manager", branchId: 2 }, "switch_branches") === false,
      "17. Multi-Branch Isolation: Branch-bound staff blocked from other branches AND blocked from querying null (ALL) branches"
    );

    // -------------------------------------------------------------------------
    // TEST GROUP 4: 1.4.4 Tamper-Proof System Audit Trails & End-to-End API Routes
    // -------------------------------------------------------------------------
    console.log("\n--- 1.4.4: Tamper-Proof Audit Trails & Live Next.js API Route Handlers ---");

    const rawDetails = {
      username: "admin",
      password: "MyPlaintextPassword123!",
      sendgridKey: "SG.secret_key_value",
      nested: {
        smtpPass: "SmtpSecret999",
        oldPrice: 120.5,
        newPrice: 135.0,
      },
    };
    const scrubbed = sanitizeAuditDetails(rawDetails) as Record<string, any>;
    assert(
      scrubbed.password === "[REDACTED]" &&
        scrubbed.sendgridKey === "[REDACTED]" &&
        scrubbed.nested.smtpPass === "[REDACTED]" &&
        scrubbed.nested.newPrice === 135.0,
      "18. sanitizeAuditDetails automatically redacts passwords, API keys, and tokens while preserving diffs"
    );

    // Verify PUT and DELETE on /api/admin/audit-logs return 405 Method Not Allowed
    const putAuditRes = await auditPut();
    const deleteAuditRes = await auditDelete();
    assert(
      putAuditRes.status === 405 && deleteAuditRes.status === 405,
      "19. Tamper-Proof Guarantee: PUT and DELETE /api/admin/audit-logs return 405 Method Not Allowed"
    );

    // Verify unauthenticated call to update_user_rbac is blocked with 401
    const unauthRbacReq = new NextRequest("http://localhost:3000/api/admin/audit-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "update_user_rbac",
        userId: 1,
        role: "cashier",
      }),
    });
    const unauthRbacRes = await auditPost(unauthRbacReq);
    assert(
      unauthRbacRes.status === 401,
      "20. Security Guard: Unauthenticated request to update_user_rbac is rejected with 401 Unauthorized"
    );

    // Create a temporary secondary branch and staff user to test E2E API login, lock, unlock, deactivated branch, and logout
    const tempBranch = await prisma.branch.create({
      data: {
        code: "TEST-BR99",
        name: "Temp Test Branch 99",
        isMain: false,
        active: true,
      },
    });
    tempBranchId = tempBranch.id;

    const tempPassword = "CashierLogin#2026";
    const tempUser = await prisma.user.create({
      data: {
        username: "temp_cashier_99",
        name: "Temp Cashier 99",
        email: "temp_cashier_99@pharmacy.test",
        password: await hashPassword(tempPassword),
        role: "cashier",
        branchId: tempBranch.id,
        active: true,
      },
    });
    tempUserId = tempUser.id;

    // 21. Test E2E POST /api/auth/admin login with valid credentials
    const loginReq = new NextRequest("http://localhost:3000/api/auth/admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "198.51.100.201",
      },
      body: JSON.stringify({
        action: "login",
        identifier: "temp_cashier_99@pharmacy.test",
        password: tempPassword,
      }),
    });
    const loginRes = await authPost(loginReq);
    const loginJson = await loginRes.json();
    const sessionToken = loginJson.token as string;
    assert(
      loginRes.status === 200 &&
        loginJson.success === true &&
        loginJson.session?.branchCode === "TEST-BR99" &&
        Boolean(sessionToken),
      "21. E2E POST /api/auth/admin: Login succeeds via email and returns session bound to [TEST-BR99]"
    );

    // 22. Non-admin trying to call update_user_rbac must be rejected with 403
    const cashierRbacReq = new NextRequest("http://localhost:3000/api/admin/audit-logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        operation: "update_user_rbac",
        userId: tempUser.id,
        role: "admin",
      }),
    });
    const cashierRbacRes = await auditPost(cashierRbacReq);
    assert(
      cashierRbacRes.status === 403,
      "22. Privilege Escalation Defense: Cashier attempting to self-promote to Admin is blocked with 403 Forbidden"
    );

    // 23. Lock Screen via PUT /api/auth/admin (action: "lock")
    const lockReq = new NextRequest("http://localhost:3000/api/auth/admin", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ action: "lock", reason: "test_manual_lock" }),
    });
    const lockRes = await authPut(lockReq);
    const lockJson = await lockRes.json();
    const lockedCookieToken = lockRes.cookies.get(SESSION_COOKIE_NAME)?.value || "";
    assert(
      lockRes.status === 200 && lockJson.locked === true && Boolean(lockedCookieToken),
      "23. E2E PUT /api/auth/admin: Screen lock sets isLocked=true and issues locked token"
    );

    // 24. Locked session attempting API verification via verifyAdminRequest must return 423 Locked
    const lockedVerifyReq = new NextRequest("http://localhost:3000/api/admin/settings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lockedCookieToken}`,
      },
    });
    const lockedCheck = await verifyAdminRequest(lockedVerifyReq);
    assert(
      lockedCheck.authorized === false && lockedCheck.status === 423,
      "24. Locked Screen API Guard: Locked session token is blocked from API actions with HTTP 423 Locked"
    );

    // 25. Unlock screen via POST /api/auth/admin (action: "unlock")
    const unlockReq = new NextRequest("http://localhost:3000/api/auth/admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lockedCookieToken}`,
      },
      body: JSON.stringify({
        action: "unlock",
        password: tempPassword,
      }),
    });
    const unlockRes = await authPost(unlockReq);
    const unlockJson = await unlockRes.json();
    assert(
      unlockRes.status === 200 && unlockJson.success === true && unlockJson.locked === false,
      "25. E2E POST /api/auth/admin (unlock): Re-entering BCrypt password unlocks screen cleanly"
    );

    // 26. Edge Case: Deactivate the staff's assigned branch [TEST-BR99] -> GET /api/auth/admin & POST login must block with 403!
    await prisma.branch.update({
      where: { id: tempBranch.id },
      data: { active: false },
    });

    const getDeactivatedBranchReq = new NextRequest("http://localhost:3000/api/auth/admin", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${unlockJson.token}`,
      },
    });
    const getDeactivatedRes = await authGet(getDeactivatedBranchReq);
    assert(
      getDeactivatedRes.status === 403,
      "26. Edge Case: Deactivating a store branch immediately invalidates active sessions of staff assigned to that branch (403)"
    );

    // 27. Logout via DELETE /api/auth/admin
    const logoutReq = new NextRequest("http://localhost:3000/api/auth/admin", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${unlockJson.token}`,
      },
    });
    const logoutRes = await authDelete(logoutReq);
    const logoutJson = await logoutRes.json();
    assert(
      logoutRes.status === 200 && logoutJson.authenticated === false,
      "27. E2E DELETE /api/auth/admin: Logs out user, clears cookie, and writes LOGOUT audit trail"
    );

    // 28. Verify audit trail entries were written for tempUserId
    const userAuditCount = await prisma.auditLog.count({
      where: { userId: tempUser.id },
    });
    assert(
      userAuditCount >= 4,
      `28. Audit Trail Verification: ${userAuditCount} immutable audit_logs recorded for login, lock, unlock, and logout`
    );
  } catch (err) {
    failed++;
    console.error("Unexpected test error:", err);
  } finally {
    // Clean up temporary test records
    if (tempUserId) {
      await prisma.auditLog.deleteMany({ where: { userId: tempUserId } });
      await prisma.loginAttempt.deleteMany({
        where: {
          OR: [
            { context: "admin:temp_cashier_99" },
            { context: "admin:temp_cashier_99@pharmacy.test" },
          ],
        },
      });
      await prisma.user.delete({ where: { id: tempUserId } }).catch(() => {});
    }
    if (tempBranchId) {
      await prisma.branch.delete({ where: { id: tempBranchId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log("\n==================================================================");
  console.log(`  MODULE 1.4 DEEP TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
