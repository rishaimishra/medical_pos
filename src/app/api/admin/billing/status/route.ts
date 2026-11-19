import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { getClientIp, logAudit, logPlatformAudit } from "@/lib/audit";
import { PRESCRIPTION_STORAGE_DIR } from "@/lib/prescriptionFiles";
import { invalidateStoreEntitlements, resolveStoreEntitlements } from "@/lib/entitlements";
import { getPublicRazorpayKeyId, isRazorpayConfigured, razorpayRequest } from "@/lib/razorpay";
import {
  QUOTA_RESOURCE_REGISTRY,
  SAAS_FEATURE_REGISTRY,
  parseFeaturesJson,
} from "@/lib/saasFeatures";

/**
 * MODULE 3.6.2, 3.7.1 & 3.7.2: Store Subscription Entitlements, Billing Summary & Self-Serve Cancellation API
 * (`GET / PATCH /api/admin/billing/status`)
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const storeId = auth.session.storeId;
  if (!storeId) {
    return NextResponse.json({ success: false, message: "No store workspace linked." }, { status: 400 });
  }

  try {
    const now = new Date();
    const monthStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

    const [
      entitlements,
      storeInfo,
      platformCfg,
      latestSub,
      plans,
      payments,
      branchCount,
      staffCount,
      medCount,
      supCount,
      monthlyInvoiceCount,
      custCount,
      discCount,
      rxFiles,
    ] = await Promise.all([
      resolveStoreEntitlements(storeId),
      prisma.settings.findUnique({
        where: { id: storeId },
        select: {
          id: true,
          storeName: true,
          storeGst: true,
          storeAddress: true,
          storeEmail: true,
          storePhone: true,
          city: true,
          state: true,
          ownerName: true,
          ownerEmail: true,
        },
      }),
      prisma.platformConfig.findFirst({
        orderBy: { id: "asc" },
        select: {
          platformName: true,
          legalEntityName: true,
          gstNo: true,
          sacCode: true,
          billingAddress: true,
          supportEmail: true,
          supportPhone: true,
        },
      }),
      prisma.storeSubscription.findFirst({
        where: { storeId },
        orderBy: [{ id: "desc" }],
        include: { plan: { select: { priceInr: true, code: true, name: true } } },
      }),
      prisma.subscriptionPlan.findMany({
        where: { isActive: true, isPublic: true },
        orderBy: [{ sortOrder: "asc" }, { priceInr: "asc" }],
      }),
      prisma.subscriptionPayment.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        take: 25,
        include: { plan: { select: { code: true, name: true } } },
      }),
      prisma.branch.count({ where: { storeId } }),
      prisma.user.count({ where: { storeId, active: true } }),
      prisma.medicine.count({ where: { storeId } }),
      prisma.supplier.count({ where: { storeId } }),
      prisma.sale.count({ where: { branch: { storeId }, saleDate: { gte: monthStartUtc } } }),
      prisma.customer.count({ where: { storeId } }),
      prisma.discount.count({ where: { storeId, active: true } }),
      prisma.patientMessage.findMany({
        where: { filePath: { not: null }, customer: { storeId } },
        select: { filePath: true },
      }),
    ]);

    let rxBytes = 0;
    for (const f of rxFiles) {
      if (!f.filePath) continue;
      try {
        const fp = path.resolve(PRESCRIPTION_STORAGE_DIR, path.basename(f.filePath));
        if (fp.startsWith(PRESCRIPTION_STORAGE_DIR + path.sep) && fs.existsSync(fp)) {
          rxBytes += fs.statSync(fp).size;
        }
      } catch {
        // ignore missing files
      }
    }
    const rxStorageMb = Math.round((rxBytes / (1024 * 1024)) * 100) / 100;

    const usageMap: Record<string, number> = {
      maxBranches: branchCount,
      maxStaffUsers: staffCount,
      maxMedicines: medCount,
      maxMonthlyInvoices: monthlyInvoiceCount,
      maxSuppliers: supCount,
      maxRxStorageMb: rxStorageMb,
      maxCustomers: custCount,
      maxDiscountSchemes: discCount,
    };

    const usageMeters = QUOTA_RESOURCE_REGISTRY.map((q) => {
      const used = usageMap[q.key] ?? 0;
      const limit = entitlements.limits[q.key];
      const percent = limit === -1 ? 0 : limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
      return {
        key: q.key,
        label: q.label,
        unit: q.unit,
        used,
        limit,
        percent,
      };
    });

    // Calculate proration credit preview if currently on an active paid plan
    let prorationCreditInr = 0;
    if (
      latestSub &&
      latestSub.status === "active" &&
      Number(latestSub.plan.priceInr) > 0 &&
      latestSub.currentPeriodEnd > now
    ) {
      const totalMs = Math.max(86_400_000, latestSub.currentPeriodEnd.getTime() - latestSub.currentPeriodStart.getTime());
      const remMs = Math.max(0, latestSub.currentPeriodEnd.getTime() - now.getTime());
      prorationCreditInr = Math.round(Number(latestSub.plan.priceInr) * (remMs / totalMs) * 100) / 100;
    }

    return NextResponse.json({
      success: true,
      entitlements,
      subscriptionDetails: latestSub
        ? {
            id: latestSub.id,
            status: latestSub.status,
            billingMode: latestSub.billingMode,
            razorpaySubscriptionId: latestSub.razorpaySubscriptionId,
            autoRenew: latestSub.autoRenew,
            cancelAtPeriodEnd: latestSub.cancelAtPeriodEnd,
            cancelledAt: latestSub.cancelledAt,
            currentPeriodStart: latestSub.currentPeriodStart,
            currentPeriodEnd: latestSub.currentPeriodEnd,
            currentPlanPriceInr: Number(latestSub.plan.priceInr),
            prorationCreditInr,
          }
        : null,
      storeInfo,
      platformCompany: platformCfg || {
        platformName: "Medical POS Cloud",
        legalEntityName: "Medical POS SaaS Pvt. Ltd.",
        gstNo: null,
        sacCode: "998314",
        billingAddress: "India",
        supportEmail: null,
        supportPhone: null,
      },
      usageMeters,
      plans: plans.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        tagline: p.tagline,
        description: p.description,
        billingCycle: p.billingCycle,
        intervalCount: p.intervalCount,
        priceInr: Number(p.priceInr),
        setupFeeInr: Number(p.setupFeeInr),
        trialDays: p.trialDays,
        isRecommended: p.isRecommended,
        razorpayReady: Boolean(p.razorpayPlanId && p.razorpaySyncStatus === "synced"),
        limits: {
          maxBranches: p.maxBranches,
          maxStaffUsers: p.maxStaffUsers,
          maxMedicines: p.maxMedicines,
          maxMonthlyInvoices: p.maxMonthlyInvoices,
          maxSuppliers: p.maxSuppliers,
          maxRxStorageMb: p.maxRxStorageMb,
          maxCustomers: p.maxCustomers,
          maxDiscountSchemes: p.maxDiscountSchemes,
        },
        features: parseFeaturesJson(p.featuresJson),
      })),
      payments: payments.map((pay) => ({
        id: pay.id,
        invoiceNo: pay.invoiceNo,
        planCode: pay.plan.code,
        planName: pay.plan.name,
        amountSubtotal: Number(pay.amountSubtotal),
        gstPercent: Number(pay.gstPercent),
        gstAmount: Number(pay.gstAmount),
        totalAmount: Number(pay.totalAmount),
        currency: pay.currency,
        paymentType: pay.paymentType,
        status: pay.status,
        paymentMethod: pay.paymentMethod,
        paidAt: pay.paidAt,
        createdAt: pay.createdAt,
      })),
      featureRegistry: SAAS_FEATURE_REGISTRY,
      razorpayConfigured: isRazorpayConfigured(),
      razorpayKeyId: getPublicRazorpayKeyId(),
    });
  } catch (err: any) {
    console.error("[GET /api/admin/billing/status Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load billing status" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (auth.session.role !== "admin") {
    return NextResponse.json(
      { success: false, message: "Only Store Administrators can manage subscription renewal settings." },
      { status: 403 }
    );
  }

  const storeId = auth.session.storeId;
  if (!storeId) {
    return NextResponse.json({ success: false, message: "Store workspace not found." }, { status: 400 });
  }

  try {
    const body = await req.json();
    const action = String(body.action || "").toLowerCase();

    const latestSub = await prisma.storeSubscription.findFirst({
      where: { storeId, status: { in: ["active", "trialing", "grace_period"] } },
      orderBy: [{ id: "desc" }],
    });

    if (!latestSub) {
      return NextResponse.json(
        { success: false, message: "No active or trialing subscription found." },
        { status: 404 }
      );
    }

    if (action === "cancel_subscription") {
      if (latestSub.razorpaySubscriptionId && isRazorpayConfigured()) {
        try {
          await razorpayRequest(
            "POST",
            `/subscriptions/${latestSub.razorpaySubscriptionId}/cancel`,
            { cancel_at_cycle_end: 1 }
          );
        } catch (rzpErr: any) {
          console.warn("[Razorpay Cancel Subscription Notice]:", rzpErr?.message || rzpErr);
        }
      }

      const updated = await prisma.storeSubscription.update({
        where: { id: latestSub.id },
        data: {
          cancelAtPeriodEnd: true,
          autoRenew: false,
          cancelledAt: new Date(),
        },
      });

      await Promise.all([
        logAudit({
          storeId,
          userId: auth.session.userId,
          action: "SAAS_SUBSCRIPTION_CANCEL_SCHEDULED",
          entity: "store_subscriptions",
          entityId: updated.id,
          details: { currentPeriodEnd: updated.currentPeriodEnd.toISOString() },
          ipAddress: getClientIp(req),
        }),
        logPlatformAudit({
          storeId,
          action: "STORE_CANCEL_AT_PERIOD_END_ENABLED",
          entity: "store_subscriptions",
          entityId: updated.id,
          ipAddress: getClientIp(req),
        }),
      ]);

      invalidateStoreEntitlements(storeId);
      return NextResponse.json({
        success: true,
        subscription: updated,
        message: `Auto-renewal disabled. Your plan stays active until ${updated.currentPeriodEnd.toLocaleDateString("en-IN")}.`,
      });
    }

    return NextResponse.json({ success: false, message: "Unsupported billing action." }, { status: 400 });
  } catch (err: any) {
    console.error("[PATCH /api/admin/billing/status Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to update subscription renewal" },
      { status: 500 }
    );
  }
}
