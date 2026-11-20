import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { getClientIp, logAudit } from "@/lib/audit";
import { verifySameOrigin } from "@/lib/platformConfig";
import {
  calculateSaasTaxFromSubtotal,
  generateNextSubscriptionInvoiceNo,
  razorpayRequest,
  resolveEffectiveRazorpayCredentials,
  syncPlanToRazorpay,
} from "@/lib/razorpay";

/**
 * MODULE 3.5.2: Store Subscription Checkout Initiator (`POST /api/admin/billing/checkout`)
 * - Flow A (`mode === "subscription"`): Creates/reuses Razorpay Customer + Razorpay Subscription
 * - Flow B (`mode === "order"`): Creates GST-inclusive Razorpay Order + pending SubscriptionPayment
 */
export async function POST(req: NextRequest) {
  const originCheck = verifySameOrigin(req);
  if (!originCheck.ok && originCheck.response) return originCheck.response;

  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (auth.session.role !== "admin") {
    return NextResponse.json(
      { success: false, message: "Only the Store Administrator can initiate subscription billing." },
      { status: 403 }
    );
  }

  const storeId = auth.session.storeId;
  if (!storeId) {
    return NextResponse.json({ success: false, message: "Store workspace not found." }, { status: 400 });
  }

  try {
    const body = await req.json();
    const planId = parseInt(String(body.planId || ""), 10);
    const requestedMode = body.mode ? String(body.mode).toLowerCase() : null;

    if (!planId || isNaN(planId)) {
      return NextResponse.json({ success: false, message: "Valid planId is required." }, { status: 400 });
    }

    let plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      return NextResponse.json(
        { success: false, message: "Selected subscription plan is unavailable or archived." },
        { status: 404 }
      );
    }

    const basePrice = Number(plan.priceInr);
    if (basePrice <= 0) {
      return NextResponse.json(
        { success: false, message: "Free trial tiers do not require Razorpay checkout." },
        { status: 400 }
      );
    }

    const store = await prisma.settings.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        storeName: true,
        storeEmail: true,
        storePhone: true,
        ownerName: true,
        ownerEmail: true,
        storeGst: true,
      },
    });
    if (!store) {
      return NextResponse.json({ success: false, message: "Store settings not found." }, { status: 404 });
    }

    const mode: "subscription" | "order" =
      plan.billingCycle === "lifetime"
        ? "order"
        : requestedMode === "subscription"
        ? "subscription"
        : "order";

    const rzpCreds = await resolveEffectiveRazorpayCredentials();
    const razorpayKeyId = rzpCreds.keyId || null;
    if (!razorpayKeyId || !rzpCreds.keySecret) {
      return NextResponse.json(
        { success: false, message: "Razorpay keys are not configured on the platform server." },
        { status: 500 }
      );
    }

    const prefill = {
      name: store.ownerName || auth.session.name || store.storeName,
      email: store.ownerEmail || store.storeEmail || auth.session.email,
      contact: store.storePhone || "",
    };

    if (mode === "subscription") {
      if (!plan.razorpayPlanId || plan.razorpaySyncStatus !== "synced") {
        const syncRes = await syncPlanToRazorpay(plan.id);
        if (!syncRes.success) {
          return NextResponse.json(
            {
              success: false,
              message: `Could not sync plan with Razorpay before checkout: ${syncRes.error || "Unknown error"}`,
            },
            { status: 502 }
          );
        }
        plan = (await prisma.subscriptionPlan.findUnique({ where: { id: plan.id } }))!;
      }

      // Reuse existing razorpayCustomerId or create idempotently via fail_existing: 0
      const existingSub = await prisma.storeSubscription.findFirst({
        where: { storeId, razorpayCustomerId: { not: null } },
        orderBy: { id: "desc" },
        select: { razorpayCustomerId: true },
      });

      let razorpayCustomerId = existingSub?.razorpayCustomerId || null;
      if (!razorpayCustomerId) {
        const rzpCust = await razorpayRequest<{ id: string }>("POST", "/customers", {
          name: prefill.name,
          email: prefill.email,
          contact: prefill.contact || undefined,
          fail_existing: 0,
          notes: { storeId: String(storeId), storeName: store.storeName },
        });
        razorpayCustomerId = rzpCust.id;
      }

      const totalCount =
        plan.billingCycle === "yearly" ? 10 : plan.billingCycle === "quarterly" ? 20 : 60;
      const subTax = calculateSaasTaxFromSubtotal(basePrice, 18);

      const rzpSub = await razorpayRequest<{ id: string; status: string }>("POST", "/subscriptions", {
        plan_id: plan.razorpayPlanId,
        total_count: totalCount,
        customer_notify: 1,
        notes: {
          storeId: String(storeId),
          planId: String(plan.id),
          planCode: plan.code,
          userId: String(auth.session.userId),
          razorpayCustomerId: razorpayCustomerId || "",
          amountSubtotal: String(subTax.amountSubtotal),
          gstAmount: String(subTax.gstAmount),
          totalAmount: String(subTax.totalAmount),
        },
      });

      await logAudit({
        storeId,
        userId: auth.session.userId,
        action: "SAAS_CHECKOUT_SUBSCRIPTION_INITIATED",
        entity: "store_subscriptions",
        details: {
          planId: plan.id,
          planCode: plan.code,
          razorpaySubscriptionId: rzpSub.id,
          razorpayCustomerId,
        },
        ipAddress: getClientIp(req),
      });

      return NextResponse.json({
        success: true,
        mode: "subscription",
        razorpayKeyId,
        subscriptionId: rzpSub.id,
        customerId: razorpayCustomerId,
        amountPaise: Math.round(subTax.totalAmount * 100),
        gstBreakdown: subTax,
        currency: "INR",
        plan: {
          id: plan.id,
          code: plan.code,
          name: plan.name,
          priceInr: basePrice,
          billingCycle: plan.billingCycle,
        },
        prefill,
      });
    }

    // Flow B: GST-Inclusive One-Time / Prorated Upgrade Razorpay Order + Pending SubscriptionPayment
    const activePaidSub = await prisma.storeSubscription.findFirst({
      where: { storeId, status: "active" },
      orderBy: [{ id: "desc" }],
      include: { plan: { select: { priceInr: true } } },
    });

    const now = new Date();
    let prorationCreditInr = 0;
    let remainingDays = 0;
    let isUpgradeProration = false;

    if (
      activePaidSub &&
      Number(activePaidSub.plan.priceInr) > 0 &&
      basePrice > Number(activePaidSub.plan.priceInr) &&
      activePaidSub.currentPeriodEnd > now
    ) {
      const totalMs = Math.max(
        86_400_000,
        activePaidSub.currentPeriodEnd.getTime() - activePaidSub.currentPeriodStart.getTime()
      );
      const remMs = Math.max(0, activePaidSub.currentPeriodEnd.getTime() - now.getTime());
      remainingDays = Math.floor(remMs / 86_400_000);
      const rawCredit = Number(activePaidSub.plan.priceInr) * (remMs / totalMs);
      prorationCreditInr = Math.min(Math.max(0, basePrice - 1), Math.round(rawCredit * 100) / 100);
      if (prorationCreditInr > 0) isUpgradeProration = true;
    }

    const netSubtotal = Math.max(1, Math.round((basePrice - prorationCreditInr) * 100) / 100);
    const tax = calculateSaasTaxFromSubtotal(netSubtotal, 18);
    const amountPaise = Math.round(tax.totalAmount * 100);
    const receiptRef = `S${storeId}-P${plan.id}-${Date.now()}`.slice(0, 40);

    const rzpOrder = await razorpayRequest<{ id: string; amount: number; currency: string }>(
      "POST",
      "/orders",
      {
        amount: amountPaise,
        currency: "INR",
        receipt: receiptRef,
        notes: {
          storeId: String(storeId),
          planId: String(plan.id),
          planCode: plan.code,
          userId: String(auth.session.userId),
          amountSubtotal: String(tax.amountSubtotal),
          gstAmount: String(tax.gstAmount),
          prorationCreditInr: String(prorationCreditInr),
        },
      }
    );

    const pendingPayment = await runInTransaction(async (tx) => {
      const invoiceNo = await generateNextSubscriptionInvoiceNo(tx);
      return tx.subscriptionPayment.create({
        data: {
          storeId,
          planId: plan.id,
          invoiceNo,
          amountSubtotal: tax.amountSubtotal,
          gstPercent: tax.gstPercent,
          gstAmount: tax.gstAmount,
          totalAmount: tax.totalAmount,
          currency: "INR",
          paymentType: isUpgradeProration ? "upgrade_proration" : "initial",
          status: "created",
          razorpayOrderId: rzpOrder.id,
        },
      });
    });

    await logAudit({
      storeId,
      userId: auth.session.userId,
      action: "SAAS_CHECKOUT_ORDER_INITIATED",
      entity: "subscription_payments",
      entityId: pendingPayment.id,
      details: {
        planCode: plan.code,
        razorpayOrderId: rzpOrder.id,
        prorationCreditInr,
        totalAmount: tax.totalAmount,
      },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      mode: "order",
      razorpayKeyId,
      orderId: rzpOrder.id,
      amountPaise: rzpOrder.amount,
      currency: rzpOrder.currency,
      paymentRecordId: pendingPayment.id,
      invoiceNo: pendingPayment.invoiceNo,
      prorationCreditInr,
      remainingDays,
      gstBreakdown: tax,
      plan: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        priceInr: basePrice,
        billingCycle: plan.billingCycle,
      },
      prefill,
    });
  } catch (err: any) {
    console.error("[POST /api/admin/billing/checkout Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.description || err?.message || "Checkout initiation failed" },
      { status: err?.status || 500 }
    );
  }
}
