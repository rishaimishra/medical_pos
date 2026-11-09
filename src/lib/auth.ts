import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { prisma } from "./db-transaction";
import { APP_CONFIG } from "./config";
import {
  canAccessBranch,
  getEffectiveAllowedPages,
  getEffectiveMaxDiscount,
  getEffectivePermissions,
  hasPermission,
  PermissionKey,
  SystemRole,
} from "./rbac";

/**
 * MODULE 1.4.1 & 1.4.2: Secure User Authentication Engine & Brute-Force Protection
 * - BCrypt password hashing (cost 12)
 * - 2-hour inactivity session timeout & auto-lock support
 * - 5-attempt / 15-minute IP & account brute-force rate limiter (with username + email canonicalization)
 */

export const SESSION_COOKIE_NAME = "med_pos_admin_session";
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.DATABASE_URL ||
  "med_pos_default_hmac_secret_2026_pharmacy";

export interface SessionPayload {
  userId: number;
  storeId?: number | null;
  username: string;
  name: string;
  email: string;
  role: SystemRole;
  branchId: number | null;
  branchCode?: string | null;
  branchName?: string | null;
  permissions: PermissionKey[];
  allowedPages: string[];
  maxDiscountPercent: number;
  issuedAt: number;
  lastActive: number;
  isLocked?: boolean;
}

export interface RateLimitStatus {
  locked: boolean;
  attemptsCount: number;
  remainingAttempts: number;
  remainingSeconds: number;
  unlockAt?: string;
}

/**
 * Hashes a plaintext password using BCrypt (cost factor 12).
 */
export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, 12);
}

/**
 * Verifies a plaintext password against a BCrypt hash.
 */
export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  if (!plainText || !hash) return false;
  return bcrypt.compare(plainText, hash);
}

/**
 * Signs a session payload using HMAC-SHA256.
 */
export function createSessionToken(payload: SessionPayload): string {
  const fullPayload = {
    ...payload,
    issuedAt: payload.issuedAt || Date.now(),
    lastActive: payload.lastActive || Date.now(),
  };
  const dataB64 = Buffer.from(JSON.stringify(fullPayload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(dataB64)
    .digest("base64url");
  return `${dataB64}.${signature}`;
}

/**
 * Verifies an HMAC-SHA256 session token and enforces the 2-hour (120 min) inactivity timeout.
 * Note: If `payload.isLocked === true`, `valid` is returned as `false` and `locked` as `true`
 * so locked sessions cannot execute privileged API mutations until unlocked.
 */
export function verifySessionToken(
  token?: string | null,
  customTimeoutMinutes: number = APP_CONFIG.sessionTimeoutMinutes
): {
  valid: boolean;
  expired: boolean;
  locked: boolean;
  session: SessionPayload | null;
  inactiveSeconds?: number;
} {
  if (!token || !token.includes(".")) {
    return { valid: false, expired: false, locked: false, session: null };
  }

  const [dataB64, sig] = token.split(".");
  if (!dataB64 || !sig) {
    return { valid: false, expired: false, locked: false, session: null };
  }

  const expectedSig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(dataB64)
    .digest("base64url");

  // Timing-safe signature comparison
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, expired: false, locked: false, session: null };
  }

  try {
    const payload = JSON.parse(
      Buffer.from(dataB64, "base64url").toString("utf8")
    ) as SessionPayload;

    const now = Date.now();
    const timeoutMs = customTimeoutMinutes * 60 * 1000;
    const elapsedMs = now - (payload.lastActive || payload.issuedAt || 0);
    const inactiveSeconds = Math.floor(elapsedMs / 1000);

    if (elapsedMs > timeoutMs) {
      return {
        valid: false,
        expired: true,
        locked: true,
        session: { ...payload, isLocked: true },
        inactiveSeconds,
      };
    }

    if (payload.isLocked) {
      return {
        valid: false,
        expired: false,
        locked: true,
        session: payload,
        inactiveSeconds,
      };
    }

    return {
      valid: true,
      expired: false,
      locked: false,
      session: payload,
      inactiveSeconds,
    };
  } catch {
    return { valid: false, expired: false, locked: false, session: null };
  }
}

/**
 * Extracts and verifies the admin session from a NextRequest cookie or Authorization header.
 */
export function getSessionFromRequest(req: NextRequest): {
  valid: boolean;
  expired: boolean;
  locked: boolean;
  session: SessionPayload | null;
} {
  const cookieToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const token = cookieToken || bearerToken;
  return verifySessionToken(token);
}

/**
 * MODULE 1.4.2: Brute-Force Attack Protection System
 * Checks whether an IP or account context is locked out (5 failed attempts within 15 minutes).
 * Supports both primary identifier (username) and secondary identifier (email) to prevent
 * splitting 4 attempts on username + 4 attempts on email.
 */
export async function checkBruteForceLockout(
  ip: string,
  context: "admin" | "supplier" | "customer" = "admin",
  identifier?: string,
  secondaryIdentifier?: string
): Promise<RateLimitStatus> {
  const maxAttempts = APP_CONFIG.maxLoginAttempts; // 5
  const lockoutMinutes = APP_CONFIG.lockoutDurationMinutes; // 15
  const windowStart = new Date(Date.now() - lockoutMinutes * 60 * 1000);

  const normalizedIp = (ip || "127.0.0.1").slice(0, 45);
  const acctContexts: string[] = [];

  if (identifier && identifier.trim()) {
    acctContexts.push(`${context}:${identifier.trim().toLowerCase()}`.slice(0, 50));
  }
  if (
    secondaryIdentifier &&
    secondaryIdentifier.trim() &&
    secondaryIdentifier.trim().toLowerCase() !== identifier?.trim().toLowerCase()
  ) {
    acctContexts.push(`${context}:${secondaryIdentifier.trim().toLowerCase()}`.slice(0, 50));
  }

  // Prune expired attempts older than 15 minutes
  await prisma.loginAttempt.deleteMany({
    where: {
      ts: { lt: windowStart },
    },
  });

  // Query recent attempts for IP
  const ipAttempts = await prisma.loginAttempt.findMany({
    where: {
      ip: normalizedIp,
      context,
      ts: { gte: windowStart },
    },
    orderBy: { ts: "asc" },
  });

  let maxAcctAttempts = ipAttempts;

  for (const ctx of acctContexts) {
    const attempts = await prisma.loginAttempt.findMany({
      where: {
        context: ctx,
        ts: { gte: windowStart },
      },
      orderBy: { ts: "asc" },
    });
    if (attempts.length > maxAcctAttempts.length) {
      maxAcctAttempts = attempts;
    }
  }

  const attemptsCount = maxAcctAttempts.length;

  if (attemptsCount >= maxAttempts) {
    const oldestInWindow = maxAcctAttempts[maxAcctAttempts.length - maxAttempts];
    const unlockTimeMs =
      (oldestInWindow?.ts.getTime() || Date.now()) + lockoutMinutes * 60 * 1000;
    const remainingSeconds = Math.max(1, Math.ceil((unlockTimeMs - Date.now()) / 1000));

    return {
      locked: true,
      attemptsCount,
      remainingAttempts: 0,
      remainingSeconds,
      unlockAt: new Date(unlockTimeMs).toISOString(),
    };
  }

  return {
    locked: false,
    attemptsCount,
    remainingAttempts: Math.max(0, maxAttempts - attemptsCount),
    remainingSeconds: 0,
  };
}

/**
 * Records a failed login attempt for IP, primary identifier (e.g. username), and optional secondary identifier (e.g. email).
 */
export async function recordFailedLoginAttempt(
  ip: string,
  context: "admin" | "supplier" | "customer" = "admin",
  identifier?: string,
  secondaryIdentifier?: string
): Promise<RateLimitStatus> {
  const normalizedIp = (ip || "127.0.0.1").slice(0, 45);
  const now = new Date();

  const rowsToInsert: { ip: string; context: string; ts: Date }[] = [
    {
      ip: normalizedIp,
      context,
      ts: now,
    },
  ];

  const primaryClean = identifier?.trim().toLowerCase();
  const secondaryClean = secondaryIdentifier?.trim().toLowerCase();

  if (primaryClean) {
    rowsToInsert.push({
      ip: normalizedIp,
      context: `${context}:${primaryClean}`.slice(0, 50),
      ts: now,
    });
  }

  if (secondaryClean && secondaryClean !== primaryClean) {
    rowsToInsert.push({
      ip: normalizedIp,
      context: `${context}:${secondaryClean}`.slice(0, 50),
      ts: now,
    });
  }

  await prisma.loginAttempt.createMany({
    data: rowsToInsert,
  });

  return checkBruteForceLockout(normalizedIp, context, identifier, secondaryIdentifier);
}

/**
 * Clears failed login attempts upon successful authentication.
 */
export async function clearFailedLoginAttempts(
  ip: string,
  context: "admin" | "supplier" | "customer" = "admin",
  identifier?: string,
  secondaryIdentifier?: string
): Promise<void> {
  const normalizedIp = (ip || "127.0.0.1").slice(0, 45);
  const orConditions: { ip?: string; context: string }[] = [];

  const primaryClean = identifier?.trim().toLowerCase();
  const secondaryClean = secondaryIdentifier?.trim().toLowerCase();

  if (primaryClean) {
    orConditions.push({
      context: `${context}:${primaryClean}`.slice(0, 50),
    });
  }

  if (secondaryClean && secondaryClean !== primaryClean) {
    orConditions.push({
      context: `${context}:${secondaryClean}`.slice(0, 50),
    });
  }

  if (orConditions.length === 0) {
    orConditions.push({ ip: normalizedIp, context });
  }

  await prisma.loginAttempt.deleteMany({
    where: {
      OR: orConditions,
    },
  });
}

/**
 * Builds a complete SessionPayload from a database User record.
 */
export function buildUserSessionPayload(
  user: {
    id: number;
    storeId?: number | null;
    username: string;
    name: string;
    email: string;
    role: string;
    permissions?: string | null;
    branchId?: number | null;
    branch?: { code: string; name: string; storeId?: number | null } | null;
  },
  isLocked: boolean = false
): SessionPayload {
  const now = Date.now();
  const normalizedRole = (user.role?.toLowerCase() as SystemRole) || "staff";
  return {
    userId: user.id,
    storeId: user.storeId ?? user.branch?.storeId ?? null,
    username: user.username,
    name: user.name,
    email: user.email,
    role: normalizedRole,
    branchId: user.branchId ?? null,
    branchCode: user.branch?.code ?? null,
    branchName: user.branch?.name ?? null,
    permissions: getEffectivePermissions(normalizedRole, user.permissions, user.branchId),
    allowedPages: getEffectiveAllowedPages(normalizedRole, user.permissions, user.branchId),
    maxDiscountPercent: getEffectiveMaxDiscount(normalizedRole, user.permissions),
    issuedAt: now,
    lastActive: now,
    isLocked,
  };
}

/**
 * Server-side RBAC & Session Verification Guard for Admin APIs.
 * Validates token, ensures screen is not locked/expired, verifies live DB user & branch status,
 * and checks optional role, granular permission, and target branch access.
 */
export async function verifyAdminRequest(
  req: NextRequest,
  options?: {
    requiredRole?: SystemRole;
    requiredPermission?: PermissionKey;
    targetBranchId?: number | null;
  }
): Promise<{
  authorized: boolean;
  status: number;
  message?: string;
  session: SessionPayload | null;
}> {
  const tokenResult = getSessionFromRequest(req);

  if (!tokenResult.session) {
    return {
      authorized: false,
      status: 401,
      message: "Authentication required. Please sign in.",
      session: null,
    };
  }

  if (tokenResult.expired || tokenResult.locked) {
    return {
      authorized: false,
      status: 423,
      message: tokenResult.expired
        ? "Session locked due to 2 hours of inactivity. Please unlock your screen."
        : "POS counter screen is currently locked. Please unlock to continue.",
      session: tokenResult.session,
    };
  }

  let dbUser: any = null;
  try {
    dbUser = await prisma.user.findUnique({
      where: { id: tokenResult.session.userId },
      include: {
        branch: {
          select: { id: true, storeId: true, code: true, name: true, active: true, isMain: true },
        },
      },
    });
  } catch (err: any) {
    if (err?.code === "P1017" || err?.message?.includes("closed the connection")) {
      await prisma.$connect().catch(() => {});
      dbUser = await prisma.user.findUnique({
        where: { id: tokenResult.session.userId },
        include: {
          branch: {
            select: { id: true, storeId: true, code: true, name: true, active: true, isMain: true },
          },
        },
      });
    } else {
      throw err;
    }
  }

  if (!dbUser || !dbUser.active) {
    return {
      authorized: false,
      status: 403,
      message: "User account has been deactivated or removed.",
      session: null,
    };
  }

  // Edge Case: Assigned store branch was deactivated by Super Admin
  if (
    dbUser.role.toLowerCase() !== "admin" &&
    dbUser.branchId !== null &&
    dbUser.branch &&
    !dbUser.branch.active &&
    !dbUser.branch.isMain
  ) {
    return {
      authorized: false,
      status: 403,
      message: `Your assigned store branch [${dbUser.branch.code}] is currently deactivated.`,
      session: null,
    };
  }

  const freshSession = buildUserSessionPayload(dbUser, false);

  if (options?.requiredRole && freshSession.role !== options.requiredRole && freshSession.role !== "admin") {
    return {
      authorized: false,
      status: 403,
      message: `Insufficient role privileges. Required role: ${options.requiredRole}.`,
      session: freshSession,
    };
  }

  if (
    options?.requiredPermission &&
    !hasPermission(
      {
        role: freshSession.role,
        permissions: freshSession.permissions,
        branchId: freshSession.branchId,
      },
      options.requiredPermission
    )
  ) {
    return {
      authorized: false,
      status: 403,
      message: `Missing required permission: '${options.requiredPermission}'.`,
      session: freshSession,
    };
  }

  if (
    options?.targetBranchId !== undefined &&
    !canAccessBranch(
      { role: freshSession.role, branchId: freshSession.branchId },
      options.targetBranchId
    )
  ) {
    return {
      authorized: false,
      status: 403,
      message: `Cross-Branch Access Denied: Your account is restricted to branch [${freshSession.branchCode || freshSession.branchId
        }].`,
      session: freshSession,
    };
  }

  return {
    authorized: true,
    status: 200,
    session: freshSession,
  };
}

export const SUPPLIER_COOKIE_NAME = "med_pos_supplier_session";
export const CUSTOMER_COOKIE_NAME = "med_pos_customer_session";

export interface SupplierSessionPayload {
  supplierUserId: number;
  supplierId: number;
  name: string;
  companyName: string;
  username: string;
  email: string;
  phone: string | null;
  issuedAt: number;
}

export interface CustomerSessionPayload {
  customerId: number;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  issuedAt: number;
}

export function verifySupplierToken(token?: string | null): SupplierSessionPayload | null {
  if (!token || !token.includes(".")) return null;
  const [dataB64, sig] = token.split(".");
  if (!dataB64 || !sig) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(dataB64).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    return JSON.parse(Buffer.from(dataB64, "base64url").toString("utf8")) as SupplierSessionPayload;
  } catch {
    return null;
  }
}

export async function verifySupplierRequest(req: NextRequest): Promise<{
  authorized: boolean;
  status: number;
  message?: string;
  session: SupplierSessionPayload | null;
}> {
  const token = req.cookies.get(SUPPLIER_COOKIE_NAME)?.value;
  const session = verifySupplierToken(token);
  if (!session) {
    return {
      authorized: false,
      status: 401,
      message: "Unauthorized: Please log in to supplier portal",
      session: null,
    };
  }
  return { authorized: true, status: 200, session };
}

export function verifyCustomerToken(token?: string | null): CustomerSessionPayload | null {
  if (!token || !token.includes(".")) return null;
  const [dataB64, sig] = token.split(".");
  if (!dataB64 || !sig) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(dataB64).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    return JSON.parse(Buffer.from(dataB64, "base64url").toString("utf8")) as CustomerSessionPayload;
  } catch {
    return null;
  }
}

export async function verifyCustomerRequest(req: NextRequest): Promise<{
  authorized: boolean;
  status: number;
  message?: string;
  session: CustomerSessionPayload | null;
}> {
  const token = req.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
  const session = verifyCustomerToken(token);
  if (!session) {
    return {
      authorized: false,
      status: 401,
      message: "Unauthorized: Please log in to patient portal",
      session: null,
    };
  }
  return { authorized: true, status: 200, session };
}

