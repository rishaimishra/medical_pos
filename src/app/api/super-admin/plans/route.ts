import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySuperAdminRequest } from "@/lib/auth";
import { getClientIp, logPlatformAudit } from "@/lib/audit";
import { invalidateStoreEntitlements } from "@/lib/entitlements";
import { isRazorpayConfigured, syncPlanToRazorpay } from "@/lib/razorpay";
import {
  QUOTA_RESOURCE_REGISTRY,
  SAAS_FEATURE_REGISTRY,
  buildEmptyFeatureFlags,
  ensureDefaultPlansSeeded,
  parseFeaturesJson,
} from "@/lib/saasFeatures";

const ALLOWED_CYCLES = new Set(["monthly", "quarterly", "yearly", "lifetime"]);

/**
 * MODULE 3.4.3: Super Admin Subscription Plans Collection & Seeding API (`/api/super-admin/plans`)
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  if (searchParams.get("autoSeed") === "1") {
    const existing = await prisma.subscriptionPlan.count();
    if (existing === 0) {
      await ensureDefaultPlansSeeded();
    }
  }

  try {
    const [plans, activeSubGroups] = await Promise.all([
      prisma.subscriptionPlan.findMany({
        orderBy: [{ sortOrder: "asc" }, { priceInr: "asc" }, { id: "asc" }],
        include: {
          _count: { select: { subscriptions: true, payments: true } },
        },
      }),
      prisma.storeSubscription.groupBy({
        by: ["planId"],
        where: { status: { in: ["active", "trialing", "grace_period"] } },
        _count: { _all: true },
      }),
    ]);

    const activeMap = new Map<number, number>();
    activeSubGroups.forEach((g) => activeMap.set(g.planId, g._count._all));

    return NextResponse.json({
      success: true,
      plans: plans.map((p) => ({
        ...p,
        priceInr: Number(p.priceInr),
        setupFeeInr: Number(p.setupFeeInr),
        features: parseFeaturesJson(p.featuresJson),
        activeSubscribers: activeMap.get(p.id) || 0,
        totalSubscriptions: p._count.subscriptions,
        totalPayments: p._count.payments,
      })),
      featureRegistry: SAAS_FEATURE_REGISTRY,
      quotaRegistry: QUOTA_RESOURCE_REGISTRY,
    });
  } catch (err: any) {
    console.error("[GET /api/super-admin/plans Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load subscription plans" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req, ["ceo", "platform_admin"]);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const ip = getClientIp(req);

  try {
    const body = await req.json();

    if (body.action === "seed_defaults") {
      const seedRes = await ensureDefaultPlansSeeded();
      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        action: "SAAS_DEFAULT_PLANS_SEEDED",
        entity: "subscription_plans",
        details: seedRes,
        ipAddress: ip,
      });
      return NextResponse.json({ success: true, ...seedRes });
    }

    const code = String(body.code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_");
    const name = String(body.name || "").trim();
    const tagline = body.tagline ? String(body.tagline).trim() : null;
    const description = body.description ? String(body.description).trim() : null;
    const billingCycle = String(body.billingCycle || "monthly").toLowerCase();
    const intervalCount = parseInt(
      String(body.intervalCount ?? (billingCycle === "quarterly" ? 3 : 1)),
      10
    );
    const priceInr = Number(body.priceInr ?? 0);
    const setupFeeInr = Number(body.setupFeeInr ?? 0);
    const trialDays = parseInt(String(body.trialDays ?? 0), 10);
    const sortOrder = parseInt(String(body.sortOrder ?? 50), 10);

    if (!code || code.length < 2 || !name) {
      return NextResponse.json(
        { success: false, message: "Plan Code and Display Name are required." },
        { status: 400 }
      );
    }
    if (!ALLOWED_CYCLES.has(billingCycle)) {
      return NextResponse.json(
        { success: false, message: "Invalid billing cycle." },
        { status: 400 }
      );
    }
    if (!Number.isFinite(priceInr) || priceInr < 0 || !Number.isFinite(setupFeeInr) || setupFeeInr < 0) {
      return NextResponse.json(
        { success: false, message: "Price and setup fee must be non-negative numbers." },
        { status: 400 }
      );
    }

    const existing = await prisma.subscriptionPlan.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json(
        { success: false, message: `Plan code '${code}' already exists.` },
        { status: 409 }
      );
    }

    const parseLimit = (raw: unknown, fallback: number): number => {
      const n = parseInt(String(raw ?? fallback), 10);
      if (isNaN(n) || n < -1) return fallback;
      return n;
    };

    const incomingFeatures = body.features && typeof body.features === "object" ? body.features : {};
    const mergedFeatures = { ...buildEmptyFeatureFlags(false), ...incomingFeatures, posBilling: true };

    const created = await prisma.subscriptionPlan.create({
      data: {
        code,
        name,
        tagline,
        description,
        billingCycle,
        intervalCount: !isNaN(intervalCount) && intervalCount > 0 ? intervalCount : 1,
        priceInr,
        setupFeeInr,
        trialDays: !isNaN(trialDays) && trialDays >= 0 ? trialDays : 0,
        isPublic: body.isPublic !== undefined ? Boolean(body.isPublic) : true,
        isRecommended: Boolean(body.isRecommended),
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
        sortOrder: !isNaN(sortOrder) ? sortOrder : 50,
        razorpaySyncStatus: priceInr > 0 && billingCycle !== "lifetime" ? "pending" : "not_applicable",
        maxBranches: parseLimit(body.maxBranches, 1),
        maxStaffUsers: parseLimit(body.maxStaffUsers, 3),
        maxMedicines: parseLimit(body.maxMedicines, 2000),
        maxMonthlyInvoices: parseLimit(body.maxMonthlyInvoices, 1000),
        maxSuppliers: parseLimit(body.maxSuppliers, 25),
        maxRxStorageMb: parseLimit(body.maxRxStorageMb, 250),
        maxCustomers: parseLimit(body.maxCustomers, -1),
        maxDiscountSchemes: parseLimit(body.maxDiscountSchemes, 5),
        featuresJson: JSON.stringify(mergedFeatures),
      },
    });

    let finalPlan = created;
    if (priceInr > 0 && billingCycle !== "lifetime" && isRazorpayConfigured() && body.skipRazorpaySync !== true) {
      await syncPlanToRazorpay(created.id);
      const refreshed = await prisma.subscriptionPlan.findUnique({ where: { id: created.id } });
      if (refreshed) finalPlan = refreshed;
    }

    invalidateStoreEntitlements();

    await logPlatformAudit({
      platformUserId: auth.session.platformUserId,
      action: "SUBSCRIPTION_PLAN_CREATED",
      entity: "subscription_plans",
      entityId: finalPlan.id,
      details: {
        code: finalPlan.code,
        name: finalPlan.name,
        priceInr,
        billingCycle,
        razorpayPlanId: finalPlan.razorpayPlanId,
        razorpaySyncStatus: finalPlan.razorpaySyncStatus,
      },
      ipAddress: ip,
    });

    return NextResponse.json(
      {
        success: true,
        plan: {
          ...finalPlan,
          priceInr: Number(finalPlan.priceInr),
          setupFeeInr: Number(finalPlan.setupFeeInr),
          features: parseFeaturesJson(finalPlan.featuresJson),
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[POST /api/super-admin/plans Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to create plan" },
      { status: 500 }
    );
  }
}
