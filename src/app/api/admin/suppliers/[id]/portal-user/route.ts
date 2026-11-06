import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest, hashPassword } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { sendAccountCredentialsEmail } from "@/lib/email";
import crypto from "crypto";

/**
 * MODULE 1.10.3: SUPPLIER USER ACCOUNT GENERATION
 * 
 * Endpoints:
 * - GET: Check existing portal account details for this supplier.
 * - POST: Generate or reset portal credentials, hash password, and email supplier.
 * - PUT: Toggle active status.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { id: rawId } = await params;
  const supplierId = parseInt(rawId, 10);
  if (!supplierId || isNaN(supplierId)) {
    return NextResponse.json({ success: false, message: "Invalid supplier ID" }, { status: 400 });
  }

  try {
    const portalUser = await prisma.supplierUser.findFirst({
      where: { supplierId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        phone: true,
        active: true,
        verified: true,
        lastLogin: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, portalUser });
  } catch (error: any) {
    console.error("GET /api/admin/suppliers/[id]/portal-user error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch portal user" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  // Admin or Manager only
  if (auth.session.role !== "admin" && auth.session.role !== "manager") {
    return NextResponse.json({ success: false, message: "Forbidden: Admin privileges required to generate portal accounts" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const supplierId = parseInt(rawId, 10);
  if (!supplierId || isNaN(supplierId)) {
    return NextResponse.json({ success: false, message: "Invalid supplier ID" }, { status: 400 });
  }

  try {
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      return NextResponse.json({ success: false, message: "Supplier not found" }, { status: 404 });
    }

    const body = await req.json();
    let username = (body.username || "").trim().toLowerCase();
    let email = (body.email || supplier.email || "").trim().toLowerCase();
    let plainPassword = (body.password || "").trim();
    const sendEmail = body.sendEmail !== false;

    // Default username generation if missing
    if (!username) {
      const sanitized = supplier.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      username = `sup_${sanitized.slice(0, 12)}_${supplier.id}`;
    }

    if (!email) {
      return NextResponse.json({ success: false, message: "Supplier email is required to create a portal account" }, { status: 400 });
    }

    // Default password generation if missing
    if (!plainPassword) {
      plainPassword = `Sup@${crypto.randomBytes(3).toString("hex")}!`;
    }

    if (plainPassword.length < 6) {
      return NextResponse.json({ success: false, message: "Password must be at least 6 characters" }, { status: 400 });
    }

    const hashedPassword = await hashPassword(plainPassword);

    // Check if supplier already has a portal user
    const existingForSupplier = await prisma.supplierUser.findFirst({
      where: { supplierId },
    });

    // Check unique username and email across ALL supplier users
    const duplicate = await prisma.supplierUser.findFirst({
      where: {
        id: existingForSupplier ? { not: existingForSupplier.id } : undefined,
        OR: [
          { username },
          { email },
        ],
      },
    });

    if (duplicate) {
      if (duplicate.username === username) {
        return NextResponse.json({ success: false, message: `Portal username '${username}' is already taken.` }, { status: 400 });
      }
      return NextResponse.json({ success: false, message: `Email '${email}' is already in use by another supplier portal account.` }, { status: 400 });
    }

    let portalUser;
    let actionType = "SUPPLIER_PORTAL_USER_CREATED";

    if (existingForSupplier) {
      portalUser = await prisma.supplierUser.update({
        where: { id: existingForSupplier.id },
        data: {
          name: supplier.contact || supplier.name,
          username,
          email,
          phone: supplier.phone,
          password: hashedPassword,
          active: true,
          verified: true,
        },
      });
      actionType = "SUPPLIER_PORTAL_USER_RESET";
    } else {
      portalUser = await prisma.supplierUser.create({
        data: {
          supplierId,
          name: supplier.contact || supplier.name,
          username,
          email,
          phone: supplier.phone,
          password: hashedPassword,
          active: true,
          verified: true,
        },
      });
    }

    await logAudit({
      userId: auth.session.userId,
      branchId: auth.session.branchId,
      action: actionType,
      entity: "supplier_user",
      entityId: portalUser.id,
      details: { supplierId, supplierName: supplier.name, username, email },
      ipAddress: getClientIp(req),
    });

    // Send credentials email
    let emailSent = false;
    let emailError: string | null = null;

    if (sendEmail && email) {
      try {
        const storeSettings = await prisma.settings.findFirst();
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const emailRes = await sendAccountCredentialsEmail({
          name: supplier.contact || supplier.name,
          username,
          toEmail: email,
          password: plainPassword,
          role: "supplier",
          accountType: "supplier",
          storeName: storeSettings?.storeName || "Medical POS Pharmacy",
          loginUrl: `${appUrl}/supplier/login`,
        });
        emailSent = emailRes.success;
        if (!emailRes.success) emailError = emailRes.error || "Failed to send credential email";
      } catch (err: any) {
        emailError = err.message || "Failed to dispatch email";
      }
    }

    return NextResponse.json({
      success: true,
      message: existingForSupplier
        ? `Portal credentials reset successfully for '${supplier.name}'`
        : `Portal account created successfully for '${supplier.name}'`,
      portalUser: {
        id: portalUser.id,
        username: portalUser.username,
        email: portalUser.email,
        active: portalUser.active,
        verified: portalUser.verified,
      },
      credentials: {
        username,
        password: plainPassword, // Handed to admin on create/reset
        loginUrl: "/supplier/login",
      },
      emailSent,
      emailError,
    });
  } catch (error: any) {
    console.error("POST /api/admin/suppliers/[id]/portal-user error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to generate portal user" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (auth.session.role !== "admin" && auth.session.role !== "manager") {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const supplierId = parseInt(rawId, 10);
  if (!supplierId || isNaN(supplierId)) {
    return NextResponse.json({ success: false, message: "Invalid supplier ID" }, { status: 400 });
  }

  try {
    const portalUser = await prisma.supplierUser.findFirst({ where: { supplierId } });
    if (!portalUser) {
      return NextResponse.json({ success: false, message: "No portal user found for this supplier" }, { status: 404 });
    }

    const body = await req.json();
    const active = body.active !== undefined ? Boolean(body.active) : !portalUser.active;

    const updated = await prisma.supplierUser.update({
      where: { id: portalUser.id },
      data: { active },
    });

    await logAudit({
      userId: auth.session.userId,
      branchId: auth.session.branchId,
      action: active ? "SUPPLIER_PORTAL_USER_ACTIVATED" : "SUPPLIER_PORTAL_USER_DEACTIVATED",
      entity: "supplier_user",
      entityId: updated.id,
      details: { supplierId, username: updated.username, active },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Supplier portal user '${updated.username}' is now ${active ? "active" : "deactivated"}`,
      portalUser: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        active: updated.active,
        verified: updated.verified,
      },
    });
  } catch (error: any) {
    console.error("PUT /api/admin/suppliers/[id]/portal-user error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to update portal user status" }, { status: 500 });
  }
}
