import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { logPlatformAudit } from "@/lib/audit";
import { escapeHtml, sendEmail } from "@/lib/email";
import { invalidateStoreEntitlements } from "@/lib/entitlements";
import {
  calculateSaasTaxFromInclusiveTotal,
  calculateSaasTaxFromSubtotal,
  computeSubscriptionPeriodEnd,
  generateNextSubscriptionInvoiceNo,
  resolveEffectiveRazorpayCredentials,
  verifyRazorpayWebhookSignature,
} from "@/lib/razorpay";

/**
 * MODULE 3.5.3: Idempotent Razorpay Webhook Processor (`POST /api/webhooks/razorpay`)
 * - Validates `x-razorpay-signature` via timing-safe HMAC-SHA256 on exact raw body text
 * - Protects against duplicate delivery using `RazorpayWebhookEvent.eventId`
 * - Handles subscription activation, recurring renewal charges, payment failures (7d grace),
 *   halt/cancellation, and refunds inside atomic transactions
 */
export async function POST(req: NextRequest) {
  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ success: false, message: "Unreadable request body" }, { status: 400 });
  }

  const effectiveCreds = await resolveEffectiveRazorpayCredentials();
  const signatureHeader = req.headers.get("x-razorpay-signature");
  if (!verifyRazorpayWebhookSignature(rawBody, signatureHeader, effectiveCreds.webhookSecret)) {
    return NextResponse.json(
      { success: false, message: "Invalid Razorpay webhook signature." },
      { status: 401 }
    );
  }

  let payload: any = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, message: "Malformed webhook JSON payload." }, { status: 400 });
  }

  const headerEventId = req.headers.get("x-razorpay-event-id")?.trim();
  const fallbackHash = crypto.createHash("sha256").update(rawBody).digest("hex").slice(0, 32);
  const eventId = headerEventId || payload?.id || `rzp_evt_${fallbackHash}`;
  const eventType = String(payload?.event || "unknown");

  try {
    // 1. Strict Replay Protection Check
    const existingEvent = await prisma.razorpayWebhookEvent.findUnique({
      where: { eventId },
    });
    if (existingEvent?.processed) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        eventId,
        eventType,
        message: "Event already processed idempotently.",
      });
    }

    await prisma.razorpayWebhookEvent.upsert({
      where: { eventId },
      update: {
        eventType,
        payloadJson: rawBody,
        signatureVerified: true,
      },
      create: {
        eventId,
        eventType,
        payloadJson: rawBody,
        signatureVerified: true,
        processed: false,
      },
    });

    const subEntity = payload?.payload?.subscription?.entity || null;
    const payEntity = payload?.payload?.payment?.entity || null;
    const invEntity = payload?.payload?.invoice?.entity || null;
    const refEntity = payload?.payload?.refund?.entity || null;

    const rzpSubId: string | null =
      subEntity?.id || payEntity?.subscription_id || invEntity?.subscription_id || null;
    const rzpPayId: string | null = payEntity?.id || refEntity?.payment_id || null;
    const rzpOrderId: string | null = payEntity?.order_id || invEntity?.order_id || null;

    const notesStoreId = parseInt(
      String(subEntity?.notes?.storeId || payEntity?.notes?.storeId || ""),
      10
    );
    const notesPlanId = parseInt(
      String(subEntity?.notes?.planId || payEntity?.notes?.planId || ""),
      10
    );

    let affectedStoreId: number | null = !isNaN(notesStoreId) ? notesStoreId : null;
    let notifyRetryEmailStoreId: number | null = null;
    let failureReasonText = "";

    await runInTransaction(async (tx) => {
      const cfg = await tx.platformConfig.findFirst({ orderBy: { id: "asc" } });
      const graceDays = cfg?.gracePeriodDays || 7;

      let localSub = rzpSubId
        ? await tx.storeSubscription.findUnique({
            where: { razorpaySubscriptionId: rzpSubId },
            include: { plan: true },
          })
        : null;

      if (!localSub && affectedStoreId) {
        localSub = await tx.storeSubscription.findFirst({
          where: { storeId: affectedStoreId },
          orderBy: { id: "desc" },
          include: { plan: true },
        });
      }

      if (localSub && !affectedStoreId) {
        affectedStoreId = localSub.storeId;
      }

      const now = new Date();

      if (eventType === "subscription.authenticated" || eventType === "subscription.activated") {
        if (!localSub && affectedStoreId && !isNaN(notesPlanId)) {
          const plan = await tx.subscriptionPlan.findUnique({ where: { id: notesPlanId } });
          if (plan) {
            const end = computeSubscriptionPeriodEnd(now, plan.billingCycle, plan.intervalCount);
            localSub = await tx.storeSubscription.create({
              data: {
                storeId: affectedStoreId,
                planId: plan.id,
                status: "active",
                billingMode: "razorpay_subscription",
                razorpaySubscriptionId: rzpSubId,
                razorpayCustomerId: subEntity?.customer_id || null,
                currentPeriodStart: now,
                currentPeriodEnd: end,
                autoRenew: true,
              },
              include: { plan: true },
            });
          }
        } else if (localSub) {
          localSub = await tx.storeSubscription.update({
            where: { id: localSub.id },
            data: {
              status: "active",
              graceEndsAt: null,
              cancelledAt: null,
              cancelAtPeriodEnd: false,
              ...(rzpSubId && !localSub.razorpaySubscriptionId ? { razorpaySubscriptionId: rzpSubId } : {}),
            },
            include: { plan: true },
          });
        }

        if (localSub) {
          await tx.storeSubscription.updateMany({
            where: {
              storeId: localSub.storeId,
              id: { not: localSub.id },
              status: { in: ["active", "trialing", "grace_period"] },
            },
            data: { status: "expired", autoRenew: false },
          });
        }

        if (affectedStoreId) {
          await tx.settings.update({
            where: { id: affectedStoreId },
            data: { storeStatus: "active", suspensionReason: null, suspendedAt: null },
          });
        }
      } else if (eventType === "subscription.charged" || eventType === "invoice.paid") {
        let targetPlan = localSub?.plan || null;
        if (!targetPlan && !isNaN(notesPlanId)) {
          targetPlan = await tx.subscriptionPlan.findUnique({ where: { id: notesPlanId } });
        }

        if (localSub && targetPlan) {
          const anchor = localSub.currentPeriodEnd > now ? localSub.currentPeriodEnd : now;
          const nextEnd = subEntity?.current_end
            ? new Date(Number(subEntity.current_end) * 1000)
            : computeSubscriptionPeriodEnd(anchor, targetPlan.billingCycle, targetPlan.intervalCount);

          localSub = await tx.storeSubscription.update({
            where: { id: localSub.id },
            data: {
              status: "active",
              currentPeriodStart: now,
              currentPeriodEnd: nextEnd,
              graceEndsAt: null,
              ...(rzpSubId && !localSub.razorpaySubscriptionId ? { razorpaySubscriptionId: rzpSubId } : {}),
            },
            include: { plan: true },
          });

          await tx.storeSubscription.updateMany({
            where: {
              storeId: localSub.storeId,
              id: { not: localSub.id },
              status: { in: ["active", "trialing", "grace_period"] },
            },
            data: { status: "expired", autoRenew: false },
          });

          await tx.settings.update({
            where: { id: localSub.storeId },
            data: { storeStatus: "active", suspensionReason: null, suspendedAt: null },
          });
        }

        if (rzpPayId && (localSub || (affectedStoreId && targetPlan))) {
          const existingPay = await tx.subscriptionPayment.findUnique({
            where: { razorpayPaymentId: rzpPayId },
          });
          if (!existingPay) {
            const targetStoreId = localSub?.storeId || affectedStoreId!;
            const resolvedPlan = targetPlan!;
            const basePlanPrice = Number(resolvedPlan.priceInr);
            const paidInr = payEntity?.amount
              ? Number(payEntity.amount) / 100
              : Math.round(basePlanPrice * 1.18 * 100) / 100;
            const tax =
              Math.abs(paidInr - basePlanPrice) < 0.5
                ? calculateSaasTaxFromSubtotal(basePlanPrice, 18)
                : calculateSaasTaxFromInclusiveTotal(paidInr, 18);
            const invoiceNo = await generateNextSubscriptionInvoiceNo(tx);

            await tx.subscriptionPayment.create({
              data: {
                subscriptionId: localSub?.id || null,
                storeId: targetStoreId,
                planId: resolvedPlan.id,
                invoiceNo,
                amountSubtotal: tax.amountSubtotal,
                gstPercent: tax.gstPercent,
                gstAmount: tax.gstAmount,
                totalAmount: tax.totalAmount,
                currency: "INR",
                paymentType: localSub ? "renewal" : "initial",
                status: "captured",
                razorpayOrderId: rzpOrderId,
                razorpayPaymentId: rzpPayId,
                razorpaySubscriptionId: rzpSubId,
                razorpaySignatureVerified: true,
                paymentMethod: payEntity?.method || "razorpay",
                paidAt: now,
              },
            });
          } else if (existingPay.status !== "captured") {
            await tx.subscriptionPayment.update({
              where: { id: existingPay.id },
              data: { status: "captured", paidAt: now, razorpaySignatureVerified: true },
            });
          }
        }
      } else if (eventType === "subscription.pending" || eventType === "payment.failed") {
        const graceUntil = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);
        failureReasonText =
          payEntity?.error_description || payEntity?.error_reason || "Subscription renewal charge failed";

        if (localSub) {
          await tx.storeSubscription.update({
            where: { id: localSub.id },
            data: {
              status: "grace_period",
              graceEndsAt: graceUntil,
            },
          });
          await tx.settings.update({
            where: { id: localSub.storeId },
            data: { storeStatus: "grace_period" },
          });
          notifyRetryEmailStoreId = localSub.storeId;
        } else if (affectedStoreId) {
          await tx.settings.update({
            where: { id: affectedStoreId },
            data: { storeStatus: "grace_period" },
          });
          notifyRetryEmailStoreId = affectedStoreId;
        }

        if (rzpPayId && (localSub || (affectedStoreId && !isNaN(notesPlanId)))) {
          const targetStoreId = localSub?.storeId || affectedStoreId!;
          const targetPlanId = localSub?.planId || notesPlanId;
          const existingPay = await tx.subscriptionPayment.findUnique({
            where: { razorpayPaymentId: rzpPayId },
          });
          if (!existingPay) {
            const invoiceNo = await generateNextSubscriptionInvoiceNo(tx);
            const totalFail = payEntity?.amount ? Number(payEntity.amount) / 100 : 0;
            const tax = calculateSaasTaxFromInclusiveTotal(totalFail, 18);
            await tx.subscriptionPayment.create({
              data: {
                subscriptionId: localSub?.id || null,
                storeId: targetStoreId,
                planId: targetPlanId,
                invoiceNo,
                amountSubtotal: tax.amountSubtotal,
                gstPercent: tax.gstPercent,
                gstAmount: tax.gstAmount,
                totalAmount: tax.totalAmount,
                currency: "INR",
                paymentType: "renewal",
                status: "failed",
                razorpayOrderId: rzpOrderId,
                razorpayPaymentId: rzpPayId,
                razorpaySubscriptionId: rzpSubId,
                failureReason: failureReasonText,
              },
            });
          } else {
            await tx.subscriptionPayment.update({
              where: { id: existingPay.id },
              data: { status: "failed", failureReason: failureReasonText },
            });
          }
        }
      } else if (eventType === "subscription.halted" || eventType === "subscription.cancelled") {
        const nextStatus = eventType === "subscription.halted" ? "suspended" : "cancelled";
        if (localSub) {
          await tx.storeSubscription.update({
            where: { id: localSub.id },
            data: {
              status: nextStatus,
              cancelledAt: now,
              autoRenew: false,
            },
          });
          if (eventType === "subscription.halted" || localSub.currentPeriodEnd <= now) {
            await tx.settings.update({
              where: { id: localSub.storeId },
              data: {
                storeStatus: "suspended",
                suspensionReason: "Subscription halted or cancelled after payment retry exhaustion.",
                suspendedAt: now,
              },
            });
          }
        }
      } else if (eventType === "refund.processed") {
        const targetPaymentId = refEntity?.payment_id || rzpPayId;
        if (targetPaymentId) {
          await tx.subscriptionPayment.updateMany({
            where: { razorpayPaymentId: targetPaymentId },
            data: { status: "refunded" },
          });
        }
      }

      await tx.razorpayWebhookEvent.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date(), errorMessage: null },
      });
    });

    if (affectedStoreId) {
      invalidateStoreEntitlements(affectedStoreId);
    }

    await logPlatformAudit({
      storeId: affectedStoreId,
      action: `RAZORPAY_WEBHOOK_${eventType.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`,
      entity: "razorpay_webhook_events",
      details: { eventId, eventType, rzpSubId, rzpPayId },
    });

    // Non-blocking payment retry email alert to Store Owner on failure / grace period transition
    if (notifyRetryEmailStoreId) {
      const store = await prisma.settings.findUnique({
        where: { id: notifyRetryEmailStoreId },
        select: { storeName: true, ownerEmail: true, storeEmail: true },
      });
      const targetEmail = store?.ownerEmail || store?.storeEmail;
      if (targetEmail) {
        sendEmail({
          to: targetEmail,
          subject: `[Action Required] Subscription Renewal Failed — 7-Day Grace Period Active (${store?.storeName})`,
          html: `<p>Your Razorpay subscription renewal failed (${escapeHtml(
            failureReasonText
          )}).</p><p>Your POS terminal remains open under a <strong>7-day Grace Period</strong>. Please update payment details at <strong>/admin/billing</strong> to prevent service interruption.</p>`,
          text: `Subscription renewal failed (${failureReasonText}). Your store is in a 7-day grace period; update payment at /admin/billing.`,
        }).catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      eventId,
      eventType,
      processed: true,
    });
  } catch (err: any) {
    console.error("[POST /api/webhooks/razorpay Error]:", err);
    await prisma.razorpayWebhookEvent
      .updateMany({
        where: { eventId },
        data: { errorMessage: (err?.message || "Webhook error").slice(0, 1000) },
      })
      .catch(() => {});
    return NextResponse.json(
      { success: false, message: err?.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}
