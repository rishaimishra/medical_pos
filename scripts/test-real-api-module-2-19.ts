/**
 * Integration Test Suite for MODULE 2.19: Customer Portal Account Lifecycle & Return Requests
 *
 * - 2.19.1: Self-Registration With Mandatory Email Verification, Resend Verify,
 *           Unverified Login Block & Brute-Force Lockout
 * - 2.19.2: Customer Return Request From Portal (requestedBy="customer", IDOR isolation,
 *           already-returned guard, staff approval in /api/admin/returns/[id] with batch restock)
 * - 2.19.3: Profile Editing, Change Password & Forgot-Password Store Contact Info
 */

import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { createSessionToken, hashPassword } from "../src/lib/auth";
import { GET as customerAuthGet, POST as customerAuthPost } from "../src/app/api/auth/customer/route";
import { GET as customerVerifyGet } from "../src/app/api/auth/customer/verify/route";
import {
  GET as getCustomerReturns,
  POST as postCustomerReturn,
} from "../src/app/api/customer/returns/route";
import { GET as getCustomerOrders } from "../src/app/api/customer/orders/route";
import {
  GET as getCustomerProfile,
  PATCH as patchCustomerProfile,
} from "../src/app/api/customer/profile/route";
import { PATCH as patchAdminReturn } from "../src/app/api/admin/returns/[id]/route";
import { GET as getAdminNotifications } from "../src/app/api/admin/notifications/route";

let adminCookie = "";
let customerCookie = "";

function adminReq(url: string, method = "GET", body?: any): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(adminCookie ? { cookie: `med_pos_admin_session=${adminCookie}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function customerReq(url: string, method = "GET", body?: any): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(customerCookie ? { cookie: `med_pos_customer_session=${customerCookie}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
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
  console.log("INTEGRATION TEST SUITE: MODULE 2.19 (CUSTOMER LIFECYCLE, VERIFY & RETURNS)");
  console.log("================================================================================");

  const runId = Math.floor(Math.random() * 900000) + 100000;
  const storeRow = await prisma.settings.findFirst({ orderBy: { id: "asc" } });
  const storeId = storeRow?.id || 1;

  let branchId = 0;
  let staffId = 0;
  let regCustId = 0;
  let otherCustId = 0;
  let lockCustId = 0;
  let medId = 0;
  let batchId = 0;
  const createdSaleIds: number[] = [];
  const createdReturnIds: number[] = [];

  try {
    const branch = await prisma.branch.create({
      data: {
        code: `L${runId.toString().slice(-4)}`,
        name: `Lifecycle Branch ${runId}`,
        storeId,
        active: true,
      },
    });
    branchId = branch.id;

    const staffHash = await hashPassword("Staff@123");
    const staff = await prisma.user.create({
      data: {
        name: `Staff 2.19 ${runId}`,
        username: `stf219_${runId}`,
        email: `stf219_${runId}@pharmacy.local`,
        password: staffHash,
        role: "manager",
        permissions: JSON.stringify(["manage_customers", "manage_medicines"]),
        branchId,
        storeId,
        active: true,
      },
    });
    staffId = staff.id;

    const ts = Date.now();
    adminCookie = createSessionToken({
      userId: staff.id,
      storeId,
      username: staff.username,
      name: staff.name,
      email: staff.email,
      role: "manager",
      branchId,
      permissions: ["manage_customers", "manage_medicines"],
      allowedPages: ["/admin/dashboard", "/admin/returns", "/admin/pos"],
      maxDiscountPercent: 50,
      issuedAt: ts,
      lastActive: ts,
    });

    // =========================================================================
    // [1] 2.19.1: SELF-REGISTRATION WITH MANDATORY EMAIL VERIFICATION & LOCKOUT
    // =========================================================================
    console.log("\n[1] Testing 2.19.1: Self-Registration, Verification, Resend & Lockout...");

    // Registration missing email -> 400
    const noEmailRes = await customerAuthPost(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          name: `Test Reg ${runId}`,
          phone: `96${runId}01`,
          password: "UserPass123",
        }),
      })
    );
    assert(noEmailRes.status === 400, "Registration missing mandatory email rejected (400)");

    // Registration with email -> 201 requiresVerification=true, no cookie
    const regEmail = `cust219_${runId}@patient.local`;
    const regPhone = `96${runId}01`;
    const regRes = await customerAuthPost(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          name: `Customer Reg ${runId}`,
          phone: regPhone,
          email: regEmail,
          address: "10 Baker St",
          password: "UserPass123",
        }),
      })
    );
    const regJson = await regRes.json();
    const regDb = await prisma.customer.findFirst({ where: { phone: regPhone } });
    regCustId = regDb?.id || 0;
    const firstToken = regDb?.verifyToken || "";

    assert(
      regRes.status === 201 &&
        regJson.requiresVerification === true &&
        regJson.authenticated === false &&
        !regRes.cookies.get("med_pos_customer_session") &&
        regDb?.verified === false &&
        firstToken.length > 20,
      "Self-registration sets verified=false, generates verifyToken, issues no session cookie"
    );

    // Unverified login attempt blocked (403)
    const unverifiedLoginRes = await customerAuthPost(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: regEmail, password: "UserPass123" }),
      })
    );
    const unverifiedLoginJson = await unverifiedLoginRes.json();
    assert(
      unverifiedLoginRes.status === 403 && unverifiedLoginJson.requiresVerification === true,
      "Unverified customer blocked from signing in (403 requiresVerification)"
    );

    // Resend Verification cooldown triggers 429 immediately (cannot bypass via body flag), and rotates token once cooldown elapses
    const cooldownRes = await customerAuthPost(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resend_verification",
          identifier: regEmail,
          bypassCooldownForTest: true,
        }),
      })
    );
    assert(cooldownRes.status === 429, "Immediate Resend Verification rate-limited by 60s cooldown (429, even if client sends bypass flag)");

    await prisma.customer.update({
      where: { id: regCustId },
      data: { verifySentAt: new Date(Date.now() - 120 * 1000) },
    });

    const resendRes = await customerAuthPost(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resend_verification",
          identifier: regEmail,
        }),
      })
    );
    const regAfterResend = await prisma.customer.findUnique({ where: { id: regCustId } });
    const rotatedToken = regAfterResend?.verifyToken || "";
    assert(
      resendRes.status === 200 && rotatedToken.length > 20 && rotatedToken !== firstToken,
      "Resend Verification rotates verifyToken cleanly"
    );

    // Bug 12 regression: self-registration cannot hijack/overwrite an existing walk-in customer's email
    const walkInWithEmail = await prisma.customer.create({
      data: {
        name: `WalkIn Existing ${runId}`,
        phone: `96${runId}78`,
        email: `walkin_orig_${runId}@patient.local`,
        active: true,
        verified: false,
      },
    });
    const hijackEmailRes = await customerAuthPost(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          name: "Attacker Name",
          phone: walkInWithEmail.phone,
          email: `attacker_${runId}@patient.local`,
          password: "UserPass123",
        }),
      })
    );
    await prisma.customer.delete({ where: { id: walkInWithEmail.id } });
    assert(
      hijackEmailRes.status === 409,
      "Self-registration blocked (409) when attempting to overwrite a walk-in customer's existing email"
    );

    // Verify via GET /api/auth/customer/verify?token=...
    const verifyRes = await customerVerifyGet(
      new NextRequest(
        `http://localhost:3000/api/auth/customer/verify?token=${encodeURIComponent(rotatedToken)}`,
        { headers: { accept: "application/json" } }
      )
    );
    const verifyJson = await verifyRes.json();
    const verifiedDb = await prisma.customer.findUnique({ where: { id: regCustId } });
    assert(
      verifyRes.status === 200 &&
        verifyJson.verified === true &&
        verifiedDb?.verified === true &&
        verifiedDb?.verifyToken === null,
      "Email verification endpoint marks account verified=true and clears verifyToken"
    );

    // Verified Login succeeds
    const loginRes = await customerAuthPost(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: regEmail, password: "UserPass123" }),
      })
    );
    customerCookie = loginRes.cookies.get("med_pos_customer_session")?.value || "";
    assert(loginRes.status === 200 && customerCookie.includes("."), "Verified customer signs in successfully");

    // Brute-Force Lockout on dedicated lockout test customer
    const lockPhone = `96${runId}99`;
    const lockCust = await prisma.customer.create({
      data: {
        name: `Lock Test ${runId}`,
        phone: lockPhone,
        email: `lock_${runId}@patient.local`,
        password: await hashPassword("CorrectPass9"),
        active: true,
        verified: true,
      },
    });
    lockCustId = lockCust.id;

    for (let attempt = 1; attempt <= 5; attempt++) {
      await customerAuthPost(
        new NextRequest("http://localhost:3000/api/auth/customer", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.99" },
          body: JSON.stringify({ identifier: lockPhone, password: "WrongPassword!" }),
        })
      );
    }
    const lockedRes = await customerAuthPost(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.99" },
        body: JSON.stringify({ identifier: lockPhone, password: "CorrectPass9" }),
      })
    );
    const lockedJson = await lockedRes.json();
    assert(
      lockedRes.status === 429 && lockedJson.lockedOut === true,
      "Customer brute-force protection locks login after 5 wrong password attempts (429)"
    );

    // =========================================================================
    // [2] 2.19.2: PORTAL RETURN REQUEST & STAFF APPROVAL WORKFLOW
    // =========================================================================
    console.log("\n[2] Testing 2.19.2: Customer Portal Return Request & Staff Approval...");

    const otherCust = await prisma.customer.create({
      data: {
        name: `Other Cust ${runId}`,
        phone: `96${runId}02`,
        email: `other_${runId}@patient.local`,
        active: true,
        verified: true,
      },
    });
    otherCustId = otherCust.id;

    const med = await prisma.medicine.create({
      data: {
        name: `RetMed ${runId}`,
        company: "BioPharma",
        category: "Tablet",
        hsnCode: "3004",
        gstPercent: 12,
      },
    });
    medId = med.id;

    const batch = await prisma.batch.create({
      data: {
        medicineId: medId,
        batchNo: `BRET-${runId}`,
        expiryDate: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000),
        quantity: 20,
        purchasePrice: 50,
        mrp: 100,
        branchId,
      },
    });
    batchId = batch.id;

    const todayUtc = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
    // Customer buys 4 units with 10% bill discount -> grandTotal = 360 (₹90/unit)
    const saleOwn = await prisma.sale.create({
      data: {
        invoiceNo: `INV-219A-${runId}`,
        customerId: regCustId,
        saleDate: todayUtc,
        totalAmount: 400,
        gstAmount: 0,
        discountAmount: 40,
        grandTotal: 360,
        paymentMethod: "cash",
        branchId,
        items: {
          create: {
            medicineId: medId,
            batchId,
            quantity: 4,
            mrp: 100,
            taxableBase: 400,
            gstPercent: 0,
            gstAmount: 0,
            price: 400,
          },
        },
      },
      include: { items: true },
    });
    const saleOther = await prisma.sale.create({
      data: {
        invoiceNo: `INV-219B-${runId}`,
        customerId: otherCustId,
        saleDate: todayUtc,
        totalAmount: 100,
        gstAmount: 0,
        grandTotal: 100,
        paymentMethod: "cash",
        branchId,
        items: {
          create: {
            medicineId: medId,
            batchId,
            quantity: 1,
            mrp: 100,
            taxableBase: 100,
            gstPercent: 0,
            gstAmount: 0,
            price: 100,
          },
        },
      },
      include: { items: true },
    });
    createdSaleIds.push(saleOwn.id, saleOther.id);

    // Cross-customer return blocked (404)
    const idorRetRes = await postCustomerReturn(
      customerReq("http://localhost:3000/api/customer/returns", "POST", {
        saleId: saleOther.id,
        reason: "Not mine",
        items: [{ saleItemId: saleOther.items[0].id, quantity: 1 }],
      })
    );
    assert(idorRetRes.status === 404, "Customer blocked from requesting return on another customer's invoice (404)");

    // Valid portal return for 2 units (discount proportional = 180)
    const retRes = await postCustomerReturn(
      customerReq("http://localhost:3000/api/customer/returns", "POST", {
        saleId: saleOwn.id,
        reason: "Doctor changed dose",
        refundMethod: "store_credit",
        items: [{ saleItemId: saleOwn.items[0].id, quantity: 2 }],
      })
    );
    const retJson = await retRes.json();
    const retId = retJson.return?.id;
    if (retId) createdReturnIds.push(retId);
    assert(
      retRes.status === 201 &&
        retJson.return?.status === "pending" &&
        retJson.return?.requestedBy === "customer" &&
        retJson.return?.refundAmount === 180,
      `Customer return request created as pending (requestedBy='customer', proportional refund ₹180)`
    );

    // Admin Notification Bell sees pending return
    const notifRes = await getAdminNotifications(
      adminReq(`http://localhost:3000/api/admin/notifications?branchId=${branchId}`)
    );
    const notifJson = await notifRes.json();
    assert(
      notifRes.status === 200 &&
        (notifJson.notifications || []).some((n: any) => n.type === "return" && n.href === "/admin/returns"),
      "Admin Bell surfaces customer return request under /admin/returns"
    );

    // Fractional / non-integer return qty blocked (400)
    const fracRetRes = await postCustomerReturn(
      customerReq("http://localhost:3000/api/customer/returns", "POST", {
        saleId: saleOwn.id,
        reason: "Half strip",
        items: [{ saleItemId: saleOwn.items[0].id, quantity: 0.5 }],
      })
    );
    assert(fracRetRes.status === 400, "Fractional return quantity (0.5) rejected (400)");

    // Excessive return qty > remaining 2 rejected (400)
    const overRetRes = await postCustomerReturn(
      customerReq("http://localhost:3000/api/customer/returns", "POST", {
        saleId: saleOwn.id,
        reason: "Too many",
        items: [{ saleItemId: saleOwn.items[0].id, quantity: 3 }],
      })
    );
    assert(overRetRes.status === 400, "Exceeding remaining returnable qty (3 > 2 left) blocked (400)");

    // Orders API exposes alreadyReturnedQty & remainingReturnableQty accurately
    const ordersRes = await getCustomerOrders(customerReq("http://localhost:3000/api/customer/orders"));
    const ordersJson = await ordersRes.json();
    const ownOrder = (ordersJson.orders || []).find((o: any) => o.id === saleOwn.id);
    const ownItem = ownOrder?.items?.[0];
    assert(
      ordersRes.status === 200 && ownItem?.alreadyReturnedQty === 2 && ownItem?.remainingReturnableQty === 2,
      "Orders API reports alreadyReturnedQty=2 and remainingReturnableQty=2 cleanly"
    );

    // Staff approves return via Admin Returns API -> processed + stock +2 restocked (20 -> 22)
    const approveRes = await patchAdminReturn(
      adminReq(`http://localhost:3000/api/admin/returns/${retId}`, "PATCH", { status: "processed" }),
      { params: Promise.resolve({ id: String(retId) }) }
    );
    const batchAfterApprove = await prisma.batch.findUnique({ where: { id: batchId } });
    const custRetListRes = await getCustomerReturns(
      customerReq("http://localhost:3000/api/customer/returns")
    );
    const custRetListJson = await custRetListRes.json();
    assert(
      approveRes.status === 200 &&
        batchAfterApprove?.quantity === 22 &&
        custRetListJson.returns?.[0]?.status === "processed",
      "Staff approves customer return -> batch stock incremented (+2 = 22) and customer sees status='processed'"
    );

    // =========================================================================
    // [3] 2.19.3: PROFILE EDIT, CHANGE PASSWORD & FORGOT-PASSWORD CONTACT
    // =========================================================================
    console.log("\n[3] Testing 2.19.3: Profile Management, Change Password & Store Contact...");

    const storeContactRes = await customerAuthGet(
      new NextRequest("http://localhost:3000/api/auth/customer?storeContact=1")
    );
    const storeContactJson = await storeContactRes.json();
    assert(
      storeContactRes.status === 200 && Boolean(storeContactJson.store?.name),
      "Public storeContact endpoint returns pharmacy contact info for forgot-password guidance"
    );

    const profRes = await getCustomerProfile(
      customerReq("http://localhost:3000/api/customer/profile")
    );
    const profJson = await profRes.json();
    assert(
      profRes.status === 200 && profJson.profile?.verified === true && Boolean(profJson.storeContact?.name),
      "Customer profile API returns verified status and storeContact"
    );

    // Duplicate email update blocked (409)
    const dupEmailRes = await patchCustomerProfile(
      customerReq("http://localhost:3000/api/customer/profile", "PATCH", {
        email: otherCust.email,
      })
    );
    assert(dupEmailRes.status === 409, "Updating profile to another customer's email rejected (409)");

    // Valid profile update
    const updProfRes = await patchCustomerProfile(
      customerReq("http://localhost:3000/api/customer/profile", "PATCH", {
        name: `Customer Updated ${runId}`,
        address: "99 MG Road",
        gender: "female",
        dob: "1992-05-15",
      })
    );
    const updProfJson = await updProfRes.json();
    assert(
      updProfRes.status === 200 &&
        updProfJson.profile?.name === `Customer Updated ${runId}` &&
        updProfJson.profile?.address === "99 MG Road" &&
        updProfJson.profile?.gender === "female",
      "Profile fields (name, address, gender, dob) updated cleanly"
    );

    // Bug 13 regression: changing email resets verified=false, clears cookie & invalidates old session token
    const newRegEmail = `cust219_changed_${runId}@patient.local`;
    const emailChangeRes = await patchCustomerProfile(
      customerReq("http://localhost:3000/api/customer/profile", "PATCH", {
        email: newRegEmail,
      })
    );
    const emailChangeJson = await emailChangeRes.json();
    const staleTokenCheckRes = await getCustomerProfile(
      customerReq("http://localhost:3000/api/customer/profile")
    );
    const afterEmailChangeDb = await prisma.customer.findUnique({ where: { id: regCustId } });
    assert(
      emailChangeRes.status === 200 &&
        emailChangeJson.requiresVerification === true &&
        afterEmailChangeDb?.verified === false &&
        staleTokenCheckRes.status === 401,
      "Changing profile email resets verified=false, requires re-verification & invalidates old session (401)"
    );

    // Re-verify updated email & sign back in for password change check
    await customerVerifyGet(
      new NextRequest(
        `http://localhost:3000/api/auth/customer/verify?token=${encodeURIComponent(afterEmailChangeDb?.verifyToken || "")}`,
        { headers: { accept: "application/json" } }
      )
    );
    const reloginRes = await customerAuthPost(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: newRegEmail, password: "UserPass123" }),
      })
    );
    customerCookie = reloginRes.cookies.get("med_pos_customer_session")?.value || "";

    // Wrong current password rejected (401)
    const wrongPwRes = await patchCustomerProfile(
      customerReq("http://localhost:3000/api/customer/profile", "PATCH", {
        action: "change_password",
        currentPassword: "NotMyPassword",
        newPassword: "NewStrongPass99",
      })
    );
    assert(wrongPwRes.status === 401, "Wrong current password rejected on password change (401)");

    // Valid password change + login verification with new password
    const goodPwRes = await patchCustomerProfile(
      customerReq("http://localhost:3000/api/customer/profile", "PATCH", {
        action: "change_password",
        currentPassword: "UserPass123",
        newPassword: "NewStrongPass99",
      })
    );
    const oldPwLoginRes = await customerAuthPost(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.55" },
        body: JSON.stringify({ identifier: newRegEmail, password: "UserPass123" }),
      })
    );
    const newPwLoginRes = await customerAuthPost(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.55" },
        body: JSON.stringify({ identifier: newRegEmail, password: "NewStrongPass99" }),
      })
    );
    assert(
      goodPwRes.status === 200 && oldPwLoginRes.status === 401 && newPwLoginRes.status === 200,
      "Password change succeeds: old password rejected (401) and new password signs in (200)"
    );
  } finally {
    console.log("\nCleaning up Module 2.19 test fixtures...");
    const custIds = [regCustId, otherCustId, lockCustId].filter(Boolean);
    if (custIds.length) {
      await prisma.customerPayment.deleteMany({ where: { customerId: { in: custIds } } });
    }
    if (createdReturnIds.length) {
      await prisma.returnItem.deleteMany({ where: { returnId: { in: createdReturnIds } } });
      await prisma.return.deleteMany({ where: { id: { in: createdReturnIds } } });
    }
    if (batchId) {
      await prisma.stockAdjustment.deleteMany({ where: { batchId } });
    }
    if (createdSaleIds.length) {
      await prisma.saleItem.deleteMany({ where: { saleId: { in: createdSaleIds } } });
      await prisma.sale.deleteMany({ where: { id: { in: createdSaleIds } } });
    }
    if (batchId) {
      await prisma.batch.deleteMany({ where: { id: batchId } });
    }
    if (medId) {
      await prisma.medicine.deleteMany({ where: { id: medId } });
    }
    await prisma.loginAttempt.deleteMany({
      where: {
        OR: [
          { context: { contains: String(runId) } },
          { context: "customer" },
        ],
      },
    });
    if (custIds.length) {
      await prisma.customer.deleteMany({ where: { id: { in: custIds } } });
    }
    if (staffId) {
      await prisma.auditLog.deleteMany({ where: { userId: staffId } });
      await prisma.user.deleteMany({ where: { id: staffId } });
    }
    if (branchId) {
      await prisma.auditLog.deleteMany({ where: { branchId } });
      await prisma.branch.deleteMany({ where: { id: branchId } });
    }
    await prisma.$disconnect();
  }

  console.log(`\nSUMMARY: ${passedTests} Passed, ${failedTests} Failed`);
  if (failedTests > 0) process.exit(1);
}

main().catch((err) => {
  console.error("FATAL TEST ERROR:", err);
  process.exit(1);
});
