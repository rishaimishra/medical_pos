import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { getClientIp, logAudit } from "@/lib/audit";

/**
 * API: /api/admin/settings
 * Multi-Tenant Store Settings Engine:
 * - Strictly guarded by verifyAdminRequest (requires active authenticated session).
 * - Enforces multi-tenant isolation (`storeId = auth.session.storeId`).
 */

export async function GET(req: NextRequest) {
  try {
    const authGuard = await verifyAdminRequest(req);
    if (!authGuard.authorized || !authGuard.session) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          setupDone: false,
          error: authGuard.message || "Authentication required.",
        },
        { status: authGuard.status || 401 }
      );
    }

    const storeId = authGuard.session.storeId;
    const settings = storeId
      ? await prisma.settings.findUnique({ where: { id: storeId } })
      : null;

    if (!settings) {
      return NextResponse.json({
        success: true,
        authenticated: true,
        setupDone: true,
        data: {
          storeName: "",
          storeAddress: "",
          storePhone: "",
          storeEmail: "",
          storeGst: "",
          storeDl: "",
          currency: "₹",
          lowQty: 10,
          expiryDays: 90,
          emailProvider: "sendgrid",
          smtpHost: "",
          smtpPort: 587,
          smtpUser: "",
          hasSmtpPass: false,
          smtpFrom: "",
          smtpName: "",
          smtpSecure: "tls",
          hasSendgridKey: Boolean(process.env.SENDGRID_API_KEY),
        },
      });
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      setupDone: Boolean(settings.setupDone),
      data: {
        id: settings.id,
        storeName: settings.storeName || "",
        storeAddress: settings.storeAddress || "",
        storePhone: settings.storePhone || "",
        storeEmail: settings.storeEmail || "",
        storeGst: settings.storeGst || "",
        storeDl: settings.storeDl || "",
        currency: settings.currency || "₹",
        lowQty: settings.lowQty,
        expiryDays: settings.expiryDays,
        emailProvider: settings.emailProvider || "sendgrid",
        smtpHost: settings.smtpHost || "",
        smtpPort: settings.smtpPort || 587,
        smtpUser: settings.smtpUser || "",
        hasSmtpPass: Boolean(settings.smtpPass),
        smtpFrom: settings.smtpFrom || "",
        smtpName: settings.smtpName || settings.storeName || "",
        smtpSecure: settings.smtpSecure || "tls",
        hasSendgridKey: Boolean(
          settings.sendgridKey || process.env.SENDGRID_API_KEY
        ),
        sendgridKeyMasked: settings.sendgridKey
          ? `${settings.sendgridKey.slice(0, 7)}...${settings.sendgridKey.slice(-4)}`
          : process.env.SENDGRID_API_KEY
          ? `${process.env.SENDGRID_API_KEY.slice(0, 7)}...${process.env.SENDGRID_API_KEY.slice(-4)} (from .env)`
          : "",
      },
    });
  } catch (err: any) {
    console.error("[API /api/admin/settings GET error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authGuard = await verifyAdminRequest(req, { requiredPermission: "manage_settings" });
    if (!authGuard.authorized || !authGuard.session) {
      return NextResponse.json(
        {
          success: false,
          error: authGuard.message || "Unauthorized: 'manage_settings' permission required.",
        },
        { status: authGuard.status || 403 }
      );
    }

    const body = await req.json();
    const {
      storeName,
      storeAddress,
      storePhone,
      storeEmail,
      storeGst,
      storeDl,
      currency,
      lowQty,
      expiryDays,
      emailProvider,
      sendgridKey,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpFrom,
      smtpName,
      smtpSecure,
    } = body;

    if (!storeName || !storeName.trim()) {
      return NextResponse.json(
        { success: false, error: "Store Name is required." },
        { status: 400 }
      );
    }

    const storeId = authGuard.session.storeId;
    const currentSettings = storeId
      ? await prisma.settings.findUnique({ where: { id: storeId } })
      : null;

    const parsedLowQty =
      lowQty !== undefined && lowQty !== null && !isNaN(Number(lowQty))
        ? Math.max(0, Number(lowQty))
        : currentSettings?.lowQty ?? 10;
    const parsedExpiryDays =
      expiryDays !== undefined && expiryDays !== null && !isNaN(Number(expiryDays))
        ? Math.max(1, Number(expiryDays))
        : currentSettings?.expiryDays ?? 90;

    // Partial update preservation: keep existing values if fields were not provided in request
    const updateData: any = {
      storeName: storeName.trim(),
      storeAddress: storeAddress !== undefined ? (storeAddress ? storeAddress.trim() : null) : currentSettings?.storeAddress,
      storePhone: storePhone !== undefined ? (storePhone ? storePhone.trim() : null) : currentSettings?.storePhone,
      storeEmail: storeEmail !== undefined ? (storeEmail ? storeEmail.trim() : null) : currentSettings?.storeEmail,
      storeGst: storeGst !== undefined ? (storeGst ? storeGst.trim().toUpperCase() : null) : currentSettings?.storeGst,
      storeDl: storeDl !== undefined ? (storeDl ? storeDl.trim() : null) : currentSettings?.storeDl,
      currency: currency !== undefined ? currency : currentSettings?.currency || "₹",
      lowQty: parsedLowQty,
      expiryDays: parsedExpiryDays,
      emailProvider: emailProvider || currentSettings?.emailProvider || "sendgrid",
      smtpHost: smtpHost !== undefined ? (smtpHost ? smtpHost.trim() : null) : currentSettings?.smtpHost,
      smtpPort: smtpPort !== undefined ? (Number(smtpPort) || 587) : currentSettings?.smtpPort ?? 587,
      smtpUser: smtpUser !== undefined ? (smtpUser ? smtpUser.trim() : null) : currentSettings?.smtpUser,
      smtpFrom: smtpFrom !== undefined ? (smtpFrom ? smtpFrom.trim() : null) : currentSettings?.smtpFrom,
      smtpName: smtpName !== undefined ? (smtpName ? smtpName.trim() : null) : currentSettings?.smtpName,
      smtpSecure: smtpSecure || currentSettings?.smtpSecure || "tls",
      setupDone: true,
    };

    if (sendgridKey !== undefined && sendgridKey.trim()) {
      updateData.sendgridKey = sendgridKey.trim();
    }
    if (smtpPass !== undefined && smtpPass.trim()) {
      updateData.smtpPass = smtpPass.trim();
    }

    let saved;
    if (currentSettings) {
      saved = await prisma.settings.update({
        where: { id: currentSettings.id },
        data: updateData,
      });
    } else {
      saved = await prisma.settings.create({
        data: updateData,
      });
      await prisma.user.update({
        where: { id: authGuard.session.userId },
        data: { storeId: saved.id },
      });
    }

    // Sync this store owner's primary (MAIN) branch
    const mainBranch = await prisma.branch.findFirst({
      where: { storeId: saved.id, isMain: true },
    });
    if (mainBranch) {
      await prisma.branch.update({
        where: { id: mainBranch.id },
        data: {
          name: updateData.storeName,
          address: updateData.storeAddress,
          phone: updateData.storePhone,
          email: updateData.storeEmail,
          gstNo: updateData.storeGst,
          dlNo: updateData.storeDl,
        },
      });
    }

    await logAudit({
      storeId: saved.id,
      userId: authGuard.session.userId,
      branchId: mainBranch?.id ?? authGuard.session.branchId ?? null,
      action: "SETTINGS_UPDATED",
      entity: "settings",
      entityId: saved.id,
      details: {
        storeName: saved.storeName,
        storeGst: saved.storeGst,
        storeDl: saved.storeDl,
        lowQty: saved.lowQty,
        expiryDays: saved.expiryDays,
        emailProvider: saved.emailProvider,
      },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: "Store settings updated successfully.",
      data: {
        id: saved.id,
        storeName: saved.storeName,
        storeGst: saved.storeGst,
        storeDl: saved.storeDl,
        emailProvider: saved.emailProvider,
      },
    });
  } catch (err: any) {
    console.error("[API /api/admin/settings POST error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update settings" },
      { status: 500 }
    );
  }
}
