import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import {
  CUSTOMER_COOKIE_NAME,
  hashPassword,
  signCustomerToken,
  verifyCustomerRequest,
  verifyPassword,
} from "@/lib/auth";
import { escapeHtml, sendEmail } from "@/lib/email";

/**
 * MODULE 2.19.3: Customer Profile & Password Management API
 */
export async function GET(req: NextRequest) {
  const auth = await verifyCustomerRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const [customer, store] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: auth.session.customerId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          address: true,
          dob: true,
          gender: true,
          isChronic: true,
          chronicDiseases: true,
          refillDays: true,
          nextRefillDate: true,
          verified: true,
          verifiedAt: true,
          lastLogin: true,
        },
      }),
      prisma.settings.findFirst({
        orderBy: { id: "asc" },
        select: { storeName: true, storeEmail: true, storePhone: true },
      }),
    ]);

    if (!customer) {
      return NextResponse.json({ success: false, message: "Customer profile not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      profile: customer,
      storeContact: {
        name: store?.storeName || "Medical POS Pharmacy",
        email: store?.storeEmail || null,
        phone: store?.storePhone || null,
      },
    });
  } catch (error: any) {
    console.error("GET /api/customer/profile error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to load profile" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyCustomerRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const action = String(body.action || "update_profile").toLowerCase();

    const customer = await prisma.customer.findUnique({
      where: { id: auth.session.customerId },
    });

    if (!customer) {
      return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
    }

    if (action === "change_password") {
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");

      if (!currentPassword || !newPassword) {
        return NextResponse.json(
          { success: false, message: "Current password and new password are required." },
          { status: 400 }
        );
      }

      if (newPassword.length < 6) {
        return NextResponse.json(
          { success: false, message: "New password must be at least 6 characters long." },
          { status: 400 }
        );
      }

      if (!customer.password || !(await verifyPassword(currentPassword, customer.password))) {
        return NextResponse.json(
          { success: false, message: "Current password is incorrect." },
          { status: 401 }
        );
      }

      const nextHash = await hashPassword(newPassword);
      await prisma.customer.updateMany({
        where: { phone: customer.phone },
        data: { password: nextHash },
      });

      return NextResponse.json({
        success: true,
        message: "Password updated successfully!",
      });
    }

    // Profile Update Mode
    const name = body.name !== undefined ? String(body.name).trim() : customer.name;
    const address = body.address !== undefined ? (String(body.address).trim() || null) : customer.address;
    const gender = body.gender !== undefined ? (String(body.gender).trim() || null) : customer.gender;
    const email = body.email !== undefined ? (String(body.email).trim().toLowerCase() || null) : customer.email;

    if (!name) {
      return NextResponse.json({ success: false, message: "Name cannot be empty." }, { status: 400 });
    }

    if (body.email !== undefined && !email) {
      return NextResponse.json(
        { success: false, message: "Email address is required for your portal account." },
        { status: 400 }
      );
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, message: "Invalid email address format." }, { status: 400 });
    }

    if (email && email !== customer.email) {
      const conflict = await prisma.customer.findFirst({
        where: {
          email: { equals: email, mode: "insensitive" },
          phone: { not: customer.phone },
        },
      });
      if (conflict) {
        return NextResponse.json(
          { success: false, message: "That email is already associated with another account." },
          { status: 409 }
        );
      }
    }

    let dobUpdate: Date | null | undefined = undefined;
    if (body.dob !== undefined) {
      if (!body.dob) {
        dobUpdate = null;
      } else {
        const parsedDob = new Date(String(body.dob));
        if (isNaN(parsedDob.getTime())) {
          return NextResponse.json({ success: false, message: "Invalid date of birth." }, { status: 400 });
        }
        dobUpdate = parsedDob;
      }
    }

    const updatedEmailChanged = Boolean(email && email !== customer.email);
    const verifyToken = updatedEmailChanged ? crypto.randomBytes(24).toString("hex") : undefined;

    const syncData = {
      name,
      address,
      gender,
      email,
      ...(dobUpdate !== undefined ? { dob: dobUpdate } : {}),
      ...(updatedEmailChanged && verifyToken
        ? {
            verified: false,
            verifyToken,
            verifySentAt: new Date(),
            verifiedAt: null,
          }
        : {}),
    };

    const [, updated] = await Promise.all([
      prisma.customer.updateMany({
        where: { phone: customer.phone, id: { not: customer.id } },
        data: syncData,
      }),
      prisma.customer.update({
        where: { id: customer.id },
        data: syncData,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          address: true,
          dob: true,
          gender: true,
          verified: true,
        },
      }),
    ]);

    if (updatedEmailChanged && email && verifyToken) {
      const origin = req.nextUrl?.origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const verifyLink = `${origin}/api/auth/customer/verify?token=${encodeURIComponent(verifyToken)}`;
      const store = await prisma.settings.findFirst({ orderBy: { id: "asc" }, select: { id: true, storeName: true } });
      sendEmail({
        to: email,
        subject: `Verify your updated email — ${store?.storeName || "Medical POS Pharmacy"}`,
        html: `<p>Hello <strong>${escapeHtml(name)}</strong>,</p><p>You updated your email address. Please verify it to reactivate your Patient Portal login:</p><p><a href="${verifyLink}">Verify Updated Email</a></p>`,
        text: `Verify your updated email here: ${verifyLink}`,
        storeId: store?.id,
      }).catch(() => {});

      const res = NextResponse.json({
        success: true,
        requiresVerification: true,
        message: `Profile updated! Please verify your new email (${email}) before signing in again.`,
        profile: updated,
      });
      res.cookies.delete(CUSTOMER_COOKIE_NAME);
      return res;
    }

    const refreshedToken = signCustomerToken({
      customerId: updated.id,
      name: updated.name,
      phone: updated.phone,
      email: updated.email,
      address: updated.address,
      issuedAt: Date.now(),
    });
    const res = NextResponse.json({
      success: true,
      message: "Profile updated successfully!",
      profile: updated,
    });
    res.cookies.set(CUSTOMER_COOKIE_NAME, refreshedToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (error: any) {
    console.error("PATCH /api/customer/profile error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to update profile" },
      { status: 500 }
    );
  }
}
