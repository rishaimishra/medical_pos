import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface AppConfig {
  storeName: string;
  storeAddress: string | null;
  storePhone: string | null;
  storeEmail: string | null;
  storeGst: string | null;
  storeDl: string | null;
  currency: string;
  timezone: string;
  appMode: "development" | "production" | "test";
  lowQtyThreshold: number;
  expiryDaysThreshold: number;
  setupDone: boolean;
  storage: string;
  defaultGstPercent: number;
  perPageDefault: number;
  version?: string;
}

export const APP_VERSION = "0.1.0";

export const DEFAULT_CONFIG: AppConfig = {
  storeName: "Medical POS Pharmacy",
  storeAddress: null,
  storePhone: null,
  storeEmail: null,
  storeGst: null,
  storeDl: null,
  currency: "₹",
  timezone: process.env.APP_TIMEZONE || "Asia/Kolkata",
  appMode: (process.env.NODE_ENV as "development" | "production" | "test") || "development",
  lowQtyThreshold: 10,
  expiryDaysThreshold: 90,
  setupDone: false,
  storage: "postgres",
  defaultGstPercent: 18.0,
  perPageDefault: 25,
  version: APP_VERSION,
};

export const APP_CONFIG = {
  ...DEFAULT_CONFIG,
  sessionTimeoutMinutes: 120, // 2-hour inactivity auto-lock (1.4.1)
  maxLoginAttempts: 5, // 5 failed attempts limit (1.4.2)
  lockoutDurationMinutes: 15, // 15-minute lockout window (1.4.2)
};

/**
 * Get centralized pharmacy store settings from DB or seeded defaults.
 * Accepts optional storeId for multi-tenant isolation.
 * Read-only safe: never creates dummy rows on read.
 */
export async function getStoreSettings(storeId?: number | null): Promise<AppConfig> {
  try {
    const settings = storeId
      ? await prisma.settings.findUnique({ where: { id: storeId } })
      : await prisma.settings.findFirst({
          where: { setupDone: true },
          orderBy: { createdAt: "desc" },
        });

    if (!settings) {
      return DEFAULT_CONFIG;
    }

    return {
      storeName: settings.storeName || DEFAULT_CONFIG.storeName,
      storeAddress: settings.storeAddress,
      storePhone: settings.storePhone,
      storeEmail: settings.storeEmail,
      storeGst: settings.storeGst,
      storeDl: settings.storeDl,
      currency: settings.currency || DEFAULT_CONFIG.currency,
      timezone: process.env.APP_TIMEZONE || "Asia/Kolkata",
      appMode: (process.env.NODE_ENV as "development" | "production" | "test") || "development",
      lowQtyThreshold: typeof settings.lowQty === "number" ? settings.lowQty : DEFAULT_CONFIG.lowQtyThreshold,
      expiryDaysThreshold: typeof settings.expiryDays === "number" ? settings.expiryDays : DEFAULT_CONFIG.expiryDaysThreshold,
      setupDone: Boolean(settings.setupDone),
      storage: settings.storage || "postgres",
      defaultGstPercent: DEFAULT_CONFIG.defaultGstPercent,
      perPageDefault: DEFAULT_CONFIG.perPageDefault,
    };
  } catch (error) {
    console.error("Failed to read settings from database, falling back to defaults:", error);
    return DEFAULT_CONFIG;
  }
}

/**
 * Update centralized pharmacy store settings for a specific store tenant.
 */
export async function updateStoreSettings(
  data: Partial<{
    storeName: string;
    storeAddress: string | null;
    storePhone: string | null;
    storeEmail: string | null;
    storeGst: string | null;
    storeDl: string | null;
    currency: string;
    lowQty: number;
    expiryDays: number;
    setupDone: boolean;
    smtpHost: string | null;
    smtpPort: number;
    smtpUser: string | null;
    smtpPass: string | null;
    smtpFrom: string | null;
    smtpName: string | null;
    smtpSecure: string;
  }>,
  storeId?: number | null
) {
  const current = storeId
    ? await prisma.settings.findUnique({ where: { id: storeId } })
    : await prisma.settings.findFirst({ where: { setupDone: true } });

  if (current) {
    return prisma.settings.update({
      where: { id: current.id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  } else {
    return prisma.settings.create({
      data: {
        storeName: data.storeName || DEFAULT_CONFIG.storeName,
        currency: data.currency || DEFAULT_CONFIG.currency,
        lowQty: typeof data.lowQty === "number" ? data.lowQty : DEFAULT_CONFIG.lowQtyThreshold,
        expiryDays: typeof data.expiryDays === "number" ? data.expiryDays : DEFAULT_CONFIG.expiryDaysThreshold,
        setupDone: data.setupDone ?? false,
        storage: "postgres",
        ...data,
      },
    });
  }
}

/**
 * Checks whether setup wizard is completed for any store (or a specific storeId).
 */
export async function isSetupCompleted(storeId?: number | null): Promise<boolean> {
  try {
    const settings = await prisma.settings.findFirst({
      where: {
        setupDone: true,
        ...(storeId ? { id: storeId } : {}),
      },
      select: { id: true, setupDone: true },
    });
    if (!settings || !settings.setupDone) return false;

    const adminCount = await prisma.user.count({
      where: {
        role: "admin",
        active: true,
        ...(storeId ? { storeId: settings.id } : {}),
      },
    });
    return adminCount > 0;
  } catch (err) {
    return false;
  }
}

/**
 * Helper to format currency values cleanly with active store symbol (default ₹).
 */
export function formatCurrency(
  amount: number | string | Prisma.Decimal,
  currency: string = "₹"
): string {
  const num = typeof amount === "number" ? amount : Number(amount);
  if (isNaN(num)) return `${currency}0.00`;
  return `${currency}${num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Expiry classification for pharmaceutical inventory (FEFO / Alert Tiers).
 */
export type ExpiryTier = "expired" | "critical_30" | "warning_90" | "safe";

export function getExpiryStatus(
  expiryDate: Date | string,
  warningThresholdDays: number = 90
): { tier: ExpiryTier; daysRemaining: number; label: string } {
  const exp = typeof expiryDate === "string" ? new Date(expiryDate) : expiryDate;
  const now = new Date();
  
  // Calculate difference in whole days
  const diffTime = exp.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysRemaining <= 0) {
    return { tier: "expired", daysRemaining, label: "Expired" };
  } else if (daysRemaining <= 30) {
    return { tier: "critical_30", daysRemaining, label: `Expiring in ${daysRemaining} days (Critical)` };
  } else if (daysRemaining <= warningThresholdDays) {
    return { tier: "warning_90", daysRemaining, label: `Expiring in ${daysRemaining} days` };
  } else {
    return { tier: "safe", daysRemaining, label: "Safe Stock" };
  }
}

