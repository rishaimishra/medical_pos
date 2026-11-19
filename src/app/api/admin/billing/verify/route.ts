import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { getClientIp, logAudit, logPlatformAudit } from "@/lib/audit";
import { invalidateStoreEntitlements } from "@/lib/entitlements";
import {
  calculateSaasTaxFromSubtotal,
  computeSubscriptionPeriodEnd,
  generateNextSubscriptionInvoiceNo,
  verifyRazorpayPaymentSignature,
} from "@/lib/razorpay";

/**
 * MODULE 3.5.2: Crypto Signature Verification & Atomic Subscription Activation (`POST /api/admin/billing/verify`)
 */
export async function POST(req: NextRequest) {
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

    const signatureValid = verifyRazorpayPaymentSignature({
      paymentId,
      orderId,
      subscriptionId,
      signature,
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
