import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import {
  PlatformRole,
  SUPER_ADMIN_COOKIE_NAME,
  SuperAdminSessionPayload,
  checkBruteForceLockout,
  clearFailedLoginAttempts,
  hashPassword,
  recordFailedLoginAttempt,
  signSuperAdminToken,
  verifyPassword,
  verifySuperAdminRequest,
  verifySuperAdminToken,
} from "@/lib/auth";
import { getClientIp, logPlatformAudit } from "@/lib/audit";
import { PLATFORM_COOKIE_MAX_AGE_SECONDS } from "./constants";

const VALID_PLATFORM_ROLES = new Set<PlatformRole>([
  "ceo",
  "platform_admin",
  "finance_ops",
  "support_viewer",
]);

function timingSafeTextEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function attachSuperAdminCookie(res: NextResponse, token: string) {
  res.cookies.set(SUPER_ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: PLATFORM_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function GET(req: NextRequest) {
  try {
    const [totalPlatformUsers, cookieToken] = await Promise.all([
      prisma.platformUser.count(),
      Promise.resolve(req.cookies.get(SUPER_ADMIN_COOKIE_NAME)?.value),
    ]);
    const bootstrapNeeded = totalPlatformUsers === 0;

    const check = verifySuperAdminToken(cookieToken);
    if (!check.valid || !check.session) {
      const res = NextResponse.json({
        success: true,
        authenticated: false,
        expired: check.expired,
        bootstrapNeeded,
        platformUser: null,
      });
      if (cookieToken && check.expired) {
        res.cookies.delete(SUPER_ADMIN_COOKIE_NAME);
      }
      return res;
    }

    const dbUser = await prisma.platformUser.findUnique({
      where: { id: check.session.platformUserId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        active: true,
        lastLogin: true,
      },
    });

    if (!dbUser || !dbUser.active) {
      const res = NextResponse.json({
        success: true,
        authenticated: false,
        bootstrapNeeded,
        platformUser: null,
      });
      res.cookies.delete(SUPER_ADMIN_COOKIE_NAME);
      return res;
    }

    const refreshed: SuperAdminSessionPayload = {
      platformUserId: dbUser.id,
      name: dbUser.name,
      username: dbUser.username,
      email: dbUser.email,
      role: (dbUser.role || "support_viewer") as PlatformRole,
      issuedAt: check.session.issuedAt,
      lastActive: Date.now(),
    };
    const token = signSuperAdminToken(refreshed);

    const res = NextResponse.json({
      success: true,
      authenticated: true,
      bootstrapNeeded,
      platformUser: {
        ...refreshed,
        lastLogin: dbUser.lastLogin,
      },
    });
    attachSuperAdminCookie(res, token);
    return res;
  } catch (err: any) {
    console.error("[GET /api/auth/super-admin Error]:", err);
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
    const action = String(body.action || "login").toLowerCase();

    // Action 1: First-run guarded CEO bootstrap (only when 0 PlatformUser rows exist)
    if (action === "bootstrap") {
      const existingCount = await prisma.platformUser.count();
      if (existingCount > 0) {
        return NextResponse.json(
          { success: false, message: "Platform CEO account is already initialized." },
          { status: 403 }
        );
      }

      const expectedKey = (process.env.PLATFORM_BOOTSTRAP_KEY || "").trim();
      if (!expectedKey) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Web bootstrap disabled. Configure PLATFORM_BOOTSTRAP_KEY in .env or run `scripts/seed-super-admin.ts`.",
          },
          { status: 403 }
        );
      }

      const suppliedKey = String(body.bootstrapKey || "").trim();
      if (!suppliedKey || !timingSafeTextEqual(suppliedKey, expectedKey)) {
        return NextResponse.json(
          { success: false, message: "Invalid platform bootstrap key." },
          { status: 403 }
        );
      }

      const name = String(body.name || "").trim();
      const username = String(body.username || "").trim().toLowerCase();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!name || !username || !email || password.length < 8) {
        return NextResponse.json(
          {
            success: false,
            message: "Name, username, email, and password (min 8 chars) are required.",
          },
          { status: 400 }
        );
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          { success: false, message: "Please provide a valid CEO email address." },
          { status: 400 }
        );
      }

      const pwHash = await hashPassword(password);
      const ceo = await prisma.platformUser.create({
        data: {
          name,
          username,
          email,
          password: pwHash,
          role: "ceo",
          active: true,
          lastLogin: new Date(),
        },
      });

      const cfgCount = await prisma.platformConfig.count();
      if (cfgCount === 0) {
        await prisma.platformConfig.create({
          data: {
            platformName: "Medical POS Cloud",
            supportEmail: email,
            defaultTrialDays: 14,
            gracePeriodDays: 7,
            razorpayMode: "test",
          },
        });
      }

      await logPlatformAudit({
        platformUserId: ceo.id,
        action: "PLATFORM_CEO_BOOTSTRAPPED",
        entity: "platform_users",
        entityId: ceo.id,
        details: { username: ceo.username, email: ceo.email, role: ceo.role },
        ipAddress: ip,
      });

      const payload: SuperAdminSessionPayload = {
        platformUserId: ceo.id,
        name: ceo.name,
        username: ceo.username,
        email: ceo.email,
        role: "ceo",
        issuedAt: Date.now(),
        lastActive: Date.now(),
      };
      const token = signSuperAdminToken(payload);
      const res = NextResponse.json(
        {
          success: true,
          authenticated: true,
          platformUser: payload,
          message: "Platform CEO initialized and signed in!",
        },
        { status: 201 }
      );
      attachSuperAdminCookie(res, token);
      return res;
    }

    // Action 2: Create additional Super Admin team login (CEO only)
    if (action === "create_team_user") {
      const auth = await verifySuperAdminRequest(req, ["ceo"]);
      if (!auth.authorized || !auth.session) {
        return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
      }

      const name = String(body.name || "").trim();
      const username = String(body.username || "").trim().toLowerCase();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const rawRole = String(body.role || "support_viewer").toLowerCase() as PlatformRole;

      if (!name || !username || !email || password.length < 8) {
        return NextResponse.json(
          { success: false, message: "Name, username, email, and password (min 8 chars) required." },
          { status: 400 }
        );
      }
      if (!VALID_PLATFORM_ROLES.has(rawRole)) {
        return NextResponse.json({ success: false, message: "Invalid platform role." }, { status: 400 });
      }

      const conflict = await prisma.platformUser.findFirst({
        where: { OR: [{ username }, { email }] },
      });
      if (conflict) {
        return NextResponse.json(
          { success: false, message: "Username or email is already registered." },
          { status: 409 }
        );
      }

      const pwHash = await hashPassword(password);
      const created = await prisma.platformUser.create({
        data: {
          name,
          username,
          email,
          password: pwHash,
          role: rawRole,
          active: true,
        },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          role: true,
          active: true,
          createdAt: true,
        },
      });

      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        action: "PLATFORM_USER_CREATED",
        entity: "platform_users",
        entityId: created.id,
        details: { username: created.username, role: created.role },
        ipAddress: ip,
      });

      return NextResponse.json(
        { success: true, platformUser: created, message: "Platform operator created." },
        { status: 201 }
      );
    }

    // Action 3: Standard Login (default)
    const identifier = String(body.identifier || body.username || body.email || "").trim();
    const password = String(body.password || "");

    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, message: "Username/Email and Password are required." },
        { status: 400 }
      );
    }

    const lockCheck = await checkBruteForceLockout(ip, "super_admin", identifier);
    if (lockCheck.locked) {
      return NextResponse.json(
        {
          success: false,
          lockedOut: true,
          remainingSeconds: lockCheck.remainingSeconds,
          message: `Too many wrong password attempts. Wait ${Math.ceil(
            lockCheck.remainingSeconds / 60
          )} minute(s).`,
        },
        { status: 429 }
      );
    }

    const dbUser = await prisma.platformUser.findFirst({
      where: {
        OR: [
          { username: { equals: identifier, mode: "insensitive" } },
          { email: { equals: identifier, mode: "insensitive" } },
        ],
      },
    });

    if (!dbUser) {
      const fail = await recordFailedLoginAttempt(ip, "super_admin", identifier);
      return NextResponse.json(
        {
          success: false,
          remainingAttempts: fail.remainingAttempts,
          message: "Super Admin account not found.",
        },
        { status: 401 }
      );
    }

    if (!dbUser.active) {
      return NextResponse.json(
        {
          success: false,
          message: "Your platform operator account is disabled.",
        },
        { status: 403 }
      );
    }

    const valid = await verifyPassword(password, dbUser.password);
    if (!valid) {
      const fail = await recordFailedLoginAttempt(ip, "super_admin", dbUser.username, dbUser.email);
      await logPlatformAudit({
        platformUserId: dbUser.id,
        action: "SUPER_ADMIN_LOGIN_FAILED",
        entity: "platform_users",
        entityId: dbUser.id,
        details: { username: dbUser.username, remainingAttempts: fail.remainingAttempts },
        ipAddress: ip,
      });
      return NextResponse.json(
        {
          success: false,
          remainingAttempts: fail.remainingAttempts,
          message: `Wrong password. ${fail.remainingAttempts} try(s) left.`,
        },
        { status: 401 }
      );
    }

    await clearFailedLoginAttempts(ip, "super_admin", dbUser.username, dbUser.email);

    await prisma.platformUser.update({
      where: { id: dbUser.id },
      data: { lastLogin: new Date() },
    });

    await logPlatformAudit({
      platformUserId: dbUser.id,
      action: "SUPER_ADMIN_LOGIN_SUCCESS",
      entity: "platform_users",
      entityId: dbUser.id,
      details: { username: dbUser.username, role: dbUser.role },
      ipAddress: ip,
    });

    const payload: SuperAdminSessionPayload = {
      platformUserId: dbUser.id,
      name: dbUser.name,
      username: dbUser.username,
      email: dbUser.email,
      role: (dbUser.role || "support_viewer") as PlatformRole,
      issuedAt: Date.now(),
      lastActive: Date.now(),
    };
    const token = signSuperAdminToken(payload);

    const res = NextResponse.json({
      success: true,
      authenticated: true,
      platformUser: payload,
      message: "Signed in to Platform Control Tower!",
    });
    attachSuperAdminCookie(res, token);
    return res;
  } catch (err: any) {
    console.error("[POST /api/auth/super-admin Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Authentication failed." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const name = body.name !== undefined ? String(body.name).trim() : undefined;
    const currentPassword = body.currentPassword ? String(body.currentPassword) : "";
    const newPassword = body.newPassword ? String(body.newPassword) : "";

    const dbUser = await prisma.platformUser.findUnique({
      where: { id: auth.session.platformUserId },
    });
    if (!dbUser) {
      return NextResponse.json({ success: false, message: "Account not found" }, { status: 404 });
    }

    const updateData: any = {};
    if (name !== undefined) {
      if (!name) {
        return NextResponse.json({ success: false, message: "Name cannot be empty" }, { status: 400 });
      }
      updateData.name = name;
    }

    if (newPassword) {
      if (!currentPassword || !(await verifyPassword(currentPassword, dbUser.password))) {
        return NextResponse.json(
          { success: false, message: "Current password is incorrect" },
          { status: 401 }
        );
      }
      if (newPassword.length < 8) {
        return NextResponse.json(
          { success: false, message: "New password must be at least 8 characters" },
          { status: 400 }
        );
      }
      updateData.password = await hashPassword(newPassword);
    }

    const updated = await prisma.platformUser.update({
      where: { id: dbUser.id },
      data: updateData,
      select: { id: true, name: true, username: true, email: true, role: true },
    });

    await logPlatformAudit({
      platformUserId: dbUser.id,
      action: newPassword ? "SUPER_ADMIN_PASSWORD_CHANGED" : "SUPER_ADMIN_PROFILE_UPDATED",
      entity: "platform_users",
      entityId: dbUser.id,
      details: { updatedFields: Object.keys(updateData) },
      ipAddress: getClientIp(req),
    });

    const refreshedPayload: SuperAdminSessionPayload = {
      platformUserId: updated.id,
      name: updated.name,
      username: updated.username,
      email: updated.email,
      role: updated.role as PlatformRole,
      issuedAt: auth.session.issuedAt,
      lastActive: Date.now(),
    };
    const token = signSuperAdminToken(refreshedPayload);
    const res = NextResponse.json({
      success: true,
      platformUser: refreshedPayload,
      message: "Account updated successfully.",
    });
    attachSuperAdminCookie(res, token);
    return res;
  } catch (err: any) {
    console.error("[PATCH /api/auth/super-admin Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Update failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(SUPER_ADMIN_COOKIE_NAME)?.value;
  const check = verifySuperAdminToken(token);
  if (check.session?.platformUserId) {
    await logPlatformAudit({
      platformUserId: check.session.platformUserId,
      action: "SUPER_ADMIN_LOGOUT",
      entity: "platform_users",
      entityId: check.session.platformUserId,
      ipAddress: getClientIp(req),
    });
  }

  const res = NextResponse.json({
    success: true,
    authenticated: false,
    message: "Signed out of Super Admin portal.",
  });
  res.cookies.delete(SUPER_ADMIN_COOKIE_NAME);
  return res;
}
