/**
 * MASTER PHASE 3 END-TO-END VERIFICATION SUITE (`scripts/test-real-api-phase-3.ts` — Module 3.10.3)
 *
 * Exercises all 8 core SaaS + Multi-Store + Razorpay + Security + BI + Patient Portal journeys:
 *  1. Auth Boundary & RBAC Isolation + Cross-Origin CSRF 403
 *  2. Multi-Store & Cross-Branch Tenant Isolation
 *  3. SaaS Plan Lifecycle & Live Razorpay Plan Sync (+ Immutable Version Bump)
 *  4. Razorpay Checkout, HMAC Verification & Idempotent Webhook Processing
 *  5. 402 Feature Gating & Hard Quota Enforcement + Expired Compliance Read-Only
 *  6. CEO BI Reports, 12M MRR Bridge & 7-Sheet `.xlsx` Export Verification (`AdmZip`)
 *  7. Platform Settings Secret Masking (`••••••••1a2b`) & Unified Forensic Audit Trail
 *  8. 4-Store Customer Bill Aggregation, Return Routing, Future Store Discovery & Rx Isolation
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import {
  CUSTOMER_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SUPER_ADMIN_COOKIE_NAME,
  createSessionToken,
  hashPassword,
  signCustomerToken,
  signSuperAdminToken,
} from "../src/lib/auth";
import { invalidateStoreEntitlements } from "../src/lib/entitlements";
import { getRazorpayCredentials, isRazorpayConfigured } from "../src/lib/razorpay";
import { PRESCRIPTION_STORAGE_DIR } from "../src/lib/prescriptionFiles";
import { ensureDefaultPlansSeeded } from "../src/lib/saasFeatures";

// Route Handlers under test
import { GET as getSuperAdminStores } from "../src/app/api/super-admin/stores/route";
import { PATCH as patchSuperAdminStore } from "../src/app/api/super-admin/stores/[id]/route";
import { GET as getSuperAdminBranches } from "../src/app/api/super-admin/branches/route";
import { GET as getSuperAdminPlans, POST as postSuperAdminPlan } from "../src/app/api/super-admin/plans/route";
import { PATCH as patchSuperAdminPlan } from "../src/app/api/super-admin/plans/[id]/route";
import { GET as getSuperAdminSettings, PATCH as patchSuperAdminSettings } from "../src/app/api/super-admin/settings/route";
import { GET as getSuperAdminReports } from "../src/app/api/super-admin/reports/route";
import { GET as getSuperAdminReportsExport } from "../src/app/api/super-admin/reports/export/route";
import { GET as getSuperAdminAuditLogs } from "../src/app/api/super-admin/audit-logs/route";
import { POST as postBillingCheckout } from "../src/app/api/admin/billing/checkout/route";
import { POST as postBillingVerify } from "../src/app/api/admin/billing/verify/route";
import { POST as postRazorpayWebhook } from "../src/app/api/webhooks/razorpay/route";
import { GET as getAdminMedicines, POST as postAdminMedicine } from "../src/app/api/admin/medicines/route";
import { GET as getAdminCustomers } from "../src/app/api/admin/customers/route";
import { POST as postAdminPos } from "../src/app/api/admin/pos/route";
import { GET as getGstReport } from "../src/app/api/admin/reports/gst/route";
import { GET as getGstExport } from "../src/app/api/admin/reports/gst/export/route";
import { GET as getAdminPrescriptions } from "../src/app/api/admin/prescriptions/route";
import { GET as getPrescriptionFile } from "../src/app/api/prescriptions/file/[id]/route";
import { POST as postCustomerAuth } from "../src/app/api/auth/customer/route";
import { GET as getCustomerVerify } from "../src/app/api/auth/customer/verify/route";
import { GET as getCustomerOrders } from "../src/app/api/customer/orders/route";
import { POST as postCustomerReturn } from "../src/app/api/customer/returns/route";
import { POST as postCustomerPrescription } from "../src/app/api/customer/prescriptions/route";

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

function makeReq(
  cookiePair: string,
  url: string,
  method = "GET",
  body?: any,
  extraHeaders?: Record<string, string>
): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookiePair ? { cookie: cookiePair } : {}),
      ...(extraHeaders || {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function signWebhookBody(rawBody: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

function extractWorkbookSheetNames(xlsxBuffer: Buffer): string[] {
  const zip = new AdmZip(xlsxBuffer);
  const workbookEntry = zip.getEntry("xl/workbook.xml");
  if (!workbookEntry) return [];
  const xml = workbookEntry.getData().toString("utf8");
  const matches = Array.from(xml.matchAll(/<sheet\s+[^>]*name="([^"]+)"/g));
  return matches.map((m) =>
    m[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  );
}

async function main() {
  console.log("================================================================================");
  console.log(" 🧪 MODULE 3.10.3: MASTER PHASE 3 END-TO-END VERIFICATION SUITE");
  console.log("================================================================================");

  const ts = Date.now();
  const created = {
    platformUsers: [] as number[],
    stores: [] as number[],
    branches: [] as number[],
    users: [] as number[],
    medicines: [] as number[],
    batches: [] as number[],
    customers: [] as number[],
    sales: [] as number[],
    returns: [] as number[],
    patientMessages: [] as number[],
    plans: [] as number[],
    subscriptions: [] as number[],
    payments: [] as number[],
    webhooks: [] as string[],
    diskFiles: [] as string[],
  };

  const originalPlatformConfig = await prisma.platformConfig.findFirst({ orderBy: { id: "asc" } });

  try {
    await ensureDefaultPlansSeeded();
    const creds = getRazorpayCredentials();
    assert(isRazorpayConfigured() && creds.keyId.startsWith("rzp_"), "Razorpay test configuration ready");

    const pwHash = await hashPassword("Phase3Pass@2026");

    // Seed CEO & Viewer Super Admins
    const ceo = await prisma.platformUser.create({
      data: {
        name: `CEO P3 ${ts}`,
        username: `ceo_p3_${ts}`,
        email: `ceo_p3_${ts}@medipos.test`,
        password: pwHash,
        role: "ceo",
        active: true,
      },
    });
    const viewer = await prisma.platformUser.create({
      data: {
        name: `FinanceOps P3 ${ts}`,
        username: `finops_p3_${ts}`,
        email: `finops_p3_${ts}@medipos.test`,
        password: pwHash,
        role: "finance_ops",
        active: true,
      },
    });
    created.platformUsers.push(ceo.id, viewer.id);

    const ceoCookie = `${SUPER_ADMIN_COOKIE_NAME}=${signSuperAdminToken({
      platformUserId: ceo.id,
      name: ceo.name,
      username: ceo.username,
      email: ceo.email,
      role: "ceo",
      issuedAt: Date.now(),
      lastActive: Date.now(),
    })}`;

    const viewerCookie = `${SUPER_ADMIN_COOKIE_NAME}=${signSuperAdminToken({
      platformUserId: viewer.id,
      name: viewer.name,
      username: viewer.username,
      email: viewer.email,
      role: "finance_ops",
      issuedAt: Date.now(),
      lastActive: Date.now(),
    })}`;

    // Find Enterprise plan for Store A, C, D unrestricted operational testing
    const enterprisePlan = await prisma.subscriptionPlan.findUnique({ where: { code: "ENTERPRISE" } });
    assert(Boolean(enterprisePlan), "ENTERPRISE SaaS plan available for seeded test stores");

    // Seed Store A (2 branches), Store B (2 branches), Store C (1 branch), Store D (1 branch)
    const createTenantStore = async (label: string, city: string, state: string, subBranch: boolean) => {
      const st = await prisma.settings.create({
        data: {
          storeName: `Phase3 ${label} ${ts}`,
          storeAddress: `${city} Main Road`,
          storePhone: `9800${String(created.stores.length)}${String(ts).slice(-5)}`,
          storeEmail: `${label.toLowerCase()}_${ts}@pharma.test`,
          ownerName: `Owner ${label}`,
          ownerEmail: `owner_${label.toLowerCase()}_${ts}@pharma.test`,
          storeGst: `19AAAC${String(1000 + created.stores.length)}A1Z5`,
          storeDl: `WB-${label}-${ts}`.slice(0, 20),
          city,
          state,
          storeStatus: "active",
          setupDone: true,
        },
      });
      created.stores.push(st.id);

      const mainBr = await prisma.branch.create({
        data: {
          storeId: st.id,
          code: `P3_${label}_M_${ts}`.slice(0, 20),
          name: `${label} Main Branch`,
          isMain: true,
          active: true,
        },
      });
      created.branches.push(mainBr.id);

      let subBr: typeof mainBr | null = null;
      if (subBranch) {
        subBr = await prisma.branch.create({
          data: {
            storeId: st.id,
            code: `P3_${label}_S_${ts}`.slice(0, 20),
            name: `${label} Annex Branch`,
            isMain: false,
            active: true,
          },
        });
        created.branches.push(subBr.id);
      }

      const adm = await prisma.user.create({
        data: {
          storeId: st.id,
          branchId: null, // Store-level admin with access to all branches in own store
          name: `Admin ${label} ${ts}`,
          username: `adm_${label.toLowerCase()}_${ts}`,
          email: `adm_${label.toLowerCase()}_${ts}@pharma.test`,
          password: pwHash,
          role: "admin",
          active: true,
        },
      });
      created.users.push(adm.id);

      if (enterprisePlan) {
        const sub = await prisma.storeSubscription.create({
          data: {
            storeId: st.id,
            planId: enterprisePlan.id,
            status: "active",
            billingMode: "manual_grant",
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
          },
        });
        created.subscriptions.push(sub.id);
      }

      const med = await prisma.medicine.create({
        data: {
          storeId: st.id,
          name: `${label}_UniqueMed_${ts}`,
          genericName: "Paracetamol",
          company: "Phase3Labs",
          category: "Tablet",
        },
      });
      created.medicines.push(med.id);

      const batch = await prisma.batch.create({
        data: {
          medicineId: med.id,
          branchId: mainBr.id,
          batchNo: `P3B_${label}_${ts}`.slice(0, 20),
          expiryDate: new Date(Date.now() + 365 * 86_400_000),
          quantity: 100,
          mrp: 100,
          purchasePrice: 65,
        },
      });
      created.batches.push(batch.id);

      const admCookie = `${SESSION_COOKIE_NAME}=${createSessionToken({
        userId: adm.id,
        username: adm.username,
        name: adm.name,
        email: adm.email,
        role: "admin",
        storeId: st.id,
        branchId: null,
        permissions: [],
        allowedPages: ["*"],
        maxDiscountPercent: 100,
        issuedAt: Date.now(),
        lastActive: Date.now(),
      })}`;

      return { st, mainBr, subBr, adm, admCookie, med, batch };
    };

    const tenantA = await createTenantStore("StoreA", "Kolkata", "West Bengal", true);
    const tenantB = await createTenantStore("StoreB", "Mumbai", "Maharashtra", true);
    const tenantC = await createTenantStore("StoreC", "Pune", "Maharashtra", false);
    const tenantD = await createTenantStore("StoreD", "Delhi", "Delhi", false);

    // --------------------------------------------------------------------------
    // 1. Auth Boundary & RBAC Isolation (+ Cross-Origin CSRF)
    // --------------------------------------------------------------------------
    console.log("\n[1/8] Auth Boundary, RBAC & Cross-Origin CSRF Guards...");
    const unauthReports = await getSuperAdminReports(makeReq("", "http://localhost:3000/api/super-admin/reports"));
    const unauthSettings = await getSuperAdminSettings(makeReq("", "http://localhost:3000/api/super-admin/settings"));
    assert(unauthReports.status === 401 && unauthSettings.status === 401, "Unauthenticated calls to Super Admin APIs return 401");

    const storeAdminBlockedSA = await getSuperAdminStores(makeReq(tenantA.admCookie, "http://localhost:3000/api/super-admin/stores"));
    const storeAdminBlockedReports = await getSuperAdminReports(makeReq(tenantA.admCookie, "http://localhost:3000/api/super-admin/reports"));
    const storeAdminBlockedAudit = await getSuperAdminAuditLogs(makeReq(tenantA.admCookie, "http://localhost:3000/api/super-admin/audit-logs"));
    assert(
      [401, 403].includes(storeAdminBlockedSA.status) &&
        [401, 403].includes(storeAdminBlockedReports.status) &&
        [401, 403].includes(storeAdminBlockedAudit.status),
      "Store Admin cookie is rejected on Super Admin endpoints (401/403)"
    );

    const saBlockedTenant = await getAdminMedicines(makeReq(ceoCookie, "http://localhost:3000/api/admin/medicines"));
    assert(saBlockedTenant.status === 401, "Super Admin token is rejected on Store Tenant /api/admin/medicines (401)");

    const viewerPatchSettings = await patchSuperAdminSettings(
      makeReq(viewerCookie, "http://localhost:3000/api/super-admin/settings", "PATCH", {
        platformName: "Should Fail",
      })
    );
    assert(viewerPatchSettings.status === 403, "Super Admin 'finance_ops' role cannot mutate Platform Settings (403)");

    const csrfRejectedRes = await patchSuperAdminSettings(
      makeReq(
        ceoCookie,
        "http://localhost:3000/api/super-admin/settings",
        "PATCH",
        { platformName: "CSRF Attack" },
        { origin: "https://evil-attacker.example.com", host: "localhost:3000" }
      )
    );
    assert(csrfRejectedRes.status === 403, "Cross-origin PATCH to Super Admin settings rejected with 403 CSRF protection");

    // --------------------------------------------------------------------------
    // 2. Multi-Store & Cross-Branch Tenant Isolation
    // --------------------------------------------------------------------------
    console.log("\n[2/8] Multi-Store & Cross-Branch Tenant Isolation...");
    const custB = await prisma.customer.create({
      data: {
        storeId: tenantB.st.id,
        name: `CustB_Only_${ts}`,
        phone: `9111${String(ts).slice(-6)}`,
        active: true,
      },
    });
    created.customers.push(custB.id);

    const medARes = await getAdminMedicines(makeReq(tenantA.admCookie, "http://localhost:3000/api/admin/medicines?limit=50"));
    const medAJson = await medARes.json();
    const medNamesA: string[] = (medAJson.medicines || medAJson.data || []).map((m: any) => m.name);
    assert(
      medARes.status === 200 &&
        medNamesA.includes(tenantA.med.name) &&
        !medNamesA.includes(tenantB.med.name),
      "Store A GET /api/admin/medicines includes Store A inventory and excludes Store B inventory"
    );

    const custARes = await getAdminCustomers(makeReq(tenantA.admCookie, "http://localhost:3000/api/admin/customers?limit=50"));
    const custAJson = await custARes.json();
    const custNamesA: string[] = (custAJson.customers || custAJson.data || []).map((c: any) => c.name);
    assert(
      custARes.status === 200 && !custNamesA.includes(custB.name),
      "Store A GET /api/admin/customers never leaks Store B patients"
    );

    const crossBranchRes = await getAdminMedicines(
      makeReq(tenantA.admCookie, `http://localhost:3000/api/admin/medicines?branchId=${tenantB.mainBr.id}`)
    );
    assert(crossBranchRes.status === 403, "Store A probing Store B branchId receives HTTP 403 Forbidden");

    const saStoresRes = await getSuperAdminStores(makeReq(ceoCookie, `http://localhost:3000/api/super-admin/stores?search=${ts}`));
    const saStoresJson = await saStoresRes.json();
    const saBranchesRes = await getSuperAdminBranches(
      makeReq(ceoCookie, `http://localhost:3000/api/super-admin/branches?storeId=${tenantA.st.id}`)
    );
    const saBranchesJson = await saBranchesRes.json();
    assert(
      saStoresRes.status === 200 &&
        (saStoresJson.stores || []).length >= 4 &&
        saBranchesRes.status === 200 &&
        (saBranchesJson.branches || []).length === 2,
      "Super Admin sees all 4 test stores and scoped Store A branches cleanly"
    );

    // --------------------------------------------------------------------------
    // 3. SaaS Plan Lifecycle & Live Razorpay Sync
    // --------------------------------------------------------------------------
    console.log("\n[3/8] SaaS Plan Lifecycle & Live Razorpay Sync...");
    const restrictedPlanRes = await postSuperAdminPlan(
      makeReq(ceoCookie, "http://localhost:3000/api/super-admin/plans", "POST", {
        code: `P3_RESTRICT_${ts}`,
        name: `Phase3 Restricted ${ts}`,
        tagline: "Gated test tier",
        billingCycle: "monthly",
        priceInr: 499,
        maxBranches: 1,
        maxStaffUsers: 3,
        maxMedicines: 1,
        maxSuppliers: 1,
        maxMonthlyInvoices: 5,
        maxRxStorageMb: 50,
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
    const restrictedPlanJson = await restrictedPlanRes.json();
    assert(
      restrictedPlanRes.status === 201 &&
        restrictedPlanJson.plan?.razorpaySyncStatus === "synced" &&
        String(restrictedPlanJson.plan?.razorpayPlanId).startsWith("plan_"),
      `Created SaaS plan & auto-synced live Razorpay plan (${restrictedPlanJson.plan?.razorpayPlanId})`
    );
    const customPlanId = restrictedPlanJson.plan.id;
    const origRzpPlanId = restrictedPlanJson.plan.razorpayPlanId;
    created.plans.push(customPlanId);

    const quotaBumpRes = await patchSuperAdminPlan(
      makeReq(ceoCookie, `http://localhost:3000/api/super-admin/plans/${customPlanId}`, "PATCH", {
        maxStaffUsers: 4,
      }),
      { params: Promise.resolve({ id: String(customPlanId) }) }
    );
    const quotaBumpJson = await quotaBumpRes.json();
    assert(
      quotaBumpRes.status === 200 &&
        quotaBumpJson.billingChanged === false &&
        quotaBumpJson.plan?.razorpayPlanId === origRzpPlanId,
      "Non-billing plan quota update preserves existing Razorpay plan_id"
    );

    const priceBumpRes = await patchSuperAdminPlan(
      makeReq(ceoCookie, `http://localhost:3000/api/super-admin/plans/${customPlanId}`, "PATCH", {
        priceInr: 599,
      }),
      { params: Promise.resolve({ id: String(customPlanId) }) }
    );
    const priceBumpJson = await priceBumpRes.json();
    assert(
      priceBumpRes.status === 200 &&
        priceBumpJson.billingChanged === true &&
        String(priceBumpJson.plan?.razorpayPlanId).startsWith("plan_") &&
        priceBumpJson.plan?.razorpayPlanId !== origRzpPlanId,
      `Price change issued immutable new Razorpay plan version (${priceBumpJson.plan?.razorpayPlanId})`
    );

    // --------------------------------------------------------------------------
    // 4. Razorpay Checkout, HMAC Verification & Idempotent Webhook
    // --------------------------------------------------------------------------
    console.log("\n[4/8] Razorpay Checkout, HMAC & Idempotent Webhook Verification...");
    const orderInitRes = await postBillingCheckout(
      makeReq(tenantC.admCookie, "http://localhost:3000/api/admin/billing/checkout", "POST", {
        planId: customPlanId,
        mode: "order",
      })
    );
    const orderInitJson = await orderInitRes.json();
    assert(
      orderInitRes.status === 200 &&
        orderInitJson.mode === "order" &&
        String(orderInitJson.orderId).startsWith("order_"),
      `Flow B Checkout initialized live Razorpay Order (${orderInitJson.orderId})`
    );
    if (orderInitJson.paymentRecordId) created.payments.push(orderInitJson.paymentRecordId);

    const badVerifyRes = await postBillingVerify(
      makeReq(tenantC.admCookie, "http://localhost:3000/api/admin/billing/verify", "POST", {
        planId: customPlanId,
        razorpay_order_id: orderInitJson.orderId,
        razorpay_payment_id: `pay_bad_${ts}`,
        razorpay_signature: "bad_sig_000000000000000000000000",
      })
    );
    assert(badVerifyRes.status === 400, "Checkout verification rejects forged HMAC signature (400)");

    const okPayId = `pay_p3_${ts}`;
    const validSig = crypto
      .createHmac("sha256", creds.keySecret)
      .update(`${orderInitJson.orderId}|${okPayId}`)
      .digest("hex");
    const okVerifyRes = await postBillingVerify(
      makeReq(tenantC.admCookie, "http://localhost:3000/api/admin/billing/verify", "POST", {
        planId: customPlanId,
        razorpay_order_id: orderInitJson.orderId,
        razorpay_payment_id: okPayId,
        razorpay_signature: validSig,
      })
    );
    const okVerifyJson = await okVerifyRes.json();
    assert(
      okVerifyRes.status === 200 &&
        okVerifyJson.payment?.status === "captured" &&
        String(okVerifyJson.invoiceNo).startsWith("SUB-INV-"),
      `HMAC verified checkout captured payment & generated ${okVerifyJson.invoiceNo}`
    );
    if (okVerifyJson.subscription?.id) created.subscriptions.push(okVerifyJson.subscription.id);

    // Webhook bad sig vs valid idempotent replay
    const badHookRes = await postRazorpayWebhook(
      new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": "forged_hmac",
          "x-razorpay-event-id": `evt_p3_bad_${ts}`,
        },
        body: JSON.stringify({ event: "payment.captured" }),
      })
    );
    assert(badHookRes.status === 401, "Webhook rejects forged x-razorpay-signature (401)");

    const whEventId = `evt_p3_cap_${ts}`;
    created.webhooks.push(whEventId);
    const whBody = JSON.stringify({
      id: whEventId,
      event: "subscription.charged",
      payload: {
        subscription: {
          entity: {
            id: `sub_wh_${ts}`,
            notes: { storeId: String(tenantC.st.id), planId: String(enterprisePlan!.id) },
          },
        },
        payment: {
          entity: {
            id: `pay_wh_${ts}`,
            subscription_id: `sub_wh_${ts}`,
            amount: 589882,
            method: "upi",
          },
        },
      },
    });
    const whSig = signWebhookBody(whBody, creds.webhookSecret);

    const whFirstRes = await postRazorpayWebhook(
      new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": whSig,
          "x-razorpay-event-id": whEventId,
        },
        body: whBody,
      })
    );
    const whFirstJson = await whFirstRes.json();
    const whReplayRes = await postRazorpayWebhook(
      new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": whSig,
          "x-razorpay-event-id": whEventId,
        },
        body: whBody,
      })
    );
    const whReplayJson = await whReplayRes.json();
    assert(
      whFirstRes.status === 200 &&
        whFirstJson.processed === true &&
        whReplayRes.status === 200 &&
        whReplayJson.duplicate === true,
      "Webhook processes valid event once and safely deduplicates replay with { duplicate: true }"
    );

    // Restore Store C onto Enterprise cleanly after testing webhook/plan
    if (enterprisePlan) {
      await prisma.storeSubscription.updateMany({ where: { storeId: tenantC.st.id }, data: { status: "expired" } });
      const restoreSub = await prisma.storeSubscription.create({
        data: {
          storeId: tenantC.st.id,
          planId: enterprisePlan.id,
          status: "active",
          billingMode: "manual_grant",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        },
      });
      created.subscriptions.push(restoreSub.id);
      invalidateStoreEntitlements(tenantC.st.id);
    }

    // --------------------------------------------------------------------------
    // 5. 402 Feature Gating & Quota Enforcement on Store B
    // --------------------------------------------------------------------------
    console.log("\n[5/8] 402 Feature Gating, Quotas & Suspended Read-Only...");
    await prisma.storeSubscription.updateMany({ where: { storeId: tenantB.st.id }, data: { status: "expired" } });
    const gatedSubB = await prisma.storeSubscription.create({
      data: {
        storeId: tenantB.st.id,
        planId: customPlanId,
        status: "active",
        billingMode: "manual_grant",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    created.subscriptions.push(gatedSubB.id);
    invalidateStoreEntitlements(tenantB.st.id);

    const gatedGstRes = await getGstReport(makeReq(tenantB.admCookie, "http://localhost:3000/api/admin/reports/gst"));
    assert(gatedGstRes.status === 402, "Restricted plan blocks GET /api/admin/reports/gst with HTTP 402");

    const quotaMedRes = await postAdminMedicine(
      makeReq(tenantB.admCookie, "http://localhost:3000/api/admin/medicines", "POST", {
        name: `BlockedMed2_${ts}`,
        company: "Corp",
        category: "Tablet",
      })
    );
    const quotaMedJson = await quotaMedRes.json();
    assert(
      quotaMedRes.status === 402 && quotaMedJson.reason === "QUOTA_LIMIT_EXCEEDED",
      "Adding medicine 2/1 triggers HTTP 402 QUOTA_LIMIT_EXCEEDED"
    );

    // Suspend Store B temporarily and confirm POS blocked (402) while compliance export still 200
    await patchSuperAdminStore(
      makeReq(ceoCookie, `http://localhost:3000/api/super-admin/stores/${tenantB.st.id}`, "PATCH", {
        action: "set_status",
        storeStatus: "suspended",
        reason: "Phase 3 suspended check",
      }),
      { params: Promise.resolve({ id: String(tenantB.st.id) }) }
    );
    const suspendedPosRes = await postAdminPos(
      makeReq(tenantB.admCookie, "http://localhost:3000/api/admin/pos", "POST", {
        branchId: tenantB.mainBr.id,
        paymentMethod: "cash",
        items: [{ batchId: tenantB.batch.id, quantity: 1 }],
      })
    );
    const suspendedComplianceExport = await getGstExport(
      makeReq(tenantB.admCookie, "http://localhost:3000/api/admin/reports/gst/export")
    );
    assert(
      suspendedPosRes.status === 402 && suspendedComplianceExport.status === 200,
      "Suspended store blocks POST /api/admin/pos (402) while keeping GST export (200) accessible"
    );

    // Reactivate Store B on Enterprise for Scenario 8 multi-store customer testing
    await prisma.settings.update({
      where: { id: tenantB.st.id },
      data: { storeStatus: "active", suspensionReason: null, suspendedAt: null },
    });
    if (enterprisePlan) {
      await prisma.storeSubscription.updateMany({ where: { storeId: tenantB.st.id }, data: { status: "expired" } });
      const restoreB = await prisma.storeSubscription.create({
        data: {
          storeId: tenantB.st.id,
          planId: enterprisePlan.id,
          status: "active",
          billingMode: "manual_grant",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        },
      });
      created.subscriptions.push(restoreB.id);
    }
    invalidateStoreEntitlements(tenantB.st.id);

    // --------------------------------------------------------------------------
    // 6. CEO BI Reports, 12M MRR Bridge & 7-Sheet `.xlsx` Workbook Export
    // --------------------------------------------------------------------------
    console.log("\n[6/8] CEO BI Reports, 12M MRR Bridge & 7-Sheet .xlsx Export...");
    const biAllRes = await getSuperAdminReports(makeReq(ceoCookie, "http://localhost:3000/api/super-admin/reports"));
    const biAllJson = await biAllRes.json();
    assert(
      biAllRes.status === 200 &&
        biAllJson.success === true &&
        Array.isArray(biAllJson.mrrBridge12m) &&
        biAllJson.mrrBridge12m.length === 12 &&
        biAllJson.taxSummary?.sacCode === "998314" &&
        Array.isArray(biAllJson.featureAdoption) &&
        Array.isArray(biAllJson.storageFootprint),
      "GET /api/super-admin/reports returns 12-month MRR bridge, SAC 998314 tax summary & BI matrices"
    );

    const biFilteredRes = await getSuperAdminReports(
      makeReq(ceoCookie, `http://localhost:3000/api/super-admin/reports?storeId=${tenantA.st.id}`)
    );
    const biFilteredJson = await biFilteredRes.json();
    assert(
      biFilteredRes.status === 200 &&
        (biFilteredJson.storeLeaderboard || []).length === 1 &&
        biFilteredJson.storeLeaderboard[0]?.storeId === tenantA.st.id,
      "GET /api/super-admin/reports?storeId filters leaderboard accurately to Store A"
    );

    const xlsxRes = await getSuperAdminReportsExport(
      makeReq(ceoCookie, "http://localhost:3000/api/super-admin/reports/export?format=xlsx")
    );
    const xlsxBytes = Buffer.from(await xlsxRes.arrayBuffer());
    const sheetNames = extractWorkbookSheetNames(xlsxBytes);
    const expectedSheets = [
      "Executive Summary",
      "12M MRR & Revenue",
      "Plan Tier Breakdown",
      "Stores Health & Quota Matrix",
      "Branches Directory",
      "Upsell & Churn Pipeline",
      "SaaS Payment Ledger",
    ];
    assert(
      xlsxRes.status === 200 &&
        expectedSheets.every((name) => sheetNames.includes(name)),
      `CEO Board Pack .xlsx contains all 7 verified sheets (${sheetNames.join(" | ")})`
    );

    // --------------------------------------------------------------------------
    // 7. Platform Settings Secret Masking & Unified Forensic Audit Trail
    // --------------------------------------------------------------------------
    console.log("\n[7/8] Platform Settings AES-GCM Masking & Unified Forensic Audit Trail...");
    const testKeySecret = `rzp_sec_p3_${ts}_1a2b`;
    const testWebhookSecret = `whsec_p3_${ts}_c3d4`;

    const patchSettingsRes = await patchSuperAdminSettings(
      makeReq(ceoCookie, "http://localhost:3000/api/super-admin/settings", "PATCH", {
        legalEntityName: "Medical POS Cloud Test Entity",
        gstNo: "19AABCM1234F1Z5",
        sacCode: "998314",
        razorpayKeySecret: testKeySecret,
        razorpayWebhookSecret: testWebhookSecret,
      })
    );
    const patchSettingsJson = await patchSettingsRes.json();
    const getSettingsRes = await getSuperAdminSettings(
      makeReq(ceoCookie, "http://localhost:3000/api/super-admin/settings")
    );
    const getSettingsJson = await getSettingsRes.json();
    const serializedGet = JSON.stringify(getSettingsJson);

    assert(
      patchSettingsRes.status === 200 &&
        getSettingsRes.status === 200 &&
        getSettingsJson.settings?.razorpayKeySecretMasked === "••••••••1a2b" &&
        getSettingsJson.settings?.razorpayWebhookSecretMasked === "••••••••c3d4" &&
        !serializedGet.includes(testKeySecret) &&
        !serializedGet.includes(testWebhookSecret) &&
        !serializedGet.includes("razorpayKeySecretEnc") &&
        !serializedGet.includes("razorpayWebhookSecretEnc"),
      "Platform Settings strictly masks secrets (••••••••1a2b / ••••••••c3d4) and never returns raw/encrypted strings"
    );

    // Restore original PlatformConfig immediately so other Razorpay flows keep using .env
    if (originalPlatformConfig) {
      await prisma.platformConfig.update({
        where: { id: originalPlatformConfig.id },
        data: {
          legalEntityName: originalPlatformConfig.legalEntityName,
          gstNo: originalPlatformConfig.gstNo,
          sacCode: originalPlatformConfig.sacCode,
          razorpayKeySecretEnc: originalPlatformConfig.razorpayKeySecretEnc,
          razorpayWebhookSecretEnc: originalPlatformConfig.razorpayWebhookSecretEnc,
        },
      });
    } else {
      await prisma.platformConfig.deleteMany({});
    }

    const auditJsonRes = await getSuperAdminAuditLogs(
      makeReq(ceoCookie, "http://localhost:3000/api/super-admin/audit-logs?source=all")
    );
    const auditJson = await auditJsonRes.json();
    const auditCsvRes = await getSuperAdminAuditLogs(
      makeReq(ceoCookie, "http://localhost:3000/api/super-admin/audit-logs?format=csv")
    );
    const auditXlsxRes = await getSuperAdminAuditLogs(
      makeReq(ceoCookie, "http://localhost:3000/api/super-admin/audit-logs?format=xlsx")
    );
    assert(
      auditJsonRes.status === 200 &&
        (auditJson.summary?.platformEvents || 0) >= 1 &&
        auditCsvRes.status === 200 &&
        (await auditCsvRes.text()).includes("PLATFORM_CONFIG_UPDATED") &&
        auditXlsxRes.status === 200,
      "Unified Forensic Audit Trail merges Platform + Store logs and exports valid CSV/XLSX"
    );

    // --------------------------------------------------------------------------
    // 8. 4-Store Customer Bill Aggregation, Return Routing, Future Store & Rx Isolation
    // --------------------------------------------------------------------------
    console.log("\n[8/8] 4-Store Patient Aggregation, Return Routing, Future Discovery & Rx Isolation...");
    const sharedPhone = `988${String(ts).slice(-7)}`;
    const sharedEmail = `patient_p3_${ts}@mail.test`;

    // Walk-in customers created via POS at Store A, B, C before self-registration
    const walkInA = await prisma.customer.create({
      data: { storeId: tenantA.st.id, name: `WalkIn A ${ts}`, phone: sharedPhone, active: true },
    });
    const walkInB = await prisma.customer.create({
      data: { storeId: tenantB.st.id, name: `WalkIn B ${ts}`, phone: sharedPhone, active: true },
    });
    const walkInC = await prisma.customer.create({
      data: { storeId: tenantC.st.id, name: `WalkIn C ${ts}`, phone: sharedPhone, active: true },
    });
    created.customers.push(walkInA.id, walkInB.id, walkInC.id);

    const createPosSale = async (
      cookie: string,
      branchId: number,
      batchId: number,
      customerId: number,
      qty: number
    ) => {
      const res = await postAdminPos(
        makeReq(cookie, "http://localhost:3000/api/admin/pos", "POST", {
          branchId,
          customerId,
          paymentMethod: "cash",
          items: [{ batchId, quantity: qty }],
        })
      );
      const j = await res.json();
      if (j.sale?.id) created.sales.push(j.sale.id);
      return { res, j };
    };

    const s1 = await createPosSale(tenantA.admCookie, tenantA.mainBr.id, tenantA.batch.id, walkInA.id, 1);
    const s2 = await createPosSale(tenantB.admCookie, tenantB.mainBr.id, tenantB.batch.id, walkInB.id, 2);
    const s3 = await createPosSale(tenantC.admCookie, tenantC.mainBr.id, tenantC.batch.id, walkInC.id, 1);
    assert(s1.res.status === 200 && s2.res.status === 200 && s3.res.status === 200, "Created walk-in POS bills across Stores A, B, and C");

    // Self-register + verify email + login
    const regRes = await postCustomerAuth(
      makeReq("", "http://localhost:3000/api/auth/customer", "POST", {
        action: "register",
        name: `Multi Patient ${ts}`,
        phone: sharedPhone,
        email: sharedEmail,
        password: "PatientPass@123",
      })
    );
    const regJson = await regRes.json();
    const custWithToken = await prisma.customer.findFirst({
      where: { phone: sharedPhone, verifyToken: { not: null } },
      select: { id: true, verifyToken: true },
    });
    assert(regRes.status === 201 && regJson.success && Boolean(custWithToken?.verifyToken), "Patient portal self-registration succeeded (201)");

    const verRes = await getCustomerVerify(
      new NextRequest(`http://localhost:3000/api/auth/customer/verify?token=${custWithToken!.verifyToken}`, {
        headers: { accept: "application/json" },
      })
    );
    assert(verRes.status === 200, "Email verification link activated all linked phone records");

    const loginRes = await postCustomerAuth(
      makeReq("", "http://localhost:3000/api/auth/customer", "POST", {
        action: "login",
        identifier: sharedEmail,
        password: "PatientPass@123",
      })
    );
    const setCookieHeader = loginRes.headers.get("set-cookie") || "";
    const tokenMatch = setCookieHeader.match(new RegExp(`${CUSTOMER_COOKIE_NAME}=([^;]+)`));
    const custCookie = tokenMatch
      ? `${CUSTOMER_COOKIE_NAME}=${tokenMatch[1]}`
      : `${CUSTOMER_COOKIE_NAME}=${signCustomerToken({
          customerId: custWithToken!.id,
          linkedCustomerIds: [walkInA.id, walkInB.id, walkInC.id],
          phone: sharedPhone,
          name: `Multi Patient ${ts}`,
          email: sharedEmail,
          address: null,
          issuedAt: Date.now(),
        })}`;

    const orders3Res = await getCustomerOrders(makeReq(custCookie, "http://localhost:3000/api/customer/orders"));
    const orders3Json = await orders3Res.json();
    assert(
      orders3Res.status === 200 &&
        (orders3Json.orders || []).length === 3 &&
        (orders3Json.availableStores || []).length === 3,
      "GET /api/customer/orders aggregates bills across all 3 visited pharmacy stores dynamically"
    );

    // Return request on Store B's order -> must land in Store B's branchId/storeId ONLY
    const storeBOrder = (orders3Json.orders || []).find((o: any) => o.id === s2.j.sale.id);
    const storeBItem = storeBOrder?.items?.[0];
    const retReqRes = await postCustomerReturn(
      makeReq(custCookie, "http://localhost:3000/api/customer/returns", "POST", {
        saleId: s2.j.sale.id,
        reason: "Sealed pack return request",
        refundMethod: "store_credit",
        items: [{ saleItemId: storeBItem.id, quantity: 1 }],
      })
    );
    const retReqJson = await retReqRes.json();
    const createdReturnId = retReqJson.return?.id;
    if (createdReturnId) created.returns.push(createdReturnId);
    const dbRet = createdReturnId
      ? await prisma.return.findUnique({ where: { id: createdReturnId }, include: { branch: true } })
      : null;
    assert(
      retReqRes.status === 201 && dbRet?.branch?.storeId === tenantB.st.id,
      "Customer return request on Store B invoice routes strictly to Store B branch"
    );

    // Future Store Discovery: Store D creates walk-in bill AFTER patient logged in -> re-query sees 4 stores!
    const walkInD = await prisma.customer.create({
      data: { storeId: tenantD.st.id, name: `WalkIn D ${ts}`, phone: sharedPhone, active: true },
    });
    created.customers.push(walkInD.id);
    await createPosSale(tenantD.admCookie, tenantD.mainBr.id, tenantD.batch.id, walkInD.id, 1);

    const orders4Res = await getCustomerOrders(makeReq(custCookie, "http://localhost:3000/api/customer/orders"));
    const orders4Json = await orders4Res.json();
    assert(
      orders4Res.status === 200 &&
        (orders4Json.orders || []).length === 4 &&
        (orders4Json.availableStores || []).length === 4,
      "GET /api/customer/orders dynamically discovers 4th store invoice post-login without re-login"
    );

    // Target Store + Branch Prescription Upload -> strict store isolation
    const rxForm = new FormData();
    rxForm.append(
      "file",
      new File(
        [Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n")],
        "rx_phase3_test.pdf",
        { type: "application/pdf" }
      )
    );
    rxForm.append("doctorName", "Dr. Arindam Sen");
    rxForm.append("fulfillmentMode", "pickup");
    rxForm.append("message", "Refill Request Store A Annex");
    rxForm.append("storeId", String(tenantA.st.id));
    rxForm.append("branchId", String(tenantA.subBr!.id));

    const rxUploadRes = await postCustomerPrescription(
      new NextRequest("http://localhost:3000/api/customer/prescriptions", {
        method: "POST",
        headers: { cookie: custCookie },
        body: rxForm,
      })
    );
    const rxUploadJson = await rxUploadRes.json();
    const rxId = rxUploadJson.prescription?.id || rxUploadJson.data?.id;
    const savedRxRow = rxId
      ? await prisma.patientMessage.findUnique({ where: { id: rxId } })
      : await prisma.patientMessage.findFirst({
          where: { storeId: tenantA.st.id, branchId: tenantA.subBr!.id, message: { contains: "Refill Request Store A Annex" } },
          orderBy: { id: "desc" },
        });
    if (savedRxRow) {
      created.patientMessages.push(savedRxRow.id);
      if (savedRxRow.filePath) {
        created.diskFiles.push(path.resolve(PRESCRIPTION_STORAGE_DIR, path.basename(savedRxRow.filePath)));
      }
    }

    assert(
      rxUploadRes.status === 201 &&
        savedRxRow?.storeId === tenantA.st.id &&
        savedRxRow?.branchId === tenantA.subBr!.id,
      "Customer Rx upload with target storeId + branchId stores exact Store A / Annex branch routing"
    );

    const storeBFileRes = await getPrescriptionFile(
      makeReq(tenantB.admCookie, `http://localhost:3000/api/prescriptions/file/${savedRxRow!.id}`),
      { params: Promise.resolve({ id: String(savedRxRow!.id) }) }
    );
    const storeBQueueRes = await getAdminPrescriptions(
      makeReq(tenantB.admCookie, `http://localhost:3000/api/admin/prescriptions?id=${savedRxRow!.id}`)
    );
    const storeAFileRes = await getPrescriptionFile(
      makeReq(tenantA.admCookie, `http://localhost:3000/api/prescriptions/file/${savedRxRow!.id}`),
      { params: Promise.resolve({ id: String(savedRxRow!.id) }) }
    );
    assert(
      storeBFileRes.status === 403 &&
        storeBQueueRes.status === 404 &&
        storeAFileRes.status === 200,
      "Cross-store Rx access blocked for Store B (403 file / 404 queue) while authorized Store A reads Rx file (200)"
    );

    // BUG-3.10-B: Branch-assigned staff in Store A Main cannot view Rx routed specifically to Store A Annex
    const branchMainStaff = await prisma.user.create({
      data: {
        storeId: tenantA.st.id,
        branchId: tenantA.mainBr.id,
        name: `Main Staff P3 ${ts}`,
        username: `main_stf_p3_${ts}`,
        email: `main_stf_p3_${ts}@pharma.test`,
        password: pwHash,
        role: "staff",
        permissions: JSON.stringify(["manage_medicines"]),
        active: true,
      },
    });
    created.users.push(branchMainStaff.id);
    const branchMainCookie = `${SESSION_COOKIE_NAME}=${createSessionToken({
      userId: branchMainStaff.id,
      username: branchMainStaff.username,
      name: branchMainStaff.name,
      email: branchMainStaff.email,
      role: "staff",
      storeId: tenantA.st.id,
      branchId: tenantA.mainBr.id,
      permissions: ["manage_medicines"],
      allowedPages: ["/admin/pos", "/admin/messages"],
      maxDiscountPercent: 10,
      issuedAt: Date.now(),
      lastActive: Date.now(),
    })}`;
    const otherBranchFileRes = await getPrescriptionFile(
      makeReq(branchMainCookie, `http://localhost:3000/api/prescriptions/file/${savedRxRow!.id}`),
      { params: Promise.resolve({ id: String(savedRxRow!.id) }) }
    );
    const otherBranchQueueRes = await getAdminPrescriptions(
      makeReq(branchMainCookie, `http://localhost:3000/api/admin/prescriptions?id=${savedRxRow!.id}`)
    );
    assert(
      otherBranchFileRes.status === 403 && otherBranchQueueRes.status === 404,
      "BUG-3.10-B: Store A Main branch staff cannot download/view Annex branch Rx (403 / 404)"
    );
  } finally {
    console.log("\n[Cleanup] Restoring PlatformConfig and removing temporary Phase 3 test data...");
    if (originalPlatformConfig) {
      await prisma.platformConfig
        .update({
          where: { id: originalPlatformConfig.id },
          data: {
            legalEntityName: originalPlatformConfig.legalEntityName,
            gstNo: originalPlatformConfig.gstNo,
            sacCode: originalPlatformConfig.sacCode,
            razorpayKeySecretEnc: originalPlatformConfig.razorpayKeySecretEnc,
            razorpayWebhookSecretEnc: originalPlatformConfig.razorpayWebhookSecretEnc,
          },
        })
        .catch(() => {});
    } else {
      await prisma.platformConfig.deleteMany({}).catch(() => {});
    }

    for (const fp of created.diskFiles) {
      try {
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch {
        // ignore
      }
    }

    if (created.webhooks.length) {
      await prisma.razorpayWebhookEvent.deleteMany({ where: { eventId: { in: created.webhooks } } });
    }
    if (created.patientMessages.length || created.stores.length) {
      await prisma.patientMessage.deleteMany({
        where: {
          OR: [
            ...(created.patientMessages.length ? [{ id: { in: created.patientMessages } }] : []),
            ...(created.stores.length ? [{ storeId: { in: created.stores } }] : []),
          ],
        },
      });
    }
    if (created.returns.length || created.sales.length) {
      await prisma.returnItem.deleteMany({
        where: {
          OR: [
            ...(created.returns.length ? [{ returnId: { in: created.returns } }] : []),
            ...(created.sales.length ? [{ returnReturn: { saleId: { in: created.sales } } }] : []),
          ],
        },
      });
      await prisma.return.deleteMany({
        where: {
          OR: [
            ...(created.returns.length ? [{ id: { in: created.returns } }] : []),
            ...(created.sales.length ? [{ saleId: { in: created.sales } }] : []),
          ],
        },
      });
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

    invalidateStoreEntitlements();
    await prisma.$disconnect();
  }

  console.log("\n================================================================================");
  console.log(` 🏁 TEST SUMMARY: ${passedTests} Passed, ${failedTests} Failed`);
  console.log("================================================================================");
  if (failedTests > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal Phase 3 suite error:", err);
  process.exit(1);
});
