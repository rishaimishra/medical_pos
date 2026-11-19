import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { PRESCRIPTION_STORAGE_DIR } from "./prescriptionFiles";
import {
  DEFAULT_SAAS_PLANS,
  FeatureKey,
  PlanFeatureFlags,
  PlanQuotaLimits,
  QuotaResourceKey,
  buildEmptyFeatureFlags,
  parseCustomFeaturesJson,
  parseCustomLimitsJson,
  parseFeaturesJson,
} from "./saasFeatures";

/**
 * MODULE 3.6.1 & 3.6.4: Centralized Entitlement Engine, Quota Counter & Lifecycle Protection
 */

const CACHE_TTL_MS = 15_000;

export interface ResolvedEntitlements {
  storeId: number | null;
  storeStatus: string;
  suspensionReason: string | null;
  subscriptionId: number | null;
  subscriptionStatus: string;
  planId: number | null;
  planCode: string;
  planName: string;
  billingCycle: string;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  trialDaysRemaining: number | null;
  graceDaysRemaining: number | null;
  inTrialWarning: boolean;
  inGracePeriod: boolean;
  isReadOnlyLocked: boolean;
  isLegacyUnassigned: boolean;
  features: PlanFeatureFlags;
  limits: PlanQuotaLimits;
  cachedAt: number;
}

const entitlementCache = new Map<number, ResolvedEntitlements>();

export function invalidateStoreEntitlements(storeId?: number | null) {
  if (storeId && Number.isFinite(storeId)) {
    entitlementCache.delete(storeId);
  } else {
    entitlementCache.clear();
  }
}

const UNRESTRICTED_FEATURES: PlanFeatureFlags = buildEmptyFeatureFlags(true);
const UNRESTRICTED_LIMITS: PlanQuotaLimits = {
  maxBranches: -1,
  maxStaffUsers: -1,
  maxMedicines: -1,
  maxMonthlyInvoices: -1,
  maxSuppliers: -1,
  maxRxStorageMb: -1,
  maxCustomers: -1,
  maxDiscountSchemes: -1,
};

function buildFreeTrialDefaults(): { features: PlanFeatureFlags; limits: PlanQuotaLimits } {
  const def = DEFAULT_SAAS_PLANS.find((p) => p.code === "FREE_TRIAL")!;
  return {
    features: { ...def.features },
    limits: {
      maxBranches: def.maxBranches,
      maxStaffUsers: def.maxStaffUsers,
      maxMedicines: def.maxMedicines,
      maxMonthlyInvoices: def.maxMonthlyInvoices,
      maxSuppliers: def.maxSuppliers,
      maxRxStorageMb: def.maxRxStorageMb,
      maxCustomers: def.maxCustomers,
      maxDiscountSchemes: def.maxDiscountSchemes,
    },
  };
}

function diffWholeDaysCeil(futureDate: Date, now: Date): number {
  return Math.max(0, Math.ceil((futureDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * Resolves effective feature flags, quota limits & lifecycle state for a Store Tenant.
 */
export async function resolveStoreEntitlements(
  storeId: number | null | undefined
): Promise<ResolvedEntitlements> {
  const now = new Date();

  if (!storeId || isNaN(storeId)) {
    return {
      storeId: null,
      storeStatus: "active",
      suspensionReason: null,
      subscriptionId: null,
      subscriptionStatus: "legacy_unassigned",
      planId: null,
      planCode: "LEGACY_UNASSIGNED",
      planName: "Unassigned Workspace",
      billingCycle: "monthly",
      currentPeriodEnd: null,
      trialEndsAt: null,
      graceEndsAt: null,
      trialDaysRemaining: null,
      graceDaysRemaining: null,
      inTrialWarning: false,
      inGracePeriod: false,
      isReadOnlyLocked: false,
      isLegacyUnassigned: true,
      features: { ...UNRESTRICTED_FEATURES },
      limits: { ...UNRESTRICTED_LIMITS },
      cachedAt: now.getTime(),
    };
  }

  const cached = entitlementCache.get(storeId);
  if (cached && now.getTime() - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  const [store, sub] = await Promise.all([
    prisma.settings.findUnique({
      where: { id: storeId },
      select: { id: true, storeStatus: true, suspensionReason: true },
    }),
    prisma.storeSubscription.findFirst({
      where: { storeId },
      orderBy: [{ id: "desc" }],
      include: { plan: true },
    }),
  ]);

  const storeStatus = (store?.storeStatus || "active").toLowerCase();
  const suspensionReason = store?.suspensionReason || null;
  const storeHardSuspended = storeStatus === "suspended" || storeStatus === "archived";

  // Legacy / Pre-SaaS stores with no StoreSubscription row preserve full Part 1 & Part 2 parity
  if (!sub) {
    if (storeStatus === "trialing") {
      const trialDef = buildFreeTrialDefaults();
      const res: ResolvedEntitlements = {
        storeId,
        storeStatus,
        suspensionReason,
        subscriptionId: null,
        subscriptionStatus: "trialing",
        planId: null,
        planCode: "FREE_TRIAL",
        planName: "14-Day Free Trial",
        billingCycle: "monthly",
        currentPeriodEnd: null,
        trialEndsAt: null,
        graceEndsAt: null,
        trialDaysRemaining: null,
        graceDaysRemaining: null,
        inTrialWarning: false,
        inGracePeriod: false,
        isReadOnlyLocked: storeHardSuspended,
        isLegacyUnassigned: false,
        features: trialDef.features,
        limits: trialDef.limits,
        cachedAt: now.getTime(),
      };
      entitlementCache.set(storeId, res);
      return res;
    }

    const res: ResolvedEntitlements = {
      storeId,
      storeStatus,
      suspensionReason,
      subscriptionId: null,
      subscriptionStatus: storeHardSuspended ? "suspended" : storeStatus === "expired" ? "expired" : "legacy_unassigned",
      planId: null,
      planCode: "LEGACY_UNLIMITED",
      planName: "Standard Workspace",
      billingCycle: "monthly",
      currentPeriodEnd: null,
      trialEndsAt: null,
      graceEndsAt: null,
      trialDaysRemaining: null,
      graceDaysRemaining: null,
      inTrialWarning: false,
      inGracePeriod: false,
      isReadOnlyLocked: storeHardSuspended || storeStatus === "expired",
      isLegacyUnassigned: !storeHardSuspended && storeStatus === "active",
      features:
        storeHardSuspended || storeStatus === "expired"
          ? buildEmptyFeatureFlags(false)
          : { ...UNRESTRICTED_FEATURES },
      limits: { ...UNRESTRICTED_LIMITS },
      cachedAt: now.getTime(),
    };
    entitlementCache.set(storeId, res);
    return res;
  }

  const baseFeatures = parseFeaturesJson(sub.plan.featuresJson);
  const customFeatures = parseCustomFeaturesJson(sub.customFeaturesJson);
  const customLimits = parseCustomLimitsJson(sub.customLimitsJson);
  const mergedFeatures: PlanFeatureFlags = { ...baseFeatures, ...customFeatures };

  const mergedLimits: PlanQuotaLimits = {
    maxBranches: customLimits.maxBranches ?? sub.plan.maxBranches,
    maxStaffUsers: customLimits.maxStaffUsers ?? sub.plan.maxStaffUsers,
    maxMedicines: customLimits.maxMedicines ?? sub.plan.maxMedicines,
    maxMonthlyInvoices: customLimits.maxMonthlyInvoices ?? sub.plan.maxMonthlyInvoices,
    maxSuppliers: customLimits.maxSuppliers ?? sub.plan.maxSuppliers,
    maxRxStorageMb: customLimits.maxRxStorageMb ?? sub.plan.maxRxStorageMb,
    maxCustomers: customLimits.maxCustomers ?? sub.plan.maxCustomers,
    maxDiscountSchemes: customLimits.maxDiscountSchemes ?? sub.plan.maxDiscountSchemes,
  };

  const subStatus = (sub.status || "trialing").toLowerCase();
  const trialDeadline = sub.trialEndsAt || (subStatus === "trialing" ? sub.currentPeriodEnd : null);
  const isTrialExpired = subStatus === "trialing" && trialDeadline ? trialDeadline < now : false;
  const isCancelledPastEnd = subStatus === "cancelled" && sub.currentPeriodEnd < now;

  const isInGrace =
    !storeHardSuspended &&
    (subStatus === "grace_period" ||
      storeStatus === "grace_period" ||
      (subStatus === "past_due" && (!sub.graceEndsAt || sub.graceEndsAt >= now)));

  const isGraceExpired =
    subStatus === "grace_period" && sub.graceEndsAt ? sub.graceEndsAt < now : false;

  const isReadOnlyLocked =
    storeHardSuspended ||
    storeStatus === "expired" ||
    subStatus === "expired" ||
    subStatus === "suspended" ||
    isTrialExpired ||
    isCancelledPastEnd ||
    isGraceExpired;

  let effectiveFeatures: PlanFeatureFlags = { ...mergedFeatures };
  if (isReadOnlyLocked) {
    effectiveFeatures = buildEmptyFeatureFlags(false);
  } else if (isInGrace) {
    // 3.6.4: During Grace Period, POS sales & core returns continue uninterrupted; non-core premium modules prompt upgrade
    effectiveFeatures = buildEmptyFeatureFlags(false);
    effectiveFeatures.posBilling = true;
    effectiveFeatures.salesAndReturnsCore = true;
  }

  const trialDaysRemaining =
    subStatus === "trialing" && trialDeadline && !isTrialExpired
      ? diffWholeDaysCeil(trialDeadline, now)
      : null;

  const graceDaysRemaining =
    isInGrace && sub.graceEndsAt && !isGraceExpired
      ? diffWholeDaysCeil(sub.graceEndsAt, now)
      : isInGrace
      ? 7
      : null;

  const res: ResolvedEntitlements = {
    storeId,
    storeStatus,
    suspensionReason,
    subscriptionId: sub.id,
    subscriptionStatus: isReadOnlyLocked && isTrialExpired ? "expired" : subStatus,
    planId: sub.plan.id,
    planCode: sub.plan.code,
    planName: sub.plan.name,
    billingCycle: sub.plan.billingCycle,
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    trialEndsAt: sub.trialEndsAt?.toISOString() || null,
    graceEndsAt: sub.graceEndsAt?.toISOString() || null,
    trialDaysRemaining,
    graceDaysRemaining,
    inTrialWarning: trialDaysRemaining !== null && trialDaysRemaining <= 5,
    inGracePeriod: isInGrace && !isReadOnlyLocked,
    isReadOnlyLocked,
    isLegacyUnassigned: false,
    features: effectiveFeatures,
    limits: mergedLimits,
    cachedAt: now.getTime(),
  };

  entitlementCache.set(storeId, res);
  return res;
}

/**
 * Checks if a Store Tenant has a specific feature unlocked.
 * Returns structured HTTP 402 (or 403 for external portals) when blocked.
 */
export async function requireStoreFeature(
  storeId: number | null | undefined,
  featureKey: FeatureKey,
  options?: {
    forExternalPortal?: boolean;
    allowComplianceRead?: boolean;
  }
): Promise<{
  allowed: boolean;
  entitlements: ResolvedEntitlements;
  response?: NextResponse;
}> {
  const entitlements = await resolveStoreEntitlements(storeId);
  const status = options?.forExternalPortal ? 403 : 402;

  if (entitlements.isReadOnlyLocked) {
    // 3.6.4: Compliance exports remain readable even when billing mutations are locked (unless admin disabled intentionally)
    if (options?.allowComplianceRead && entitlements.storeStatus !== "archived") {
      return { allowed: true, entitlements };
    }

    const message =
      entitlements.storeStatus === "suspended"
        ? `Store access suspended${entitlements.suspensionReason ? `: ${entitlements.suspensionReason}` : ""}. Renew or contact support at /admin/billing.`
        : "Your pharmacy subscription or trial has expired. Please renew your plan in /admin/billing to continue.";

    return {
      allowed: false,
      entitlements,
      response: NextResponse.json(
        {
          success: false,
          upgradeRequired: true,
          reason:
            entitlements.storeStatus === "suspended"
              ? "STORE_SUSPENDED"
              : "SUBSCRIPTION_EXPIRED",
          featureKey,
          currentPlanCode: entitlements.planCode,
          message,
          error: message,
        },
        { status }
      ),
    };
  }

  if (!entitlements.features[featureKey]) {
    const message = entitlements.inGracePeriod
      ? `Your subscription is in Grace Period due to a pending renewal. Please complete payment at /admin/billing to re-enable '${featureKey}'.`
      : `Feature '${featureKey}' is not included in your current '${entitlements.planName}' plan. Upgrade at /admin/billing.`;

    return {
      allowed: false,
      entitlements,
      response: NextResponse.json(
        {
          success: false,
          upgradeRequired: true,
          reason: entitlements.inGracePeriod ? "GRACE_PERIOD_RESTRICTED" : "FEATURE_NOT_IN_PLAN",
          featureKey,
          currentPlanCode: entitlements.planCode,
          message,
          error: message,
        },
        { status }
      ),
    };
  }

  return { allowed: true, entitlements };
}

async function computeRxStorageMbForStore(storeId: number): Promise<number> {
  const files = await prisma.patientMessage.findMany({
    where: {
      filePath: { not: null },
      OR: [{ storeId }, { storeId: null, customer: { storeId } }],
    },
    select: { filePath: true },
  });
  let totalBytes = 0;
  for (const f of files) {
    if (!f.filePath) continue;
    try {
      const fp = path.resolve(PRESCRIPTION_STORAGE_DIR, path.basename(f.filePath));
      if (fp.startsWith(PRESCRIPTION_STORAGE_DIR + path.sep) && fs.existsSync(fp)) {
        totalBytes += fs.statSync(fp).size;
      }
    } catch {
      // ignore missing file entries on disk
    }
  }
  return Math.round((totalBytes / (1024 * 1024)) * 100) / 100;
}

/**
 * Checks store usage against metered plan limit before creating resources.
 */
export async function checkStoreQuota(
  storeId: number | null | undefined,
  resource: QuotaResourceKey,
  options?: {
    incrementBy?: number;
    isPosCheckout?: boolean;
    forExternalPortal?: boolean;
  }
): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  warningHeader: string | null;
  entitlements: ResolvedEntitlements;
  response?: NextResponse;
}> {
  const entitlements = await resolveStoreEntitlements(storeId);
  const status = options?.forExternalPortal ? 403 : 402;
  const inc = options?.incrementBy ?? 1;

  if (entitlements.isReadOnlyLocked) {
    const message =
      entitlements.storeStatus === "suspended"
        ? `Store is suspended${entitlements.suspensionReason ? `: ${entitlements.suspensionReason}` : ""}. Renew or contact platform support.`
        : "Your subscription or free trial has expired. Please renew at /admin/billing to resume operations.";
    return {
      allowed: false,
      used: 0,
      limit: entitlements.limits[resource],
      warningHeader: null,
      entitlements,
      response: NextResponse.json(
        {
          success: false,
          upgradeRequired: true,
          reason:
            entitlements.storeStatus === "suspended"
              ? "STORE_SUSPENDED"
              : "SUBSCRIPTION_EXPIRED",
          resource,
          currentPlanCode: entitlements.planCode,
          message,
          error: message,
        },
        { status }
      ),
    };
  }

  // During Grace Period, POS checkout stays open unless custom limit explicitly breached (3.6.4)
  const limit = entitlements.limits[resource];
  if (!storeId || limit === -1) {
    return {
      allowed: true,
      used: 0,
      limit: -1,
      warningHeader: null,
      entitlements,
    };
  }

  const now = new Date();
  const monthStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

  let used = 0;
  switch (resource) {
    case "maxBranches":
      used = await prisma.branch.count({ where: { storeId } });
      break;
    case "maxStaffUsers":
      used = await prisma.user.count({ where: { storeId, active: true } });
      break;
    case "maxMedicines":
      used = await prisma.medicine.count({ where: { storeId } });
      break;
    case "maxSuppliers":
      used = await prisma.supplier.count({ where: { storeId } });
      break;
    case "maxMonthlyInvoices":
      used = await prisma.sale.count({
        where: { branch: { storeId }, saleDate: { gte: monthStartUtc } },
      });
      break;
    case "maxCustomers":
      used = await prisma.customer.count({ where: { storeId } });
      break;
    case "maxDiscountSchemes":
      used = await prisma.discount.count({ where: { storeId, active: true } });
      break;
    case "maxRxStorageMb":
      used = await computeRxStorageMbForStore(storeId);
      break;
  }

  // POS Monthly Invoice quota includes a 5% grace buffer on >=20 limits so active checkout lanes never stall abruptly (3.6.3)
  const graceBuffer =
    options?.isPosCheckout && resource === "maxMonthlyInvoices"
      ? Math.floor(limit * 0.05)
      : 0;

  const projected = used + inc;
  const pct = limit > 0 ? Math.min(999, Math.round((projected / limit) * 100)) : 0;
  const warningHeader = pct >= 80 ? `${pct}% (${used}/${limit} ${resource})` : null;

  if (projected > limit + graceBuffer) {
    const message = `Plan quota reached for '${resource}' (${used}/${limit} used on ${entitlements.planName}). Upgrade your plan at /admin/billing.`;
    return {
      allowed: false,
      used,
      limit,
      warningHeader,
      entitlements,
      response: NextResponse.json(
        {
          success: false,
          upgradeRequired: true,
          reason: "QUOTA_LIMIT_EXCEEDED",
          resource,
          currentPlanCode: entitlements.planCode,
          used,
          limit,
          message,
          error: message,
        },
        { status }
      ),
    };
  }

  return {
    allowed: true,
    used,
    limit,
    warningHeader,
    entitlements,
  };
}

/**
 * Resolves store ownership from a Supplier ID and checks external supplier portal entitlement.
 */
export async function requireSupplierPortalFeature(
  supplierId: number | null | undefined,
  featureKey: FeatureKey
) {
  if (!supplierId) return requireStoreFeature(null, featureKey, { forExternalPortal: true });
  const sup = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { storeId: true },
  });
  return requireStoreFeature(sup?.storeId ?? null, featureKey, { forExternalPortal: true });
}

/**
 * Resolves store ownership from a Customer ID (or linked multi-store Customer IDs / explicit targetStoreId)
 * and checks external patient portal entitlement.
 */
export async function requireCustomerPortalFeature(
  customerId: number | null | undefined,
  featureKey: FeatureKey,
  options?: {
    linkedCustomerIds?: number[];
    targetStoreId?: number | null;
  }
) {
  if (options?.targetStoreId) {
    return requireStoreFeature(options.targetStoreId, featureKey, { forExternalPortal: true });
  }

  const candidateIds =
    options?.linkedCustomerIds && options.linkedCustomerIds.length > 0
      ? options.linkedCustomerIds
      : customerId
      ? [customerId]
      : [];

  if (candidateIds.length === 0) {
    return requireStoreFeature(null, featureKey, { forExternalPortal: true });
  }

  const rows = await prisma.customer.findMany({
    where: { id: { in: candidateIds } },
    select: { id: true, storeId: true },
  });

  const storeIds = Array.from(new Set(rows.map((r) => r.storeId).filter((s): s is number => s !== null)));
  if (storeIds.length <= 1) {
    return requireStoreFeature(storeIds[0] ?? null, featureKey, { forExternalPortal: true });
  }

  // Multi-store customer: allow viewing if at least one linked pharmacy store has the feature unlocked
  let lastGate: Awaited<ReturnType<typeof requireStoreFeature>> | null = null;
  for (const sId of storeIds) {
    const gate = await requireStoreFeature(sId, featureKey, { forExternalPortal: true });
    if (gate.allowed) return gate;
    lastGate = gate;
  }

  return lastGate || requireStoreFeature(storeIds[0] ?? null, featureKey, { forExternalPortal: true });
}
