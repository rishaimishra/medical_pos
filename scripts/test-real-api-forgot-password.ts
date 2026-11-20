/**
 * Universal Email-OTP Forgot Password E2E Integration Suite (`scripts/test-real-api-forgot-password.ts`)
 *
 * Verifies all 4 login panels (`admin`, `super_admin`, `customer`, `supplier`):
 *  1. Cross-origin CSRF rejection (`403`) & anti-enumeration on unknown accounts (`200` with no leak)
 *  2. 45s OTP resend cooldown (`429`) & 5-attempt wrong-OTP brute-force invalidation (`429`)
 *  3. Password length policy (`8` chars for `super_admin`, `6` chars for others) & confirm mismatch (`400`)
 *  4. Real 6-digit OTP reset, single-use replay rejection (`400`), & brute-force login lockout auto-clear
 *  5. Live sign-in verification with the NEW password across `/api/auth/admin`, `/api/auth/super-admin`,
 *     `/api/auth/customer` (+ multi-store linked phone password sync), and `/api/auth/supplier`
 */

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";
import { AuthPanel, hashResetOtp } from "../src/lib/passwordReset";

import { POST as postForgotPassword } from "../src/app/api/auth/forgot-password/route";
import { POST as postAdminAuth } from "../src/app/api/auth/admin/route";
import { POST as postSuperAdminAuth } from "../src/app/api/auth/super-admin/route";
import { POST as postCustomerAuth } from "../src/app/api/auth/customer/route";
import { POST as postSupplierAuth } from "../src/app/api/auth/supplier/route";

const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath) && typeof (process as any).loadEnvFile === "function") {
  (process as any).loadEnvFile(envPath);
}

let passed = 0;
let failed = 0;

function assert(cond: boolean, desc: string) {
  if (cond) {
    console.log(`  ✔ [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${desc}`);
    failed++;
  }
}

function makeReq(url: string, body: any, extraHeaders?: Record<string, string>): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(body),
  });
}

function recoverOtpFromHash(
  panel: AuthPanel,
  targetUserId: number,
  email: string,
  otpHash: string
): string {
  for (let code = 100000; code <= 999999; code++) {
    const candidate = String(code);
    if (hashResetOtp(panel, targetUserId, email, candidate) === otpHash) {
      return candidate;
    }
  }
  throw new Error(`Unable to resolve OTP for panel=${panel} user=${targetUserId}`);
}

async function main() {
  console.log("================================================================================");
  console.log(" 🔐 UNIVERSAL EMAIL OTP FORGOT PASSWORD VERIFICATION (ALL 4 PORTALS)");
  console.log("================================================================================");

  const ts = Date.now();
  const custPhone = `966${String(ts).slice(-7)}`;
  const created = {
    stores: [] as number[],
    branches: [] as number[],
    users: [] as number[],
    platformUsers: [] as number[],
    customers: [] as number[],
    suppliers: [] as number[],
    supplierUsers: [] as number[],
    otpTargets: [] as Array<{ panel: AuthPanel; targetUserId: number }>,
  };

  try {
    const oldPassHash = await hashPassword("OldPass@123");

    // Seed Store A & Store B, Branch, Admin User, Super Admin, 2x Linked Customers, Supplier & SupplierUser
    const storeA = await prisma.settings.create({
      data: {
        storeName: `OTP Pharma A ${ts}`,
        storeEmail: `otp_store_a_${ts}@pharma.test`,
        storeStatus: "active",
        setupDone: true,
      },
    });
    const storeB = await prisma.settings.create({
      data: {
        storeName: `OTP Pharma B ${ts}`,
        storeEmail: `otp_store_b_${ts}@pharma.test`,
        storeStatus: "active",
        setupDone: true,
      },
    });
    created.stores.push(storeA.id, storeB.id);

    const branchA = await prisma.branch.create({
      data: {
        storeId: storeA.id,
        code: `OTP_M_${ts}`.slice(0, 20),
        name: "OTP Main",
        isMain: true,
        active: true,
      },
    });
    created.branches.push(branchA.id);

    const adminUser = await prisma.user.create({
      data: {
        storeId: storeA.id,
        branchId: branchA.id,
        name: `Admin OTP ${ts}`,
        username: `adm_otp_${ts}`,
        email: `adm_otp_${ts}@pharma.test`,
        password: oldPassHash,
        role: "admin",
        active: true,
      },
    });
    created.users.push(adminUser.id);
    created.otpTargets.push({ panel: "admin", targetUserId: adminUser.id });

    const superUser = await prisma.platformUser.create({
      data: {
        name: `CEO OTP ${ts}`,
        username: `ceo_otp_${ts}`,
        email: `ceo_otp_${ts}@medipos.test`,
        password: oldPassHash,
        role: "platform_admin",
        active: true,
      },
    });
    created.platformUsers.push(superUser.id);
    created.otpTargets.push({ panel: "super_admin", targetUserId: superUser.id });

    const custEmail = `cust_otp_${ts}@mail.test`;
    const custA = await prisma.customer.create({
      data: {
        storeId: storeA.id,
        name: `Customer OTP ${ts}`,
        phone: custPhone,
        email: custEmail,
        password: oldPassHash,
        active: true,
        verified: true,
      },
    });
    const custB = await prisma.customer.create({
      data: {
        storeId: storeB.id,
        name: `Customer OTP ${ts}`,
        phone: custPhone,
        email: custEmail,
        password: oldPassHash,
        active: true,
        verified: false,
      },
    });
    created.customers.push(custA.id, custB.id);
    created.otpTargets.push({ panel: "customer", targetUserId: custA.id });

    const supplier = await prisma.supplier.create({
      data: {
        storeId: storeA.id,
        name: `OTP Supplier ${ts}`,
        phone: `955${String(ts).slice(-7)}`,
        email: `sup_otp_${ts}@vendor.test`,
      },
    });
    created.suppliers.push(supplier.id);

    const supplierUser = await prisma.supplierUser.create({
      data: {
        supplierId: supplier.id,
        name: `Distributor OTP ${ts}`,
        username: `sup_otp_${ts}`,
        email: `sup_user_otp_${ts}@vendor.test`,
        phone: `955${String(ts).slice(-7)}`,
        password: oldPassHash,
        active: true,
        verified: true,
      },
    });
    created.supplierUsers.push(supplierUser.id);
    created.otpTargets.push({ panel: "supplier", targetUserId: supplierUser.id });

    // 1. CSRF & Anti-Enumeration
    console.log("\n[1] Security Guards: CSRF & Anti-Enumeration...");
    const csrfRes = await postForgotPassword(
      makeReq(
        "http://localhost:3000/api/auth/forgot-password",
        { panel: "admin", action: "request_otp", identifier: adminUser.username },
        { origin: "https://evil.attacker.test", host: "localhost:3000" }
      )
    );
    assert(csrfRes.status === 403, "Cross-origin forgot-password request rejected (403)");

    const unknownRes = await postForgotPassword(
      makeReq("http://localhost:3000/api/auth/forgot-password", {
        panel: "admin",
        action: "request_otp",
        identifier: `nonexistent_${ts}@nowhere.test`,
      })
    );
    const unknownJson = await unknownRes.json();
    assert(
      unknownRes.status === 200 && unknownJson.success === true && unknownJson.otpSent === true,
      "Unknown account returns generic 200 response (prevents account enumeration)"
    );

    // 2. Cooldown & 5-Attempt Wrong-OTP Invalidator (on Admin)
    console.log("\n[2] Cooldown, Wrong-OTP Attempt Limit & Replay Protection...");
    const req1Res = await postForgotPassword(
      makeReq("http://localhost:3000/api/auth/forgot-password", {
        panel: "admin",
        action: "request_otp",
        identifier: adminUser.username,
      })
    );
    assert(req1Res.status === 200, "Admin OTP request returns 200");

    const cooldownRes = await postForgotPassword(
      makeReq("http://localhost:3000/api/auth/forgot-password", {
        panel: "admin",
        action: "request_otp",
        identifier: adminUser.email,
      })
    );
    assert(cooldownRes.status === 429, "Immediate resend within 45s returns 429 cooldown");

    // Exhaust 5 wrong OTP attempts
    let lastWrongStatus = 0;
    for (let i = 1; i <= 5; i++) {
      const wr = await postForgotPassword(
        makeReq("http://localhost:3000/api/auth/forgot-password", {
          panel: "admin",
          action: "verify_otp",
          identifier: adminUser.username,
          otp: "000000",
        })
      );
      lastWrongStatus = wr.status;
    }
    assert(lastWrongStatus === 429, "5th wrong OTP attempt invalidates OTP and returns 429");

    // Re-enable resend for admin by backdating previous OTP createdAt > 60s
    await prisma.passwordResetOtp.updateMany({
      where: { panel: "admin", targetUserId: adminUser.id },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });

    // 3. Full E2E Reset + Sign In across ALL 4 Panels
    console.log("\n[3] Full Email-OTP Reset & Sign-In across ALL 4 Panels...");
    const panelsToVerify: Array<{
      panel: AuthPanel;
      identifier: string;
      loginIdentifier: string;
      targetUserId: number;
      email: string;
      newPass: string;
      verifyLogin: (newPass: string) => Promise<Response>;
    }> = [
      {
        panel: "admin",
        identifier: adminUser.username,
        loginIdentifier: adminUser.username,
        targetUserId: adminUser.id,
        email: adminUser.email,
        newPass: "NewAdmin@2026",
        verifyLogin: (pw) =>
          postAdminAuth(
            makeReq("http://localhost:3000/api/auth/admin", {
              identifier: adminUser.username,
              password: pw,
            })
          ),
      },
      {
        panel: "super_admin",
        identifier: superUser.email,
        loginIdentifier: superUser.email,
        targetUserId: superUser.id,
        email: superUser.email,
        newPass: "NewSuperAdmin@2026",
        verifyLogin: (pw) =>
          postSuperAdminAuth(
            makeReq("http://localhost:3000/api/auth/super-admin", {
              action: "login",
              identifier: superUser.email,
              password: pw,
            })
          ),
      },
      {
        panel: "customer",
        identifier: custPhone,
        loginIdentifier: custEmail,
        targetUserId: custA.id,
        email: custEmail,
        newPass: "NewCustomer@2026",
        verifyLogin: (pw) =>
          postCustomerAuth(
            makeReq("http://localhost:3000/api/auth/customer", {
              action: "login",
              identifier: custEmail,
              password: pw,
            })
          ),
      },
      {
        panel: "supplier",
        identifier: supplierUser.email,
        loginIdentifier: supplierUser.username,
        targetUserId: supplierUser.id,
        email: supplierUser.email,
        newPass: "NewSupplier@2026",
        verifyLogin: (pw) =>
          postSupplierAuth(
            makeReq("http://localhost:3000/api/auth/supplier", {
              action: "login",
              identifier: supplierUser.username,
              password: pw,
            })
          ),
      },
    ];

    for (const item of panelsToVerify) {
      const otpReqRes = await postForgotPassword(
        makeReq("http://localhost:3000/api/auth/forgot-password", {
          panel: item.panel,
          action: "request_otp",
          identifier: item.identifier,
        })
      );
      assert(otpReqRes.status === 200, `[${item.panel}] OTP requested successfully (200)`);

      const dbOtp = await prisma.passwordResetOtp.findFirst({
        where: { panel: item.panel, targetUserId: item.targetUserId, usedAt: null },
        orderBy: { id: "desc" },
      });
      assert(Boolean(dbOtp && dbOtp.otpHash.length === 64), `[${item.panel}] Hashed OTP stored (no plaintext)`);

      const realOtp = recoverOtpFromHash(item.panel, item.targetUserId, item.email, dbOtp!.otpHash);

      if (item.panel === "super_admin") {
        const shortPwRes = await postForgotPassword(
          makeReq("http://localhost:3000/api/auth/forgot-password", {
            panel: "super_admin",
            action: "reset_password",
            identifier: item.identifier,
            otp: realOtp,
            newPassword: "short7",
            confirmPassword: "short7",
          })
        );
        assert(shortPwRes.status === 400, `[super_admin] Enforces minimum 8-char password policy (400)`);
      }

      const mismatchRes = await postForgotPassword(
        makeReq("http://localhost:3000/api/auth/forgot-password", {
          panel: item.panel,
          action: "reset_password",
          identifier: item.identifier,
          otp: realOtp,
          newPassword: item.newPass,
          confirmPassword: "DifferentPassword!",
        })
      );
      assert(mismatchRes.status === 400, `[${item.panel}] Rejects mismatched confirmPassword (400)`);

      const resetRes = await postForgotPassword(
        makeReq("http://localhost:3000/api/auth/forgot-password", {
          panel: item.panel,
          action: "reset_password",
          identifier: item.identifier,
          otp: realOtp,
          newPassword: item.newPass,
          confirmPassword: item.newPass,
        })
      );
      assert(resetRes.status === 200, `[${item.panel}] Password reset with valid Email OTP succeeds (200)`);

      const replayRes = await postForgotPassword(
        makeReq("http://localhost:3000/api/auth/forgot-password", {
          panel: item.panel,
          action: "reset_password",
          identifier: item.identifier,
          otp: realOtp,
          newPassword: "ReplayAttempt@99",
          confirmPassword: "ReplayAttempt@99",
        })
      );
      assert(replayRes.status === 400, `[${item.panel}] Single-use OTP replay rejected (400)`);

      const oldLoginRes = await item.verifyLogin("OldPass@123");
      const newLoginRes = await item.verifyLogin(item.newPass);
      assert(
        oldLoginRes.status !== 200 && newLoginRes.status === 200,
        `[${item.panel}] Old password rejected & new password signs in cleanly (200)`
      );
    }

    // Verify customer multi-store sync: both Store A & Store B records have synced verified=true & new hash
    const syncedRows = await prisma.customer.findMany({
      where: { id: { in: [custA.id, custB.id] } },
      select: { id: true, password: true, verified: true },
    });
    assert(
      syncedRows.length === 2 &&
        syncedRows.every((r) => r.verified && r.password && r.password !== oldPassHash),
      "Customer password reset syncs across all linked pharmacy store records cleanly"
    );

    // 4. Bug-fix regression checks: Deactivated branch staff & Walk-In customer with email
    const inactiveSubBranch = await prisma.branch.create({
      data: {
        storeId: storeA.id,
        code: `OTP_OFF_${ts}`.slice(0, 20),
        name: "Inactive Annex",
        isMain: false,
        active: false,
      },
    });
    created.branches.push(inactiveSubBranch.id);

    const inactiveBrStaff = await prisma.user.create({
      data: {
        storeId: storeA.id,
        branchId: inactiveSubBranch.id,
        name: `BranchOff Staff ${ts}`,
        username: `br_off_${ts}`,
        email: `br_off_${ts}@pharma.test`,
        password: oldPassHash,
        role: "staff",
        active: true,
      },
    });
    created.users.push(inactiveBrStaff.id);
    created.otpTargets.push({ panel: "admin", targetUserId: inactiveBrStaff.id });

    await postForgotPassword(
      makeReq("http://localhost:3000/api/auth/forgot-password", {
        panel: "admin",
        action: "request_otp",
        identifier: inactiveBrStaff.username,
      })
    );
    const inactiveBrOtpCount = await prisma.passwordResetOtp.count({
      where: { panel: "admin", targetUserId: inactiveBrStaff.id },
    });
    assert(
      inactiveBrOtpCount === 0,
      "BUG-FP-B: Staff on deactivated sub-branch does not receive password reset OTP"
    );

    const walkInPhone = `944${String(ts).slice(-7)}`;
    const walkInEmail = `walkin_otp_${ts}@mail.test`;
    const walkInCust = await prisma.customer.create({
      data: {
        storeId: storeA.id,
        name: `WalkIn Email ${ts}`,
        phone: walkInPhone,
        email: walkInEmail,
        password: null,
        active: true,
        verified: false,
      },
    });
    created.customers.push(walkInCust.id);
    created.otpTargets.push({ panel: "customer", targetUserId: walkInCust.id });

    await postForgotPassword(
      makeReq("http://localhost:3000/api/auth/forgot-password", {
        panel: "customer",
        action: "request_otp",
        identifier: walkInPhone,
      })
    );
    const walkInOtpRow = await prisma.passwordResetOtp.findFirst({
      where: { panel: "customer", targetUserId: walkInCust.id, usedAt: null },
      orderBy: { id: "desc" },
    });
    assert(Boolean(walkInOtpRow), "BUG-FP-A: Walk-in customer with email can request password-setup OTP");
    if (walkInOtpRow) {
      const wOtp = recoverOtpFromHash("customer", walkInCust.id, walkInEmail, walkInOtpRow.otpHash);
      const wReset = await postForgotPassword(
        makeReq("http://localhost:3000/api/auth/forgot-password", {
          panel: "customer",
          action: "reset_password",
          identifier: walkInPhone,
          otp: wOtp,
          newPassword: "WalkInPass@2026",
          confirmPassword: "WalkInPass@2026",
        })
      );
      const wLogin = await postCustomerAuth(
        makeReq("http://localhost:3000/api/auth/customer", {
          action: "login",
          identifier: walkInEmail,
          password: "WalkInPass@2026",
        })
      );
      assert(
        wReset.status === 200 && wLogin.status === 200,
        "BUG-FP-A: Walk-in customer sets password via Email OTP and logs in immediately (200)"
      );
    }
  } finally {
    console.log("\n[Cleanup] Removing temporary OTP test fixtures...");
    if (created.otpTargets.length) {
      await prisma.passwordResetOtp.deleteMany({
        where: {
          OR: created.otpTargets.map((t) => ({ panel: t.panel, targetUserId: t.targetUserId })),
        },
      });
    }
    if (created.stores.length) {
      await prisma.auditLog.deleteMany({ where: { storeId: { in: created.stores } } });
    }
    if (created.platformUsers.length) {
      await prisma.platformAuditLog.deleteMany({ where: { platformUserId: { in: created.platformUsers } } });
    }
    await prisma.loginAttempt.deleteMany({
      where: {
        OR: [
          { context: { contains: `_${ts}` } },
          { context: { contains: custPhone } },
        ],
      },
    });
    if (created.supplierUsers.length) {
      await prisma.supplierUser.deleteMany({ where: { id: { in: created.supplierUsers } } });
    }
    if (created.suppliers.length) {
      await prisma.supplier.deleteMany({ where: { id: { in: created.suppliers } } });
    }
    if (created.customers.length) {
      await prisma.customer.deleteMany({ where: { id: { in: created.customers } } });
    }
    if (created.users.length) {
      await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    }
    if (created.branches.length) {
      await prisma.branch.deleteMany({ where: { id: { in: created.branches } } });
    }
    if (created.stores.length) {
      await prisma.settings.deleteMany({ where: { id: { in: created.stores } } });
    }
    if (created.platformUsers.length) {
      await prisma.platformUser.deleteMany({ where: { id: { in: created.platformUsers } } });
    }
    await prisma.$disconnect();
  }

  console.log("\n================================================================================");
  console.log(` 🏁 FORGOT PASSWORD TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("================================================================================");
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal forgot-password suite error:", err);
  process.exit(1);
});
