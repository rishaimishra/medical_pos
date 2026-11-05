import { NextRequest, NextResponse } from "next/server";
import { verifySmtpConnection, sendTestDiagnosticsEmail, SmtpConfig } from "@/lib/email";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";

/**
 * API: /api/admin/settings/test-email
 * Diagnostic tester for SMTP connection and live test email dispatch
 * Strictly protected: requires active session with 'manage_settings' permission and scopes to auth.session.storeId
 */

export async function POST(req: NextRequest) {
  try {
    const authGuard = await verifyAdminRequest(req, { requiredPermission: "manage_settings" });
    if (!authGuard.authorized || !authGuard.session) {
      return NextResponse.json(
        { success: false, error: authGuard.message || "Unauthorized: 'manage_settings' permission required." },
        { status: authGuard.status || 401 }
      );
    }

    const body = await req.json();
    const {
      testRecipient,
      fromName,
    } = body;

    if (!testRecipient || !testRecipient.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Please enter a valid recipient email address for testing." },
        { status: 400 }
      );
    }

    const storeId = authGuard.session.storeId;
    const currentSettings = storeId
      ? await prisma.settings.findUnique({ where: { id: storeId } })
      : null;

    const storeName = currentSettings?.storeName || fromName || "Medical POS Pharmacy";
    const provider = (process.env.EMAIL_SERVICE as "sendgrid" | "smtp") || (process.env.SENDGRID_API_KEY ? "sendgrid" : "smtp");
    const resolvedSendgridKey = process.env.SENDGRID_API_KEY || "";
    const resolvedFromEmail = process.env.SENDGRID_FROM_EMAIL || "mail@meeemsl.com";

    const resolvedSmtpConfig: SmtpConfig = {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "ssl" || process.env.SMTP_PORT === "465",
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
      fromEmail: resolvedFromEmail,
      fromName: storeName,
    };

    // 1. If testing SMTP, run verification handshake first
    if (provider === "smtp") {
      const verifyResult = await verifySmtpConnection(resolvedSmtpConfig);
      if (!verifyResult.success) {
        return NextResponse.json({
          success: false,
          error: verifyResult.message,
          hint: verifyResult.error,
          latencyMs: verifyResult.latencyMs,
          details: verifyResult.details,
        }, { status: 422 });
      }
    }

    // 2. Dispatch Live Test Diagnostics Email using system-wide .env configuration
    const dispatchResult = await sendTestDiagnosticsEmail(testRecipient.trim(), {
      provider,
      sendgridKey: resolvedSendgridKey,
      smtpConfig: resolvedSmtpConfig,
      storeName,
      fromEmail: resolvedFromEmail,
    });

    if (dispatchResult.success) {
      return NextResponse.json({
        success: true,
        message: `Diagnostic test email dispatched successfully to ${testRecipient.trim()}!`,
        providerUsed: dispatchResult.providerUsed,
        latencyMs: dispatchResult.latencyMs,
        messageId: dispatchResult.messageId,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: dispatchResult.error || "Failed to deliver test email.",
          providerUsed: dispatchResult.providerUsed,
          latencyMs: dispatchResult.latencyMs,
        },
        { status: 502 }
      );
    }
  } catch (err: any) {
    console.error("[API /api/admin/settings/test-email error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "An unexpected error occurred during diagnostics." },
      { status: 500 }
    );
  }
}

