/**
 * Integration Test Suite for MODULES 3.7 & 3.8:
 * - 3.7.4: Setup Wizard (`confirm_finalize`) auto-provisions 14-day FREE_TRIAL StoreSubscription & trialing status
 * - 3.7.1–3.7.2: Billing Status API (SAC 998314 + usageMeters + store/platform GST metadata),
 *                Remaining-days Proration Upgrade Checkout on live Razorpay Test API,
 *                Upgrade supersedes prior active sub cleanly (no MRR double-count),
 *                Self-serve Cancel Auto-Renew (`PATCH /api/admin/billing/status`) synced to Razorpay
 * - 3.8.1–3.8.3: CEO Executive Command Dashboard (`GET /api/super-admin/dashboard`) — normalized MRR (Monthly + Yearly/12),
 *                ARR, ARPU, Net Collected MTD/All-Time minus Refunds, Store Cohorts, Retail GMV, Upsell Leads (>=80%),
 *                At-Risk / Churn Alerts (<=72h trial / 14d inactive) & RBAC rejection of Store Admin.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  SUPER_ADMIN_COOKIE_NAME,
  createSessionToken,
  hashPassword,
  signSuperAdminToken,
} from "../src/lib/auth";
import { invalidateStoreEntitlements } from "../src/lib/entitlements";
import { getRazorpayCredentials } from "../src/lib/razorpay";
import { ensureDefaultPlansSeeded } from "../src/lib/saasFeatures";
import { POST as postSetup } from "../src/app/api/setup/route";
import {
  GET as getBillingStatus,
  PATCH as patchBillingStatus,
} from "../src/app/api/admin/billing/status/route";
import { POST as postBillingCheckout } from "../src/app/api/admin/billing/checkout/route";
import { POST as postBillingVerify } from "../src/app/api/admin/billing/verify/route";
import { GET as getCeoDashboard } from "../src/app/api/super-admin/dashboard/route";
import { POST as postPlan } from "../src/app/api/super-admin/plans/route";
import { canAccessPage } from "../src/lib/rbac";
import { getVisibleMenuItems } from "../src/lib/menu-registry";

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
      ...(cookiePair ? { cookie: cookiePair } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function main() {
  console.log("================================================================================");
  console.log(" 🧪 MODULES 3.7 & 3.8 INTEGRATION TEST SUITE (Billing Portal, Setup Trial, CEO KPIs)");
  console.log("================================================================================");

  const ts = Date.now();
  const created = {
    platformUsers: [] as number[],
    stores: [] as number[],
    plans: [] as number[],
  };

  try {
    await ensureDefaultPlansSeeded();
    const creds = getRazorpayCredentials();
    const pwHash = await hashPassword("Pass@12345");

    // 1. Seed CEO user
    const ceo = await prisma.platformUser.create({
      data: {
        name: `CEO M37 ${ts}`,
        username: `ceo_m37_${ts}`,
        email: `ceo_m37_${ts}@medipos.test`,
        password: pwHash,
        role: "ceo",
        active: true,
      },
    });
    created.platformUsers.push(ceo.id);
    const superCookie = `${SUPER_ADMIN_COOKIE_NAME}=${signSuperAdminToken({
      platformUserId: ceo.id,
      name: ceo.name,
      username: ceo.username,
      email: ceo.email,
      role: "ceo",
      issuedAt: Date.now(),
      lastActive: Date.now(),
    })}`;

    console.log("\n[Module 3.7.4] Testing Onboarding Setup Wizard Auto-Provisioning 14-Day Free Trial...");

    const setupDraft = await prisma.settings.create({
      data: {
        storeName: `Fresh Setup Pharma ${ts}`,
        storeAddress: "Salt Lake Sec V",
        storePhone: "9830012345",
        storeEmail: `setup_${ts}@pharma.test`,
        storeGst: "19ABCDE9999F1Z5",
        storeDl: "WB-SL-109",
        setupDone: false,
        setupStep: 4,
        setupToken: `tok_setup_${ts}`,
      },
    });
    created.stores.push(setupDraft.id);

    const setupAdmin = await prisma.user.create({
      data: {
        storeId: setupDraft.id,
        name: `Setup Admin ${ts}`,
        username: `setadm_${ts}`,
        email: `setadm_${ts}@pharma.test`,
        password: pwHash,
        role: "admin",
        active: true,
      },
    });

    const finalizeRes = await postSetup(
      makeReq(
        `setup_session_token=tok_setup_${ts}`,
        "http://localhost:3000/api/setup",
        "POST",
        { action: "confirm_finalize", setupId: setupDraft.id }
      )
    );
    const finalizeJson = await finalizeRes.json();
    assert(finalizeRes.status === 200 && finalizeJson.success, "POST /api/setup (confirm_finalize) succeeds");

    const updatedDraft = await prisma.settings.findUnique({ where: { id: setupDraft.id } });
    const autoTrialSub = await prisma.storeSubscription.findFirst({
      where: { storeId: setupDraft.id },
      include: { plan: true },
    });
    assert(
      updatedDraft?.setupDone === true &&
        updatedDraft.storeStatus === "trialing" &&
        autoTrialSub?.plan.code === "FREE_TRIAL" &&
        autoTrialSub?.status === "trialing",
      "Setup finalization atomically provisions FREE_TRIAL StoreSubscription & sets storeStatus=trialing"
    );

    const setupAdminCookie = `${SESSION_COOKIE_NAME}=${createSessionToken({
      userId: setupAdmin.id,
      storeId: setupDraft.id,
      username: setupAdmin.username,
      name: setupAdmin.name,
      email: setupAdmin.email,
      role: "admin",
      branchId: finalizeJson.branchId || null,
      permissions: [],
      allowedPages: ["*"],
      maxDiscountPercent: 100,
      issuedAt: Date.now(),
      lastActive: Date.now(),
    })}`;

    console.log("\n[Module 3.7.1 & 3.7.2] Testing Billing Status, Prorated Upgrade & Auto-Renew Cancel...");

    const initBillingRes = await getBillingStatus(
      makeReq(setupAdminCookie, "http://localhost:3000/api/admin/billing/status")
    );
    const initBillingJson = await initBillingRes.json();
    assert(
      initBillingRes.status === 200 &&
        initBillingJson.entitlements?.planCode === "FREE_TRIAL" &&
        Array.isArray(initBillingJson.usageMeters) &&
        initBillingJson.usageMeters.length === 8 &&
        initBillingJson.platformCompany?.sacCode === "998314",
      "GET /api/admin/billing/status returns FREE_TRIAL entitlements, 8 usageMeters, and SAC 998314 metadata"
    );

    // Create Monthly Tier (799) & Yearly Upgraded Tier (12000 -> 1000/mo MRR normalized) synced to Razorpay
    const mPlanRes = await postPlan(
      makeReq(superCookie, "http://localhost:3000/api/super-admin/plans", "POST", {
        code: `M37_MONTHLY_${ts}`,
        name: `Monthly Pro ${ts}`,
        billingCycle: "monthly",
        priceInr: 799,
        maxBranches: 1,
        maxMedicines: 2,
      })
    );
    const mPlan = (await mPlanRes.json()).plan;
    created.plans.push(mPlan.id);

    const yPlanRes = await postPlan(
      makeReq(superCookie, "http://localhost:3000/api/super-admin/plans", "POST", {
        code: `M37_YEARLY_${ts}`,
        name: `Yearly Scale ${ts}`,
        billingCycle: "yearly",
        priceInr: 12000,
        maxBranches: 5,
        maxMedicines: 10,
      })
    );
    const yPlan = (await yPlanRes.json()).plan;
    created.plans.push(yPlan.id);

    // Activate Monthly Pro via Subscription Checkout + Verify
    const subInitRes = await postBillingCheckout(
      makeReq(setupAdminCookie, "http://localhost:3000/api/admin/billing/checkout", "POST", {
        planId: mPlan.id,
        mode: "subscription",
      })
    );
    const subInitJson = await subInitRes.json();
    assert(
      subInitRes.status === 200 && String(subInitJson.subscriptionId).startsWith("sub_"),
      `Created Razorpay Subscription (${subInitJson.subscriptionId}) for Monthly Pro`
    );

    const pay1Id = `pay_m37_1_${ts}`;
    const sig1 = crypto
      .createHmac("sha256", creds.keySecret)
      .update(`${pay1Id}|${subInitJson.subscriptionId}`)
      .digest("hex");

    const ver1Res = await postBillingVerify(
      makeReq(setupAdminCookie, "http://localhost:3000/api/admin/billing/verify", "POST", {
        planId: mPlan.id,
        razorpay_subscription_id: subInitJson.subscriptionId,
        razorpay_customer_id: subInitJson.customerId,
        razorpay_payment_id: pay1Id,
        razorpay_signature: sig1,
      })
    );
    assert(ver1Res.status === 200, "Activated Monthly Pro subscription cleanly");

    // Initiate Upgrade to Yearly Scale (12000) -> MUST deduct remaining ~799 proration credit!
    const upgInitRes = await postBillingCheckout(
      makeReq(setupAdminCookie, "http://localhost:3000/api/admin/billing/checkout", "POST", {
        planId: yPlan.id,
        mode: "order",
      })
    );
    const upgInitJson = await upgInitRes.json();
    assert(
      upgInitRes.status === 200 &&
        upgInitJson.prorationCreditInr > 700 &&
        upgInitJson.gstBreakdown.amountSubtotal < 12000,
      `Upgrade checkout deducted proration credit (${upgInitJson.prorationCreditInr} INR) -> net taxable ${upgInitJson.gstBreakdown.amountSubtotal} INR`
    );

    const pay2Id = `pay_m37_2_${ts}`;
    const sig2 = crypto
      .createHmac("sha256", creds.keySecret)
      .update(`${upgInitJson.orderId}|${pay2Id}`)
      .digest("hex");

    const ver2Res = await postBillingVerify(
      makeReq(setupAdminCookie, "http://localhost:3000/api/admin/billing/verify", "POST", {
        planId: yPlan.id,
        razorpay_order_id: upgInitJson.orderId,
        razorpay_payment_id: pay2Id,
        razorpay_signature: sig2,
      })
    );
    assert(ver2Res.status === 200, "Prorated upgrade payment verified and activated Yearly Scale");

    const activeSubsForStore = await prisma.storeSubscription.count({
      where: { storeId: setupDraft.id, status: "active" },
    });
    assert(
      activeSubsForStore === 1,
      "Upgrading marks previous active/trial subscriptions expired (strictly 1 active sub per store -> clean MRR)"
    );

    // Cancel Auto-Renewal on an active Razorpay Subscription -> verify cancelAtPeriodEnd=true
    await prisma.storeSubscription.updateMany({
      where: { storeId: setupDraft.id, status: "active" },
      data: { autoRenew: true },
    });
    const cancelRes = await patchBillingStatus(
      makeReq(setupAdminCookie, "http://localhost:3000/api/admin/billing/status", "PATCH", {
        action: "cancel_subscription",
      })
    );
    const cancelJson = await cancelRes.json();
    assert(
      cancelRes.status === 200 && cancelJson.subscription?.cancelAtPeriodEnd === true && cancelJson.subscription?.autoRenew === false,
      "Self-serve PATCH /api/admin/billing/status sets cancelAtPeriodEnd=true cleanly"
    );

    console.log("\n[Module 3.8] Testing CEO Executive Command Dashboard KPIs & Intelligence Feeds...");

    // RBAC: Store Admin cannot access CEO dashboard
    const adminBlockedRes = await getCeoDashboard(
      makeReq(setupAdminCookie, "http://localhost:3000/api/super-admin/dashboard")
    );
    assert(adminBlockedRes.status === 401, "Store Admin blocked from GET /api/super-admin/dashboard (401)");

    // Seed an Upsell Lead (>=80% quota: 2 medicines on maxMedicines=2 -> 100%) + Trial Expiring <=48h store
    const upsellStore = await prisma.settings.create({
      data: {
        storeName: `Upsell Lead Pharmacy ${ts}`,
        storeStatus: "trialing",
        setupDone: true,
      },
    });
    created.stores.push(upsellStore.id);

    await prisma.storeSubscription.create({
      data: {
        storeId: upsellStore.id,
        planId: mPlan.id, // maxMedicines: 2
        status: "trialing",
        billingMode: "manual_grant",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 36 * 3_600_000),
        trialEndsAt: new Date(Date.now() + 36 * 3_600_000), // <= 72h alert trigger!
      },
    });

    for (let i = 1; i <= 2; i++) {
      await prisma.medicine.create({
        data: {
          storeId: upsellStore.id,
          name: `M38 Med ${i} ${ts}`,
          company: "Apex",
          category: "Tablet",
          gstPercent: 12,
        },
      });
    }

    const ceoDashRes = await getCeoDashboard(
      makeReq(superCookie, "http://localhost:3000/api/super-admin/dashboard")
    );
    const ceoDashJson = await ceoDashRes.json();
    assert(ceoDashRes.status === 200 && ceoDashJson.success, "GET /api/super-admin/dashboard returns 200 for CEO");
    assert(
      ceoDashJson.financialKpis.mrr >= 1000 &&
        ceoDashJson.financialKpis.arr === Math.round(ceoDashJson.financialKpis.mrr * 12 * 100) / 100,
      `Normalized Yearly (12000/12=1000) MRR tracked accurately (MRR=${ceoDashJson.financialKpis.mrr}, ARR=${ceoDashJson.financialKpis.arr})`
    );
    assert(
      ceoDashJson.financialKpis.mtdCollected.total > 0 &&
        ceoDashJson.financialKpis.mtdCollected.gst > 0,
      `MTD Net Revenue & GST tracked accurately (Total=₹${ceoDashJson.financialKpis.mtdCollected.total}, GST=₹${ceoDashJson.financialKpis.mtdCollected.gst})`
    );
    assert(
      (ceoDashJson.feeds?.upsellLeads || []).some((l: any) => l.storeId === upsellStore.id),
      "Upsell Pipeline flags >=80% quota usage store cleanly"
    );
    assert(
      (ceoDashJson.feeds?.atRiskAlerts || []).some((a: any) => a.storeId === upsellStore.id),
      "Churn / At-Risk Alerts flags store expiring within 72h cleanly"
    );

    // BUG-3.7-B: Non-admin staff can access /admin/billing in Read-Only mode
    const staffCanViewBilling =
      canAccessPage({ role: "pharmacist" }, "/admin/billing") &&
      getVisibleMenuItems({ role: "pharmacist" }).some((m) => m.id === "billing");
    assert(
      staffCanViewBilling,
      "BUG-3.7-B: Non-admin staff roles can access /admin/billing in read-only mode"
    );

    // BUG-3.8-A & BUG-3.8-B: Unfinished draft excluded & expired one-time order sub does not inflate MRR
    const mrrBefore = ceoDashJson.financialKpis.mrr;
    const abandonedWizardDraft = await prisma.settings.create({
      data: {
        storeName: `Abandoned Draft ${ts}`,
        setupDone: false,
        setupStep: 1,
      },
    });
    created.stores.push(abandonedWizardDraft.id);

    const expiredOrderStore = await prisma.settings.create({
      data: {
        storeName: `Expired Order Store ${ts}`,
        storeStatus: "active",
        setupDone: true,
      },
    });
    created.stores.push(expiredOrderStore.id);

    await prisma.storeSubscription.create({
      data: {
        storeId: expiredOrderStore.id,
        planId: yPlan.id, // 12000/yr = 1000/mo if active
        status: "active",
        billingMode: "razorpay_order",
        currentPeriodStart: new Date(Date.now() - 60 * 86_400_000),
        currentPeriodEnd: new Date(Date.now() - 2 * 86_400_000), // Expired 2 days ago!
        autoRenew: false,
      },
    });

    const ceoDashAfterRes = await getCeoDashboard(
      makeReq(superCookie, "http://localhost:3000/api/super-admin/dashboard")
    );
    const ceoDashAfterJson = await ceoDashAfterRes.json();
    const recentStoreIds = (ceoDashAfterJson.feeds?.recentStores || []).map((s: any) => s.id);
    assert(
      !recentStoreIds.includes(abandonedWizardDraft.id) &&
        ceoDashAfterJson.financialKpis.mrr === mrrBefore,
      "BUG-3.8-A/B: Unfinished wizard draft is excluded from CEO Dashboard & past-end order subscription does not inflate MRR"
    );
  } finally {
    console.log("\n[Cleanup] Removing temporary test records...");
    if (created.stores.length) {
      await prisma.subscriptionPayment.deleteMany({ where: { storeId: { in: created.stores } } });
      await prisma.storeSubscription.deleteMany({ where: { storeId: { in: created.stores } } });
      await prisma.platformAuditLog.deleteMany({ where: { storeId: { in: created.stores } } });
      await prisma.auditLog.deleteMany({ where: { storeId: { in: created.stores } } });
      await prisma.medicine.deleteMany({ where: { storeId: { in: created.stores } } });
      await prisma.user.deleteMany({ where: { storeId: { in: created.stores } } });
      await prisma.branch.deleteMany({ where: { storeId: { in: created.stores } } });
      await prisma.settings.deleteMany({ where: { id: { in: created.stores } } });
    }
    if (created.plans.length) {
      await prisma.subscriptionPlan.deleteMany({ where: { id: { in: created.plans } } });
    }
    if (created.platformUsers.length) {
      await prisma.platformAuditLog.deleteMany({ where: { platformUserId: { in: created.platformUsers } } });
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
  console.error("Fatal test error:", err);
  process.exit(1);
});
