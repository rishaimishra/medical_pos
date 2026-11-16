import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest, verifyPassword } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { getEffectiveMaxDiscount, hasPermission } from "@/lib/rbac";

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

    // Find manager/admin user
    const canonical = usernameOrEmail.trim().toLowerCase();
    const managerUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: canonical, mode: "insensitive" } },
          { email: { equals: canonical, mode: "insensitive" } },
        ],
      },
    });

    if (!managerUser || !managerUser.active) {
      return NextResponse.json(
        { success: false, error: "Invalid manager credentials or inactive account" },
        { status: 401 }
      );
    }

    // Verify Password
    const passwordValid = await verifyPassword(password, managerUser.password);
    if (!passwordValid) {
      return NextResponse.json(
        { success: false, error: "Incorrect manager password" },
        { status: 401 }
      );
    }

    // Check authorization rights
    const role = managerUser.role as any;
    const canAuthorizeHighDiscount =
      role === "admin" ||
      role === "manager" ||
      hasPermission({ role, permissions: [] } as any, "apply_high_discount");

    if (!canAuthorizeHighDiscount) {
      return NextResponse.json(
        {
          success: false,
          error: `User '${managerUser.name}' does not possess manager-level discount authorization permissions.`,
        },
        { status: 403 }
      );
    }

    // Verify requested percentage against manager's own ceiling
    const managerMaxDiscount = getEffectiveMaxDiscount(role);
    if (requestedPct > managerMaxDiscount) {
      return NextResponse.json(
        {
          success: false,
          error: `Authorization Failed: The requested ${requestedPct}% discount exceeds ${managerUser.name}'s authorization ceiling (${managerMaxDiscount}%).`,
        },
        { status: 403 }
      );
    }

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
