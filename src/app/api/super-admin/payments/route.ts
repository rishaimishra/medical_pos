import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { verifySuperAdminRequest } from "@/lib/auth";
import { verifySameOrigin } from "@/lib/platformConfig";
import { getClientIp, logPlatformAudit } from "@/lib/audit";
import { invalidateStoreEntitlements } from "@/lib/entitlements";
import {
  calculateSaasTaxFromSubtotal,
  computeSubscriptionPeriodEnd,
  generateNextSubscriptionInvoiceNo,
} from "@/lib/razorpay";

/**
 * MODULE 3.5: Global SaaS Payments, Offline Enterprise Grants, Refunds & GST Tax Invoices API
 * (`/api/super-admin/payments`)
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = (searchParams.get("status") || "all").toLowerCase();
  const typeFilter = (searchParams.get("paymentType") || "all").toLowerCase();
  const storeIdParam = searchParams.get("storeId");
  const search = (searchParams.get("search") || "").trim().toLowerCase();

  try {
    const where: any = {};
    if (statusFilter !== "all") where.status = statusFilter;
    if (typeFilter !== "all") where.paymentType = typeFilter;
    if (storeIdParam && storeIdParam !== "all") {
      const sId = parseInt(storeIdParam, 10);
      if (!isNaN(sId)) where.storeId = sId;
    }

    const [payments, allPaymentsForKpi, recentWebhooks, platformCfg, plans, stores] = await Promise.all([
      prisma.subscriptionPayment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 150,
        include: {
          store: {
            select: {
              id: true,
              storeName: true,
              storeGst: true,
              storeAddress: true,
              ownerEmail: true,
              storeEmail: true,
              city: true,
              state: true,
            },
          },
          plan: { select: { id: true, code: true, name: true, billingCycle: true } },
        },
      }),
      prisma.subscriptionPayment.findMany({
        select: {
          status: true,
          amountSubtotal: true,
          gstAmount: true,
          totalAmount: true,
        },
      }),
      prisma.razorpayWebhookEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          eventId: true,
          eventType: true,
          signatureVerified: true,
          processed: true,
          processedAt: true,
          errorMessage: true,
          createdAt: true,
        },
      }),
      prisma.platformConfig.findFirst({ orderBy: { id: "asc" } }),
      prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { priceInr: "asc" }],
        select: { id: true, code: true, name: true, priceInr: true, billingCycle: true },
      }),
      prisma.settings.findMany({
        where: { OR: [{ setupDone: true }, { branches: { some: {} } }] },
        orderBy: { id: "asc" },
        select: { id: true, storeName: true },
      }),
    ]);

    let netPreGst = 0;
    let netGst = 0;
    let netTotal = 0;
    let totalRefunded = 0;
    let capturedCount = 0;
    let failedCount = 0;
    let refundedCount = 0;

    for (const p of allPaymentsForKpi) {
      if (p.status === "captured") {
        capturedCount++;
        netPreGst += Number(p.amountSubtotal);
        netGst += Number(p.gstAmount);
        netTotal += Number(p.totalAmount);
      } else if (p.status === "refunded") {
        refundedCount++;
        totalRefunded += Number(p.totalAmount);
        netPreGst -= Number(p.amountSubtotal);
        netGst -= Number(p.gstAmount);
        netTotal -= Number(p.totalAmount);
      } else if (p.status === "failed") {
        failedCount++;
      }
    }

    const filtered = payments
      .filter((p) => {
        if (!search) return true;
        const hay = [
          p.invoiceNo,
          p.razorpayPaymentId,
          p.razorpayOrderId,
          p.razorpaySubscriptionId,
          p.store?.storeName,
          p.store?.storeGst,
          p.plan?.name,
          p.plan?.code,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(search);
      })
      .map((p) => ({
        id: p.id,
        invoiceNo: p.invoiceNo,
        storeId: p.storeId,
        storeName: p.store?.storeName || `Store #${p.storeId}`,
        storeGst: p.store?.storeGst || null,
        storeAddress: p.store?.storeAddress || null,
        planId: p.planId,
        planCode: p.plan?.code || "PLAN",
        planName: p.plan?.name || "Subscription Plan",
        amountSubtotal: Number(p.amountSubtotal),
        gstPercent: Number(p.gstPercent),
        gstAmount: Number(p.gstAmount),
        totalAmount: Number(p.totalAmount),
        currency: p.currency,
        paymentType: p.paymentType,
        status: p.status,
        paymentMethod: p.paymentMethod,
        razorpayOrderId: p.razorpayOrderId,
        razorpayPaymentId: p.razorpayPaymentId,
        razorpaySubscriptionId: p.razorpaySubscriptionId,
        failureReason: p.failureReason,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      }));

    return NextResponse.json({
      success: true,
      payments: filtered,
      recentWebhooks,
      plans: plans.map((pl) => ({ ...pl, priceInr: Number(pl.priceInr) })),
      stores,
      platformCompany: {
        platformName: platformCfg?.platformName || "Medical POS Cloud",
        legalEntityName: platformCfg?.legalEntityName || "Medical POS SaaS Pvt. Ltd.",
        gstNo: platformCfg?.gstNo || null,
        sacCode: platformCfg?.sacCode || "998314",
        billingAddress: platformCfg?.billingAddress || "India",
      },
      summary: {
        netPreGst: Math.round(netPreGst * 100) / 100,
        netGst: Math.round(netGst * 100) / 100,
        netTotal: Math.round(netTotal * 100) / 100,
        totalRefunded: Math.round(totalRefunded * 100) / 100,
        capturedCount,
        failedCount,
        refundedCount,
      },
    });
  } catch (err: any) {
    console.error("[GET /api/super-admin/payments Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load payments ledger" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const originCheck = verifySameOrigin(req);
  if (!originCheck.ok && originCheck.response) return originCheck.response;

  const auth = await verifySuperAdminRequest(req, ["ceo", "platform_admin", "finance_ops"]);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const action = String(body.action || "record_offline_payment").toLowerCase();
    const ip = getClientIp(req);

    if (action === "record_offline_payment") {
      const storeId = parseInt(String(body.storeId || ""), 10);
      const planId = parseInt(String(body.planId || ""), 10);
      const paymentMethod = String(body.paymentMethod || "bank_neft").trim().toLowerCase();
      const referenceNotes = body.referenceNotes ? String(body.referenceNotes).trim() : null;

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

      const customSubtotal =
        body.amountSubtotal !== undefined && body.amountSubtotal !== ""
          ? parseFloat(String(body.amountSubtotal))
          : Number(plan.priceInr);
      const safeSubtotal = !isNaN(customSubtotal) && customSubtotal >= 0 ? customSubtotal : Number(plan.priceInr);
      const tax = calculateSaasTaxFromSubtotal(safeSubtotal, 18);
      const now = new Date();
      const periodEnd = computeSubscriptionPeriodEnd(now, plan.billingCycle, plan.intervalCount);

      const { subscription, payment } = await runInTransaction(async (tx) => {
        await tx.storeSubscription.updateMany({
          where: { storeId, status: { in: ["active", "trialing", "grace_period", "past_due"] } },
          data: { status: "expired", autoRenew: false },
        });

        const sub = await tx.storeSubscription.create({
          data: {
            storeId,
            planId: plan.id,
            status: "active",
            billingMode: "manual_grant",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            autoRenew: false,
            grantedByPlatformUserId: auth.session!.platformUserId,
            notes: referenceNotes || `Offline ${paymentMethod.toUpperCase()} payment recorded by ${auth.session!.name}`,
          },
        });

        await tx.settings.update({
          where: { id: storeId },
          data: { storeStatus: "active", suspensionReason: null, suspendedAt: null },
        });

        const invoiceNo = await generateNextSubscriptionInvoiceNo(tx);
        const pay = await tx.subscriptionPayment.create({
          data: {
            subscriptionId: sub.id,
            storeId,
            planId: plan.id,
            invoiceNo,
            amountSubtotal: tax.amountSubtotal,
            gstPercent: tax.gstPercent,
            gstAmount: tax.gstAmount,
            totalAmount: tax.totalAmount,
            currency: "INR",
            paymentType: "manual_offline",
            status: "captured",
            paymentMethod,
            paidAt: now,
          },
        });

        return { subscription: sub, payment: pay };
      });

      invalidateStoreEntitlements(storeId);
      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        storeId,
        action: "OFFLINE_PAYMENT_RECORDED",
        entity: "subscription_payments",
        entityId: payment.id,
        details: {
          invoiceNo: payment.invoiceNo,
          planCode: plan.code,
          totalAmount: tax.totalAmount,
          paymentMethod,
        },
        ipAddress: ip,
      });

      return NextResponse.json(
        {
          success: true,
          subscription,
          payment: {
            ...payment,
            amountSubtotal: Number(payment.amountSubtotal),
            gstAmount: Number(payment.gstAmount),
            totalAmount: Number(payment.totalAmount),
          },
          message: `Recorded offline payment & generated GST invoice ${payment.invoiceNo}.`,
        },
        { status: 201 }
      );
    }

    if (action === "mark_refunded") {
      const paymentId = parseInt(String(body.paymentId || ""), 10);
      const reason = String(body.reason || "Refund processed by platform finance").trim();
      if (!paymentId || isNaN(paymentId)) {
        return NextResponse.json({ success: false, message: "Valid paymentId is required." }, { status: 400 });
      }

      const existing = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
      if (!existing) {
        return NextResponse.json({ success: false, message: "Payment record not found." }, { status: 404 });
      }

      const updated = await prisma.subscriptionPayment.update({
        where: { id: paymentId },
        data: { status: "refunded", failureReason: reason },
      });

      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        storeId: existing.storeId,
        action: "PAYMENT_MARKED_REFUNDED",
        entity: "subscription_payments",
        entityId: paymentId,
        details: { invoiceNo: existing.invoiceNo, reason },
        ipAddress: ip,
      });

      return NextResponse.json({
        success: true,
        payment: updated,
        message: `Invoice ${existing.invoiceNo} marked as refunded.`,
      });
    }

    return NextResponse.json({ success: false, message: "Unsupported payment action." }, { status: 400 });
  } catch (err: any) {
    console.error("[POST /api/super-admin/payments Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to process payment operation" },
      { status: 500 }
    );
  }
}
