import nodemailer from "nodemailer";
import { prisma } from "./db-transaction";

/**
 * Medical POS Centralized Email & SMTP Engine
 * Supports both SendGrid REST API and Standard SMTP (Nodemailer)
 */

export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  fromEmail?: string;
  fromName?: string;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  provider?: "sendgrid" | "smtp";
  smtpConfig?: SmtpConfig;
  sendgridKey?: string;
  fromEmail?: string;
  fromName?: string;
  storeId?: number | null;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  latencyMs?: number;
  providerUsed?: "sendgrid" | "smtp" | "simulation";
  details?: Record<string, unknown>;
}

/**
 * Loads centralized system-wide email configuration from environment variables (.env).
 * Used globally for all stores across the entire system (OTPs, user credentials, alerts, etc.).
 */
export function getActiveEmailConfig(customFromName?: string): {
  provider: "sendgrid" | "smtp";
  sendgridKey: string;
  smtpConfig: SmtpConfig;
  fromEmail: string;
  fromName: string;
} {
  const provider = (process.env.EMAIL_SERVICE as "sendgrid" | "smtp") || (process.env.SENDGRID_API_KEY ? "sendgrid" : "smtp");
  const sendgridKey = process.env.SENDGRID_API_KEY || "";
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_FROM || "mail@meeemsl.com";
  const fromName = customFromName || process.env.SENDGRID_FROM_NAME || "Medical POS Pharmacy";

  const smtpConfig: SmtpConfig = {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "ssl" || process.env.SMTP_PORT === "465",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    fromEmail,
    fromName,
  };

  return {
    provider,
    sendgridKey,
    smtpConfig,
    fromEmail,
    fromName,
  };
}

/**
 * Dispatches an email using either SendGrid v3 REST API or SMTP Transport
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const startTime = Date.now();
  const activeConfig = getActiveEmailConfig(options.fromName);

  const provider = options.provider || activeConfig.provider;
  const fromEmail = options.fromEmail || activeConfig.fromEmail;
  const fromName = options.fromName || activeConfig.fromName;

  // 1. SendGrid Route
  if (provider === "sendgrid") {
    const apiKey = options.sendgridKey || activeConfig.sendgridKey;
    if (apiKey && apiKey.startsWith("SG.")) {
      try {
        const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: options.to }] }],
            from: { email: fromEmail, name: fromName },
            subject: options.subject,
            content: [
              ...(options.text ? [{ type: "text/plain", value: options.text }] : []),
              { type: "text/html", value: options.html },
            ],
          }),
        });

        const latencyMs = Date.now() - startTime;
        if (response.status === 202 || response.ok) {
          return {
            success: true,
            providerUsed: "sendgrid",
            latencyMs,
            messageId: `SG-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          };
        } else {
          const errText = await response.text();
          let parsedMsg = errText;
          try {
            const parsed = JSON.parse(errText);
            if (parsed.errors && parsed.errors.length > 0) {
              parsedMsg = parsed.errors.map((e: any) => e.message).join("; ");
            }
          } catch {
            // Keep raw string
          }
          return {
            success: false,
            providerUsed: "sendgrid",
            latencyMs,
            error: `SendGrid error (${response.status}): ${parsedMsg}`,
          };
        }
      } catch (err: any) {
        return {
          success: false,
          providerUsed: "sendgrid",
          latencyMs: Date.now() - startTime,
          error: err?.message || "Network exception reaching SendGrid API",
        };
      }
    }
  }

  // 2. Custom SMTP Route via Nodemailer
  const smtp = options.smtpConfig || activeConfig.smtpConfig;
  if (smtp && smtp.host && smtp.user) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure || smtp.port === 465,
        auth: {
          user: smtp.user,
          pass: smtp.pass || "",
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });

      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      return {
        success: true,
        providerUsed: "smtp",
        messageId: info.messageId,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        success: false,
        providerUsed: "smtp",
        latencyMs: Date.now() - startTime,
        error: `SMTP dispatch error: ${err?.message || "Unknown error"}`,
        details: { code: err?.code, command: err?.command, response: err?.response },
      };
    }
  }

  // 3. Fallback / Dev Mode
  console.log(`[Email Dispatcher - DEV SIMULATION] To: ${options.to} | Subject: ${options.subject}`);
  return {
    success: true,
    providerUsed: "simulation",
    messageId: `SIM-${Date.now()}`,
    latencyMs: Date.now() - startTime,
  };
}

/**
 * Diagnostic Tool: Verifies SMTP credentials and network connection handshake
 */
export async function verifySmtpConnection(config: SmtpConfig): Promise<{
  success: boolean;
  latencyMs: number;
  message: string;
  error?: string;
  details?: Record<string, unknown>;
}> {
  const startTime = Date.now();
  try {
    if (!config.host || !config.port) {
      return {
        success: false,
        latencyMs: 0,
        message: "Invalid configuration: Host and Port are required.",
        error: "Missing required SMTP parameters",
      };
    }

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure || config.port === 465,
      auth: config.user ? { user: config.user, pass: config.pass || "" } : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });

    await transporter.verify();
    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      latencyMs,
      message: `SMTP connection established successfully (${latencyMs}ms). Server greeted and authenticated.`,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    let hint = "Verify server host, port, username, and password.";
    if (err?.code === "ESOCKET" || err?.code === "ETIMEDOUT") {
      hint = "Connection timed out. Check firewall, or ensure port (587 for TLS, 465 for SSL) is open.";
    } else if (err?.code === "EAUTH" || err?.responseCode === 535) {
      hint = "Authentication failed. For Gmail, use an 'App Password' rather than your master account password.";
    }

    return {
      success: false,
      latencyMs,
      message: `Connection failed: ${err?.message || "Could not connect to SMTP server"}`,
      error: hint,
      details: { code: err?.code, responseCode: err?.responseCode, command: err?.command },
    };
  }
}

/**
 * Diagnostic Tool: Sends a live test email with diagnostic metrics
 */
export async function sendTestDiagnosticsEmail(recipient: string, customConfig?: {
  provider: "sendgrid" | "smtp";
  sendgridKey?: string;
  smtpConfig?: SmtpConfig;
  storeName?: string;
  fromEmail?: string;
}) {
  const storeName = customConfig?.storeName || "Medical POS Pharmacy";
  const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const providerTitle = (customConfig?.provider || "SendGrid").toUpperCase();

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8" /><title>Medical POS Gateway Diagnostics</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b0f19; color: #f1f5f9; padding: 40px 20px; margin: 0;">
        <div style="max-width: 540px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
          <div style="margin-bottom: 24px; text-align: center;">
            <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #14b8a6; background-color: rgba(13, 148, 136, 0.15); border: 1px solid rgba(20, 184, 166, 0.3); padding: 4px 14px; border-radius: 9999px;">
              Diagnostics Test Passed
            </span>
            <h2 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 16px 0 6px 0;">
              ${storeName}
            </h2>
            <p style="color: #94a3b8; font-size: 13px; margin: 0;">
              Email Gateway & Compliance Integration Test
            </p>
          </div>

          <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="color: #94a3b8; padding: 6px 0;">Status:</td>
                <td style="color: #10b981; font-weight: 700; text-align: right; padding: 6px 0;">✔ Operational / Connected</td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 6px 0;">Gateway Provider:</td>
                <td style="color: #f1f5f9; font-weight: 600; text-align: right; padding: 6px 0;">${providerTitle}</td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 6px 0;">Server Timestamp:</td>
                <td style="color: #cbd5e1; text-align: right; padding: 6px 0;">${timestamp} IST</td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 6px 0;">Recipient:</td>
                <td style="color: #cbd5e1; text-align: right; padding: 6px 0;">${recipient}</td>
              </tr>
            </table>
          </div>

          <p style="font-size: 13px; color: #94a3b8; line-height: 1.5; margin: 0; text-align: center;">
            This test confirms that your store can automatically deliver customer invoices, supplier purchase orders, low-stock alerts, and password resets reliably.
          </p>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: recipient,
    subject: `[Diagnostic Test] ${storeName} Email Gateway Verified`,
    html,
    text: `Diagnostic Test: ${storeName} Email Gateway (${providerTitle}) is operational at ${timestamp}.`,
    provider: customConfig?.provider,
    smtpConfig: customConfig?.smtpConfig,
    sendgridKey: customConfig?.sendgridKey,
    fromEmail: customConfig?.fromEmail,
    fromName: storeName,
  });
}

/**
 * Sends a 6-digit OTP email for setup wizard session recovery
 */
export async function sendSetupOtpEmail(toEmail: string, otpCode: string, storeName: string = "Medical POS Pharmacy") {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8" /><title>Setup Verification Code</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b0f19; color: #f1f5f9; padding: 40px 20px; margin: 0;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <div style="margin-bottom: 24px; text-align: center;">
            <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #14b8a6; background-color: rgba(13, 148, 136, 0.15); border: 1px solid rgba(20, 184, 166, 0.3); padding: 4px 12px; border-radius: 9999px;">
              Security Verification
            </span>
            <h2 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 16px 0 6px 0;">${storeName}</h2>
            <p style="color: #94a3b8; font-size: 13px; margin: 0;">First-Run Setup Wizard Session Unlock</p>
          </div>

          <p style="font-size: 14px; color: #cbd5e1; line-height: 1.5; margin-bottom: 24px; text-align: center;">
            A request was made to resume the setup session from a new device or cleared cache. Enter the single-use 6-digit code below to unlock:
          </p>

          <div style="background-color: #090d16; border: 1px dashed #0d9488; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 36px; font-weight: 800; letter-spacing: 0.25em; color: #2dd4bf; font-family: monospace;">
              ${otpCode}
            </span>
            <div style="font-size: 11px; color: #64748b; margin-top: 8px;">
              Valid for 15 minutes • Single-use only
            </div>
          </div>

          <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0;">
            If you did not request this code, no action is required. Your store data remains completely secure.
          </p>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: toEmail,
    subject: `[${otpCode}] Setup Verification Code - ${storeName}`,
    html,
    text: `Your setup verification code is: ${otpCode}. It expires in 15 minutes.`,
  });
}

export interface AccountCredentialEmailOptions {
  toEmail: string;
  name: string;
  username: string;
  password?: string;
  role: string;
  loginUrl?: string;
  storeName?: string;
  branchName?: string;
  accountType?: "staff" | "supplier" | "customer";
  storeId?: number | null;
}

/**
 * Sends branded HTML credentials email when a staff or portal user account is created (Module 1.5.4)
 */
export async function sendAccountCredentialsEmail(options: AccountCredentialEmailOptions): Promise<EmailResult> {
  const store = options.storeName || "Medical POS Pharmacy";
  const loginUrl = options.loginUrl || (process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/admin/login` : "http://localhost:3000/admin/login");
  const roleLabel = options.role.charAt(0).toUpperCase() + options.role.slice(1);
  const accountTypeLabel = options.accountType === "supplier" ? "Supplier Portal" : options.accountType === "customer" ? "Customer Portal" : "Staff & Counter";

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8" /><title>Your Account Credentials - ${store}</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #EAF2F4; color: #1e293b; padding: 40px 20px; margin: 0;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 20px; padding: 36px; box-shadow: 0 10px 25px rgba(31,78,91,0.08);">
          <div style="margin-bottom: 24px; text-align: center;">
            <div style="display: inline-block; background-color: #1F4E5B; color: #ffffff; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 16px; border-radius: 9999px;">
              ${accountTypeLabel} Account Created
            </div>
            <h2 style="color: #1F4E5B; font-size: 24px; font-weight: 800; margin: 18px 0 6px 0;">${store}</h2>
            <p style="color: #64748b; font-size: 13px; margin: 0;">Welcome aboard! Below are your authorized sign-in credentials.</p>
          </div>

          <p style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 20px;">
            Hello <strong>${options.name}</strong>,<br/>
            An account has been created for you at <strong>${store}</strong>${options.branchName ? ` assigned to <strong>${options.branchName}</strong>` : ""}.
          </p>

          <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="color: #64748b; padding: 8px 0; width: 35%;">Portal URL:</td>
                <td style="color: #1F4E5B; font-weight: 700; padding: 8px 0;">
                  <a href="${loginUrl}" style="color: #1F4E5B; text-decoration: underline;">${loginUrl}</a>
                </td>
              </tr>
              <tr>
                <td style="color: #64748b; padding: 8px 0;">Username / ID:</td>
                <td style="color: #0f172a; font-family: monospace; font-weight: 700; font-size: 14px; padding: 8px 0;">${options.username}</td>
              </tr>
              ${options.password ? `
              <tr>
                <td style="color: #64748b; padding: 8px 0;">Temporary Password:</td>
                <td style="color: #0f172a; font-family: monospace; font-weight: 700; font-size: 14px; padding: 8px 0; letter-spacing: 0.05em;">${options.password}</td>
              </tr>` : ""}
              <tr>
                <td style="color: #64748b; padding: 8px 0;">Assigned Role:</td>
                <td style="color: #0d9488; font-weight: 700; padding: 8px 0;">${roleLabel}</td>
              </tr>
              ${options.branchName ? `
              <tr>
                <td style="color: #64748b; padding: 8px 0;">Assigned Branch:</td>
                <td style="color: #334155; font-weight: 600; padding: 8px 0;">${options.branchName}</td>
              </tr>` : ""}
            </table>
          </div>

          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${loginUrl}" style="display: inline-block; background-color: #1F4E5B; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 32px; border-radius: 12px; box-shadow: 0 4px 12px rgba(31,78,91,0.2);">
              Sign In to Your Account
            </a>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.5; margin: 0;">
            Security Notice: Please sign in immediately and change your temporary password from your account settings. Never share your credentials with anyone.
          </p>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: options.toEmail,
    subject: `Your ${store} Account Credentials (${roleLabel})`,
    html,
    text: `Hello ${options.name}, your ${store} account has been created.\nURL: ${loginUrl}\nUsername: ${options.username}\n${options.password ? `Password: ${options.password}\n` : ""}Role: ${roleLabel}`,
    storeId: options.storeId,
  });
}

