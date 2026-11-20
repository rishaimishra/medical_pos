import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { verifySuperAdminRequest } from "@/lib/auth";
import { getClientIp, logPlatformAudit } from "@/lib/audit";
import { invalidateStoreEntitlements } from "@/lib/entitlements";
import { computeSubscriptionPeriodEnd } from "@/lib/razorpay";
import { normalizeMonthlyMrr } from "@/lib/saasFeatures";
import { verifySameOrigin } from "@/lib/platformConfig";

/**
 * MODULE 3.5: Global Store Subscriptions Control Panel API (`/api/super-admin/subscriptions`)
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = (searchParams.get("status") || "all").toLowerCase();
  const modeFilter = (searchParams.get("billingMode") || "all").toLowerCase();
  const planFilter = (searchParams.get("planCode") || "all").toUpperCase();
  const search = (searchParams.get("search") || "").trim().toLowerCase();

  try {
    const now = new Date();
    const [subscriptions, plans, stores] = await Promise.all([
      prisma.storeSubscription.findMany({
        orderBy: [{ id: "desc" }],
        include: {
          store: {
            select: {
              id: true,
              storeName: true,
              storeStatus: true,
              ownerName: true,
              ownerEmail: true,
              storeEmail: true,
              storePhone: true,
              city: true,
              state: true,
            },
          },
          plan: {
            select: {
              id: true,
              code: true,
              name: true,
              billingCycle: true,
              intervalCount: true,
              priceInr: true,
            },
          },
          grantedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { priceInr: "asc" }],
        select: { id: true, code: true, name: true, priceInr: true, billingCycle: true },
      }),
      prisma.settings.findMany({
        where: { OR: [{ setupDone: true }, { branches: { some: {} } }] },
        orderBy: { id: "asc" },
        select: { id: true, storeName: true, storeStatus: true },
      }),
    ]);

    let activePaid = 0;
    let trialing = 0;
    let gracePeriod = 0;
    let cancelledOrExpired = 0;
    let totalMrr = 0;
    const seenStoreForMrr = new Set<number>();

    for (const s of subscriptions) {
      const st = (s.status || "").toLowerCase();
      const price = Number(s.plan.priceInr);
      const isNotExpired = !s.currentPeriodEnd || s.currentPeriodEnd >= now;

      if (st === "active" && price > 0 && isNotExpired) {
        activePaid++;
        if (!seenStoreForMrr.has(s.storeId)) {
          seenStoreForMrr.add(s.storeId);
          totalMrr += normalizeMonthlyMrr(price, s.plan.billingCycle, s.plan.intervalCount);
        }
      } else if (st === "trialing" && isNotExpired) {
        trialing++;
      } else if (st === "grace_period" || st === "past_due") {
        gracePeriod++;
      } else {
        cancelledOrExpired++;
      }
    }

    const filtered = subscriptions
      .filter((s) => {
        if (statusFilter !== "all" && s.status.toLowerCase() !== statusFilter) return false;
        if (modeFilter !== "all" && s.billingMode.toLowerCase() !== modeFilter) return false;
        if (planFilter !== "ALL" && s.plan.code.toUpperCase() !== planFilter) return false;
        if (search) {
          const hay = [
            s.store?.storeName,
            s.store?.ownerEmail,
            s.store?.storeEmail,
            s.plan?.name,
            s.plan?.code,
            s.razorpaySubscriptionId,
            s.razorpayCustomerId,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .map((s) => ({
        id: s.id,
        storeId: s.storeId,
        storeName: s.store?.storeName || `Store #${s.storeId}`,
        storeStatus: s.store?.storeStatus || "active",
        ownerEmail: s.store?.ownerEmail || s.store?.storeEmail || null,
        city: s.store?.city || null,
        state: s.store?.state || null,
        planId: s.planId,
        planCode: s.plan.code,
        planName: s.plan.name,
        billingCycle: s.plan.billingCycle,
        priceInr: Number(s.plan.priceInr),
        status: s.status,
        billingMode: s.billingMode,
        razorpaySubscriptionId: s.razorpaySubscriptionId,
        razorpayCustomerId: s.razorpayCustomerId,
        currentPeriodStart: s.currentPeriodStart,
        currentPeriodEnd: s.currentPeriodEnd,
        trialEndsAt: s.trialEndsAt,
        graceEndsAt: s.graceEndsAt,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        autoRenew: s.autoRenew,
        grantedByName: s.grantedBy?.name || null,
        notes: s.notes,
        createdAt: s.createdAt,
      }));

    return NextResponse.json({
      success: true,
      subscriptions: filtered,
      plans: plans.map((p) => ({ ...p, priceInr: Number(p.priceInr) })),
      stores,
      summary: {
        total: subscriptions.length,
        activePaid,
        trialing,
        gracePeriod,
        cancelledOrExpired,
        mrr: Math.round(totalMrr * 100) / 100,
      },
    });
  } catch (err: any) {
    console.error("[GET /api/super-admin/subscriptions Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load subscriptions" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const originCheck = verifySameOrigin(req);
  if (!originCheck.ok && originCheck.response) return originCheck.response;

  const auth = await verifySuperAdminRequest(req, ["ceo", "platform_admin", "finance_ops"]);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const action = String(body.action || "").toLowerCase();
    const ip = getClientIp(req);
    const now = new Date();

    if (action === "grant_plan") {
      const storeId = parseInt(String(body.storeId || ""), 10);
      const planId = parseInt(String(body.planId || ""), 10);
      const periodDays = body.periodDays ? Math.max(1, parseInt(String(body.periodDays), 10)) : null;
      const notes = body.notes ? String(body.notes).trim() : null;

      if (!storeId || isNaN(storeId) || !planId || isNaN(planId)) {
        return NextResponse.json({ success: false, message: "storeId and planId are required." }, { status: 400 });
      }

      const [store, plan] = await Promise.all([
        prisma.settings.findUnique({ where: { id: storeId } }),
        prisma.subscriptionPlan.findUnique({ where: { id: planId } }),
      ]);
      if (!store || !plan) {
        return NextResponse.json({ success: false, message: "Store or Plan not found." }, { status: 404 });
      }

      const isTrial = plan.code === "FREE_TRIAL" || Number(plan.priceInr) === 0;
      const nextStatus = isTrial ? "trialing" : "active";
      const end = periodDays
        ? new Date(now.getTime() + periodDays * 86_400_000)
        : computeSubscriptionPeriodEnd(now, plan.billingCycle, plan.intervalCount);

      const createdSub = await runInTransaction(async (tx) => {
        await tx.storeSubscription.updateMany({
          where: { storeId, status: { in: ["active", "trialing", "grace_period", "past_due"] } },
          data: { status: "expired", autoRenew: false },
        });

        const sub = await tx.storeSubscription.create({
          data: {
            storeId,
            planId: plan.id,
            status: nextStatus,
            billingMode: "manual_grant",
            currentPeriodStart: now,
            currentPeriodEnd: end,
            trialEndsAt: isTrial ? end : null,
            autoRenew: false,
            grantedByPlatformUserId: auth.session!.platformUserId,
            notes: notes || `Manual plan grant (${plan.code}) by ${auth.session!.name}`,
          },
        });

        await tx.settings.update({
          where: { id: storeId },
          data: { storeStatus: nextStatus, suspensionReason: null, suspendedAt: null },
        });

        return sub;
      });

      invalidateStoreEntitlements(storeId);
      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        storeId,
        action: "SUBSCRIPTION_MANUAL_GRANT",
        entity: "store_subscriptions",
        entityId: createdSub.id,
        details: { planCode: plan.code, status: nextStatus, currentPeriodEnd: end.toISOString() },
        ipAddress: ip,
      });

      return NextResponse.json({
        success: true,
        subscription: createdSub,
        message: `Assigned ${plan.name} to ${store.storeName}.`,
      });
    }

    const subscriptionId = parseInt(String(body.subscriptionId || ""), 10);
    if (!subscriptionId || isNaN(subscriptionId)) {
      return NextResponse.json({ success: false, message: "Valid subscriptionId is required." }, { status: 400 });
    }

    const existing = await prisma.storeSubscription.findUnique({ where: { id: subscriptionId } });
    if (!existing) {
      return NextResponse.json({ success: false, message: "Subscription not found." }, { status: 404 });
    }

    if (action === "extend_period") {
      const days = Math.max(1, Math.min(365, parseInt(String(body.days || "7"), 10)));
      const anchor = existing.currentPeriodEnd > now ? existing.currentPeriodEnd : now;
      const nextEnd = new Date(anchor.getTime() + days * 86_400_000);

      const updated = await prisma.storeSubscription.update({
        where: { id: existing.id },
        data: {
          currentPeriodEnd: nextEnd,
          ...(existing.status === "trialing" ? { trialEndsAt: nextEnd } : {}),
          ...(existing.status === "grace_period" ? { graceEndsAt: nextEnd } : {}),
        },
      });

      invalidateStoreEntitlements(existing.storeId);
      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        storeId: existing.storeId,
        action: "SUBSCRIPTION_PERIOD_EXTENDED",
        entity: "store_subscriptions",
        entityId: existing.id,
        details: { addedDays: days, newPeriodEnd: nextEnd.toISOString() },
        ipAddress: ip,
      });

      return NextResponse.json({
        success: true,
        subscription: updated,
        message: `Extended subscription by +${days} days.`,
      });
    }

    if (action === "cancel_subscription") {
      const updated = await prisma.storeSubscription.update({
        where: { id: existing.id },
        data: {
          status: "cancelled",
          autoRenew: false,
          cancelAtPeriodEnd: true,
          cancelledAt: now,
        },
      });

      invalidateStoreEntitlements(existing.storeId);
      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        storeId: existing.storeId,
        action: "SUBSCRIPTION_CANCELLED_BY_ADMIN",
        entity: "store_subscriptions",
        entityId: existing.id,
        ipAddress: ip,
      });

      return NextResponse.json({
        success: true,
        subscription: updated,
        message: "Subscription cancelled and auto-renew disabled.",
      });
    }

    return NextResponse.json({ success: false, message: "Unsupported subscription action." }, { status: 400 });
  } catch (err: any) {
    console.error("[PATCH /api/super-admin/subscriptions Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to update subscription" },
      { status: 500 }
    );
  }
}
