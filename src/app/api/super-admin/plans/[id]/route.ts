import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySuperAdminRequest } from "@/lib/auth";
import { verifySameOrigin } from "@/lib/platformConfig";
import { getClientIp, logPlatformAudit } from "@/lib/audit";
import { invalidateStoreEntitlements } from "@/lib/entitlements";
import { isRazorpayConfiguredAsync, syncPlanToRazorpay } from "@/lib/razorpay";
import { parseFeaturesJson } from "@/lib/saasFeatures";

const ALLOWED_CYCLES = new Set(["monthly", "quarterly", "yearly", "lifetime"]);

/**
 * MODULE 3.4.3: Individual Subscription Plan Update & Safe Archival API (`/api/super-admin/plans/[id]`)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = verifySameOrigin(req);
  if (!originCheck.ok && originCheck.response) return originCheck.response;

  const auth = await verifySuperAdminRequest(req, ["ceo", "platform_admin"]);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid plan ID" }, { status: 400 });
  }

  try {
    const existing = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, message: "Plan not found" }, { status: 404 });
    }

    const body = await req.json();
    const updateData: any = {};

    if (body.name !== undefined) {
      const n = String(body.name).trim();
      if (!n) return NextResponse.json({ success: false, message: "Plan name cannot be empty." }, { status: 400 });
      updateData.name = n;
    }
    if (body.tagline !== undefined) updateData.tagline = body.tagline ? String(body.tagline).trim() : null;
    if (body.description !== undefined) updateData.description = body.description ? String(body.description).trim() : null;
    if (body.isPublic !== undefined) updateData.isPublic = Boolean(body.isPublic);
    if (body.isRecommended !== undefined) updateData.isRecommended = Boolean(body.isRecommended);
    if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);
    if (body.sortOrder !== undefined) updateData.sortOrder = parseInt(String(body.sortOrder), 10) || 0;
    if (body.trialDays !== undefined) updateData.trialDays = Math.max(0, parseInt(String(body.trialDays), 10) || 0);

    const parseLimit = (raw: unknown, current: number) => {
      const n = parseInt(String(raw), 10);
      return isNaN(n) || n < -1 ? current : n;
    };
    if (body.maxBranches !== undefined) updateData.maxBranches = parseLimit(body.maxBranches, existing.maxBranches);
    if (body.maxStaffUsers !== undefined) updateData.maxStaffUsers = parseLimit(body.maxStaffUsers, existing.maxStaffUsers);
    if (body.maxMedicines !== undefined) updateData.maxMedicines = parseLimit(body.maxMedicines, existing.maxMedicines);
    if (body.maxMonthlyInvoices !== undefined) updateData.maxMonthlyInvoices = parseLimit(body.maxMonthlyInvoices, existing.maxMonthlyInvoices);
    if (body.maxSuppliers !== undefined) updateData.maxSuppliers = parseLimit(body.maxSuppliers, existing.maxSuppliers);
    if (body.maxRxStorageMb !== undefined) updateData.maxRxStorageMb = parseLimit(body.maxRxStorageMb, existing.maxRxStorageMb);
    if (body.maxCustomers !== undefined) updateData.maxCustomers = parseLimit(body.maxCustomers, existing.maxCustomers);
    if (body.maxDiscountSchemes !== undefined) updateData.maxDiscountSchemes = parseLimit(body.maxDiscountSchemes, existing.maxDiscountSchemes);

    if (body.features && typeof body.features === "object") {
      const currFeat = parseFeaturesJson(existing.featuresJson);
      updateData.featuresJson = JSON.stringify({ ...currFeat, ...body.features, posBilling: true });
    }

    let billingChanged = false;
    if (body.billingCycle !== undefined) {
      const cycle = String(body.billingCycle).toLowerCase();
      if (!ALLOWED_CYCLES.has(cycle)) {
        return NextResponse.json({ success: false, message: "Invalid billing cycle." }, { status: 400 });
      }
      if (cycle !== existing.billingCycle) billingChanged = true;
      updateData.billingCycle = cycle;
    }
    if (body.intervalCount !== undefined) {
      const ic = parseInt(String(body.intervalCount), 10);
      if (!isNaN(ic) && ic > 0) {
        if (ic !== existing.intervalCount) billingChanged = true;
        updateData.intervalCount = ic;
      }
    }
    if (body.priceInr !== undefined) {
      const nextPrice = Number(body.priceInr);
      if (!Number.isFinite(nextPrice) || nextPrice < 0) {
        return NextResponse.json({ success: false, message: "Invalid priceInr." }, { status: 400 });
      }
      if (nextPrice !== Number(existing.priceInr)) billingChanged = true;
      updateData.priceInr = nextPrice;
    }
    if (body.setupFeeInr !== undefined) {
      const sf = Number(body.setupFeeInr);
      if (Number.isFinite(sf) && sf >= 0) updateData.setupFeeInr = sf;
    }

    if (billingChanged && existing.razorpayPlanId) {
      // Preserve grandfathered subscribers on old razorpayPlanId until resync issues new Razorpay Plan version
      updateData.razorpaySyncStatus = "pending";
      updateData.razorpaySyncError = "Billing price or cycle modified — re-sync required to publish new Razorpay Plan version.";
    }

    let updated = await prisma.subscriptionPlan.update({
      where: { id },
      data: updateData,
    });

    // Auto-create fresh Razorpay plan version if billing price/cycle changed (immutable Razorpay plans rule)
    if (
      billingChanged &&
      Number(updated.priceInr) > 0 &&
      updated.billingCycle !== "lifetime" &&
      (await isRazorpayConfiguredAsync()) &&
      body.skipRazorpaySync !== true
    ) {
      await syncPlanToRazorpay(id);
      const refreshed = await prisma.subscriptionPlan.findUnique({ where: { id } });
      if (refreshed) updated = refreshed;
    }

    invalidateStoreEntitlements();

    await logPlatformAudit({
      platformUserId: auth.session.platformUserId,
      action: "SUBSCRIPTION_PLAN_UPDATED",
      entity: "subscription_plans",
      entityId: id,
      details: {
        code: updated.code,
        billingChanged,
        razorpayPlanId: updated.razorpayPlanId,
        razorpaySyncStatus: updated.razorpaySyncStatus,
      },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      billingChanged,
      plan: {
        ...updated,
        priceInr: Number(updated.priceInr),
        setupFeeInr: Number(updated.setupFeeInr),
        features: parseFeaturesJson(updated.featuresJson),
      },
    });
  } catch (err: any) {
    console.error("[PATCH /api/super-admin/plans/[id] Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to update plan" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return PATCH(req, context);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = verifySameOrigin(req);
  if (!originCheck.ok && originCheck.response) return originCheck.response;

  const auth = await verifySuperAdminRequest(req, ["ceo", "platform_admin"]);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid plan ID" }, { status: 400 });
  }

  const ip = getClientIp(req);

  try {
    const existing = await prisma.subscriptionPlan.findUnique({
      where: { id },
      include: { _count: { select: { subscriptions: true, payments: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: "Plan not found" }, { status: 404 });
    }

    // Safe Archival Rule (3.4.3): Plans with existing subscriptions or payments cannot be hard-deleted
    if (existing._count.subscriptions > 0 || existing._count.payments > 0) {
      const archived = await prisma.subscriptionPlan.update({
        where: { id },
        data: { isActive: false, isPublic: false },
      });
      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        action: "SUBSCRIPTION_PLAN_ARCHIVED",
        entity: "subscription_plans",
        entityId: id,
        details: {
          code: existing.code,
          subscriptionsCount: existing._count.subscriptions,
        },
        ipAddress: ip,
      });
      return NextResponse.json({
        success: true,
        archived: true,
        plan: archived,
        message: `Plan '${existing.code}' has ${existing._count.subscriptions} subscription(s) and was safely archived instead of deleted.`,
      });
    }

    await prisma.subscriptionPlan.delete({ where: { id } });
    await logPlatformAudit({
      platformUserId: auth.session.platformUserId,
      action: "SUBSCRIPTION_PLAN_DELETED",
      entity: "subscription_plans",
      entityId: id,
      details: { code: existing.code },
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      archived: false,
      message: `Unused plan '${existing.code}' deleted.`,
    });
  } catch (err: any) {
    console.error("[DELETE /api/super-admin/plans/[id] Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to delete or archive plan" },
      { status: 500 }
    );
  }
}
