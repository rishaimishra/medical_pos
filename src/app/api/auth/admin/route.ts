import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import {
  SESSION_COOKIE_NAME,
  buildUserSessionPayload,
  checkBruteForceLockout,
  clearFailedLoginAttempts,
  createSessionToken,
  getSessionFromRequest,
  recordFailedLoginAttempt,
  verifyPassword,
} from "@/lib/auth";
import { getClientIp, logAudit } from "@/lib/audit";
import { ROLE_MATRIX } from "@/lib/rbac";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12; // 12-hour cookie container (2-hour inactivity enforced inside token)

function attachSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * GET /api/auth/admin
 * Verifies current session, enforces 2-hour inactivity timeout, and syncs live user permissions/status from DB.
 */
export async function GET(req: NextRequest) {
  try {
    const tokenResult = getSessionFromRequest(req);

    if (!tokenResult.session) {
      return NextResponse.json({
        success: true,
        authenticated: false,
        setupDone: false,
        locked: false,
        expired: false,
        session: null,
        roleMatrix: ROLE_MATRIX,
      });
    }

    // Fetch live user record to handle mid-session role/permission updates or account deactivation
    const dbUser = await prisma.user.findUnique({
      where: { id: tokenResult.session.userId },
      include: {
        branch: {
          select: { id: true, storeId: true, code: true, name: true, active: true, isMain: true },
        },
      },
    });

    const setupDone = true;

    if (!dbUser || !dbUser.active) {
      const res = NextResponse.json(
        {
          success: false,
          authenticated: false,
          setupDone,
          locked: false,
          expired: true,
          message: "User account is inactive or no longer exists.",
        },
        { status: 403 }
      );
      res.cookies.delete(SESSION_COOKIE_NAME);
      return res;
    }

    // Edge Case: Staff assigned to a secondary branch that was deactivated
    if (
      dbUser.role.toLowerCase() !== "admin" &&
      dbUser.branchId !== null &&
      dbUser.branch &&
      !dbUser.branch.active &&
      !dbUser.branch.isMain
    ) {
      const res = NextResponse.json(
        {
          success: false,
          authenticated: false,
          setupDone,
          locked: false,
          expired: true,
          message: `Your assigned store branch [${dbUser.branch.code}] has been deactivated.`,
        },
        { status: 403 }
      );
      res.cookies.delete(SESSION_COOKIE_NAME);
      return res;
    }

    // If 2-hour inactivity timeout elapsed, mark session as locked (preserving user identity for unlock modal)
    if (tokenResult.expired) {
      const userStoreId = dbUser.storeId ?? dbUser.branch?.storeId ?? null;
      await logAudit({
        storeId: userStoreId,
        userId: dbUser.id,
        branchId: dbUser.branchId,
        action: "SESSION_EXPIRED",
        entity: "users",
        entityId: dbUser.id,
        details: { username: dbUser.username, role: dbUser.role, reason: "inactivity_2h" },
        ipAddress: getClientIp(req),
      });

      const lockedPayload = buildUserSessionPayload(dbUser, true);
      lockedPayload.issuedAt = tokenResult.session.issuedAt;
      lockedPayload.lastActive = tokenResult.session.lastActive;
      const lockedToken = createSessionToken(lockedPayload);

      const res = NextResponse.json({
        success: true,
        authenticated: true,
        setupDone,
        locked: true,
        expired: true,
        inactiveSeconds: tokenResult.session ? Math.floor((Date.now() - tokenResult.session.lastActive) / 1000) : 7200,
        session: lockedPayload,
        roleMatrix: ROLE_MATRIX,
        message: "Session auto-locked after 2 hours of inactivity.",
      });
      attachSessionCookie(res, lockedToken);
      return res;
    }

    const isLocked = Boolean(tokenResult.locked);
    const refreshedPayload = buildUserSessionPayload(dbUser, isLocked);
    refreshedPayload.issuedAt = tokenResult.session.issuedAt;
    refreshedPayload.lastActive = isLocked
      ? tokenResult.session.lastActive
      : Date.now();

    const refreshedToken = createSessionToken(refreshedPayload);
    const res = NextResponse.json({
      success: true,
      authenticated: true,
      setupDone,
      locked: isLocked,
      expired: false,
      session: refreshedPayload,
      roleMatrix: ROLE_MATRIX,
    });
    attachSessionCookie(res, refreshedToken);
    return res;
  } catch (error) {
    console.error("[GET /api/auth/admin Error]:", error);
    return NextResponse.json(
      { success: false, message: "Failed to verify authentication session." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/admin
 * Handles:
 *  - action: "login" (default) -> Standard login with 5-attempt / 15-min brute-force protection
 *  - action: "unlock" -> Re-verifies password to unlock an auto-locked / manually-locked screen
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  try {
    const body = await req.json();
    const action = (body.action || "login") as "login" | "unlock";
    const identifier = String(body.identifier || body.username || body.email || "").trim();
    const password = String(body.password || "");

    if (action === "unlock") {
      const current = getSessionFromRequest(req);
      if (!current.session && !body.userId && !identifier) {
        return NextResponse.json(
          { success: false, message: "No active session found to unlock." },
          { status: 401 }
        );
      }

      const targetUserId = current.session?.userId || (body.userId ? Number(body.userId) : null);
      const lookupIdentifier = current.session?.username || identifier;

      // 1. Check Brute-Force Lockout
      const rateLimit = await checkBruteForceLockout(ip, "admin", lookupIdentifier);
      if (rateLimit.locked) {
        await logAudit({
          userId: targetUserId || null,
          action: "LOGIN_LOCKED",
          entity: "users",
          entityId: targetUserId || null,
          details: {
            reason: "Brute-force lockout during screen unlock",
            identifier: lookupIdentifier,
            remainingSeconds: rateLimit.remainingSeconds,
          },
          ipAddress: ip,
        });

        return NextResponse.json(
          {
            success: false,
            lockedOut: true,
            remainingAttempts: 0,
            remainingSeconds: rateLimit.remainingSeconds,
            unlockAt: rateLimit.unlockAt,
            message: `Too many failed attempts. Screen unlock blocked for ${Math.ceil(
              rateLimit.remainingSeconds / 60
            )} minute(s).`,
          },
          { status: 429 }
        );
      }

      if (!password) {
        return NextResponse.json(
          { success: false, message: "Password is required to unlock screen." },
          { status: 400 }
        );
      }

      const dbUser = targetUserId
        ? await prisma.user.findUnique({
            where: { id: targetUserId },
            include: { branch: { select: { id: true, storeId: true, code: true, name: true, active: true, isMain: true } } },
          })
        : await prisma.user.findFirst({
            where: {
              OR: [
                { username: { equals: lookupIdentifier, mode: "insensitive" } },
                { email: { equals: lookupIdentifier, mode: "insensitive" } },
              ],
            },
            include: { branch: { select: { id: true, storeId: true, code: true, name: true, active: true, isMain: true } } },
          });

      if (!dbUser || !dbUser.active) {
        return NextResponse.json(
          { success: false, message: "User session invalid or account deactivated." },
          { status: 403 }
        );
      }

      // Edge case: check if staff's assigned secondary branch is deactivated
      if (
        dbUser.role.toLowerCase() !== "admin" &&
        dbUser.branchId !== null &&
        dbUser.branch &&
        !dbUser.branch.active &&
        !dbUser.branch.isMain
      ) {
        return NextResponse.json(
          {
            success: false,
            message: `Your assigned store branch [${dbUser.branch.code}] is deactivated. Please contact Super Admin.`,
          },
          { status: 403 }
        );
      }

      const userStoreId = dbUser.storeId ?? dbUser.branch?.storeId ?? null;

      const isValid = await verifyPassword(password, dbUser.password);
      if (!isValid) {
        const updatedLimit = await recordFailedLoginAttempt(
          ip,
          "admin",
          dbUser.username,
          dbUser.email
        );
        await logAudit({
          storeId: userStoreId,
          userId: dbUser.id,
          branchId: dbUser.branchId,
          action: updatedLimit.locked ? "LOGIN_LOCKED" : "LOGIN_FAILED",
          entity: "users",
          entityId: dbUser.id,
          details: {
            context: "screen_unlock",
            attemptsCount: updatedLimit.attemptsCount,
            remainingAttempts: updatedLimit.remainingAttempts,
          },
          ipAddress: ip,
        });

        return NextResponse.json(
          {
            success: false,
            lockedOut: updatedLimit.locked,
            remainingAttempts: updatedLimit.remainingAttempts,
            remainingSeconds: updatedLimit.remainingSeconds,
            message: updatedLimit.locked
              ? `Account locked for 15 minutes after 5 failed attempts.`
              : `Incorrect password. ${updatedLimit.remainingAttempts} attempt(s) remaining before 15-min lockout.`,
          },
          { status: updatedLimit.locked ? 429 : 401 }
        );
      }

      await clearFailedLoginAttempts(ip, "admin", dbUser.username, dbUser.email);
      const unlockedPayload = buildUserSessionPayload(dbUser, false);
      const token = createSessionToken(unlockedPayload);

      await logAudit({
        storeId: userStoreId,
        userId: dbUser.id,
        branchId: dbUser.branchId,
        action: "SCREEN_UNLOCKED",
        entity: "users",
        entityId: dbUser.id,
        details: { username: dbUser.username, role: dbUser.role },
        ipAddress: ip,
      });

      const res = NextResponse.json({
        success: true,
        authenticated: true,
        locked: false,
        session: unlockedPayload,
        token,
        message: "Screen unlocked successfully.",
      });
      attachSessionCookie(res, token);
      return res;
    }

    // Standard Login Flow (action === "login")
    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, message: "Username/Email and Password are required." },
        { status: 400 }
      );
    }

    // 1. Check Brute-Force Lockout (5 attempts within 15 minutes)
    const preCheck = await checkBruteForceLockout(ip, "admin", identifier);
    if (preCheck.locked) {
      await logAudit({
        action: "LOGIN_LOCKED",
        entity: "users",
        details: {
          identifier,
          attemptsCount: preCheck.attemptsCount,
          remainingSeconds: preCheck.remainingSeconds,
        },
        ipAddress: ip,
      });

      return NextResponse.json(
        {
          success: false,
          lockedOut: true,
          remainingAttempts: 0,
          remainingSeconds: preCheck.remainingSeconds,
          unlockAt: preCheck.unlockAt,
          message: `Account & IP temporarily locked due to 5 failed login attempts. Try again in ${Math.ceil(
            preCheck.remainingSeconds / 60
          )} minute(s).`,
        },
        { status: 429 }
      );
    }

    // 2. Lookup user by username or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: identifier, mode: "insensitive" } },
          { email: { equals: identifier, mode: "insensitive" } },
        ],
      },
      include: {
        branch: {
          select: { id: true, storeId: true, code: true, name: true, active: true, isMain: true },
        },
      },
    });

    if (!user) {
      const failStatus = await recordFailedLoginAttempt(ip, "admin", identifier);
      await logAudit({
        action: failStatus.locked ? "LOGIN_LOCKED" : "LOGIN_FAILED",
        entity: "users",
        details: {
          identifier,
          reason: "User not found",
          attemptsCount: failStatus.attemptsCount,
          remainingAttempts: failStatus.remainingAttempts,
        },
        ipAddress: ip,
      });

      return NextResponse.json(
        {
          success: false,
          lockedOut: failStatus.locked,
          remainingAttempts: failStatus.remainingAttempts,
          remainingSeconds: failStatus.remainingSeconds,
          unlockAt: failStatus.unlockAt,
          message: failStatus.locked
            ? "Too many failed login attempts. Locked for 15 minutes."
            : `Invalid credentials. ${failStatus.remainingAttempts} attempt(s) remaining.`,
        },
        { status: failStatus.locked ? 429 : 401 }
      );
    }

    // 2b. Canonical Brute-Force Check across BOTH username and email of resolved user
    const userStoreId = user.storeId ?? user.branch?.storeId ?? null;

    const canonicalLockCheck = await checkBruteForceLockout(
      ip,
      "admin",
      user.username,
      user.email
    );
    if (canonicalLockCheck.locked) {
      await logAudit({
        storeId: userStoreId,
        userId: user.id,
        branchId: user.branchId,
        action: "LOGIN_LOCKED",
        entity: "users",
        entityId: user.id,
        details: {
          username: user.username,
          identifierUsed: identifier,
          attemptsCount: canonicalLockCheck.attemptsCount,
          remainingSeconds: canonicalLockCheck.remainingSeconds,
        },
        ipAddress: ip,
      });

      return NextResponse.json(
        {
          success: false,
          lockedOut: true,
          remainingAttempts: 0,
          remainingSeconds: canonicalLockCheck.remainingSeconds,
          unlockAt: canonicalLockCheck.unlockAt,
          message: `Account temporarily locked due to 5 failed login attempts. Try again in ${Math.ceil(
            canonicalLockCheck.remainingSeconds / 60
          )} minute(s).`,
        },
        { status: 429 }
      );
    }

    // 3. Check if user account is active
    if (!user.active) {
      await logAudit({
        storeId: userStoreId,
        userId: user.id,
        branchId: user.branchId,
        action: "LOGIN_BLOCKED_INACTIVE",
        entity: "users",
        entityId: user.id,
        details: { username: user.username, role: user.role, reason: "user_inactive" },
        ipAddress: ip,
      });

      return NextResponse.json(
        {
          success: false,
          message: "Your staff account is currently deactivated. Please contact the Super Admin.",
        },
        { status: 403 }
      );
    }

    // 3b. Edge Case: Check if staff's assigned branch is active
    if (
      user.role.toLowerCase() !== "admin" &&
      user.branchId !== null &&
      user.branch &&
      !user.branch.active &&
      !user.branch.isMain
    ) {
      await logAudit({
        storeId: userStoreId,
        userId: user.id,
        branchId: user.branchId,
        action: "LOGIN_BLOCKED_INACTIVE",
        entity: "users",
        entityId: user.id,
        details: {
          username: user.username,
          role: user.role,
          branchCode: user.branch.code,
          reason: "assigned_branch_inactive",
        },
        ipAddress: ip,
      });

      return NextResponse.json(
        {
          success: false,
          message: `Your assigned store branch [${user.branch.code}] is currently deactivated. Please contact the Super Admin.`,
        },
        { status: 403 }
      );
    }

    // 4. Verify BCrypt Password
    const passwordValid = await verifyPassword(password, user.password);
    if (!passwordValid) {
      const failStatus = await recordFailedLoginAttempt(
        ip,
        "admin",
        user.username,
        user.email
      );
      await logAudit({
        storeId: userStoreId,
        userId: user.id,
        branchId: user.branchId,
        action: failStatus.locked ? "LOGIN_LOCKED" : "LOGIN_FAILED",
        entity: "users",
        entityId: user.id,
        details: {
          username: user.username,
          reason: "Invalid password",
          attemptsCount: failStatus.attemptsCount,
          remainingAttempts: failStatus.remainingAttempts,
        },
        ipAddress: ip,
      });

      return NextResponse.json(
        {
          success: false,
          lockedOut: failStatus.locked,
          remainingAttempts: failStatus.remainingAttempts,
          remainingSeconds: failStatus.remainingSeconds,
          unlockAt: failStatus.unlockAt,
          message: failStatus.locked
            ? "Too many failed login attempts. Account locked for 15 minutes."
            : `Invalid credentials. ${failStatus.remainingAttempts} attempt(s) remaining.`,
        },
        { status: failStatus.locked ? 429 : 401 }
      );
    }

    // 5. Success -> Clear brute-force counter, update lastLogin, log audit, issue session
    await clearFailedLoginAttempts(ip, "admin", user.username, user.email);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const sessionPayload = buildUserSessionPayload(user, false);
    const token = createSessionToken(sessionPayload);

    await logAudit({
      storeId: userStoreId,
      userId: user.id,
      branchId: user.branchId,
      action: "LOGIN_SUCCESS",
      entity: "users",
      entityId: user.id,
      details: {
        username: user.username,
        role: user.role,
        branchId: user.branchId,
        branchCode: user.branch?.code || "ALL",
      },
      ipAddress: ip,
    });

    const res = NextResponse.json({
      success: true,
      authenticated: true,
      locked: false,
      session: sessionPayload,
      token,
      roleMatrix: ROLE_MATRIX,
      message: "Login successful.",
    });
    attachSessionCookie(res, token);
    return res;
  } catch (error) {
    console.error("[POST /api/auth/admin Error]:", error);
    return NextResponse.json(
      { success: false, message: "Internal authentication error." },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/auth/admin
 * Handles:
 *  - action: "lock" -> Manually or automatically locks the screen without losing POS cart state
 *  - action: "heartbeat" -> Refreshes lastActive timestamp
 */
export async function PUT(req: NextRequest) {
  const ip = getClientIp(req);

  try {
    const current = getSessionFromRequest(req);
    if (!current.session) {
      return NextResponse.json(
        { success: false, message: "No active session found." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "heartbeat";

    if (action === "lock") {
      const lockedSession = {
        ...current.session,
        isLocked: true,
      };
      const token = createSessionToken(lockedSession);

      await logAudit({
        storeId: current.session.storeId ?? null,
        userId: current.session.userId,
        branchId: current.session.branchId,
        action: "SCREEN_LOCKED",
        entity: "users",
        entityId: current.session.userId,
        details: {
          username: current.session.username,
          reason: body.reason || "manual_or_inactivity_lock",
        },
        ipAddress: ip,
      });

      const res = NextResponse.json({
        success: true,
        locked: true,
        session: lockedSession,
        message: "Screen locked.",
      });
      attachSessionCookie(res, token);
      return res;
    }

    // Heartbeat -> Refresh lastActive if not locked
    if (current.locked || current.expired) {
      return NextResponse.json(
        {
          success: false,
          locked: true,
          message: "Session is locked. Unlock required.",
        },
        { status: 423 }
      );
    }

    const updatedSession = {
      ...current.session,
      lastActive: Date.now(),
    };
    const token = createSessionToken(updatedSession);
    const res = NextResponse.json({
      success: true,
      locked: false,
      session: updatedSession,
    });
    attachSessionCookie(res, token);
    return res;
  } catch (error) {
    console.error("[PUT /api/auth/admin Error]:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update session state." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/admin
 * Logs out the current user and clears the session cookie.
 */
export async function DELETE(req: NextRequest) {
  const ip = getClientIp(req);

  try {
    const current = getSessionFromRequest(req);
    if (current.session) {
      await logAudit({
        storeId: current.session.storeId ?? null,
        userId: current.session.userId,
        branchId: current.session.branchId,
        action: "LOGOUT",
        entity: "users",
        entityId: current.session.userId,
        details: { username: current.session.username },
        ipAddress: ip,
      });
    }

    const res = NextResponse.json({
      success: true,
      authenticated: false,
      message: "Logged out successfully.",
    });
    res.cookies.delete(SESSION_COOKIE_NAME);
    return res;
  } catch (error) {
    console.error("[DELETE /api/auth/admin Error]:", error);
    return NextResponse.json(
      { success: false, message: "Failed to logout." },
      { status: 500 }
    );
  }
}

