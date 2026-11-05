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

const SUPPLIER_COOKIE_NAME = "med_pos_supplier_session";
const SECRET =
  process.env.SESSION_SECRET ||
  process.env.DATABASE_URL ||
  "med_pos_default_hmac_secret_2026_pharmacy";

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

function signSupplierToken(payload: SupplierSessionPayload): string {
  const dataB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(dataB64).digest("base64url");
  return `${dataB64}.${sig}`;
}

function verifySupplierToken(token?: string | null): SupplierSessionPayload | null {
  if (!token || !token.includes(".")) return null;
  const [dataB64, sig] = token.split(".");
  if (!dataB64 || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(dataB64).digest("base64url");
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(dataB64, "base64url").toString("utf8")) as SupplierSessionPayload;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const cookieToken = req.cookies.get(SUPPLIER_COOKIE_NAME)?.value;
    const session = verifySupplierToken(cookieToken);

    if (!session) {
      return NextResponse.json({
        success: true,
        authenticated: false,
        supplier: null,
      });
    }

    const dbUser = await prisma.supplierUser.findUnique({
      where: { id: session.supplierUserId },
      include: {
        supplier: {
          include: {
            _count: {
              select: {
                purchaseOrders: true,
                batches: true,
              },
            },
          },
        },
      },
    });

    if (!dbUser || !dbUser.active) {
      const res = NextResponse.json({
        success: true,
        authenticated: false,
        supplier: null,
      });
      res.cookies.delete(SUPPLIER_COOKIE_NAME);
      return res;
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      supplier: {
        id: dbUser.id,
        supplierId: dbUser.supplierId,
        name: dbUser.name,
        companyName: dbUser.supplier.name,
        username: dbUser.username,
        email: dbUser.email,
        phone: dbUser.phone || dbUser.supplier.phone,
        ordersCount: dbUser.supplier._count.purchaseOrders,
        batchesCount: dbUser.supplier._count.batches,
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
      const companyName = String(body.companyName || "").trim();
      const name = String(body.name || "").trim();
      const username = String(body.username || "").trim().toLowerCase();
      const email = String(body.email || "").trim().toLowerCase();
      const phone = String(body.phone || "").trim();
      const gstNo = body.gstNo ? String(body.gstNo).trim().toUpperCase() : null;
      const password = String(body.password || "");

      if (!companyName || !name || !username || !email || !phone || !password) {
        return NextResponse.json(
          { success: false, message: "All required supplier fields must be filled." },
          { status: 400 }
        );
      }

      const existing = await prisma.supplierUser.findFirst({
        where: {
          OR: [
            { username: { equals: username, mode: "insensitive" } },
            { email: { equals: email, mode: "insensitive" } },
          ],
        },
      });

      if (existing) {
        return NextResponse.json(
          { success: false, message: "Username or Email is already registered." },
          { status: 409 }
        );
      }

      const passwordHash = await hashPassword(password);

      const supplier = await prisma.supplier.create({
        data: {
          name: companyName,
          contact: name,
          phone,
          email,
          gstNo,
        },
      });

      const supplierUser = await prisma.supplierUser.create({
        data: {
          supplierId: supplier.id,
          name,
          username,
          email,
          phone,
          password: passwordHash,
          active: true,
          verified: true,
          lastLogin: new Date(),
        },
      });

      const payload: SupplierSessionPayload = {
        supplierUserId: supplierUser.id,
        supplierId: supplier.id,
        name: supplierUser.name,
        companyName: supplier.name,
        username: supplierUser.username,
        email: supplierUser.email,
        phone: supplierUser.phone,
        issuedAt: Date.now(),
      };
      const token = signSupplierToken(payload);

      const res = NextResponse.json({
        success: true,
        authenticated: true,
        supplier: payload,
        message: "Supplier account created successfully!",
      });
      res.cookies.set(SUPPLIER_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
      return res;
    }

    // Login Flow
    const identifier = String(body.identifier || body.username || body.email || "").trim();
    const password = String(body.password || "");

    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, message: "Username/Email and Password are required." },
        { status: 400 }
      );
    }

    const lockCheck = await checkBruteForceLockout(ip, "supplier", identifier);
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

    const supplierUser = await prisma.supplierUser.findFirst({
      where: {
        OR: [
          { username: { equals: identifier, mode: "insensitive" } },
          { email: { equals: identifier, mode: "insensitive" } },
        ],
      },
      include: { supplier: true },
    });

    if (!supplierUser) {
      const fail = await recordFailedLoginAttempt(ip, "supplier", identifier);
      return NextResponse.json(
        {
          success: false,
          remainingAttempts: fail.remainingAttempts,
          message: "Supplier account not found.",
        },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, supplierUser.password);
    if (!valid) {
      const fail = await recordFailedLoginAttempt(
        ip,
        "supplier",
        supplierUser.username,
        supplierUser.email
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
      "supplier",
      supplierUser.username,
      supplierUser.email
    );

    await prisma.supplierUser.update({
      where: { id: supplierUser.id },
      data: { lastLogin: new Date() },
    });

    const payload: SupplierSessionPayload = {
      supplierUserId: supplierUser.id,
      supplierId: supplierUser.supplierId,
      name: supplierUser.name,
      companyName: supplierUser.supplier.name,
      username: supplierUser.username,
      email: supplierUser.email,
      phone: supplierUser.phone,
      issuedAt: Date.now(),
    };
    const token = signSupplierToken(payload);

    const res = NextResponse.json({
      success: true,
      authenticated: true,
      supplier: payload,
      message: "Signed in successfully!",
    });
    res.cookies.set(SUPPLIER_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (err: any) {
    console.error("[POST /api/auth/supplier Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Supplier authentication failed." },
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
  res.cookies.delete(SUPPLIER_COOKIE_NAME);
  return res;
}

