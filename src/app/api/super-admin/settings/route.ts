import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySuperAdminRequest } from "@/lib/auth";
import { getClientIp, logPlatformAudit } from "@/lib/audit";
import { getRazorpayCredentials } from "@/lib/razorpay";
import {
  decryptPlatformSecret,
  encryptPlatformSecret,
  maskSecretLast4,
  verifySameOrigin,
} from "@/lib/platformConfig";

/**
 * MODULE 3.10.1: Platform Settings & Masked Razorpay Config API (`/api/super-admin/settings`)
 * Strictly masks `RAZORPAY_KEY_SECRET` & `RAZORPAY_WEBHOOK_SECRET` to `••••••••1a2b`; raw secrets are never returned.
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const [cfg, webhooks] = await Promise.all([
      prisma.platformConfig.findFirst({ orderBy: { id: "asc" } }),
      prisma.razorpayWebhookEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          eventId: true,
          eventType: true,
          signatureVerified: true,
          processed: true,
          errorMessage: true,
          createdAt: true,
        },
      }),
    ]);

    const envCreds = getRazorpayCredentials();
    const dbKeySecret = decryptPlatformSecret(cfg?.razorpayKeySecretEnc);
    const dbWebhookSecret = decryptPlatformSecret(cfg?.razorpayWebhookSecretEnc);

    const effectiveKeyId = (cfg?.razorpayKeyId || envCreds.keyId || "").trim();
    const effectiveKeySecret = dbKeySecret || envCreds.keySecret || "";
    const effectiveWebhookSecret = dbWebhookSecret || envCreds.webhookSecret || "";

    return NextResponse.json({
      success: true,
      settings: {
        id: cfg?.id || null,
        platformName: cfg?.platformName || "Medical POS Cloud",
        legalEntityName: cfg?.legalEntityName || "Medical POS SaaS Pvt. Ltd.",
        gstNo: cfg?.gstNo || "",
        sacCode: cfg?.sacCode || "998314",
        billingAddress: cfg?.billingAddress || "",
        supportEmail: cfg?.supportEmail || "",
        supportPhone: cfg?.supportPhone || "",
        defaultTrialDays: cfg?.defaultTrialDays ?? 14,
        gracePeriodDays: cfg?.gracePeriodDays ?? 7,
        razorpayMode: cfg?.razorpayMode || envCreds.mode || "test",
        razorpayKeyId: effectiveKeyId,
        razorpayKeySecretMasked: maskSecretLast4(effectiveKeySecret),
        razorpayWebhookSecretMasked: maskSecretLast4(effectiveWebhookSecret),
        hasKeySecret: Boolean(effectiveKeySecret),
        hasWebhookSecret: Boolean(effectiveWebhookSecret),
        keySecretSource: dbKeySecret ? "database" : envCreds.keySecret ? "env" : "unset",
        webhookSecretSource: dbWebhookSecret ? "database" : envCreds.webhookSecret ? "env" : "unset",
        updatedAt: cfg?.updatedAt?.toISOString() || null,
      },
      recentWebhooks: webhooks,
    });
  } catch (err: any) {
    console.error("[GET /api/super-admin/settings Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load platform settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const csrf = verifySameOrigin(req);
  if (!csrf.ok) return csrf.response!;

  const auth = await verifySuperAdminRequest(req, ["ceo", "platform_admin"]);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const existing = await prisma.platformConfig.findFirst({ orderBy: { id: "asc" } });

    const defaultTrialDays = Math.max(
      1,
      Math.min(90, parseInt(String(body.defaultTrialDays ?? existing?.defaultTrialDays ?? 14), 10) || 14)
    );
    const gracePeriodDays = Math.max(
      0,
      Math.min(30, parseInt(String(body.gracePeriodDays ?? existing?.gracePeriodDays ?? 7), 10) || 7)
    );
    const razorpayMode = String(body.razorpayMode || existing?.razorpayMode || "test").toLowerCase() === "live"
      ? "live"
      : "test";

    const updateData: any = {
      platformName:
        body.platformName !== undefined
          ? String(body.platformName || "Medical POS Cloud").trim().slice(0, 255)
          : existing?.platformName || "Medical POS Cloud",
      legalEntityName:
        body.legalEntityName !== undefined
          ? String(body.legalEntityName || "").trim().slice(0, 255) || null
          : existing?.legalEntityName ?? null,
      gstNo:
        body.gstNo !== undefined
          ? String(body.gstNo || "").trim().toUpperCase().slice(0, 50) || null
          : existing?.gstNo ?? null,
      sacCode:
        body.sacCode !== undefined
          ? String(body.sacCode || "998314").trim().slice(0, 20) || "998314"
          : existing?.sacCode || "998314",
      billingAddress:
        body.billingAddress !== undefined
          ? String(body.billingAddress || "").trim() || null
          : existing?.billingAddress ?? null,
      supportEmail:
        body.supportEmail !== undefined
          ? String(body.supportEmail || "").trim().slice(0, 255) || null
          : existing?.supportEmail ?? null,
      supportPhone:
        body.supportPhone !== undefined
          ? String(body.supportPhone || "").trim().slice(0, 50) || null
          : existing?.supportPhone ?? null,
      defaultTrialDays,
      gracePeriodDays,
      razorpayMode,
      razorpayKeyId:
        body.razorpayKeyId !== undefined
          ? String(body.razorpayKeyId || "").trim().slice(0, 255) || null
          : existing?.razorpayKeyId ?? null,
    };

    const incomingKeySecret = typeof body.razorpayKeySecret === "string" ? body.razorpayKeySecret.trim() : "";
    if (incomingKeySecret && !incomingKeySecret.startsWith("••")) {
      updateData.razorpayKeySecretEnc = encryptPlatformSecret(incomingKeySecret);
    }

    const incomingWebhookSecret =
      typeof body.razorpayWebhookSecret === "string" ? body.razorpayWebhookSecret.trim() : "";
    if (incomingWebhookSecret && !incomingWebhookSecret.startsWith("••")) {
      updateData.razorpayWebhookSecretEnc = encryptPlatformSecret(incomingWebhookSecret);
    }

    const saved = existing
      ? await prisma.platformConfig.update({ where: { id: existing.id }, data: updateData })
      : await prisma.platformConfig.create({ data: updateData });

    await logPlatformAudit({
      platformUserId: auth.session.platformUserId,
      action: "PLATFORM_CONFIG_UPDATED",
      entity: "platform_config",
      entityId: saved.id,
      details: {
        platformName: saved.platformName,
        sacCode: saved.sacCode,
        defaultTrialDays: saved.defaultTrialDays,
        gracePeriodDays: saved.gracePeriodDays,
        razorpayMode: saved.razorpayMode,
        updatedKeySecret: Boolean(incomingKeySecret && !incomingKeySecret.startsWith("••")),
        updatedWebhookSecret: Boolean(incomingWebhookSecret && !incomingWebhookSecret.startsWith("••")),
      },
      ipAddress: getClientIp(req),
    });

    const envCreds = getRazorpayCredentials();
    const effKeySecret = decryptPlatformSecret(saved.razorpayKeySecretEnc) || envCreds.keySecret || "";
    const effWebhookSecret =
      decryptPlatformSecret(saved.razorpayWebhookSecretEnc) || envCreds.webhookSecret || "";

    return NextResponse.json({
      success: true,
      message: "Platform settings & encrypted Razorpay config saved.",
      settings: {
        id: saved.id,
        platformName: saved.platformName,
        legalEntityName: saved.legalEntityName,
        gstNo: saved.gstNo,
        sacCode: saved.sacCode,
        billingAddress: saved.billingAddress,
        supportEmail: saved.supportEmail,
        supportPhone: saved.supportPhone,
        defaultTrialDays: saved.defaultTrialDays,
        gracePeriodDays: saved.gracePeriodDays,
        razorpayMode: saved.razorpayMode,
        razorpayKeyId: saved.razorpayKeyId || envCreds.keyId || "",
        razorpayKeySecretMasked: maskSecretLast4(effKeySecret),
        razorpayWebhookSecretMasked: maskSecretLast4(effWebhookSecret),
        hasKeySecret: Boolean(effKeySecret),
        hasWebhookSecret: Boolean(effWebhookSecret),
      },
    });
  } catch (err: any) {
    console.error("[PATCH /api/super-admin/settings Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to update platform settings" },
      { status: 500 }
    );
  }
}
