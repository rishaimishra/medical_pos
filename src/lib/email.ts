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

export interface SupplierPoEmailOptions {
  type: "created" | "price_updated" | "confirmed" | "cancelled" | "received";
  poNumber: string;
  supplierName: string;
  supplierEmail: string;
  totalAmount: number | string;
  itemsCount: number;
  storeName?: string;
  branchName?: string;
  notes?: string;
}

/**
 * MODULE 1.12.5: Sends supplier transactional email alerts for PO lifecycle events
 * (created, price_updated, confirmed, cancelled, received)
 */
export async function sendSupplierPoEmail(options: SupplierPoEmailOptions): Promise<EmailResult> {
  const store = options.storeName || "Medical POS Pharmacy";
  const formattedTotal = Number(options.totalAmount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const eventConfigs: Record<
    SupplierPoEmailOptions["type"],
    { title: string; badgeColor: string; subject: string; intro: string }
  > = {
    created: {
      title: "New Purchase Order Issued",
      badgeColor: "#0284c7",
      subject: `[New PO] Order ${options.poNumber} from ${store}`,
      intro: `A new purchase order has been placed with your company. Please review the line items and confirm availability and pricing.`,
    },
    price_updated: {
      title: "PO Pricing Update Logged",
      badgeColor: "#d97706",
      subject: `[Price Updated] Purchase Order ${options.poNumber}`,
      intro: `Pricing updates for Purchase Order ${options.poNumber} have been submitted and are awaiting pharmacy admin confirmation.`,
    },
    confirmed: {
      title: "Purchase Order Confirmed & Locked",
      badgeColor: "#16a34a",
      subject: `[Order Confirmed] PO ${options.poNumber} approved by ${store}`,
      intro: `Purchase Order ${options.poNumber} has been officially approved and confirmed by pharmacy administration. Prices are locked and ready for shipment.`,
    },
    cancelled: {
      title: "Purchase Order Cancelled",
      badgeColor: "#dc2626",
      subject: `[Cancelled] Purchase Order ${options.poNumber} Voided`,
      intro: `Purchase Order ${options.poNumber} has been cancelled by ${store}. Please halt processing or dispatch for this order.`,
    },
    received: {
      title: "Goods Receipt Note (GRN) Inwarded",
      badgeColor: "#0d9488",
      subject: `[GRN Inwarded] Delivery Accepted for PO ${options.poNumber}`,
      intro: `Your shipment for Purchase Order ${options.poNumber} has been received, verified, and inwarded into the pharmacy inventory.`,
    },
  };

  const config = eventConfigs[options.type] || eventConfigs.created;

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8" /><title>${config.title}</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #F1F5F9; color: #1e293b; padding: 40px 20px; margin: 0;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #E2E8F0; border-radius: 20px; padding: 36px; box-shadow: 0 10px 25px rgba(0,0,0,0.06);">
          <div style="margin-bottom: 24px; text-align: center;">
            <div style="display: inline-block; background-color: ${config.badgeColor}; color: #ffffff; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 16px; border-radius: 9999px;">
              ${config.title}
            </div>
            <h2 style="color: #0f172a; font-size: 22px; font-weight: 800; margin: 18px 0 6px 0;">${store}</h2>
            <p style="color: #64748b; font-size: 13px; margin: 0;">Vendor Order & Logistics Notification</p>
          </div>

          <p style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 20px;">
            Dear <strong>${options.supplierName}</strong>,<br/>
            ${config.intro}
          </p>

          <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="color: #64748b; padding: 8px 0; width: 40%;">PO Number:</td>
                <td style="color: #0f172a; font-family: monospace; font-weight: 700; font-size: 14px; padding: 8px 0;">${options.poNumber}</td>
              </tr>
              <tr>
                <td style="color: #64748b; padding: 8px 0;">Total Amount:</td>
                <td style="color: #0f172a; font-weight: 800; font-size: 15px; padding: 8px 0;">₹${formattedTotal}</td>
              </tr>
              <tr>
                <td style="color: #64748b; padding: 8px 0;">Line Items:</td>
                <td style="color: #334155; font-weight: 600; padding: 8px 0;">${options.itemsCount} product(s)</td>
              </tr>
              ${options.branchName ? `
              <tr>
                <td style="color: #64748b; padding: 8px 0;">Destination Branch:</td>
                <td style="color: #334155; font-weight: 600; padding: 8px 0;">${options.branchName}</td>
              </tr>` : ""}
              ${options.notes ? `
              <tr>
                <td style="color: #64748b; padding: 8px 0; vertical-align: top;">Notes:</td>
                <td style="color: #475569; font-style: italic; padding: 8px 0;">${options.notes}</td>
              </tr>` : ""}
            </table>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.5; margin: 0;">
            This is an automated notification from ${store}. Please contact pharmacy purchasing for dispatch queries.
          </p>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: options.supplierEmail,
    subject: config.subject,
    html,
    text: `${config.title}\nPO: ${options.poNumber}\nTotal: ₹${formattedTotal}\nItems: ${options.itemsCount}\nStore: ${store}`,
  });
}

export interface DailyStockAlertEmailOptions {
  adminEmail: string;
  storeName?: string;
  lowStockItems: Array<{ name: string; stock: number; threshold: number; unit?: string }>;
  expiringBatches: Array<{ name: string; batchNo: string; expiryDate: string; daysLeft: number; stock: number }>;
}

/**
 * MODULE 1.12.6: Daily low-stock and batch expiry digest email to admin
 */
export async function sendDailyStockAlertEmail(options: DailyStockAlertEmailOptions): Promise<EmailResult> {
  const store = options.storeName || "Medical POS Pharmacy";
  const dateStr = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const lowStockRows = options.lowStockItems
    .slice(0, 15)
    .map(
      (it) => `
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 8px 6px; font-weight: 600; color: #0f172a;">${it.name}</td>
        <td style="padding: 8px 6px; text-align: center; font-weight: 700; color: #dc2626;">${it.stock}</td>
        <td style="padding: 8px 6px; text-align: right; color: #64748b;">Min ${it.threshold}</td>
      </tr>
    `
    )
    .join("");

  const expiringRows = options.expiringBatches
    .slice(0, 15)
    .map(
      (b) => `
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 8px 6px; font-weight: 600; color: #0f172a;">${b.name}</td>
        <td style="padding: 8px 6px; text-align: center; font-family: monospace; font-size: 12px; color: #475569;">${b.batchNo}</td>
        <td style="padding: 8px 6px; text-align: center; color: #ea580c; font-weight: 700;">${b.daysLeft > 0 ? `${b.daysLeft}d left` : "Expired"}</td>
        <td style="padding: 8px 6px; text-align: right; font-weight: 600; color: #0f172a;">${b.stock}</td>
      </tr>
    `
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8" /><title>Daily Stock & Expiry Alert</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #F8FAFC; color: #1e293b; padding: 40px 20px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #E2E8F0; border-radius: 20px; padding: 36px; box-shadow: 0 10px 25px rgba(0,0,0,0.06);">
          <div style="margin-bottom: 24px; text-align: center;">
            <div style="display: inline-block; background-color: #dc2626; color: #ffffff; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 16px; border-radius: 9999px;">
              Daily Inventory Alert Digest
            </div>
            <h2 style="color: #0f172a; font-size: 22px; font-weight: 800; margin: 18px 0 6px 0;">${store}</h2>
            <p style="color: #64748b; font-size: 13px; margin: 0;">Generated on ${dateStr}</p>
          </div>

          <div style="display: flex; gap: 12px; margin-bottom: 24px;">
            <div style="flex: 1; background-color: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 12px; padding: 14px; text-align: center;">
              <div style="font-size: 22px; font-weight: 800; color: #991B1B;">${options.lowStockItems.length}</div>
              <div style="font-size: 12px; color: #B91C1C; font-weight: 600;">Low Stock Medicines</div>
            </div>
            <div style="flex: 1; background-color: #FFF7ED; border: 1px solid #FDBA74; border-radius: 12px; padding: 14px; text-align: center;">
              <div style="font-size: 22px; font-weight: 800; color: #9A3412;">${options.expiringBatches.length}</div>
              <div style="font-size: 12px; color: #C2410C; font-weight: 600;">Expiring Soon Batches</div>
            </div>
          </div>

          ${
            options.lowStockItems.length > 0
              ? `
            <div style="margin-bottom: 24px;">
              <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Top Low-Stock Items</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr style="background-color: #F1F5F9; color: #475569; text-align: left;">
                    <th style="padding: 8px 6px;">Medicine</th>
                    <th style="padding: 8px 6px; text-align: center;">Current</th>
                    <th style="padding: 8px 6px; text-align: right;">Threshold</th>
                  </tr>
                </thead>
                <tbody>${lowStockRows}</tbody>
              </table>
            </div>
          `
              : `<p style="color: #16a34a; font-weight: 600; font-size: 13px; margin-bottom: 20px;">✔ All stock quantities are above minimum thresholds.</p>`
          }

          ${
            options.expiringBatches.length > 0
              ? `
            <div style="margin-bottom: 24px;">
              <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Upcoming Expiring Batches</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr style="background-color: #F1F5F9; color: #475569; text-align: left;">
                    <th style="padding: 8px 6px;">Medicine</th>
                    <th style="padding: 8px 6px; text-align: center;">Batch</th>
                    <th style="padding: 8px 6px; text-align: center;">Expiry</th>
                    <th style="padding: 8px 6px; text-align: right;">Units</th>
                  </tr>
                </thead>
                <tbody>${expiringRows}</tbody>
              </table>
            </div>
          `
              : `<p style="color: #16a34a; font-weight: 600; font-size: 13px; margin-bottom: 20px;">✔ No batches expiring within the configured threshold.</p>`
          }

          <p style="font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.5; margin: 0;">
            This automated daily digest is dispatched at most once per 24 hours to the primary pharmacy administrator.
          </p>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: options.adminEmail,
    subject: `[Daily Stock Alert] ${options.lowStockItems.length} Low Stock, ${options.expiringBatches.length} Expiring - ${store}`,
    html,
    text: `Daily Inventory Alert for ${store}\nLow Stock Items: ${options.lowStockItems.length}\nExpiring Batches: ${options.expiringBatches.length}`,
  });
}

export interface CustomerRefillAlertEmailOptions {
  customerEmail: string;
  customerName: string;
  conditions?: string;
  refillDays?: number;
  nextRefillDate: string;
  storeName?: string;
  storePhone?: string;
  storeAddress?: string;
}

/**
 * MODULE 1.13.2: Sends chronic patient routine prescription refill reminder
 */
export async function sendCustomerRefillAlertEmail(options: CustomerRefillAlertEmailOptions): Promise<EmailResult> {
  const store = options.storeName || "Medical POS Pharmacy";
  const conditionsText = options.conditions ? ` (${options.conditions})` : "";

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8" /><title>Medicine Refill Reminder</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #F0FDF4; color: #1e293b; padding: 40px 20px; margin: 0;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #BBF7D0; border-radius: 20px; padding: 36px; box-shadow: 0 10px 25px rgba(22,101,52,0.06);">
          <div style="margin-bottom: 24px; text-align: center;">
            <div style="display: inline-block; background-color: #16a34a; color: #ffffff; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 16px; border-radius: 9999px;">
              Health & Refill Care
            </div>
            <h2 style="color: #14532D; font-size: 22px; font-weight: 800; margin: 18px 0 6px 0;">${store}</h2>
            <p style="color: #4b5563; font-size: 13px; margin: 0;">Routine Prescription Refill Notification</p>
          </div>

          <p style="font-size: 14px; color: #374151; line-height: 1.6; margin-bottom: 20px;">
            Dear <strong>${options.customerName}</strong>,<br/>
            According to your health profile${conditionsText}, your routine monthly prescription supply is scheduled for refill on or before <strong>${options.nextRefillDate}</strong>.
          </p>

          <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 20px; margin-bottom: 24px;">
            <p style="margin: 0 0 10px 0; font-size: 13px; color: #475569;">
              Maintaining continuity with chronic medications is vital for your health and treatment efficacy.
            </p>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="color: #64748b; padding: 6px 0; width: 45%;">Target Refill Date:</td>
                <td style="color: #15803d; font-weight: 700; padding: 6px 0;">${options.nextRefillDate}</td>
              </tr>
              ${options.refillDays ? `
              <tr>
                <td style="color: #64748b; padding: 6px 0;">Refill Cycle:</td>
                <td style="color: #334155; font-weight: 600; padding: 6px 0;">Every ${options.refillDays} days</td>
              </tr>` : ""}
              ${options.storePhone ? `
              <tr>
                <td style="color: #64748b; padding: 6px 0;">Pharmacy Contact:</td>
                <td style="color: #0f172a; font-weight: 700; padding: 6px 0;">${options.storePhone}</td>
              </tr>` : ""}
            </table>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.5; margin: 0;">
            Please visit our counter or contact us to prepare your refill package in advance.<br/>
            ${options.storeAddress || ""}
          </p>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: options.customerEmail,
    subject: `[Refill Reminder] Your prescription refill is due - ${store}`,
    html,
    text: `Dear ${options.customerName}, your prescription refill is scheduled for ${options.nextRefillDate}.\nPharmacy: ${store}\nContact: ${options.storePhone || ""}`,
  });
}


