/**
 * Integration Test Suite for MODULES 3.3 & 3.4:
 * - 3.3.1: Stores Directory API (`all`, `trial`, `near_quota`, `past_due_suspended`, `inactive_14d`, search, summary)
 * - 3.3.2: Single-Store 360° View (secret masking + 8 usage meters) & Lifecycle Mutations + RBAC
 * - 3.3.3: Global Cross-Store Branches Explorer (compliance filter) & Single-Branch Deep-Dive API
 * - 3.3.4: Global 5-Tab Users Directory + Platform Broadcast Announcements CRUD & Store Admin Notification Feed
 * - 3.4:   SaaS Feature/Limit Registry, Default 4-Tier Blueprint Seeding, Plan Builder CRUD,
 *          Razorpay Sync Dirty Flag, and Safe Archival vs Hard-Delete Rule
 */

import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  SUPER_ADMIN_COOKIE_NAME,
  createSessionToken,
  hashPassword,
  signSuperAdminToken,
} from "../src/lib/auth";
import { GET as getStoresDirectory } from "../src/app/api/super-admin/stores/route";
import {
  GET as getStoreDetail,
  PATCH as patchStoreLifecycle,
} from "../src/app/api/super-admin/stores/[id]/route";
import { GET as getBranchesExplorer } from "../src/app/api/super-admin/branches/route";
import {
  GET as getBranchDetail,
  PATCH as patchBranchStatus,
} from "../src/app/api/super-admin/branches/[id]/route";
import {
  GET as getGlobalUsers,
  PATCH as patchGlobalUser,
} from "../src/app/api/super-admin/users/route";
import {
  GET as getAnnouncements,
  POST as postAnnouncement,
  PATCH as patchAnnouncement,
  DELETE as deleteAnnouncement,
} from "../src/app/api/super-admin/announcements/route";
import {
  GET as getPlans,
  POST as postPlan,
} from "../src/app/api/super-admin/plans/route";
import {
  PATCH as patchPlan,
  DELETE as deletePlan,
} from "../src/app/api/super-admin/plans/[id]/route";
import { GET as getAdminNotifications } from "../src/app/api/admin/notifications/route";

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

function makeSuperReq(cookieVal: string, url: string, method = "GET", body?: any): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: {
      "Content-Type": "application/json",
      cookie: `${SUPER_ADMIN_COOKIE_NAME}=${cookieVal}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function makeAdminReq(cookieVal: string, url: string, method = "GET"): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: {
      "Content-Type": "application/json",
      cookie: `${SESSION_COOKIE_NAME}=${cookieVal}`,
    },
  });
}

async function main() {
  console.log("================================================================================");
  console.log(" 🧪 MODULES 3.3 & 3.4 INTEGRATION TEST SUITE (Control Tower, Branches, Users, Plans)");
  console.log("================================================================================");

  const ts = Date.now();
  const createdIds: {
    platformUsers: number[];
    stores: number[];
    branches: number[];
    users: number[];
    suppliers: number[];
    supplierUsers: number[];
    customers: number[];
    medicines: number[];
    batches: number[];
    sales: number[];
    plans: number[];
    subscriptions: number[];
    announcements: number[];
  } = {
    platformUsers: [],
    stores: [],
    branches: [],
    users: [],
    suppliers: [],
    supplierUsers: [],
    customers: [],
    medicines: [],
    batches: [],
    sales: [],
    plans: [],
    subscriptions: [],
    announcements: [],
  };

  try {
    const pwHash = await hashPassword("TestPass@123");

    // 1. Setup Platform Users (CEO + Support Viewer)
    const ceoUser = await prisma.platformUser.create({
      data: {
        name: `Test CEO ${ts}`,
        username: `ceo_m33_${ts}`,
        email: `ceo_m33_${ts}@medipos.test`,
        password: pwHash,
        role: "ceo",
        active: true,
      },
    });
    createdIds.platformUsers.push(ceoUser.id);

    const viewerUser = await prisma.platformUser.create({
      data: {
        name: `Test Viewer ${ts}`,
        username: `viewer_m33_${ts}`,
        email: `viewer_m33_${ts}@medipos.test`,
        password: pwHash,
        role: "support_viewer",
        active: true,
      },
    });
    createdIds.platformUsers.push(viewerUser.id);

    const ceoToken = signSuperAdminToken({
      platformUserId: ceoUser.id,
      name: ceoUser.name,
      username: ceoUser.username,
      email: ceoUser.email,
      role: "ceo",
      issuedAt: Date.now(),
      lastActive: Date.now(),
    });

    const viewerToken = signSuperAdminToken({
      platformUserId: viewerUser.id,
      name: viewerUser.name,
      username: viewerUser.username,
      email: viewerUser.email,
      role: "support_viewer",
      issuedAt: Date.now(),
      lastActive: Date.now(),
    });

    // 2. Setup Two Stores (Store A: Active/Trialing + Secret Keys; Store B: Suspended + Inactive >14d)
    const storeA = await prisma.settings.create({
      data: {
        storeName: `Apollo Test Store A ${ts}`,
        storeAddress: "Park Street",
        storePhone: "9830011223",
        storeEmail: `storea_${ts}@pharmacy.test`,
        storeGst: "19ABCDE1234F1Z5",
        storeDl: "WB-KOL-20B-101",
        city: "Kolkata",
        state: "West Bengal",
        ownerName: "Owner A",
        ownerEmail: `ownera_${ts}@pharmacy.test`,
        storeStatus: "trialing",
        emailProvider: "sendgrid",
        sendgridKey: "SG.SECRET_KEY_MUST_NOT_LEAK",
        smtpPass: "SMTP_SECRET_MUST_NOT_LEAK",
        smtpHost: "smtp.example.com",
        smtpUser: "mailer@example.com",
        setupDone: true,
      },
    });
    createdIds.stores.push(storeA.id);

    const storeB = await prisma.settings.create({
      data: {
        storeName: `Suspended Store B ${ts}`,
        storeAddress: "Salt Lake",
        storePhone: "9830099887",
        storeEmail: `storeb_${ts}@pharmacy.test`,
        city: "Howrah",
        state: "West Bengal",
        storeStatus: "suspended",
        suspensionReason: "Overdue invoice",
        suspendedAt: new Date(),
        setupDone: true,
      },
    });
    createdIds.stores.push(storeB.id);

    const mainBranchA = await prisma.branch.create({
      data: {
        storeId: storeA.id,
        code: `MAIN_${ts}`.slice(0, 20),
        name: `Main Outlet A ${ts}`,
        dlNo: "WB-DL-101",
        gstNo: "19ABCDE1234F1Z5",
        isMain: true,
        active: true,
      },
    });
    createdIds.branches.push(mainBranchA.id);

    // Sub branch deliberately omits dlNo and gstNo (store itself has fallback? Note branches route uses effGst = b.gstNo || b.store.storeGst -> so put missing compliance branch in Store B!)
    const subBranchA = await prisma.branch.create({
      data: {
        storeId: storeA.id,
        code: `SUBA_${ts}`.slice(0, 20),
        name: `Sub Outlet A ${ts}`,
        isMain: false,
        active: true,
      },
    });
    createdIds.branches.push(subBranchA.id);

    const branchB = await prisma.branch.create({
      data: {
        storeId: storeB.id,
        code: `MAINB_${ts}`.slice(0, 20),
        name: `Missing Compliance Branch B ${ts}`,
        isMain: true,
        active: true,
      },
    });
    createdIds.branches.push(branchB.id);

    // Store A Users (Admin + Staff)
    const adminA = await prisma.user.create({
      data: {
        storeId: storeA.id,
        branchId: mainBranchA.id,
        name: `Admin A ${ts}`,
        username: `admina_${ts}`,
        email: `admina_${ts}@pharmacy.test`,
        password: pwHash,
        role: "admin",
        active: true,
      },
    });
    createdIds.users.push(adminA.id);

    const staffA = await prisma.user.create({
      data: {
        storeId: storeA.id,
        branchId: subBranchA.id,
        name: `Pharmacist A ${ts}`,
        username: `pharma_${ts}`,
        email: `pharma_${ts}@pharmacy.test`,
        password: pwHash,
        role: "pharmacist",
        active: true,
      },
    });
    createdIds.users.push(staffA.id);

    const adminAToken = createSessionToken({
      userId: adminA.id,
      username: adminA.username,
      name: adminA.name,
      email: adminA.email || "",
      role: "admin",
      storeId: storeA.id,
      branchId: mainBranchA.id,
      permissions: [],
      allowedPages: ["*"],
      maxDiscountPercent: 100,
      issuedAt: Date.now(),
      lastActive: Date.now(),
    });

    // Supplier + SupplierUser + Customer for Global Users Tab tests
    const supplierA = await prisma.supplier.create({
      data: {
        storeId: storeA.id,
        name: `MedSupply Dist ${ts}`,
        phone: "9000011111",
      },
    });
    createdIds.suppliers.push(supplierA.id);

    const supplierUserA = await prisma.supplierUser.create({
      data: {
        supplierId: supplierA.id,
        name: `Vendor Contact ${ts}`,
        username: `vendor_${ts}`,
        email: `vendor_${ts}@dist.test`,
        password: pwHash,
        active: true,
        verified: true,
      },
    });
    createdIds.supplierUsers.push(supplierUserA.id);

    const customerA = await prisma.customer.create({
      data: {
        storeId: storeA.id,
        name: `Patient One ${ts}`,
        phone: `999${String(ts).slice(-7)}`,
        email: `patient_${ts}@mail.test`,
        active: true,
        verified: true,
      },
    });
    createdIds.customers.push(customerA.id);

    // 4 Medicines + 1 Batch + 1 Today Sale in Store A, 1 Stale Sale (20 days ago) in Store B
    const medIds: number[] = [];
    for (let i = 1; i <= 4; i++) {
      const m = await prisma.medicine.create({
        data: {
          storeId: storeA.id,
          name: `TestMed ${i} ${ts}`,
          company: "TestPharma",
          category: "Tablet",
          gstPercent: 12,
        },
      });
      medIds.push(m.id);
      createdIds.medicines.push(m.id);
    }

    const batchA = await prisma.batch.create({
      data: {
        branchId: mainBranchA.id,
        medicineId: medIds[0],
        batchNo: `B-${ts}`,
        expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        quantity: 20,
        purchasePrice: 50,
        mrp: 80,
      },
    });
    createdIds.batches.push(batchA.id);

    const saleA = await prisma.sale.create({
      data: {
        branchId: mainBranchA.id,
        createdBy: adminA.id,
        customerId: customerA.id,
        invoiceNo: `INV-A-${ts}`,
        totalAmount: 400,
        gstAmount: 48,
        grandTotal: 448,
        paymentMethod: "cash",
        saleDate: new Date(),
      },
    });
    createdIds.sales.push(saleA.id);

    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const saleB = await prisma.sale.create({
      data: {
        branchId: branchB.id,
        invoiceNo: `INV-B-${ts}`,
        totalAmount: 100,
        gstAmount: 12,
        grandTotal: 112,
        paymentMethod: "cash",
        saleDate: twentyDaysAgo,
        createdAt: twentyDaysAgo,
      },
    });
    createdIds.sales.push(saleB.id);

    console.log("\n[Module 3.4] Testing Feature/Limit Registry, Default 4-Tier Seeding & Plan CRUD...");

    // Seed defaults
    const seedRes = await postPlan(
      makeSuperReq(ceoToken, "http://localhost:3000/api/super-admin/plans", "POST", {
        action: "seed_defaults",
      })
    );
    const seedJson = await seedRes.json();
    assert(seedRes.status === 200 && seedJson.success, "POST /api/super-admin/plans (seed_defaults) succeeds");

    // GET plans & verify 16 features + 8 quotas
    const plansRes = await getPlans(makeSuperReq(ceoToken, "http://localhost:3000/api/super-admin/plans"));
    const plansJson = await plansRes.json();
    assert(plansRes.status === 200 && plansJson.success, "GET /api/super-admin/plans returns 200");
    assert(Array.isArray(plansJson.featureRegistry) && plansJson.featureRegistry.length === 16, "Feature registry contains 16 canonical feature flags");
    assert(Array.isArray(plansJson.quotaRegistry) && plansJson.quotaRegistry.length === 8, "Quota registry contains 8 metered resource quotas");
    const planCodes = new Set((plansJson.plans || []).map((p: any) => p.code));
    assert(
      planCodes.has("FREE_TRIAL") && planCodes.has("STARTER") && planCodes.has("GROWTH") && planCodes.has("ENTERPRISE"),
      "4 recommended tiers (FREE_TRIAL, STARTER, GROWTH, ENTERPRISE) exist"
    );

    // Create custom plan (used later for Safe Archival) & unused plan (for Hard Delete)
    const subPlanRes = await postPlan(
      makeSuperReq(ceoToken, "http://localhost:3000/api/super-admin/plans", "POST", {
        code: `TEST_SUB_PLAN_${ts}`,
        name: `Tight Quota Plan ${ts}`,
        billingCycle: "monthly",
        priceInr: 499,
        maxBranches: 5,
        maxStaffUsers: 10,
        maxMedicines: 5, // Store A has 4 -> 80% triggers near_quota!
        maxMonthlyInvoices: 100,
        skipRazorpaySync: true,
        features: { posBilling: false, multiBranchManagement: true },
      })
    );
    const subPlanJson = await subPlanRes.json();
    assert(subPlanRes.status === 201 && subPlanJson.success, "Custom plan created (201)");
    assert(subPlanJson.plan.features.posBilling === true, "Core posBilling feature locked to true even if omitted/false");
    const subPlanId = subPlanJson.plan.id;
    createdIds.plans.push(subPlanId);

    // Duplicate plan code conflict check
    const dupPlanRes = await postPlan(
      makeSuperReq(ceoToken, "http://localhost:3000/api/super-admin/plans", "POST", {
        code: `TEST_SUB_PLAN_${ts}`,
        name: "Duplicate",
        priceInr: 100,
      })
    );
    assert(dupPlanRes.status === 409, "Duplicate plan code returns 409 Conflict");

    // Simulate synced Razorpay plan, then change price -> syncStatus must reset to 'pending'
    await prisma.subscriptionPlan.update({
      where: { id: subPlanId },
      data: { razorpayPlanId: `plan_rzp_mock_${ts}`, razorpaySyncStatus: "synced" },
    });
    const updPlanRes = await patchPlan(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/plans/${subPlanId}`, "PATCH", {
        priceInr: 599,
        skipRazorpaySync: true,
      }),
      { params: Promise.resolve({ id: String(subPlanId) }) }
    );
    const updPlanJson = await updPlanRes.json();
    assert(
      updPlanRes.status === 200 &&
        updPlanJson.billingChanged === true &&
        updPlanJson.plan.razorpaySyncStatus === "pending",
      "Updating price on Razorpay-synced plan resets razorpaySyncStatus to 'pending'"
    );

    // Unused plan for hard delete test
    const unusedPlanRes = await postPlan(
      makeSuperReq(ceoToken, "http://localhost:3000/api/super-admin/plans", "POST", {
        code: `TEST_UNUSED_${ts}`,
        name: `Unused Plan ${ts}`,
        billingCycle: "yearly",
        priceInr: 9999,
        skipRazorpaySync: true,
      })
    );
    const unusedPlanJson = await unusedPlanRes.json();
    const unusedPlanId = unusedPlanJson.plan.id;
    createdIds.plans.push(unusedPlanId);

    console.log("\n[Module 3.3.1 & 3.3.2] Testing Stores Directory & 360° Lifecycle Control...");

    // Grant Tight Quota Plan to Store A (so Store A reaches 80% on maxMedicines: 4/5)
    const grantRes = await patchStoreLifecycle(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/stores/${storeA.id}`, "PATCH", {
        action: "grant_plan",
        planId: subPlanId,
        durationDays: 30,
        notes: "Test grant",
      }),
      { params: Promise.resolve({ id: String(storeA.id) }) }
    );
    const grantJson = await grantRes.json();
    assert(grantRes.status === 200 && grantJson.success, "CEO grant_plan succeeds on Store A");
    if (grantJson.subscription?.id) createdIds.subscriptions.push(grantJson.subscription.id);

    // RBAC Check: support_viewer cannot PATCH store lifecycle
    const viewerPatchRes = await patchStoreLifecycle(
      makeSuperReq(viewerToken, `http://localhost:3000/api/super-admin/stores/${storeA.id}`, "PATCH", {
        action: "extend_trial",
        days: 7,
      }),
      { params: Promise.resolve({ id: String(storeA.id) }) }
    );
    assert(viewerPatchRes.status === 403, "RBAC blocks support_viewer from PATCH /stores/[id] (403)");

    // Filter checks on Stores Directory
    const dirAllRes = await getStoresDirectory(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/stores?filter=all&search=${ts}`)
    );
    const dirAllJson = await dirAllRes.json();
    assert(dirAllRes.status === 200 && dirAllJson.stores.length >= 2, "Stores directory search returns Store A & Store B");

    const dirNearQuotaRes = await getStoresDirectory(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/stores?filter=near_quota&search=${ts}`)
    );
    const dirNearQuotaJson = await dirNearQuotaRes.json();
    assert(
      dirNearQuotaJson.stores.some((s: any) => s.id === storeA.id),
      "Stores directory filter=near_quota surfaces Store A (4/5 medicines = 80%)"
    );

    const dirSuspendedRes = await getStoresDirectory(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/stores?filter=past_due_suspended&search=${ts}`)
    );
    const dirSuspendedJson = await dirSuspendedRes.json();
    assert(
      dirSuspendedJson.stores.some((s: any) => s.id === storeB.id) &&
        !dirSuspendedJson.stores.some((s: any) => s.id === storeA.id),
      "Stores directory filter=past_due_suspended includes Store B & excludes active Store A"
    );

    const dirInactiveRes = await getStoresDirectory(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/stores?filter=inactive_14d&search=${ts}`)
    );
    const dirInactiveJson = await dirInactiveRes.json();
    assert(
      dirInactiveJson.stores.some((s: any) => s.id === storeB.id) &&
        !dirInactiveJson.stores.some((s: any) => s.id === storeA.id),
      "Stores directory filter=inactive_14d includes Store B (20d stale sale) & excludes Store A"
    );

    // Safe Archival vs Hard-Delete Test (now that Store A holds a subscription to subPlanId!)
    const archiveRes = await deletePlan(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/plans/${subPlanId}`, "DELETE"),
      { params: Promise.resolve({ id: String(subPlanId) }) }
    );
    const archiveJson = await archiveRes.json();
    assert(
      archiveRes.status === 200 && archiveJson.archived === true && archiveJson.plan?.isActive === false,
      "Safe Archival: subscribed plan is archived (isActive=false, isPublic=false) instead of deleted"
    );

    const hardDelRes = await deletePlan(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/plans/${unusedPlanId}`, "DELETE"),
      { params: Promise.resolve({ id: String(unusedPlanId) }) }
    );
    const hardDelJson = await hardDelRes.json();
    assert(
      hardDelRes.status === 200 && hardDelJson.archived === false,
      "Unused plan with 0 subscriptions/payments is hard-deleted"
    );
    createdIds.plans = createdIds.plans.filter((pid) => pid !== unusedPlanId);

    // 360° Single-Store View & Secret Masking check
    const detailRes = await getStoreDetail(
      makeSuperReq(viewerToken, `http://localhost:3000/api/super-admin/stores/${storeA.id}`),
      { params: Promise.resolve({ id: String(storeA.id) }) }
    );
    const detailJson = await detailRes.json();
    assert(detailRes.status === 200 && detailJson.success, "GET /stores/[id] succeeds for support_viewer");
    assert(
      detailJson.overview.hasSendgrid === true &&
        detailJson.overview.hasSmtp === true &&
        detailJson.overview.sendgridKey === undefined &&
        detailJson.overview.smtpPass === undefined,
      "Store 360° overview masks raw sendgridKey and smtpPass while reporting booleans"
    );
    assert(
      Array.isArray(detailJson.subscription.usageMeters) && detailJson.subscription.usageMeters.length === 8,
      "Store 360° returns all 8 live quota usage meters"
    );

    // Store Lifecycle Mutations: extend_trial, set_overrides, set_status, toggle_branch_active, toggle_user_active
    const extRes = await patchStoreLifecycle(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/stores/${storeA.id}`, "PATCH", {
        action: "extend_trial",
        days: 10,
      }),
      { params: Promise.resolve({ id: String(storeA.id) }) }
    );
    assert(extRes.status === 200, "Store extend_trial (+10 days) succeeds");

    const ovrRes = await patchStoreLifecycle(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/stores/${storeA.id}`, "PATCH", {
        action: "set_overrides",
        customLimits: { maxMedicines: 999 },
        customFeatures: { advancedBiAndProfitReports: true },
      }),
      { params: Promise.resolve({ id: String(storeA.id) }) }
    );
    assert(ovrRes.status === 200, "Store set_overrides succeeds");

    const detailAfterOvr = await (
      await getStoreDetail(
        makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/stores/${storeA.id}`),
        { params: Promise.resolve({ id: String(storeA.id) }) }
      )
    ).json();
    assert(
      detailAfterOvr.subscription.current.limits.maxMedicines === 999 &&
        detailAfterOvr.subscription.current.effectiveFeatures.advancedBiAndProfitReports === true,
      "Custom limit & feature overrides apply in live 360° subscription snapshot"
    );

    // Status suspension requires reason
    const suspBadRes = await patchStoreLifecycle(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/stores/${storeA.id}`, "PATCH", {
        action: "set_status",
        storeStatus: "suspended",
        reason: "",
      }),
      { params: Promise.resolve({ id: String(storeA.id) }) }
    );
    assert(suspBadRes.status === 400, "Suspending store without reason fails validation (400)");

    const suspOkRes = await patchStoreLifecycle(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/stores/${storeA.id}`, "PATCH", {
        action: "set_status",
        storeStatus: "suspended",
        reason: "Audit suspension test",
      }),
      { params: Promise.resolve({ id: String(storeA.id) }) }
    );
    const suspOkJson = await suspOkRes.json();
    assert(suspOkRes.status === 200 && suspOkJson.storeStatus === "suspended", "Store suspended with valid reason");

    // Re-activate Store A for downstream notification test
    await patchStoreLifecycle(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/stores/${storeA.id}`, "PATCH", {
        action: "set_status",
        storeStatus: "active",
      }),
      { params: Promise.resolve({ id: String(storeA.id) }) }
    );

    const toggleMainFail = await patchStoreLifecycle(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/stores/${storeA.id}`, "PATCH", {
        action: "toggle_branch_active",
        branchId: mainBranchA.id,
        active: false,
      }),
      { params: Promise.resolve({ id: String(storeA.id) }) }
    );
    assert(toggleMainFail.status === 400, "Cannot deactivate primary MAIN branch (400)");

    const toggleUserOk = await patchStoreLifecycle(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/stores/${storeA.id}`, "PATCH", {
        action: "toggle_user_active",
        userId: staffA.id,
        active: false,
      }),
      { params: Promise.resolve({ id: String(storeA.id) }) }
    );
    assert(toggleUserOk.status === 200, "Store staff active state toggled cleanly");

    console.log("\n[Module 3.3.3] Testing Global Branches Explorer & Single-Branch Deep-Dive...");

    const missingCompRes = await getBranchesExplorer(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/branches?compliance=missing&search=${ts}`)
    );
    const missingCompJson = await missingCompRes.json();
    assert(
      missingCompRes.status === 200 &&
        missingCompJson.branches.some((b: any) => b.id === branchB.id) &&
        !missingCompJson.branches.some((b: any) => b.id === mainBranchA.id),
      "Branches Explorer compliance=missing surfaces Branch B without DL/GST & excludes Main Branch A"
    );

    const branchDeepRes = await getBranchDetail(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/branches/${mainBranchA.id}`),
      { params: Promise.resolve({ id: String(mainBranchA.id) }) }
    );
    const branchDeepJson = await branchDeepRes.json();
    assert(
      branchDeepRes.status === 200 &&
        branchDeepJson.branch.sales30d >= 448 &&
        branchDeepJson.batches.length >= 1 &&
        branchDeepJson.recentSales.length >= 1,
      "GET /branches/[id] returns 30d sales, batches, and recent sales"
    );

    const subToggleRes = await patchBranchStatus(
      makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/branches/${subBranchA.id}`, "PATCH", {
        active: false,
      }),
      { params: Promise.resolve({ id: String(subBranchA.id) }) }
    );
    assert(subToggleRes.status === 200, "PATCH /branches/[id] deactivates sub-branch cleanly");

    console.log("\n[Module 3.3.4] Testing Global 5-Tab Users Directory & Platform Broadcasts...");

    for (const tabName of ["store_admins", "staff", "suppliers", "patients", "platform"] as const) {
      const uRes = await getGlobalUsers(
        makeSuperReq(ceoToken, `http://localhost:3000/api/super-admin/users?tab=${tabName}&search=${ts}`)
      );
      const uJson = await uRes.json();
      assert(
        uRes.status === 200 && Array.isArray(uJson.users) && uJson.users.length >= 1,
        `GET /users?tab=${tabName} finds seeded ${tabName} test record`
      );
    }

    const supToggleRes = await patchGlobalUser(
      makeSuperReq(ceoToken, "http://localhost:3000/api/super-admin/users", "PATCH", {
        userType: "supplier_user",
        id: supplierUserA.id,
        active: false,
      })
    );
    assert(supToggleRes.status === 200, "PATCH /users toggles supplier_user active state");

    // Announcements CRUD + Store Notification Integration
    const globalTitle = `Global Maint ${ts}`;
    const bcastGlobalRes = await postAnnouncement(
      makeSuperReq(ceoToken, "http://localhost:3000/api/super-admin/announcements", "POST", {
        title: globalTitle,
        message: "Planned maintenance window.",
        severity: "urgent",
      })
    );
    const bcastGlobalJson = await bcastGlobalRes.json();
    assert(bcastGlobalRes.status === 201, "POST /announcements publishes global urgent notice");
    createdIds.announcements.push(bcastGlobalJson.announcement.id);

    const storeBTitle = `Store B Only ${ts}`;
    const bcastStoreBRes = await postAnnouncement(
      makeSuperReq(ceoToken, "http://localhost:3000/api/super-admin/announcements", "POST", {
        title: storeBTitle,
        message: "Billing update required for Store B.",
        severity: "warning",
        targetStoreId: storeB.id,
      })
    );
    const bcastStoreBJson = await bcastStoreBRes.json();
    createdIds.announcements.push(bcastStoreBJson.announcement.id);

    const notifRes = await getAdminNotifications(
      makeAdminReq(adminAToken, "http://localhost:3000/api/admin/notifications")
    );
    const notifJson = await notifRes.json();
    const notifList: any[] = Array.isArray(notifJson.notifications) ? notifJson.notifications : [];
    assert(
      notifRes.status === 200 &&
        notifList.some((n) => n.type === "announcement" && n.title === globalTitle) &&
        !notifList.some((n) => n.title === storeBTitle),
      "Store A Notification Bell receives global broadcast and filters out Store B's private broadcast"
    );

    // Pause global announcement -> disappears from Store A notifications
    const pauseRes = await patchAnnouncement(
      makeSuperReq(ceoToken, "http://localhost:3000/api/super-admin/announcements", "PATCH", {
        id: bcastGlobalJson.announcement.id,
        active: false,
      })
    );
    assert(pauseRes.status === 200, "PATCH /announcements pauses active broadcast");

    const notifAfterPause = await (
      await getAdminNotifications(makeAdminReq(adminAToken, "http://localhost:3000/api/admin/notifications"))
    ).json();
    assert(
      !(notifAfterPause.notifications || []).some((n: any) => n.title === globalTitle),
      "Paused announcement no longer surfaces in Store Admin Notification Bell"
    );

    const delBcastRes = await deleteAnnouncement(
      makeSuperReq(
        ceoToken,
        `http://localhost:3000/api/super-admin/announcements?id=${bcastGlobalJson.announcement.id}`,
        "DELETE"
      )
    );
    assert(delBcastRes.status === 200, "DELETE /announcements removes announcement");
    createdIds.announcements = createdIds.announcements.filter((id) => id !== bcastGlobalJson.announcement.id);

    const listAnnRes = await getAnnouncements(
      makeSuperReq(ceoToken, "http://localhost:3000/api/super-admin/announcements")
    );
    assert(listAnnRes.status === 200, "GET /announcements succeeds");
  } finally {
    console.log("\n[Cleanup] Removing temporary test records...");
    if (createdIds.announcements.length) {
      await prisma.platformAnnouncement.deleteMany({ where: { id: { in: createdIds.announcements } } });
    }
    if (createdIds.stores.length) {
      await prisma.platformAuditLog.deleteMany({ where: { storeId: { in: createdIds.stores } } });
      await prisma.auditLog.deleteMany({ where: { storeId: { in: createdIds.stores } } });
    }
    if (createdIds.platformUsers.length) {
      await prisma.platformAuditLog.deleteMany({ where: { platformUserId: { in: createdIds.platformUsers } } });
    }
    if (createdIds.sales.length) {
      await prisma.sale.deleteMany({ where: { id: { in: createdIds.sales } } });
    }
    if (createdIds.batches.length) {
      await prisma.batch.deleteMany({ where: { id: { in: createdIds.batches } } });
    }
    if (createdIds.medicines.length) {
      await prisma.medicine.deleteMany({ where: { id: { in: createdIds.medicines } } });
    }
    if (createdIds.supplierUsers.length) {
      await prisma.supplierUser.deleteMany({ where: { id: { in: createdIds.supplierUsers } } });
    }
    if (createdIds.suppliers.length) {
      await prisma.supplier.deleteMany({ where: { id: { in: createdIds.suppliers } } });
    }
    if (createdIds.customers.length) {
      await prisma.customer.deleteMany({ where: { id: { in: createdIds.customers } } });
    }
    if (createdIds.subscriptions.length || createdIds.stores.length) {
      await prisma.storeSubscription.deleteMany({
        where: {
          OR: [
            ...(createdIds.subscriptions.length ? [{ id: { in: createdIds.subscriptions } }] : []),
            ...(createdIds.stores.length ? [{ storeId: { in: createdIds.stores } }] : []),
          ],
        },
      });
    }
    if (createdIds.plans.length) {
      await prisma.subscriptionPlan.deleteMany({ where: { id: { in: createdIds.plans } } });
    }
    if (createdIds.users.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdIds.users } } });
    }
    if (createdIds.branches.length) {
      await prisma.branch.deleteMany({ where: { id: { in: createdIds.branches } } });
    }
    if (createdIds.stores.length) {
      await prisma.settings.deleteMany({ where: { id: { in: createdIds.stores } } });
    }
    if (createdIds.platformUsers.length) {
      await prisma.platformUser.deleteMany({ where: { id: { in: createdIds.platformUsers } } });
    }
    await prisma.$disconnect();
  }

  console.log("\n================================================================================");
  console.log(` 🏁 TEST SUMMARY: ${passedTests} Passed, ${failedTests} Failed`);
  console.log("================================================================================");
  if (failedTests > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
