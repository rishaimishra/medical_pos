import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import {
  CUSTOMER_COOKIE_NAME,
  CustomerSessionPayload,
  checkBruteForceLockout,
  clearFailedLoginAttempts,
  hashPassword,
  recordFailedLoginAttempt,
  signCustomerToken,
  verifyCustomerToken,
  verifyPassword,
} from "@/lib/auth";
import { getClientIp } from "@/lib/audit";
import { escapeHtml, sendEmail } from "@/lib/email";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get("storeContact") === "1") {
      const store = await prisma.settings.findFirst({
        orderBy: { id: "asc" },
        select: { storeName: true, storeEmail: true, storePhone: true },
      });
      return NextResponse.json({
        success: true,
        store: {
          name: store?.storeName || "Medical POS Pharmacy",
          email: store?.storeEmail || null,
          phone: store?.storePhone || null,
        },
      });
    }

    const cookieToken = req.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
    const session = verifyCustomerToken(cookieToken);

    if (!session) {
      return NextResponse.json({
        success: true,
        authenticated: false,
        customer: null,
      });
    }

    const dbCustomer = await prisma.customer.findUnique({
      where: { id: session.customerId },
      include: {
        _count: {
          select: {
            sales: true,
            returns: true,
          },
        },
      },
    });

    if (!dbCustomer || !dbCustomer.active || !dbCustomer.verified) {
      const res = NextResponse.json({
        success: true,
        authenticated: false,
        customer: null,
      });
      res.cookies.delete(CUSTOMER_COOKIE_NAME);
      return res;
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      customer: {
        id: dbCustomer.id,
        name: dbCustomer.name,
        phone: dbCustomer.phone,
        email: dbCustomer.email,
        address: dbCustomer.address,
        ordersCount: dbCustomer._count.sales,
        returnsCount: dbCustomer._count.returns,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, authenticated: false, message: err?.message || "Session check failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  try {
    const body = await req.json();
    const action = (body.action || "login") as
      | "login"
      | "register"
      | "resend_verification"
      | "verify";

    const buildVerifyUrl = (token: string) => {
      const origin = req.nextUrl?.origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      return `${origin}/api/auth/customer/verify?token=${encodeURIComponent(token)}`;
    };

    const dispatchVerificationEmail = async (toEmail: string, name: string, token: string) => {
      const link = buildVerifyUrl(token);
      const store = await prisma.settings.findFirst({
        orderBy: { id: "asc" },
        select: { id: true, storeName: true },
      });
      const storeName = store?.storeName || "Medical POS Pharmacy";
      await sendEmail({
        to: toEmail,
        subject: `Verify your ${storeName} Patient Portal Account`,
        html: `<p>Hello <strong>${escapeHtml(name)}</strong>,</p><p>Thank you for registering at ${escapeHtml(storeName)}. Please verify your email address to activate your Patient Portal login:</p><p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#0F5A47;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Verify Email Address</a></p><p>Verification Token: <code>${escapeHtml(token)}</code></p><p>This link expires in 24 hours.</p>`,
        text: `Hello ${name}, verify your ${storeName} account here: ${link}\nToken: ${token}`,
        storeId: store?.id,
      }).catch(() => {});
    };

    if (action === "register") {
      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const address = body.address ? String(body.address).trim() : null;
      const password = String(body.password || "");

      if (!name || !phone || !email || !password) {
        return NextResponse.json(
          { success: false, message: "Full Name, Mobile Number, Email Address, and Password are required." },
          { status: 400 }
        );
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          { success: false, message: "Please provide a valid email address for verification." },
          { status: 400 }
        );
      }

      if (password.length < 6) {
        return NextResponse.json(
          { success: false, message: "Password must be at least 6 characters long." },
          { status: 400 }
        );
      }

      const existingPhone = await prisma.customer.findUnique({ where: { phone } });
      const existingEmail = await prisma.customer.findUnique({ where: { email } });

      if (existingPhone && existingPhone.password) {
        return NextResponse.json(
          {
            success: false,
            message: "An account with this mobile number already exists. Please Sign In.",
          },
          { status: 409 }
        );
      }

      if (
        existingPhone &&
        existingPhone.email &&
        existingPhone.email.toLowerCase() !== email
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "This mobile number is linked to another email on file. Please register using the matching email or contact store support.",
          },
          { status: 409 }
        );
      }

      if (existingEmail && (!existingPhone || existingEmail.id !== existingPhone.id)) {
        return NextResponse.json(
          {
            success: false,
            message: "An account with this email address already exists. Please Sign In.",
          },
          { status: 409 }
        );
      }

      const passwordHash = await hashPassword(password);
      const verifyToken = crypto.randomBytes(24).toString("hex");
      const now = new Date();

      const customer = existingPhone
        ? await prisma.customer.update({
            where: { id: existingPhone.id },
            data: {
              name: existingPhone.name || name,
              email,
              address: existingPhone.address || address,
              password: passwordHash,
              active: true,
              verified: false,
              verifyToken,
              verifySentAt: now,
              verifiedAt: null,
            },
          })
        : await prisma.customer.create({
            data: {
              name,
              phone,
              email,
              address,
              password: passwordHash,
              active: true,
              verified: false,
              verifyToken,
              verifySentAt: now,
            },
          });

      await dispatchVerificationEmail(email, customer.name, verifyToken);

      return NextResponse.json(
        {
          success: true,
          authenticated: false,
          requiresVerification: true,
          verificationSentTo: email,
          message: `Account registered! A verification link has been sent to ${email}. Please verify before signing in.`,
        },
        { status: 201 }
      );
    }

    if (action === "resend_verification") {
      const identifier = String(body.identifier || body.email || body.phone || "").trim();
      if (!identifier) {
        return NextResponse.json(
          { success: false, message: "Email or phone number is required to resend verification." },
          { status: 400 }
        );
      }

      const customer = await prisma.customer.findFirst({
        where: {
          OR: [
            { phone: identifier },
            { email: { equals: identifier, mode: "insensitive" } },
          ],
        },
      });

      if (!customer || !customer.email) {
        return NextResponse.json(
          { success: false, message: "No customer account with a registered email found." },
          { status: 404 }
        );
      }

      if (customer.verified) {
        return NextResponse.json(
          { success: false, message: "This account is already verified. You can Sign In now." },
          { status: 400 }
        );
      }

      if (
        customer.verifySentAt &&
        Date.now() - customer.verifySentAt.getTime() < 60 * 1000
      ) {
        const waitSec = Math.ceil((60 * 1000 - (Date.now() - customer.verifySentAt.getTime())) / 1000);
        return NextResponse.json(
          {
            success: false,
            message: `Please wait ${waitSec}s before requesting another verification email.`,
          },
          { status: 429 }
        );
      }

      const newToken = crypto.randomBytes(24).toString("hex");
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          verifyToken: newToken,
          verifySentAt: new Date(),
        },
      });

      await dispatchVerificationEmail(customer.email, customer.name, newToken);

      return NextResponse.json({
        success: true,
        verificationSentTo: customer.email,
        message: `A new verification link has been sent to ${customer.email}.`,
      });
    }

    if (action === "verify") {
      const token = String(body.token || "").trim();
      if (!token) {
        return NextResponse.json(
          { success: false, message: "Verification token is required." },
          { status: 400 }
        );
      }

      const customer = await prisma.customer.findFirst({
        where: { verifyToken: token },
      });

      if (!customer) {
        return NextResponse.json(
          { success: false, message: "Invalid or expired verification link." },
          { status: 400 }
        );
      }

      if (
        customer.verifySentAt &&
        Date.now() - customer.verifySentAt.getTime() > 24 * 60 * 60 * 1000
      ) {
        return NextResponse.json(
          { success: false, expired: true, message: "Verification link expired. Please resend verification." },
          { status: 400 }
        );
      }

      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          verified: true,
          verifiedAt: new Date(),
          verifyToken: null,
        },
      });

      return NextResponse.json({
        success: true,
        verified: true,
        message: "Email verified successfully! You may now sign in to your Patient Portal.",
      });
    }

    // Login Flow
    const identifier = String(body.identifier || body.phone || body.email || "").trim();
    const password = String(body.password || "");

    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, message: "Mobile Number / Email and Password are required." },
        { status: 400 }
      );
    }

    const lockCheck = await checkBruteForceLockout(ip, "customer", identifier);
    if (lockCheck.locked) {
      return NextResponse.json(
        {
          success: false,
          lockedOut: true,
          remainingSeconds: lockCheck.remainingSeconds,
          message: `Too many wrong password attempts. Please wait ${Math.ceil(
            lockCheck.remainingSeconds / 60
          )} minute(s).`,
        },
        { status: 429 }
      );
    }

    const customer = await prisma.customer.findFirst({
      where: {
        OR: [
          { phone: identifier },
          { email: { equals: identifier, mode: "insensitive" } },
        ],
      },
    });

    if (!customer || !customer.password) {
      const fail = await recordFailedLoginAttempt(ip, "customer", identifier);
      return NextResponse.json(
        {
          success: false,
          remainingAttempts: fail.remainingAttempts,
          message: "Account not found or password not set. Please create an account first.",
        },
        { status: 401 }
      );
    }

    if (!customer.active) {
      return NextResponse.json(
        { success: false, message: "Your customer account is inactive." },
        { status: 403 }
      );
    }

    const valid = await verifyPassword(password, customer.password);
    if (!valid) {
      const fail = await recordFailedLoginAttempt(
        ip,
        "customer",
        customer.phone,
        customer.email || undefined
      );
      return NextResponse.json(
        {
          success: false,
          remainingAttempts: fail.remainingAttempts,
          message: `Wrong password. ${fail.remainingAttempts} try(s) left.`,
        },
        { status: 401 }
      );
    }

    await clearFailedLoginAttempts(
      ip,
      "customer",
      customer.phone,
      customer.email || undefined
    );

    // Module 2.19.1: Unverified customer accounts cannot log in
    if (!customer.verified) {
      return NextResponse.json(
        {
          success: false,
          requiresVerification: true,
          email: customer.email,
          message:
            "Email verification required before login. Please verify your email or use Resend Verification.",
        },
        { status: 403 }
      );
    }

    await prisma.customer.update({
      where: { id: customer.id },
      data: { lastLogin: new Date() },
    });

    const payload: CustomerSessionPayload = {
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      issuedAt: Date.now(),
    };
    const token = signCustomerToken(payload);

    const res = NextResponse.json({
      success: true,
      authenticated: true,
      customer: payload,
      message: "Signed in successfully!",
    });
    res.cookies.set(CUSTOMER_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (err: any) {
    console.error("[POST /api/auth/customer Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Customer authentication failed." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({
    success: true,
    authenticated: false,
    message: "Signed out successfully.",
  });
  res.cookies.delete(CUSTOMER_COOKIE_NAME);
  return res;
}

