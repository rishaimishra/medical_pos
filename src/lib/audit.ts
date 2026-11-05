import { NextRequest } from "next/server";
import { prisma, TransactionClient } from "./db-transaction";

/**
 * MODULE 1.4.4: Tamper-Proof System Audit Trails
 * Immutable append-only audit logger with automatic credential scrubbing and IP extraction.
 */

export type AuditAction =
  | "SETUP_COMPLETED"
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGIN_LOCKED"
  | "LOGIN_BLOCKED_INACTIVE"
  | "LOGOUT"
  | "SCREEN_LOCKED"
  | "SCREEN_UNLOCKED"
  | "SESSION_EXPIRED"
  | "PRICE_CHANGE"
  | "BATCH_EDIT"
  | "STOCK_WRITE_OFF"
  | "STOCK_ADJUSTMENT"
  | "INVOICE_CREATED"
  | "INVOICE_CANCELLED"
  | "RETURN_PROCESSED"
  | "SETTINGS_UPDATED"
  | "BRANCH_CREATED"
  | "BRANCH_UPDATED"
  | "BRANCH_DELETED"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "ROLE_PERMISSION_UPDATED";

export interface AuditLogInput {
  storeId?: number | null;
  userId?: number | null;
  branchId?: number | null;
  action: AuditAction | string;
  entity: string;
  entityId?: number | null;
  details?: string | Record<string, unknown> | null;
  ipAddress?: string | null;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "newpassword",
  "oldpassword",
  "smtppass",
  "sendgridkey",
  "token",
  "setuptoken",
  "setupotp",
  "otp",
  "secret",
]);

/**
 * Recursively scrubs sensitive fields before serializing audit log details.
 */
export function sanitizeAuditDetails(input: unknown): unknown {
  if (input === null || input === undefined) return null;
  if (typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map(sanitizeAuditDetails);

  const scrubbed: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      scrubbed[key] = "[REDACTED]";
    } else if (typeof val === "object" && val !== null) {
      scrubbed[key] = sanitizeAuditDetails(val);
    } else {
      scrubbed[key] = val;
    }
  }
  return scrubbed;
}

/**
 * Extracts client IP address from NextRequest headers or fallback to 127.0.0.1.
 */
export function getClientIp(req?: NextRequest | Request | null): string {
  if (!req || !req.headers) return "127.0.0.1";
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0]?.trim();
    if (firstIp) return firstIp.slice(0, 45);
  }
  const realIp = req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip");
  if (realIp) return realIp.trim().slice(0, 45);
  return "127.0.0.1";
}

/**
 * Writes an immutable audit log row. Never throws to avoid breaking primary user flow if logging fails,
 * unless running inside an explicit ACID transaction `tx`.
 */
export async function logAudit(
  input: AuditLogInput,
  tx?: TransactionClient
): Promise<void> {
  const client = tx || prisma;

  let serializedDetails: string | null = null;
  if (typeof input.details === "string") {
    serializedDetails = input.details;
  } else if (input.details && typeof input.details === "object") {
    try {
      serializedDetails = JSON.stringify(sanitizeAuditDetails(input.details));
    } catch {
      serializedDetails = String(input.details);
    }
  }

  const data = {
    storeId: input.storeId ?? null,
    userId: input.userId ?? null,
    branchId: input.branchId ?? null,
    action: input.action.slice(0, 100),
    entity: input.entity.slice(0, 100),
    entityId: input.entityId ?? null,
    details: serializedDetails,
    ipAddress: (input.ipAddress || "127.0.0.1").slice(0, 45),
  };

  if (tx) {
    await tx.auditLog.create({ data });
    return;
  }

  try {
    await prisma.auditLog.create({ data });
  } catch (err) {
    console.error("[AuditTrail Error] Failed to write audit log:", err);
  }
}

