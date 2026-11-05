import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import {
  checkBruteForceLockout,
  clearFailedLoginAttempts,
  hashPassword,
  recordFailedLoginAttempt,
  verifyPassword,
} from "@/lib/auth";
import { getClientIp } from "@/lib/audit";

const CUSTOMER_COOKIE_NAME = "med_pos_customer_session";
const SECRET =
  process.env.SESSION_SECRET ||
  process.env.DATABASE_URL ||
  "med_pos_default_hmac_secret_2026_pharmacy";

export interface CustomerSessionPayload {
  customerId: number;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  issuedAt: number;
}

function signCustomerToken(payload: CustomerSessionPayload): string {
  const dataB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(dataB64).digest("base64url");
  return `${dataB64}.${sig}`;
}

function verifyCustomerToken(token?: string | null): CustomerSessionPayload | null {
  if (!token || !token.includes(".")) return null;
  const [dataB64, sig] = token.split(".");
  if (!dataB64 || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(dataB64).digest("base64url");
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(dataB64, "base64url").toString("utf8")) as CustomerSessionPayload;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
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

    if (!dbCustomer || !dbCustomer.active) {
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
    const action = (body.action || "login") as "login" | "register";

    if (action === "register") {
      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();
      const email = body.email ? String(body.email).trim().toLowerCase() : null;
      const address = body.address ? String(body.address).trim() : null;
      const password = String(body.password || "");

      if (!name || !phone || !password) {
        return NextResponse.json(
          { success: false, message: "Full Name, Mobile Number, and Password are required." },
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
      const existingEmail = email ? await prisma.customer.findUnique({ where: { email } }) : null;

      if (existingPhone && existingPhone.password) {
        return NextResponse.json(
          {
            success: false,
            message: "An account with this mobile number already exists. Please Sign In.",
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

      const customer = existingPhone
        ? await prisma.customer.update({
            where: { id: existingPhone.id },
            data: {
              name,
              email: email || existingPhone.email,
              address: address || existingPhone.address,
              password: passwordHash,
              active: true,
              verified: true,
              verifiedAt: new Date(),
              lastLogin: new Date(),
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
              verified: true,
              verifiedAt: new Date(),
              lastLogin: new Date(),
            },
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
        message: "Account created successfully! Welcome.",
      });
      res.cookies.set(CUSTOMER_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
      return res;
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

