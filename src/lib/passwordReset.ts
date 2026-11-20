import crypto from "crypto";
import { prisma, runInTransaction } from "./db-transaction";
import {
  clearFailedLoginAttempts,
  hashPassword,
  normalizePhoneValue,
} from "./auth";
import { logAudit, logPlatformAudit } from "./audit";
import { sendPasswordResetOtpEmail } from "./email";

export type AuthPanel = "admin" | "super_admin" | "customer" | "supplier";

export interface PanelResetMeta {
  label: string;
  minPasswordLength: number;
  storeNameDefault: string;
}

export const PANEL_RESET_META: Record<AuthPanel, PanelResetMeta> = {
  admin: {
    label: "Staff & Store Admin Portal",
    minPasswordLength: 6,
    storeNameDefault: "Medical POS Pharmacy",
  },
  super_admin: {
    label: "CEO / Super Admin Command Tower",
    minPasswordLength: 8,
    storeNameDefault: "Medical POS Cloud",
  },
  customer: {
    label: "Patient & Customer Portal",
    minPasswordLength: 6,
    storeNameDefault: "Medical POS Pharmacy",
  },
  supplier: {
    label: "Supplier & Distributor Portal",
    minPasswordLength: 6,
    storeNameDefault: "Medical POS Pharmacy",
  },
};

export const OTP_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
export const OTP_RESEND_COOLDOWN_MS = 45 * 1000; // 45 seconds
export const OTP_MAX_ATTEMPTS = 5;

const OTP_HMAC_SECRET =
  process.env.PASSWORD_RESET_OTP_SECRET ||
  process.env.SESSION_SECRET ||
  process.env.PLATFORM_CONFIG_ENCRYPTION_KEY ||
  process.env.DATABASE_URL ||
  "med_pos_reset_otp_secret_2026";

export interface ResolvedPanelAccount {
  panel: AuthPanel;
  targetUserId: number;
  email: string;
  name: string;
  secondaryIdentifier: string;
  storeId: number | null;
  storeName: string | null;
}

export function isValidAuthPanel(value: string): value is AuthPanel {
  return value === "admin" || value === "super_admin" || value === "customer" || value === "supplier";
}

export function generateSixDigitOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashResetOtp(
  panel: AuthPanel,
  targetUserId: number,
  email: string,
  otpCode: string
): string {
  return crypto
    .createHmac("sha256", OTP_HMAC_SECRET)
    .update(`${panel}:${targetUserId}:${email.trim().toLowerCase()}:${otpCode.trim()}`)
    .digest("hex");
}

function timingSafeHexEqual(aHex: string, bHex: string): boolean {
  const cleanA = aHex.trim().toLowerCase();
  const cleanB = bHex.trim().toLowerCase();
  if (!cleanA || !cleanB || cleanA.length !== cleanB.length) return false;
  return crypto.timingSafeEqual(Buffer.from(cleanA, "utf8"), Buffer.from(cleanB, "utf8"));
}

/**
 * Resolves an active, reset-eligible account across Admin, Super Admin, Customer, or Supplier panels.
 */
export async function resolvePanelAccount(
  panel: AuthPanel,
  rawIdentifier: string
): Promise<ResolvedPanelAccount | null> {
  const clean = rawIdentifier.trim();
  if (!clean) return null;

  if (panel === "admin") {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: clean, mode: "insensitive" } },
          { email: { equals: clean, mode: "insensitive" } },
        ],
      },
      include: {
        store: { select: { id: true, storeName: true } },
        branch: {
          select: {
            id: true,
            storeId: true,
            active: true,
            isMain: true,
            store: { select: { storeName: true } },
          },
        },
      },
    });
    if (!user || !user.active || !user.email?.trim()) return null;
    if (
      user.role.toLowerCase() !== "admin" &&
      user.branchId !== null &&
      user.branch &&
      !user.branch.active &&
      !user.branch.isMain
    ) {
      return null;
    }
    const storeId = user.storeId ?? user.branch?.storeId ?? null;
    const storeName = user.store?.storeName || user.branch?.store?.storeName || null;
    return {
      panel,
      targetUserId: user.id,
      email: user.email.trim().toLowerCase(),
      name: user.name,
      secondaryIdentifier: user.username,
      storeId,
      storeName,
    };
  }

  if (panel === "super_admin") {
    const pu = await prisma.platformUser.findFirst({
      where: {
        OR: [
          { username: { equals: clean, mode: "insensitive" } },
          { email: { equals: clean, mode: "insensitive" } },
        ],
      },
    });
    if (!pu || !pu.active || !pu.email?.trim()) return null;
    return {
      panel,
      targetUserId: pu.id,
      email: pu.email.trim().toLowerCase(),
      name: pu.name,
      secondaryIdentifier: pu.username,
      storeId: null,
      storeName: PANEL_RESET_META.super_admin.storeNameDefault,
    };
  }

  if (panel === "customer") {
    const normalizedPhone = normalizePhoneValue(clean);
    const phoneVariants = Array.from(new Set([clean, normalizedPhone].filter(Boolean)));
    const customer = await prisma.customer.findFirst({
      where: {
        active: true,
        email: { not: null },
        OR: [
          { phone: { in: phoneVariants } },
          { email: { equals: clean, mode: "insensitive" } },
        ],
      },
      orderBy: [{ verified: "desc" }, { password: "desc" }, { id: "asc" }],
      include: {
        store: { select: { id: true, storeName: true } },
      },
    });
    if (!customer || !customer.email?.trim()) return null;
    return {
      panel,
      targetUserId: customer.id,
      email: customer.email.trim().toLowerCase(),
      name: customer.name,
      secondaryIdentifier: customer.phone,
      storeId: customer.storeId,
      storeName: customer.store?.storeName || null,
    };
  }

  // supplier
  const su = await prisma.supplierUser.findFirst({
    where: {
      OR: [
        { username: { equals: clean, mode: "insensitive" } },
        { email: { equals: clean, mode: "insensitive" } },
      ],
    },
    include: {
      supplier: {
        select: {
          storeId: true,
          store: { select: { storeName: true } },
        },
      },
    },
  });
  if (!su || !su.active || !su.email?.trim()) return null;
  return {
    panel,
    targetUserId: su.id,
    email: su.email.trim().toLowerCase(),
    name: su.name,
    secondaryIdentifier: su.username,
    storeId: su.supplier?.storeId ?? null,
    storeName: su.supplier?.store?.storeName || null,
  };
}

/**
 * Generates and emails a 6-digit single-use OTP while preventing account enumeration.
 */
export async function requestPanelPasswordResetOtp(params: {
  panel: AuthPanel;
  identifier: string;
  ipAddress: string;
}) {
  const genericMsg =
    "If an active account with a registered email matches your details, a 6-digit verification OTP has been sent.";
  const now = new Date();

  const ipWindowFloor = new Date(now.getTime() - 15 * 60 * 1000);
  const ipRecentCount = await prisma.passwordResetOtp.count({
    where: {
      ipAddress: (params.ipAddress || "127.0.0.1").slice(0, 45),
      createdAt: { gte: ipWindowFloor },
    },
  });
  if (ipRecentCount >= 25) {
    return {
      status: 429,
      body: {
        success: false,
        retryAfterSeconds: 60,
        message: "Too many OTP requests from this network. Please wait a minute before trying again.",
      },
    };
  }

  const account = await resolvePanelAccount(params.panel, params.identifier);

  if (!account) {
    return {
      status: 200,
      body: {
        success: true,
        otpSent: true,
        cooldownSeconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
        expiresInMinutes: Math.ceil(OTP_EXPIRY_MS / 60000),
        message: genericMsg,
      },
    };
  }

  const cooldownFloor = new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS);
  const recentOtp = await prisma.passwordResetOtp.findFirst({
    where: {
      panel: account.panel,
      targetUserId: account.targetUserId,
      usedAt: null,
      createdAt: { gte: cooldownFloor },
    },
    orderBy: { id: "desc" },
  });

  if (recentOtp) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((recentOtp.createdAt.getTime() + OTP_RESEND_COOLDOWN_MS - now.getTime()) / 1000)
    );
    return {
      status: 429,
      body: {
        success: false,
        retryAfterSeconds,
        message: `OTP already sent recently. Please wait ${retryAfterSeconds}s before requesting a new code.`,
      },
    };
  }

  const otpCode = generateSixDigitOtp();
  const otpHash = hashResetOtp(account.panel, account.targetUserId, account.email, otpCode);
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);

  await runInTransaction(async (tx) => {
    await tx.passwordResetOtp.updateMany({
      where: {
        panel: account.panel,
        targetUserId: account.targetUserId,
        usedAt: null,
      },
      data: { usedAt: now },
    });

    await tx.passwordResetOtp.create({
      data: {
        panel: account.panel,
        targetUserId: account.targetUserId,
        email: account.email,
        otpHash,
        expiresAt,
        ipAddress: params.ipAddress,
      },
    });
  });

  const meta = PANEL_RESET_META[account.panel];
  const emailRes = await sendPasswordResetOtpEmail({
    toEmail: account.email,
    otpCode,
    accountName: account.name,
    panelLabel: meta.label,
    storeName: account.storeName || meta.storeNameDefault,
    storeId: account.storeId,
  }).catch((err) => ({ success: false, error: err?.message || "Email dispatch failed" }));

  if (!emailRes.success) {
    console.error(`[Forgot Password OTP Email Failed] panel=${account.panel}:`, emailRes.error);
  }

  if (account.panel === "admin") {
    await logAudit({
      storeId: account.storeId,
      userId: account.targetUserId,
      action: "PASSWORD_RESET_OTP_REQUESTED",
      entity: "users",
      entityId: account.targetUserId,
      details: { email: account.email },
      ipAddress: params.ipAddress,
    });
  } else if (account.panel === "super_admin") {
    await logPlatformAudit({
      platformUserId: account.targetUserId,
      action: "PLATFORM_PASSWORD_RESET_OTP_REQUESTED",
      entity: "platform_users",
      entityId: account.targetUserId,
      details: { email: account.email },
      ipAddress: params.ipAddress,
    });
  }

  return {
    status: 200,
    body: {
      success: true,
      otpSent: true,
      cooldownSeconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
      expiresInMinutes: Math.ceil(OTP_EXPIRY_MS / 60000),
      message: genericMsg,
    },
  };
}

/**
 * Validates OTP (and optionally executes atomic password reset + clears login lockout).
 */
export async function verifyOrResetPanelPassword(params: {
  panel: AuthPanel;
  identifier: string;
  otp: string;
  newPassword?: string;
  mode: "verify_only" | "reset";
  ipAddress: string;
}) {
  const cleanOtp = params.otp.trim();
  if (!/^\d{6}$/.test(cleanOtp)) {
    return {
      status: 400,
      body: { success: false, message: "Please enter the exact 6-digit OTP from your email." },
    };
  }

  const meta = PANEL_RESET_META[params.panel];
  if (params.mode === "reset") {
    const newPass = String(params.newPassword || "");
    if (newPass.length < meta.minPasswordLength) {
      return {
        status: 400,
        body: {
          success: false,
          message: `New password must be at least ${meta.minPasswordLength} characters long.`,
        },
      };
    }
  }

  const account = await resolvePanelAccount(params.panel, params.identifier);
  const invalidOrExpiredMsg = "Invalid or expired verification OTP. Please check your code or request a new OTP.";

  if (!account) {
    return {
      status: 400,
      body: { success: false, message: invalidOrExpiredMsg },
    };
  }

  const now = new Date();
  const otpRow = await prisma.passwordResetOtp.findFirst({
    where: {
      panel: account.panel,
      targetUserId: account.targetUserId,
      usedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { id: "desc" },
  });

  if (!otpRow) {
    return {
      status: 400,
      body: {
        success: false,
        message: invalidOrExpiredMsg,
      },
    };
  }

  if (otpRow.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.passwordResetOtp.update({
      where: { id: otpRow.id },
      data: { usedAt: now },
    });
    return {
      status: 429,
      body: {
        success: false,
        message: "Too many wrong OTP attempts. This code is invalidated; request a new OTP.",
      },
    };
  }

  const expectedHash = hashResetOtp(account.panel, account.targetUserId, account.email, cleanOtp);
  if (!timingSafeHexEqual(expectedHash, otpRow.otpHash)) {
    const nextAttempts = otpRow.attempts + 1;
    const exhausted = nextAttempts >= OTP_MAX_ATTEMPTS;
    await prisma.passwordResetOtp.update({
      where: { id: otpRow.id },
      data: {
        attempts: nextAttempts,
        ...(exhausted ? { usedAt: now } : {}),
      },
    });
    return {
      status: exhausted ? 429 : 400,
      body: {
        success: false,
        remainingAttempts: Math.max(0, OTP_MAX_ATTEMPTS - nextAttempts),
        message: exhausted
          ? "Maximum OTP attempts reached. Please request a new OTP."
          : `Incorrect OTP. ${OTP_MAX_ATTEMPTS - nextAttempts} attempt(s) remaining.`,
      },
    };
  }

  if (params.mode === "verify_only") {
    return {
      status: 200,
      body: {
        success: true,
        otpValid: true,
        message: "OTP verified. Enter your new password.",
      },
    };
  }

  const nextHash = await hashPassword(String(params.newPassword));

  const committed = await runInTransaction(async (tx) => {
    const claimed = await tx.passwordResetOtp.updateMany({
      where: {
        id: otpRow.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;

    await tx.passwordResetOtp.updateMany({
      where: {
        panel: account.panel,
        targetUserId: account.targetUserId,
        usedAt: null,
      },
      data: { usedAt: now },
    });

    if (account.panel === "admin") {
      await tx.user.update({
        where: { id: account.targetUserId },
        data: { password: nextHash },
      });
    } else if (account.panel === "super_admin") {
      await tx.platformUser.update({
        where: { id: account.targetUserId },
        data: { password: nextHash },
      });
    } else if (account.panel === "customer") {
      // Update primary target account AND safe linked rows for same phone without overwriting a third-party verified email
      await tx.customer.update({
        where: { id: account.targetUserId },
        data: {
          password: nextHash,
          email: account.email,
          verified: true,
          verifiedAt: now,
          verifyToken: null,
        },
      });
      await tx.customer.updateMany({
        where: {
          phone: account.secondaryIdentifier,
          id: { not: account.targetUserId },
          OR: [
            { email: null },
            { verified: false },
            { email: { equals: account.email, mode: "insensitive" } },
          ],
        },
        data: {
          password: nextHash,
          email: account.email,
          verified: true,
          verifiedAt: now,
          verifyToken: null,
        },
      });
    } else {
      await tx.supplierUser.update({
        where: { id: account.targetUserId },
        data: {
          password: nextHash,
          verified: true,
        },
      });
    }

    return true;
  });

  if (!committed) {
    return {
      status: 400,
      body: {
        success: false,
        message: "This OTP has already been used or expired. Please request a new OTP.",
      },
    };
  }

  await clearFailedLoginAttempts(
    params.ipAddress,
    account.panel,
    account.secondaryIdentifier,
    account.email
  );

  if (account.panel === "admin") {
    await logAudit({
      storeId: account.storeId,
      userId: account.targetUserId,
      action: "PASSWORD_RESET_COMPLETED",
      entity: "users",
      entityId: account.targetUserId,
      details: { method: "email_otp" },
      ipAddress: params.ipAddress,
    });
  } else if (account.panel === "super_admin") {
    await logPlatformAudit({
      platformUserId: account.targetUserId,
      action: "PLATFORM_PASSWORD_RESET_COMPLETED",
      entity: "platform_users",
      entityId: account.targetUserId,
      details: { method: "email_otp" },
      ipAddress: params.ipAddress,
    });
  }

  return {
    status: 200,
    body: {
      success: true,
      message: "Password reset successfully! You can now sign in with your new password.",
    },
  };
}
