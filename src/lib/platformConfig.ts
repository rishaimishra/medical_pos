import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * MODULE 3.10.1: Platform Config Secret Encryption, Last-4 Masking & Origin/CSRF Guard
 */

const CONFIG_KEY_MATERIAL =
  process.env.PLATFORM_CONFIG_ENCRYPTION_KEY ||
  process.env.SESSION_SECRET ||
  process.env.DATABASE_URL ||
  "med_pos_platform_config_default_key_2026";

function deriveAesKey(): Buffer {
  return crypto.createHash("sha256").update(CONFIG_KEY_MATERIAL, "utf8").digest();
}

export function encryptPlatformSecret(plainText?: string | null): string | null {
  const clean = (plainText || "").trim();
  if (!clean) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveAesKey(), iv);
  const enc = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptPlatformSecret(cipherText?: string | null): string {
  const clean = (cipherText || "").trim();
  if (!clean) return "";
  if (!clean.startsWith("v1:")) return "";
  const parts = clean.split(":");
  if (parts.length !== 4) return "";
  try {
    const [, ivB64, tagB64, dataB64] = parts;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      deriveAesKey(),
      Buffer.from(ivB64, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return dec.toString("utf8");
  } catch {
    return "";
  }
}

/**
 * Masks sensitive keys to last 4 chars (e.g. `••••••••1a2b`), never returning the raw secret.
 */
export function maskSecretLast4(secret?: string | null): string {
  const clean = (secret || "").trim();
  if (!clean) return "";
  if (clean.length <= 4) return "••••••••";
  return `••••••••${clean.slice(-4)}`;
}

/**
 * Validates same-origin CSRF protection for browser-initiated state-changing requests.
 * Requests without `Origin`/`Referer` (such as internal calls/tests) remain unaffected,
 * while mismatched browser origins are rejected with HTTP 403.
 */
export function verifySameOrigin(req: NextRequest): { ok: boolean; response?: NextResponse } {
  const originHeader = req.headers.get("origin");
  if (!originHeader) return { ok: true };

  const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!hostHeader) return { ok: true };

  try {
    const originHost = new URL(originHeader).host.toLowerCase();
    const expectedHost = hostHeader.split(",")[0].trim().toLowerCase();
    if (originHost && expectedHost && originHost !== expectedHost) {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, message: "CSRF Protection: Cross-origin mutation rejected." },
          { status: 403 }
        ),
      };
    }
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Invalid Origin header." },
        { status: 403 }
      ),
    };
  }
  return { ok: true };
}
