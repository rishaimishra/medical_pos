/**
 * Integration Test Suite for MODULES 3.5 & 3.6 (Live Razorpay Test API + Entitlements & Quotas):
 * - 3.5.1: Live Razorpay REST Plan Sync (`POST /v1/plans`), Immutable Version Bump, Bulk Reconcile (`GET /v1/plans`)
 * - 3.5.2: Live Razorpay Checkout Initiation (`POST /v1/orders` & `/v1/subscriptions`) + HMAC Verification + SUB-INV GST Invoice
 * - 3.5.3: Idempotent Razorpay Webhook Processor (`/api/webhooks/razorpay`) + Replay Protection + Payment Failure Grace + Refund
 * - 3.5.4: Manual Offline Payment Grant (`record_offline_payment`), Grace Extension & Refund Panel
 * - 3.6.1–3.6.4: Centralized Entitlement Engine, 402/403 Feature Gating Across Core/Report/Export/Portal Endpoints,
 *                Hard Quota Count Enforcement + `X-Quota-Warning`, Grace Period POS Continuity & Expired Compliance Read-Only
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import {
  CUSTOMER_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SUPER_ADMIN_COOKIE_NAME,
  SUPPLIER_COOKIE_NAME,
  createSessionToken,
  hashPassword,
  signCustomerToken,
  signSuperAdminToken,
  signSupplierToken,
} from "../src/lib/auth";
import { invalidateStoreEntitlements } from "../src/lib/entitlements";
import { getRazorpayCredentials, isRazorpayConfigured } from "../src/lib/razorpay";
import { POST as postPlan } from "../src/app/api/super-admin/plans/route";
import { PATCH as patchPlan } from "../src/app/api/super-admin/plans/[id]/route";
import { POST as postSyncRazorpay } from "../src/app/api/super-admin/plans/sync-razorpay/route";
import { PATCH as patchStoreLifecycle } from "../src/app/api/super-admin/stores/[id]/route";
import { GET as getBillingStatus } from "../src/app/api/admin/billing/status/route";
import { POST as postBillingCheckout } from "../src/app/api/admin/billing/checkout/route";
import { POST as postBillingVerify } from "../src/app/api/admin/billing/verify/route";
import { POST as postRazorpayWebhook } from "../src/app/api/webhooks/razorpay/route";
import { POST as postAdminBranch } from "../src/app/api/admin/branches/route";
import { POST as postAdminMedicine } from "../src/app/api/admin/medicines/route";
import { POST as postAdminSupplier } from "../src/app/api/admin/suppliers/route";
import { POST as postAdminPos } from "../src/app/api/admin/pos/route";
import { POST as postAdminDiscount } from "../src/app/api/admin/discounts/route";
import { GET as getGstReport } from "../src/app/api/admin/reports/gst/route";
import { GET as getGstExport } from "../src/app/api/admin/reports/gst/export/route";
import { GET as getSalesSummary } from "../src/app/api/admin/reports/sales-summary/route";
import { GET as getSalesSummaryExport } from "../src/app/api/admin/reports/sales-summary/export/route";
import { GET as getCashDrawerSummary } from "../src/app/api/admin/cash-drawer/summary/route";
import { GET as getAdminAuditLogs } from "../src/app/api/admin/audit-logs/route";
import { GET as getAdminPrescriptions } from "../src/app/api/admin/prescriptions/route";
import { GET as getAdminPatientMsgs } from "../src/app/api/admin/patient-messages/route";
import { GET as getSupplierOrders } from "../src/app/api/supplier/orders/route";
import { GET as getCustomerPrescriptions } from "../src/app/api/customer/prescriptions/route";
import { GET as getCustomerMessages } from "../src/app/api/customer/messages/route";

// Load .env cleanly when run via tsx CLI directly
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath) && typeof (process as any).loadEnvFile === "function") {
  (process as any).loadEnvFile(envPath);
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

function makeReq(cookiePair: string, url: string, method = "GET", body?: any): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: {
      "Content-Type": "application/json",
      cookie: cookiePair,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function signWebhookBody(rawBody: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

async function main() {
  console.log("================================================================================");
  console.log(" 🧪 MODULES 3.5 & 3.6 INTEGRATION TEST SUITE (Live Razorpay API + Entitlements)");
  console.log("================================================================================");

  const ts = Date.now();
  const created = {
    platformUsers: [] as number[],
    stores: [] as number[],
    branches: [] as number[],
    users: [] as number[],
    suppliers: [] as number[],
    supplierUsers: [] as number[],
    customers: [] as number[],
    medicines: [] as number[],
    batches: [] as number[],
    sales: [] as number[],
    plans: [] as number[],
    subscriptions: [] as number[],
    payments: [] as number[],
    webhooks: [] as string[],
  };

  try {
    const creds = getRazorpayCredentials();
    assert(isRazorpayConfigured() && creds.keyId.startsWith("rzp_test_"), "Loaded Razorpay Test keys from .env");

    const pwHash = await hashPassword("TestPass@123");

    // Seed CEO PlatformUser
    const ceo = await prisma.platformUser.create({
      data: {
        name: `CEO M35 ${ts}`,
        username: `ceo_m35_${ts}`,
        email: `ceo_m35_${ts}@medipos.test`,
        password: pwHash,
        role: "ceo",
        active: true,
      },
    });
    created.platformUsers.push(ceo.id);

    const ceoToken = signSuperAdminToken({
      platformUserId: ceo.id,
      name: ceo.name,
      username: ceo.username,
      email: ceo.email,
      role: "ceo",
      issuedAt: Date.now(),
      lastActive: Date.now(),
    });
    const superCookie = `${SUPER_ADMIN_COOKIE_NAME}=${ceoToken}`;

    // Seed Store, Branch, Store Admin, Medicine, Batch, Supplier, Customer
    const store = await prisma.settings.create({
      data: {
        storeName: `Razorpay SaaS Pharma ${ts}`,
        storeAddress: "Camac Street",
        storePhone: "9830055443",
        storeEmail: `store_m35_${ts}@pharma.test`,
        ownerName: "Dr. Sen",
        ownerEmail: `owner_m35_${ts}@pharma.test`,
        storeGst: "19AAAAA0000A1Z5",
        storeDl: "WB-KOL-35",
        storeStatus: "active",
        setupDone: true,
      },
    });
    created.stores.push(store.id);

    const branch = await prisma.branch.create({
      data: {
        storeId: store.id,
        code: `BR_${ts}`.slice(0, 20),
        name: `Main Counter ${ts}`,
        isMain: true,
        active: true,
      },
    });
    created.branches.push(branch.id);

    const adminUser = await prisma.user.create({
      data: {
        storeId: store.id,
        branchId: branch.id,
        name: `Owner Admin ${ts}`,
        username: `adm_m35_${ts}`,
        email: `adm_m35_${ts}@pharma.test`,
        password: pwHash,
        role: "admin",
        active: true,
      },
    });
    created.users.push(adminUser.id);

    const adminToken = createSessionToken({
      userId: adminUser.id,
      username: adminUser.username,
      name: adminUser.name,
      email: adminUser.email,
      role: "admin",
      storeId: store.id,
      branchId: branch.id,
      permissions: [],
      allowedPages: ["*"],
      maxDiscountPercent: 100,
      issuedAt: Date.now(),
      lastActive: Date.now(),
    });
    const adminCookie = `${SESSION_COOKIE_NAME}=${adminToken}`;

    const seedMed = await prisma.medicine.create({
      data: {
        storeId: store.id,
        name: `ParaTest ${ts}`,
        company: "MedCorp",
        category: "Tablet",
        gstPercent: 12,
      },
    });
    created.medicines.push(seedMed.id);

    const seedBatch = await prisma.batch.create({
      data: {
        branchId: branch.id,
        medicineId: seedMed.id,
        batchNo: `B35-${ts}`,
        expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        quantity: 50,
        purchasePrice: 20,
        mrp: 30,
      },
    });
    created.batches.push(seedBatch.id);

    const sup = await prisma.supplier.create({
      data: {
        storeId: store.id,
        name: `Distro ${ts}`,
        phone: `911${String(ts).slice(-7)}`,
      },
    });
    created.suppliers.push(sup.id);

    const supUser = await prisma.supplierUser.create({
      data: {
        supplierId: sup.id,
        name: `Distro Login ${ts}`,
        username: `sup_m35_${ts}`,
        email: `sup_m35_${ts}@vendor.test`,
        password: pwHash,
        active: true,
        verified: true,
      },
    });
    created.supplierUsers.push(supUser.id);

    const supCookie = `${SUPPLIER_COOKIE_NAME}=${signSupplierToken({
      supplierUserId: supUser.id,
      supplierId: sup.id,
      username: supUser.username,
      name: supUser.name,
      companyName: sup.name,
      email: supUser.email,
      phone: sup.phone,
      issuedAt: Date.now(),
    })}`;

    const cust = await prisma.customer.create({
      data: {
        storeId: store.id,
        name: `Patient M35 ${ts}`,
        phone: `977${String(ts).slice(-7)}`,
        email: `pat_m35_${ts}@mail.test`,
        active: true,
        verified: true,
      },
    });
    created.customers.push(cust.id);

    const custCookie = `${CUSTOMER_COOKIE_NAME}=${signCustomerToken({
      customerId: cust.id,
      linkedCustomerIds: [cust.id],
      phone: cust.phone,
      name: cust.name,
      email: cust.email || "",
      address: null,
      issuedAt: Date.now(),
    })}`;

    console.log("\n[Module 3.5.1] Testing Live Razorpay Plan Sync & Immutable Versioning...");

    const createPlanRes = await postPlan(
      makeReq(superCookie, "http://localhost:3000/api/super-admin/plans", "POST", {
        code: `RZP_TEST_${ts}`,
        name: `Razorpay Growth ${ts}`,
        tagline: "Live test tier",
        billingCycle: "monthly",
        priceInr: 799,
        maxBranches: 1,
        maxStaffUsers: 5,
        maxMedicines: 2, // store already has 1
        maxSuppliers: 2, // store already has 1
        maxMonthlyInvoices: 2,
        maxRxStorageMb: 100,
        features: {
          multiBranchManagement: false,
          gstAndRegulatoryReports: false,
          advancedBiAndProfitReports: false,
          excelAndCsvExports: false,
          supplierPortalAndGrn: false,
          patientPortalAndRxQueue: false,
          twoWayMessagingInboxes: false,
          customDiscountsAndDayEndClose: false,
        },
      })
    );
    const createPlanJson = await createPlanRes.json();
    assert(createPlanRes.status === 201 && createPlanJson.success, "POST /plans creates local plan cleanly");
    const planId = createPlanJson.plan.id;
    created.plans.push(planId);
    const firstRzpPlanId = createPlanJson.plan.razorpayPlanId;
    assert(
      typeof firstRzpPlanId === "string" &&
        firstRzpPlanId.startsWith("plan_") &&
        createPlanJson.plan.razorpaySyncStatus === "synced",
      `Auto-synced plan to live Razorpay (${firstRzpPlanId})`
    );

    // Edit non-billing fields -> keeps same razorpayPlanId
    const quotaOnlyRes = await patchPlan(
      makeReq(superCookie, `http://localhost:3000/api/super-admin/plans/${planId}`, "PATCH", {
        maxStaffUsers: 6,
      }),
      { params: Promise.resolve({ id: String(planId) }) }
    );
    const quotaOnlyJson = await quotaOnlyRes.json();
    assert(
      quotaOnlyRes.status === 200 &&
        quotaOnlyJson.billingChanged === false &&
        quotaOnlyJson.plan.razorpayPlanId === firstRzpPlanId,
      "Editing limits preserves existing Razorpay plan_id (no spurious version created)"
    );

    // Edit priceInr -> creates NEW immutable Razorpay Plan ID
    const priceChangeRes = await patchPlan(
      makeReq(superCookie, `http://localhost:3000/api/super-admin/plans/${planId}`, "PATCH", {
        priceInr: 899,
      }),
      { params: Promise.resolve({ id: String(planId) }) }
    );
    const priceChangeJson = await priceChangeRes.json();
    assert(
      priceChangeRes.status === 200 &&
        priceChangeJson.billingChanged === true &&
        typeof priceChangeJson.plan.razorpayPlanId === "string" &&
        priceChangeJson.plan.razorpayPlanId.startsWith("plan_") &&
        priceChangeJson.plan.razorpayPlanId !== firstRzpPlanId &&
        priceChangeJson.plan.razorpaySyncStatus === "synced",
      `Changing price issues fresh immutable Razorpay plan version (${priceChangeJson.plan.razorpayPlanId})`
    );

    // Reconcile All against Razorpay GET /v1/plans
    const recRes = await postSyncRazorpay(
      makeReq(superCookie, "http://localhost:3000/api/super-admin/plans/sync-razorpay", "POST", {
        action: "reconcile_all",
      })
    );
    const recJson = await recRes.json();
    assert(
      recRes.status === 200 && recJson.totalRemotePlans >= 1 && recJson.failedCount === 0,
      `Reconcile All verified ${recJson.totalRemotePlans} remote Razorpay plan(s) with 0 failures`
    );

    console.log("\n[Module 3.5.2] Testing Live Razorpay Checkout Orders & Subscriptions + Crypto Verify...");

    // Flow B: One-time GST Order Checkout
    const orderCheckoutRes = await postBillingCheckout(
      makeReq(adminCookie, "http://localhost:3000/api/admin/billing/checkout", "POST", {
        planId,
        mode: "order",
      })
    );
    const orderCheckoutJson = await orderCheckoutRes.json();
    assert(
      orderCheckoutRes.status === 200 &&
        orderCheckoutJson.mode === "order" &&
        String(orderCheckoutJson.orderId).startsWith("order_") &&
        orderCheckoutJson.amountPaise === Math.round(899 * 1.18 * 100),
      `Flow B created live Razorpay Order (${orderCheckoutJson.orderId}) for GST-inclusive ${orderCheckoutJson.amountPaise} paise`
    );
    created.payments.push(orderCheckoutJson.paymentRecordId);

    // Reject invalid signature
    const badSigRes = await postBillingVerify(
      makeReq(adminCookie, "http://localhost:3000/api/admin/billing/verify", "POST", {
        planId,
        razorpay_order_id: orderCheckoutJson.orderId,
        razorpay_payment_id: `pay_test_${ts}_1`,
        razorpay_signature: "0000000000000000000000000000000000000000000000000000000000000000",
      })
    );
    assert(badSigRes.status === 400, "Verify rejects tampered Razorpay signature (400)");

    // Valid Order HMAC verification
    const simOrderPayId = `pay_ord_${ts}`;
    const validOrderSig = crypto
      .createHmac("sha256", creds.keySecret)
      .update(`${orderCheckoutJson.orderId}|${simOrderPayId}`)
      .digest("hex");

    const okOrdVerifyRes = await postBillingVerify(
      makeReq(adminCookie, "http://localhost:3000/api/admin/billing/verify", "POST", {
        planId,
        razorpay_order_id: orderCheckoutJson.orderId,
        razorpay_payment_id: simOrderPayId,
        razorpay_signature: validOrderSig,
      })
    );
    const okOrdVerifyJson = await okOrdVerifyRes.json();
    assert(
      okOrdVerifyRes.status === 200 &&
        okOrdVerifyJson.success &&
        okOrdVerifyJson.payment?.status === "captured" &&
        String(okOrdVerifyJson.invoiceNo).startsWith("SUB-INV-"),
      `Order verification captured payment & issued GST invoice (${okOrdVerifyJson.invoiceNo})`
    );
    if (okOrdVerifyJson.subscription?.id) created.subscriptions.push(okOrdVerifyJson.subscription.id);

    // Flow A: Auto-renewing Subscription Checkout
    const subCheckoutRes = await postBillingCheckout(
      makeReq(adminCookie, "http://localhost:3000/api/admin/billing/checkout", "POST", {
        planId,
        mode: "subscription",
      })
    );
    const subCheckoutJson = await subCheckoutRes.json();
    assert(
      subCheckoutRes.status === 200 &&
        subCheckoutJson.mode === "subscription" &&
        String(subCheckoutJson.subscriptionId).startsWith("sub_"),
      `Flow A created live Razorpay Subscription (${subCheckoutJson.subscriptionId})`
    );

    const simSubPayId = `pay_sub_${ts}`;
    const validSubSig = crypto
      .createHmac("sha256", creds.keySecret)
      .update(`${simSubPayId}|${subCheckoutJson.subscriptionId}`)
      .digest("hex");

    const okSubVerifyRes = await postBillingVerify(
      makeReq(adminCookie, "http://localhost:3000/api/admin/billing/verify", "POST", {
        planId,
        razorpay_subscription_id: subCheckoutJson.subscriptionId,
        razorpay_customer_id: subCheckoutJson.customerId,
        razorpay_payment_id: simSubPayId,
        razorpay_signature: validSubSig,
      })
    );
    const okSubVerifyJson = await okSubVerifyRes.json();
    assert(
      okSubVerifyRes.status === 200 &&
        okSubVerifyJson.subscription?.billingMode === "razorpay_subscription" &&
        okSubVerifyJson.subscription?.razorpaySubscriptionId === subCheckoutJson.subscriptionId,
      "Subscription verification activated auto-renew subscription cleanly"
    );
    if (okSubVerifyJson.subscription?.id) created.subscriptions.push(okSubVerifyJson.subscription.id);
    if (okSubVerifyJson.payment?.id) created.payments.push(okSubVerifyJson.payment.id);

    console.log("\n[Module 3.5.3] Testing Idempotent Razorpay Webhooks & Replay Protection...");

    // Reject bad webhook signature
    const badHookReq = new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": "invalid_hmac",
        "x-razorpay-event-id": `evt_bad_${ts}`,
      },
      body: JSON.stringify({ event: "subscription.charged" }),
    });
    const badHookRes = await postRazorpayWebhook(badHookReq);
    assert(badHookRes.status === 401, "Webhook rejects forged x-razorpay-signature (401)");

    // Valid subscription.charged renewal webhook
    const chargedEventId = `evt_charged_${ts}`;
    created.webhooks.push(chargedEventId);
    const chargedPayload = JSON.stringify({
      id: chargedEventId,
      event: "subscription.charged",
      payload: {
        subscription: {
          entity: {
            id: subCheckoutJson.subscriptionId,
            notes: { storeId: String(store.id), planId: String(planId) },
          },
        },
        payment: {
          entity: {
            id: `pay_ren_${ts}`,
            subscription_id: subCheckoutJson.subscriptionId,
            amount: 106082,
            method: "upi",
          },
        },
      },
    });

    const chargedRes = await postRazorpayWebhook(
      new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": signWebhookBody(chargedPayload, creds.webhookSecret),
          "x-razorpay-event-id": chargedEventId,
        },
        body: chargedPayload,
      })
    );
    const chargedJson = await chargedRes.json();
    assert(
      chargedRes.status === 200 && chargedJson.processed === true,
      "Webhook processed subscription.charged renewal transaction cleanly"
    );

    // Replay same event ID -> idempotent duplicate: true
    const replayRes = await postRazorpayWebhook(
      new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": signWebhookBody(chargedPayload, creds.webhookSecret),
          "x-razorpay-event-id": chargedEventId,
        },
        body: chargedPayload,
      })
    );
    const replayJson = await replayRes.json();
    const renewalPayCount = await prisma.subscriptionPayment.count({
      where: { razorpayPaymentId: `pay_ren_${ts}` },
    });
    assert(
      replayRes.status === 200 && replayJson.duplicate === true && renewalPayCount === 1,
      "Duplicate webhook delivery ignored idempotently (zero double-billing)"
    );

    console.log("\n[Module 3.6.1–3.6.4] Testing Feature Gating, Count Quotas & Lifecycle Protection...");

    // Store is currently ACTIVE on tight Starter-like plan -> test blocked paid features & count limits
    const billingStatusRes = await getBillingStatus(
      makeReq(adminCookie, "http://localhost:3000/api/admin/billing/status")
    );
    const billingStatusJson = await billingStatusRes.json();
    assert(
      billingStatusRes.status === 200 &&
        billingStatusJson.entitlements?.planCode === `RZP_TEST_${ts}` &&
        billingStatusJson.razorpayKeyId === creds.keyId,
      "GET /api/admin/billing/status exposes sanitized entitlements & public keyId only"
    );

    const brGateRes = await postAdminBranch(
      makeReq(adminCookie, "http://localhost:3000/api/admin/branches", "POST", {
        code: `BR2_${ts}`.slice(0, 20),
        name: "Blocked Branch",
      })
    );
    const brGateJson = await brGateRes.json();
    assert(
      brGateRes.status === 402 && brGateJson.upgradeRequired === true && brGateJson.featureKey === "multiBranchManagement",
      "POST /branches blocked with HTTP 402 when multiBranchManagement is false"
    );

    const gstRes = await getGstReport(makeReq(adminCookie, "http://localhost:3000/api/admin/reports/gst"));
    assert(gstRes.status === 402, "GET /reports/gst blocked (402) when gstAndRegulatoryReports disabled");

    const biRes = await getSalesSummary(makeReq(adminCookie, "http://localhost:3000/api/admin/reports/sales-summary"));
    assert(biRes.status === 402, "GET /reports/sales-summary blocked (402) when advancedBiAndProfitReports disabled");

    const expRes = await getSalesSummaryExport(
      makeReq(adminCookie, "http://localhost:3000/api/admin/reports/sales-summary/export")
    );
    assert(expRes.status === 402, "GET /reports/sales-summary/export blocked (402) when excelAndCsvExports disabled");

    const zRes = await getCashDrawerSummary(makeReq(adminCookie, "http://localhost:3000/api/admin/cash-drawer/summary"));
    assert(zRes.status === 402, "GET /cash-drawer/summary blocked (402) when customDiscountsAndDayEndClose disabled");

    const discRes = await postAdminDiscount(
      makeReq(adminCookie, "http://localhost:3000/api/admin/discounts", "POST", {
        name: "VIP",
        type: "percent",
        value: 5,
      })
    );
    assert(discRes.status === 402, "POST /discounts blocked (402) when customDiscountsAndDayEndClose disabled");

    const rxAdminRes = await getAdminPrescriptions(makeReq(adminCookie, "http://localhost:3000/api/admin/prescriptions"));
    assert(rxAdminRes.status === 402, "GET /admin/prescriptions blocked (402) when patientPortalAndRxQueue disabled");

    const inboxAdminRes = await getAdminPatientMsgs(makeReq(adminCookie, "http://localhost:3000/api/admin/patient-messages"));
    assert(inboxAdminRes.status === 402, "GET /admin/patient-messages blocked (402) when twoWayMessagingInboxes disabled");

    const supPortalRes = await getSupplierOrders(makeReq(supCookie, "http://localhost:3000/api/supplier/orders"));
    assert(supPortalRes.status === 403, "External GET /supplier/orders blocked with HTTP 403 when supplierPortalAndGrn disabled");

    const custRxRes = await getCustomerPrescriptions(makeReq(custCookie, "http://localhost:3000/api/customer/prescriptions"));
    assert(custRxRes.status === 403, "External GET /customer/prescriptions blocked with HTTP 403 when patientPortalAndRxQueue disabled");

    const custMsgRes = await getCustomerMessages(makeReq(custCookie, "http://localhost:3000/api/customer/messages"));
    assert(custMsgRes.status === 403, "External GET /customer/messages blocked with HTTP 403 when twoWayMessagingInboxes disabled");

    // Server-side Quota Count Limits (maxMedicines = 2, maxSuppliers = 2, maxMonthlyInvoices = 2)
    const med2Res = await postAdminMedicine(
      makeReq(adminCookie, "http://localhost:3000/api/admin/medicines", "POST", {
        name: `MedTwo ${ts}`,
        company: "MedCorp",
        category: "Tablet",
      })
    );
    const med2Json = await med2Res.json();
    assert(med2Res.status === 200 && med2Json.success, "POST /medicines succeeds for SKU 2/2");
    if (med2Json.data?.id) created.medicines.push(med2Json.data.id);

    const med3Res = await postAdminMedicine(
      makeReq(adminCookie, "http://localhost:3000/api/admin/medicines", "POST", {
        name: `MedThree ${ts}`,
        company: "MedCorp",
        category: "Tablet",
      })
    );
    const med3Json = await med3Res.json();
    assert(
      med3Res.status === 402 && med3Json.reason === "QUOTA_LIMIT_EXCEEDED" && med3Json.resource === "maxMedicines",
      "POST /medicines blocks SKU 3/2 with HTTP 402 QUOTA_LIMIT_EXCEEDED"
    );

    const sup2Res = await postAdminSupplier(
      makeReq(adminCookie, "http://localhost:3000/api/admin/suppliers", "POST", {
        name: `SupTwo ${ts}`,
        phone: `912${String(ts).slice(-7)}`,
      })
    );
    const sup2Json = await sup2Res.json();
    assert(sup2Res.status === 200 && sup2Json.success, "POST /suppliers succeeds for Vendor 2/2");
    if (sup2Json.supplier?.id) created.suppliers.push(sup2Json.supplier.id);

    const sup3Res = await postAdminSupplier(
      makeReq(adminCookie, "http://localhost:3000/api/admin/suppliers", "POST", {
        name: `SupThree ${ts}`,
        phone: `913${String(ts).slice(-7)}`,
      })
    );
    assert(sup3Res.status === 402, "POST /suppliers blocks Vendor 3/2 with HTTP 402 QUOTA_LIMIT_EXCEEDED");

    // POS Invoice Quota + X-Quota-Warning header
    const posPayload = {
      branchId: branch.id,
      paymentMethod: "cash",
      items: [{ batchId: seedBatch.id, quantity: 1 }],
    };
    const pos1 = await postAdminPos(makeReq(adminCookie, "http://localhost:3000/api/admin/pos", "POST", posPayload));
    const pos1Json = await pos1.json();
    assert(pos1.status === 200 && pos1Json.success, "POS invoice 1/2 succeeds");
    if (pos1Json.sale?.id) created.sales.push(pos1Json.sale.id);

    const pos2 = await postAdminPos(makeReq(adminCookie, "http://localhost:3000/api/admin/pos", "POST", posPayload));
    const pos2Json = await pos2.json();
    assert(
      pos2.status === 200 && pos2.headers.get("X-Quota-Warning") !== null,
      `POS invoice 2/2 succeeds & emits X-Quota-Warning (${pos2.headers.get("X-Quota-Warning")})`
    );
    if (pos2Json.sale?.id) created.sales.push(pos2Json.sale.id);

    const pos3 = await postAdminPos(makeReq(adminCookie, "http://localhost:3000/api/admin/pos", "POST", posPayload));
    assert(pos3.status === 402, "POS invoice 3/2 blocked with HTTP 402 QUOTA_LIMIT_EXCEEDED");

    // Test payment.failed webhook -> transitions Store to 7-day Grace Period where POS works uninterrupted!
    await patchPlan(
      makeReq(superCookie, `http://localhost:3000/api/super-admin/plans/${planId}`, "PATCH", {
        maxMonthlyInvoices: 25,
        features: { advancedBiAndProfitReports: true, excelAndCsvExports: true, auditAndBackupCompliance: true },
      }),
      { params: Promise.resolve({ id: String(planId) }) }
    );

    const failEventId = `evt_failed_${ts}`;
    created.webhooks.push(failEventId);
    const failPayload = JSON.stringify({
      id: failEventId,
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: `pay_fail_${ts}`,
            subscription_id: subCheckoutJson.subscriptionId,
            amount: 106082,
            error_description: "Insufficient funds in test card",
          },
        },
      },
    });
    const failHookRes = await postRazorpayWebhook(
      new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": signWebhookBody(failPayload, creds.webhookSecret),
          "x-razorpay-event-id": failEventId,
        },
        body: failPayload,
      })
    );
    assert(failHookRes.status === 200, "Webhook payment.failed sets 7-day grace_period");

    const posInGrace = await postAdminPos(makeReq(adminCookie, "http://localhost:3000/api/admin/pos", "POST", posPayload));
    const posInGraceJson = await posInGrace.json();
    assert(posInGrace.status === 200, "3.6.4 Grace Period: POS checkout stays open uninterrupted");
    if (posInGraceJson.sale?.id) created.sales.push(posInGraceJson.sale.id);

    const biInGrace = await getSalesSummary(makeReq(adminCookie, "http://localhost:3000/api/admin/reports/sales-summary"));
    assert(biInGrace.status === 402, "3.6.4 Grace Period: Non-core BI reports locked until renewal");

    // Module 3.5.4: Manual Offline Payment restores active status, and Refund marks refunded
    const offRes = await patchStoreLifecycle(
      makeReq(superCookie, `http://localhost:3000/api/super-admin/stores/${store.id}`, "PATCH", {
        action: "record_offline_payment",
        planId,
        amountSubtotal: 899,
        durationDays: 365,
        paymentMethod: "neft",
        referenceNo: `UTR-${ts}`,
      }),
      { params: Promise.resolve({ id: String(store.id) }) }
    );
    const offJson = await offRes.json();
    assert(
      offRes.status === 200 && offJson.payment?.paymentType === "manual_offline" && offJson.invoiceNo,
      `3.5.4 Offline NEFT payment recorded & issued GST invoice (${offJson.invoiceNo})`
    );
    if (offJson.payment?.id) created.payments.push(offJson.payment.id);

    const refRes = await patchStoreLifecycle(
      makeReq(superCookie, `http://localhost:3000/api/super-admin/stores/${store.id}`, "PATCH", {
        action: "mark_payment_refunded",
        paymentId: offJson.payment.id,
        reason: "Contract cancelled cleanly",
      }),
      { params: Promise.resolve({ id: String(store.id) }) }
    );
    const refJson = await refRes.json();
    assert(refRes.status === 200 && refJson.payment?.status === "refunded", "3.5.4 CEO marks payment refunded cleanly");

    // 3.6.4 Store Suspended / Expired Lockout -> POS blocked, Billing & Compliance Reads stay open
    await patchStoreLifecycle(
      makeReq(superCookie, `http://localhost:3000/api/super-admin/stores/${store.id}`, "PATCH", {
        action: "set_status",
        storeStatus: "suspended",
        reason: "Non-payment lockout test",
      }),
      { params: Promise.resolve({ id: String(store.id) }) }
    );

    const posWhenSuspended = await postAdminPos(makeReq(adminCookie, "http://localhost:3000/api/admin/pos", "POST", posPayload));
    assert(posWhenSuspended.status === 402, "3.6.4 Hard Lockout: POS creation returns 402 when store is suspended");

    const auditWhenSuspended = await getAdminAuditLogs(makeReq(adminCookie, "http://localhost:3000/api/admin/audit-logs"));
    const gstExportWhenSuspended = await getGstExport(
      makeReq(adminCookie, "http://localhost:3000/api/admin/reports/gst/export")
    );
    const billingWhenSuspended = await getBillingStatus(
      makeReq(adminCookie, "http://localhost:3000/api/admin/billing/status")
    );
    assert(
      auditWhenSuspended.status === 200 &&
        gstExportWhenSuspended.status === 200 &&
        billingWhenSuspended.status === 200,
      "3.6.4 Hard Lockout: Billing recovery (/billing/status) & Compliance Exports (/audit-logs, /gst/export) remain accessible"
    );
  } finally {
    console.log("\n[Cleanup] Removing temporary test records...");
    if (created.webhooks.length) {
      await prisma.razorpayWebhookEvent.deleteMany({ where: { eventId: { in: created.webhooks } } });
    }
    if (created.stores.length) {
      await prisma.subscriptionPayment.deleteMany({ where: { storeId: { in: created.stores } } });
      await prisma.storeSubscription.deleteMany({ where: { storeId: { in: created.stores } } });
      await prisma.platformAuditLog.deleteMany({ where: { storeId: { in: created.stores } } });
      await prisma.auditLog.deleteMany({ where: { storeId: { in: created.stores } } });
    }
    if (created.platformUsers.length) {
      await prisma.platformAuditLog.deleteMany({ where: { platformUserId: { in: created.platformUsers } } });
    }
    if (created.sales.length) {
      await prisma.customerPurchaseLog.deleteMany({ where: { saleId: { in: created.sales } } });
      await prisma.saleItem.deleteMany({ where: { saleId: { in: created.sales } } });
      await prisma.sale.deleteMany({ where: { id: { in: created.sales } } });
    }
    if (created.batches.length || created.stores.length) {
      await prisma.stockAdjustment.deleteMany({
        where: {
          OR: [
            ...(created.batches.length ? [{ batchId: { in: created.batches } }] : []),
            ...(created.stores.length ? [{ medicine: { storeId: { in: created.stores } } }] : []),
          ],
        },
      });
    }
    if (created.batches.length) {
      await prisma.batch.deleteMany({ where: { id: { in: created.batches } } });
    }
    if (created.medicines.length) {
      await prisma.medicine.deleteMany({ where: { id: { in: created.medicines } } });
    }
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
    if (created.plans.length) {
      await prisma.subscriptionPlan.deleteMany({ where: { id: { in: created.plans } } });
    }
    if (created.platformUsers.length) {
      await prisma.platformUser.deleteMany({ where: { id: { in: created.platformUsers } } });
    }
    // Sweep any leftover test rows from interrupted runs
    const staleStores = await prisma.settings.findMany({
      where: { storeName: { startsWith: "Razorpay SaaS Pharma " } },
      select: { id: true },
    });
    if (staleStores.length) {
      const sIds = staleStores.map((s) => s.id);
      const staleBranches = await prisma.branch.findMany({ where: { storeId: { in: sIds } }, select: { id: true } });
      const bIds = staleBranches.map((b) => b.id);
      await prisma.stockAdjustment.deleteMany({
        where: {
          OR: [
            { medicine: { storeId: { in: sIds } } },
            ...(bIds.length ? [{ batch: { branchId: { in: bIds } } }] : []),
          ],
        },
      });
      await prisma.saleItem.deleteMany({ where: { medicine: { storeId: { in: sIds } } } });
      if (bIds.length) {
        await prisma.sale.deleteMany({ where: { branchId: { in: bIds } } });
        await prisma.batch.deleteMany({ where: { branchId: { in: bIds } } });
      }
      await prisma.medicine.deleteMany({ where: { storeId: { in: sIds } } });
      await prisma.settings.deleteMany({ where: { id: { in: sIds } } });
    }
    await prisma.subscriptionPlan.deleteMany({ where: { code: { startsWith: "RZP_TEST_" } } });
    await prisma.platformUser.deleteMany({ where: { username: { startsWith: "ceo_m35_" } } });
    invalidateStoreEntitlements();
    await prisma.$disconnect();
  }

  console.log("\n================================================================================");
  console.log(` 🏁 TEST SUMMARY: ${passedTests} Passed, ${failedTests} Failed`);
  console.log("================================================================================");
  if (failedTests > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
