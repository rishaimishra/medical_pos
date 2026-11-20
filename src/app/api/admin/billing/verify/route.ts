import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { getClientIp, logAudit, logPlatformAudit } from "@/lib/audit";
import { verifySameOrigin } from "@/lib/platformConfig";
import { invalidateStoreEntitlements } from "@/lib/entitlements";
import {
  calculateSaasTaxFromSubtotal,
  computeSubscriptionPeriodEnd,
  generateNextSubscriptionInvoiceNo,
  resolveEffectiveRazorpayCredentials,
  verifyRazorpayPaymentSignature,
} from "@/lib/razorpay";

/**
 * MODULE 3.5.2: Crypto Signature Verification & Atomic Subscription Activation (`POST /api/admin/billing/verify`)
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
      { success: false, message: "Only Store Administrators can verify billing payments." },
      { status: 403 }
    );
  }

  const storeId = auth.session.storeId;
  if (!storeId) {
    return NextResponse.json({ success: false, message: "Store workspace not found." }, { status: 400 });
  }

  const ip = getClientIp(req);

  try {
    const body = await req.json();
    const planId = parseInt(String(body.planId || ""), 10);
    const paymentId = String(body.razorpay_payment_id || "").trim();
    const orderId = body.razorpay_order_id ? String(body.razorpay_order_id).trim() : null;
    const subscriptionId = body.razorpay_subscription_id
      ? String(body.razorpay_subscription_id).trim()
      : null;
    const signature = String(body.razorpay_signature || "").trim();
    const paymentMethod = body.paymentMethod ? String(body.paymentMethod).trim() : "razorpay";
    const razorpayCustomerId = body.razorpay_customer_id
      ? String(body.razorpay_customer_id).trim()
      : null;

    if (!planId || isNaN(planId) || !paymentId || !signature || (!orderId && !subscriptionId)) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required Razorpay verification parameters (paymentId, order/subscriptionId, signature).",
        },
        { status: 400 }
      );
    }

    const effectiveCreds = await resolveEffectiveRazorpayCredentials();
    const signatureValid = verifyRazorpayPaymentSignature({
      paymentId,
      orderId,
      subscriptionId,
      signature,
      secretOverride: effectiveCreds.keySecret,
    });

    if (!signatureValid) {
      await logAudit({
        storeId,
        userId: auth.session.userId,
        action: "SAAS_PAYMENT_SIGNATURE_FAILED",
        entity: "subscription_payments",
        details: { paymentId, orderId, subscriptionId },
        ipAddress: ip,
      });
      return NextResponse.json(
        { success: false, message: "Razorpay signature verification failed. Payment not trusted." },
        { status: 400 }
      );
    }

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) {
      return NextResponse.json({ success: false, message: "Plan not found." }, { status: 404 });
    }

    // Security Guard (BUG-3.5-A): Prevent plan-tampering where an order/subscription initiated for a cheaper tier is verified against a higher tier planId
    if (orderId) {
      const orderPayment = await prisma.subscriptionPayment.findFirst({
        where: { razorpayOrderId: orderId },
      });
      if (orderPayment && (orderPayment.storeId !== storeId || orderPayment.planId !== plan.id)) {
        return NextResponse.json(
          {
            success: false,
            message: "Security Error: Razorpay Order does not match the requested subscription plan or store.",
          },
          { status: 400 }
        );
      }
    }

    if (subscriptionId) {
      const existingSubRow = await prisma.storeSubscription.findUnique({
        where: { razorpaySubscriptionId: subscriptionId },
      });
      if (existingSubRow && (existingSubRow.storeId !== storeId || existingSubRow.planId !== plan.id)) {
        return NextResponse.json(
          {
            success: false,
            message: "Security Error: Razorpay Subscription belongs to a different store or plan.",
          },
          { status: 400 }
        );
      }

      const initAudit = await prisma.auditLog.findFirst({
        where: {
          action: "SAAS_CHECKOUT_SUBSCRIPTION_INITIATED",
          details: { contains: subscriptionId },
        },
        orderBy: { id: "desc" },
      });
      if (initAudit) {
        if (initAudit.storeId && initAudit.storeId !== storeId) {
          return NextResponse.json(
            { success: false, message: "Security Error: Subscription was initiated by another store." },
            { status: 400 }
          );
        }
        try {
          const parsedDetails = JSON.parse(initAudit.details || "{}");
          if (
            (parsedDetails.planId && Number(parsedDetails.planId) !== plan.id) ||
            (parsedDetails.planCode && parsedDetails.planCode !== plan.code)
          ) {
            return NextResponse.json(
              {
                success: false,
                message: `Security Error: Razorpay Subscription was initiated for plan '${parsedDetails.planCode || parsedDetails.planId}', not '${plan.code}'.`,
              },
              { status: 400 }
            );
          }
        } catch {
          // ignore non-JSON details
        }
      }
    }

    // Idempotency guard if already verified & captured
    const alreadyCaptured = await prisma.subscriptionPayment.findUnique({
      where: { razorpayPaymentId: paymentId },
    });
    if (alreadyCaptured && alreadyCaptured.status === "captured") {
      invalidateStoreEntitlements(storeId);
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        invoiceNo: alreadyCaptured.invoiceNo,
        message: "Payment already verified and subscription active.",
      });
    }

    const now = new Date();
    const result = await runInTransaction(async (tx) => {
      const existingActive = await tx.storeSubscription.findFirst({
        where: { storeId, status: { in: ["active", "grace_period"] } },
        orderBy: { id: "desc" },
      });

      const periodStart = now;
      const baseAnchor =
        existingActive && existingActive.planId === plan.id && existingActive.currentPeriodEnd > now
          ? existingActive.currentPeriodEnd
          : now;
      const periodEnd = computeSubscriptionPeriodEnd(baseAnchor, plan.billingCycle, plan.intervalCount);

      let subscription;
      if (subscriptionId) {
        subscription = await tx.storeSubscription.upsert({
          where: { razorpaySubscriptionId: subscriptionId },
          update: {
            planId: plan.id,
            status: "active",
            billingMode: "razorpay_subscription",
            razorpayCustomerId,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            graceEndsAt: null,
            cancelAtPeriodEnd: false,
            cancelledAt: null,
            autoRenew: true,
          },
          create: {
            storeId,
            planId: plan.id,
            status: "active",
            billingMode: "razorpay_subscription",
            razorpaySubscriptionId: subscriptionId,
            razorpayCustomerId,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            autoRenew: true,
          },
        });
      } else {
        subscription = await tx.storeSubscription.create({
          data: {
            storeId,
            planId: plan.id,
            status: "active",
            billingMode: "razorpay_order",
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            autoRenew: false,
          },
        });
      }

      await tx.storeSubscription.updateMany({
        where: {
          storeId,
          id: { not: subscription.id },
          status: { in: ["active", "trialing", "grace_period"] },
        },
        data: { status: "expired", autoRenew: false },
      });

      await tx.settings.update({
        where: { id: storeId },
        data: {
          storeStatus: "active",
          suspensionReason: null,
          suspendedAt: null,
        },
      });

      let paymentRecord = orderId
        ? await tx.subscriptionPayment.findFirst({
            where: { storeId, razorpayOrderId: orderId },
          })
        : null;

      if (paymentRecord) {
        paymentRecord = await tx.subscriptionPayment.update({
          where: { id: paymentRecord.id },
          data: {
            subscriptionId: subscription.id,
            status: "captured",
            razorpayPaymentId: paymentId,
            razorpaySubscriptionId: subscriptionId,
            razorpaySignatureVerified: true,
            paymentMethod,
            paidAt: now,
            paymentType: existingActive ? "upgrade_proration" : "initial",
          },
        });
      } else {
        const invoiceNo = await generateNextSubscriptionInvoiceNo(tx);
        const tax = calculateSaasTaxFromSubtotal(Number(plan.priceInr), 18);
        paymentRecord = await tx.subscriptionPayment.create({
          data: {
            subscriptionId: subscription.id,
            storeId,
            planId: plan.id,
            invoiceNo,
            amountSubtotal: tax.amountSubtotal,
            gstPercent: tax.gstPercent,
            gstAmount: tax.gstAmount,
            totalAmount: tax.totalAmount,
            currency: "INR",
            paymentType: existingActive ? "upgrade_proration" : "initial",
            status: "captured",
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId,
            razorpaySubscriptionId: subscriptionId,
            razorpaySignatureVerified: true,
            paymentMethod,
            paidAt: now,
          },
        });
      }

      return { subscription, paymentRecord };
    });

    invalidateStoreEntitlements(storeId);

    await Promise.all([
      logAudit({
        storeId,
        userId: auth.session.userId,
        action: "SAAS_SUBSCRIPTION_ACTIVATED",
        entity: "store_subscriptions",
        entityId: result.subscription.id,
        details: {
          planCode: plan.code,
          invoiceNo: result.paymentRecord.invoiceNo,
          razorpayPaymentId: paymentId,
        },
        ipAddress: ip,
      }),
      logPlatformAudit({
        storeId,
        action: "STORE_PAYMENT_VERIFIED_AND_ACTIVATED",
        entity: "subscription_payments",
        entityId: result.paymentRecord.id,
        details: {
          planCode: plan.code,
          invoiceNo: result.paymentRecord.invoiceNo,
          totalAmount: Number(result.paymentRecord.totalAmount),
        },
        ipAddress: ip,
      }),
    ]);

    return NextResponse.json({
      success: true,
      subscription: result.subscription,
      payment: {
        ...result.paymentRecord,
        amountSubtotal: Number(result.paymentRecord.amountSubtotal),
        gstAmount: Number(result.paymentRecord.gstAmount),
        totalAmount: Number(result.paymentRecord.totalAmount),
      },
      invoiceNo: result.paymentRecord.invoiceNo,
      message: `${plan.name} plan activated! Invoice ${result.paymentRecord.invoiceNo} generated.`,
    });
  } catch (err: any) {
    console.error("[POST /api/admin/billing/verify Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to verify Razorpay payment" },
      { status: 500 }
    );
  }
}
