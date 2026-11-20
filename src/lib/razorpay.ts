import crypto from "crypto";
import { prisma } from "./prisma";
import { decryptPlatformSecret } from "./platformConfig";

/**
 * MODULE 3.5.1 & 3.5.2: Razorpay REST Client, HMAC Crypto Verification,
 * Bidirectional Plan Sync Engine & Sequential Subscription GST Invoice Helpers.
 */

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  mode: "test" | "live";
}

export class RazorpayApiError extends Error {
  status: number;
  code?: string;
  description?: string;

  constructor(message: string, status = 500, code?: string, description?: string) {
    super(message);
    this.name = "RazorpayApiError";
    this.status = status;
    this.code = code;
    this.description = description;
  }
}

export function getRazorpayCredentials(): RazorpayCredentials {
  const keyId = (process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  const mode: "test" | "live" = keyId.startsWith("rzp_live_") ? "live" : "test";

  return { keyId, keySecret, webhookSecret, mode };
}

export function getPublicRazorpayKeyId(): string | null {
  const keyId = (process.env.RAZORPAY_KEY_ID || "").trim();
  return keyId || null;
}

export function isRazorpayConfigured(): boolean {
  const { keyId, keySecret } = getRazorpayCredentials();
  return Boolean(keyId && keySecret);
}

/**
 * Resolves effective Razorpay credentials preferring encrypted PlatformConfig DB entries
 * with `.env` values as fallback so UI-configured secret rotation takes effect immediately.
 */
export async function resolveEffectiveRazorpayCredentials(): Promise<RazorpayCredentials> {
  const envCreds = getRazorpayCredentials();
  try {
    const cfg = await prisma.platformConfig.findFirst({ orderBy: { id: "asc" } });
    if (!cfg) return envCreds;

    const dbKeyId = (cfg.razorpayKeyId || "").trim();
    const dbKeySecret = decryptPlatformSecret(cfg.razorpayKeySecretEnc);
    const dbWebhookSecret = decryptPlatformSecret(cfg.razorpayWebhookSecretEnc);

    const keyId = dbKeyId || envCreds.keyId;
    const keySecret = dbKeySecret || envCreds.keySecret;
    const webhookSecret = dbWebhookSecret || envCreds.webhookSecret;
    const mode: "test" | "live" = keyId.startsWith("rzp_live_") ? "live" : "test";

    return { keyId, keySecret, webhookSecret, mode };
  } catch {
    return envCreds;
  }
}

export async function isRazorpayConfiguredAsync(): Promise<boolean> {
  const { keyId, keySecret } = await resolveEffectiveRazorpayCredentials();
  return Boolean(keyId && keySecret);
}

/**
 * Executes an authenticated REST request against Razorpay API v1 using Basic Auth.
 */
export async function razorpayRequest<T = any>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  endpoint: string,
  body?: unknown
): Promise<T> {
  const { keyId, keySecret } = await resolveEffectiveRazorpayCredentials();
  if (!keyId || !keySecret) {
    throw new RazorpayApiError(
      "Razorpay API keys (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured in environment.",
      500,
      "RAZORPAY_NOT_CONFIGURED"
    );
  }

  const normalizedPath = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `https://api.razorpay.com/v1${normalizedPath}`;
  const authHeader = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    ...(body !== undefined && method !== "GET" ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let parsed: any = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }

  if (!res.ok) {
    const code = parsed?.error?.code || "RAZORPAY_HTTP_ERROR";
    const description =
      parsed?.error?.description || parsed?.message || `Razorpay request failed with status ${res.status}`;
    throw new RazorpayApiError(description, res.status, code, description);
  }

  return parsed as T;
}

function timingSafeHexEqual(aHex: string, bHex: string): boolean {
  const normA = aHex.trim().toLowerCase();
  const normB = bHex.trim().toLowerCase();
  if (!normA || !normB || normA.length !== normB.length) return false;
  return crypto.timingSafeEqual(Buffer.from(normA, "utf8"), Buffer.from(normB, "utf8"));
}

/**
 * Verifies Razorpay Checkout signature via HMAC-SHA256 & timing-safe comparison.
 * - Order flow payload:      `${razorpay_order_id}|${razorpay_payment_id}`
 * - Subscription flow payload: `${razorpay_payment_id}|${razorpay_subscription_id}`
 */
export function verifyRazorpayPaymentSignature(params: {
  paymentId: string;
  orderId?: string | null;
  subscriptionId?: string | null;
  signature: string;
  secretOverride?: string;
}): boolean {
  const secret = (params.secretOverride || getRazorpayCredentials().keySecret).trim();
  if (!secret || !params.paymentId || !params.signature) return false;

  let payload = "";
  if (params.orderId) {
    payload = `${params.orderId}|${params.paymentId}`;
  } else if (params.subscriptionId) {
    payload = `${params.paymentId}|${params.subscriptionId}`;
  } else {
    return false;
  }

  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return timingSafeHexEqual(expected, params.signature);
}

/**
 * Verifies Razorpay webhook `x-razorpay-signature` header against exact raw request text.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secretOverride?: string
): boolean {
  const secret = (secretOverride || getRazorpayCredentials().webhookSecret).trim();
  if (!secret || !rawBody || !signatureHeader) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return timingSafeHexEqual(expected, signatureHeader);
}

/**
 * Maps internal billing cycles to Razorpay Plan `period` & `interval`.
 */
export function mapCycleToRazorpay(
  billingCycle: string,
  intervalCount = 1
): { period: "daily" | "weekly" | "monthly" | "yearly"; interval: number } | null {
  const cycle = (billingCycle || "monthly").toLowerCase();
  const safeInterval = Math.max(1, Number(intervalCount) || 1);

  if (cycle === "monthly") {
    return { period: "monthly", interval: safeInterval };
  }
  if (cycle === "quarterly") {
    // Support both (quarterly, 3) created via UI/API and (quarterly, 1)
    return { period: "monthly", interval: safeInterval >= 3 ? safeInterval : safeInterval * 3 };
  }
  if (cycle === "yearly") {
    return { period: "yearly", interval: safeInterval };
  }
  return null;
}

/**
 * Computes subscription end date given cycle + interval.
 */
export function computeSubscriptionPeriodEnd(
  startDate: Date,
  billingCycle: string,
  intervalCount = 1
): Date {
  const end = new Date(startDate.getTime());
  const cycle = (billingCycle || "monthly").toLowerCase();
  const safeInterval = Math.max(1, Number(intervalCount) || 1);

  if (cycle === "yearly") {
    end.setUTCFullYear(end.getUTCFullYear() + safeInterval);
  } else if (cycle === "quarterly") {
    const months = safeInterval >= 3 ? safeInterval : safeInterval * 3;
    end.setUTCMonth(end.getUTCMonth() + months);
  } else if (cycle === "lifetime") {
    end.setUTCFullYear(end.getUTCFullYear() + 50);
  } else {
    end.setUTCMonth(end.getUTCMonth() + safeInterval);
  }
  return end;
}

/**
 * Computes 18% GST SaaS breakdown from base price (subtotal) OR inclusive total.
 */
export function calculateSaasTaxFromSubtotal(subtotal: number, gstPercent = 18) {
  const safeSub = Math.round(Math.max(0, subtotal) * 100) / 100;
  const gstAmount = Math.round(safeSub * (gstPercent / 100) * 100) / 100;
  const totalAmount = Math.round((safeSub + gstAmount) * 100) / 100;
  return {
    amountSubtotal: safeSub,
    gstPercent,
    gstAmount,
    totalAmount,
  };
}

export function calculateSaasTaxFromInclusiveTotal(total: number, gstPercent = 18) {
  const safeTotal = Math.round(Math.max(0, total) * 100) / 100;
  const divisor = 1 + gstPercent / 100;
  const amountSubtotal = Math.round((safeTotal / divisor) * 100) / 100;
  const gstAmount = Math.round((safeTotal - amountSubtotal) * 100) / 100;
  return {
    amountSubtotal,
    gstPercent,
    gstAmount,
    totalAmount: safeTotal,
  };
}

/**
 * Issues sequential GST Invoice numbers `SUB-INV-YYYY-00001` inside a Prisma transaction.
 */
export async function generateNextSubscriptionInvoiceNo(tx: any): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026350)`;
  const year = new Date().getUTCFullYear();
  const prefix = `SUB-INV-${year}-`;
  const last = await tx.subscriptionPayment.findFirst({
    where: { invoiceNo: { startsWith: prefix } },
    orderBy: { id: "desc" },
    select: { invoiceNo: true },
  });

  let seq = 1;
  if (last?.invoiceNo) {
    const tail = last.invoiceNo.split("-").pop() || "";
    const parsed = parseInt(tail, 10);
    if (!isNaN(parsed)) seq = parsed + 1;
  }
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

/**
 * Syncs a local SubscriptionPlan to Razorpay `POST /v1/plans`.
 * Because Razorpay Plan billing fields are immutable, always creates a new Razorpay plan ID
 * whenever price or billing interval changes while letting existing subscriptions stay grandfathered.
 */
export async function syncPlanToRazorpay(planId: number): Promise<{
  success: boolean;
  skipped?: boolean;
  razorpayPlanId?: string | null;
  error?: string;
}> {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) {
    return { success: false, error: "Subscription plan not found" };
  }

  const price = Number(plan.priceInr);
  const mapped = mapCycleToRazorpay(plan.billingCycle, plan.intervalCount);

  if (price <= 0 || !mapped) {
    await prisma.subscriptionPlan.update({
      where: { id: plan.id },
      data: {
        razorpaySyncStatus: "not_applicable",
        razorpaySyncError: null,
      },
    });
    return { success: true, skipped: true, razorpayPlanId: null };
  }

  try {
    const amountPaise = Math.round(price * 100);
    const created = await razorpayRequest<{ id: string }>("POST", "/plans", {
      period: mapped.period,
      interval: mapped.interval,
      item: {
        name: `${plan.name} (${plan.code})`.slice(0, 120),
        amount: amountPaise,
        currency: "INR",
        description: (plan.tagline || plan.description || `${plan.name} SaaS Subscription`).slice(0, 250),
      },
      notes: {
        dbPlanId: String(plan.id),
        planCode: plan.code,
        billingCycle: plan.billingCycle,
      },
    });

    await prisma.subscriptionPlan.update({
      where: { id: plan.id },
      data: {
        razorpayPlanId: created.id,
        razorpaySyncedAt: new Date(),
        razorpaySyncStatus: "synced",
        razorpaySyncError: null,
      },
    });

    return { success: true, razorpayPlanId: created.id };
  } catch (err: any) {
    const msg = err?.description || err?.message || "Failed to sync plan to Razorpay";
    await prisma.subscriptionPlan.update({
      where: { id: plan.id },
      data: {
        razorpaySyncStatus: "failed",
        razorpaySyncError: msg.slice(0, 1000),
      },
    });
    return { success: false, error: msg };
  }
}

/**
 * Reconciles all active recurring local plans against Razorpay `GET /v1/plans`.
 */
export async function reconcileAllPlansWithRazorpay() {
  const remoteRes = await razorpayRequest<{ items: any[]; count: number }>("GET", "/plans?count=100");
  const remoteMap = new Map<string, any>();
  for (const item of remoteRes.items || []) {
    if (item?.id) remoteMap.set(item.id, item);
  }

  const localPlans = await prisma.subscriptionPlan.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const details: Array<{
    planId: number;
    code: string;
    action: string;
    status: string;
    razorpayPlanId: string | null;
    error?: string;
  }> = [];

  for (const p of localPlans) {
    const mapped = mapCycleToRazorpay(p.billingCycle, p.intervalCount);
    const price = Number(p.priceInr);
    if (price <= 0 || !mapped) {
      if (p.razorpaySyncStatus !== "not_applicable") {
        await prisma.subscriptionPlan.update({
          where: { id: p.id },
          data: { razorpaySyncStatus: "not_applicable", razorpaySyncError: null },
        });
      }
      details.push({
        planId: p.id,
        code: p.code,
        action: "skipped",
        status: "not_applicable",
        razorpayPlanId: null,
      });
      continue;
    }

    if (!p.isActive && !p.razorpayPlanId) {
      details.push({
        planId: p.id,
        code: p.code,
        action: "skipped_archived",
        status: p.razorpaySyncStatus,
        razorpayPlanId: null,
      });
      continue;
    }

    const remote = p.razorpayPlanId ? remoteMap.get(p.razorpayPlanId) : null;
    const expectedPaise = Math.round(price * 100);
    const matchesRemote =
      remote &&
      remote.period === mapped.period &&
      Number(remote.interval) === mapped.interval &&
      Number(remote.item?.amount) === expectedPaise &&
      p.razorpaySyncStatus === "synced";

    if (matchesRemote) {
      await prisma.subscriptionPlan.update({
        where: { id: p.id },
        data: {
          razorpaySyncedAt: new Date(),
          razorpaySyncStatus: "synced",
          razorpaySyncError: null,
        },
      });
      details.push({
        planId: p.id,
        code: p.code,
        action: "verified",
        status: "synced",
        razorpayPlanId: p.razorpayPlanId,
      });
    } else {
      const res = await syncPlanToRazorpay(p.id);
      details.push({
        planId: p.id,
        code: p.code,
        action: p.razorpayPlanId ? "resynced_new_version" : "created_remote",
        status: res.success ? "synced" : "failed",
        razorpayPlanId: res.razorpayPlanId || p.razorpayPlanId,
        ...(res.error ? { error: res.error } : {}),
      });
    }
  }

  return {
    totalLocalPlans: localPlans.length,
    totalRemotePlans: remoteRes.items?.length || 0,
    syncedCount: details.filter((d) => d.status === "synced").length,
    failedCount: details.filter((d) => d.status === "failed").length,
    details,
  };
}
