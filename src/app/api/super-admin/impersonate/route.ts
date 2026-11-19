import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import {
  SESSION_COOKIE_NAME,
  buildUserSessionPayload,
  createSessionToken,
  getSessionFromRequest,
  verifySuperAdminRequest,
} from "@/lib/auth";
import { getClientIp, logAudit, logPlatformAudit } from "@/lib/audit";

const IMPERSONATION_TTL_MS = 30 * 60 * 1000; // 30 minutes strict time limit

/**
 * MODULE 3.2.3: Guarded "Support View / Impersonate Store Admin" Mode
 * - POST: Grants a time-limited (30m) med_pos_admin_session for a target Store Tenant with mandatory reason & dual audit logging
 * - DELETE: Cleanly exits support view and logs termination
 */
export async function POST(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req, ["ceo", "platform_admin"]);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const storeId = parseInt(String(body.storeId || ""), 10);
    const reason = String(body.reason || "").trim();

    if (!storeId || isNaN(storeId)) {
      return NextResponse.json({ success: false, message: "Valid storeId is required." }, { status: 400 });
    }
    if (reason.length < 5) {
      return NextResponse.json(
        { success: false, message: "Support impersonation reason (min 5 chars) is mandatory." },
        { status: 400 }
      );
    }

    const store = await prisma.settings.findUnique({
      where: { id: storeId },
      select: { id: true, storeName: true, storeStatus: true },
    });
    if (!store) {
      return NextResponse.json({ success: false, message: "Store not found." }, { status: 404 });
    }

    // Prefer store's active primary admin; fallback to first active staff user in store
    const targetUser = await prisma.user.findFirst({
      where: { storeId, active: true },
      orderBy: [{ role: "asc" }, { id: "asc" }],
      include: {
        branch: {
          select: { id: true, storeId: true, code: true, name: true, active: true, isMain: true },
        },
      },
    });

    if (!targetUser) {
      return NextResponse.json(
        { success: false, message: "No active staff or admin users exist for this store." },
        { status: 404 }
      );
    }

    const ip = getClientIp(req);
    const expiresAt = Date.now() + IMPERSONATION_TTL_MS;
    const payload = buildUserSessionPayload(targetUser, false);
    payload.impersonatedByPlatformUserId = auth.session.platformUserId;
    payload.impersonatorName = auth.session.name;
    payload.impersonationReason = reason.slice(0, 200);
    payload.impersonationExpiresAt = expiresAt;

    const token = createSessionToken(payload);

    await Promise.all([
      logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        storeId: store.id,
        action: "SUPPORT_IMPERSONATION_STARTED",
        entity: "settings",
        entityId: store.id,
        details: {
          storeName: store.storeName,
          impersonatedUserId: targetUser.id,
          impersonatedUsername: targetUser.username,
          reason,
          expiresAt: new Date(expiresAt).toISOString(),
        },
        ipAddress: ip,
      }),
      logAudit({
        storeId: store.id,
        userId: targetUser.id,
        branchId: targetUser.branchId,
        action: "CEO_SUPPORT_SESSION_STARTED",
        entity: "users",
        entityId: targetUser.id,
        details: {
          platformUserId: auth.session.platformUserId,
          impersonatorName: auth.session.name,
          reason,
        },
        ipAddress: ip,
      }),
    ]);

    const res = NextResponse.json({
      success: true,
      redirectUrl: "/admin/dashboard",
      storeName: store.storeName,
      impersonatedAs: targetUser.username,
      expiresAt: new Date(expiresAt).toISOString(),
    });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 30,
    });
    return res;
  } catch (err: any) {
    console.error("[POST /api/super-admin/impersonate Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to initiate support view" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const adminToken = getSessionFromRequest(req);
  const superCheck = await verifySuperAdminRequest(req).catch(() => null);
  const ip = getClientIp(req);

  const impStoreId = adminToken.session?.storeId ?? null;
  const impPlatformId =
    superCheck?.session?.platformUserId ?? adminToken.session?.impersonatedByPlatformUserId ?? null;

  if (impPlatformId && adminToken.session?.impersonatedByPlatformUserId) {
    await Promise.all([
      logPlatformAudit({
        platformUserId: impPlatformId,
        storeId: impStoreId,
        action: "SUPPORT_IMPERSONATION_ENDED",
        entity: "settings",
        entityId: impStoreId,
        details: { exitedBy: superCheck?.session?.name || "Platform Operator" },
        ipAddress: ip,
      }),
      impStoreId
        ? logAudit({
            storeId: impStoreId,
            userId: adminToken.session.userId,
            branchId: adminToken.session.branchId,
            action: "CEO_SUPPORT_SESSION_ENDED",
            entity: "users",
            entityId: adminToken.session.userId,
            details: { platformUserId: impPlatformId },
            ipAddress: ip,
          })
        : Promise.resolve(),
    ]);
  }

  const res = NextResponse.json({
    success: true,
    message: "Exited CEO Support View.",
  });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
