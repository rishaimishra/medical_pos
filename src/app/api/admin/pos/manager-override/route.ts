import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import {
  verifyAdminRequest,
  verifyPassword,
  createDiscountOverrideToken,
  checkBruteForceLockout,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
} from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { canAccessBranch, getEffectiveMaxDiscount, hasPermission } from "@/lib/rbac";

/**
 * MODULE 2.4.2: Manager Discount Override Authentication
 * Allows cashiers to request in-person manager/admin password authorization when an
 * item-level or bill-level discount exceeds the cashier's allowable maximum (e.g. >10%).
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const {
      usernameOrEmail,
      password,
      requestedDiscountPercent,
      reason = "Cashier discount limit exceeded",
      itemDescription,
    } = body;

    if (!usernameOrEmail || !password) {
      return NextResponse.json(
        { success: false, error: "Manager credentials (Username/Email & Password) are required" },
        { status: 400 }
      );
    }

    const requestedPct = parseFloat(requestedDiscountPercent);
    if (isNaN(requestedPct) || requestedPct <= 0 || requestedPct > 100) {
      return NextResponse.json(
        { success: false, error: "Valid discount percentage between 0% and 100% is required" },
        { status: 400 }
      );
    }

    // Find manager/admin user within the same store tenant
    const ip = getClientIp(req);
    const canonical = usernameOrEmail.trim().toLowerCase();

    const lockout = await checkBruteForceLockout(ip, "admin", canonical);
    if (lockout.locked) {
      return NextResponse.json(
        {
          success: false,
          lockedOut: true,
          remainingSeconds: lockout.remainingSeconds,
          error: `Too many failed override attempts. Try again in ${Math.ceil(lockout.remainingSeconds / 60)} minute(s).`,
        },
        { status: 429 }
      );
    }

    const managerUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: canonical, mode: "insensitive" } },
          { email: { equals: canonical, mode: "insensitive" } },
        ],
        ...(auth.session.storeId ? { storeId: auth.session.storeId } : {}),
      },
    });

    if (!managerUser || !managerUser.active) {
      await recordFailedLoginAttempt(ip, "admin", canonical);
      return NextResponse.json(
        { success: false, error: "Invalid manager credentials or inactive account" },
        { status: 401 }
      );
    }

    const userLockout = await checkBruteForceLockout(ip, "admin", managerUser.username, managerUser.email);
    if (userLockout.locked) {
      return NextResponse.json(
        {
          success: false,
          lockedOut: true,
          remainingSeconds: userLockout.remainingSeconds,
          error: `Manager override temporarily locked due to failed attempts. Try again in ${Math.ceil(userLockout.remainingSeconds / 60)} minute(s).`,
        },
        { status: 429 }
      );
    }

    if (
      auth.session.branchId &&
      !canAccessBranch(
        {
          role: managerUser.role,
          branchId: managerUser.branchId,
          permissions: managerUser.permissions,
        },
        auth.session.branchId
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Manager '${managerUser.name}' is not authorized for this store branch.`,
        },
        { status: 403 }
      );
    }

    // Verify Password
    const passwordValid = await verifyPassword(password, managerUser.password);
    if (!passwordValid) {
      await recordFailedLoginAttempt(ip, "admin", managerUser.username, managerUser.email);
      await logAudit({
        storeId: auth.session.storeId ?? null,
        userId: auth.session.userId,
        branchId: auth.session.branchId ?? null,
        action: "manager_discount_override_failed",
        entity: "pos_discount",
        details: {
          attemptedManager: managerUser.username,
          requestedDiscountPercent: requestedPct,
          cashierName: auth.session.name,
        },
        ipAddress: ip,
      });
      return NextResponse.json(
        { success: false, error: "Incorrect manager password" },
        { status: 401 }
      );
    }

    await clearFailedLoginAttempts(ip, "admin", managerUser.username, managerUser.email);

    // Check authorization rights (using managerUser's actual custom permissions)
    const role = managerUser.role as any;
    const canAuthorizeHighDiscount =
      role === "admin" ||
      role === "manager" ||
      hasPermission(
        { role, permissions: managerUser.permissions, branchId: managerUser.branchId },
        "apply_high_discount"
      );

    if (!canAuthorizeHighDiscount) {
      return NextResponse.json(
        {
          success: false,
          error: `User '${managerUser.name}' does not possess manager-level discount authorization permissions.`,
        },
        { status: 403 }
      );
    }

    // Verify requested percentage against manager's own ceiling (including custom ceiling)
    const managerMaxDiscount = getEffectiveMaxDiscount(role, managerUser.permissions);
    if (requestedPct > managerMaxDiscount) {
      return NextResponse.json(
        {
          success: false,
          error: `Authorization Failed: The requested ${requestedPct}% discount exceeds ${managerUser.name}'s authorization ceiling (${managerMaxDiscount}%).`,
        },
        { status: 403 }
      );
    }

    const overrideToken = createDiscountOverrideToken({
      managerId: managerUser.id,
      managerName: managerUser.name,
      managerRole: managerUser.role,
      maxApprovedPercent: requestedPct,
      storeId: auth.session.storeId ?? null,
      cashierId: auth.session.userId,
    });

    // Record Manager Override in Audit Log
    await logAudit({
      storeId: auth.session.storeId ?? null,
      userId: auth.session.userId, // cashier who performed transaction
      branchId: auth.session.branchId ?? null,
      action: "manager_discount_override",
      entity: "pos_discount",
      details: JSON.stringify({
        approvedBy: managerUser.name,
        managerId: managerUser.id,
        managerRole: managerUser.role,
        discountPercent: requestedPct,
        reason,
        itemDescription: itemDescription || "Bill/Item Discount",
        cashierName: auth.session.name,
      }),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      authorized: true,
      managerId: managerUser.id,
      managerName: managerUser.name,
      overrideToken,
      approvedDiscountPercent: requestedPct,
      message: `Discount approved by ${managerUser.name} (${managerUser.role.toUpperCase()})`,
    });
  } catch (error: unknown) {
    console.error("Manager override error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process manager discount authorization" },
      { status: 500 }
    );
  }
}
