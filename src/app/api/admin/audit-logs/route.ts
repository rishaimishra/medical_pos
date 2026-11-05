import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { getSessionFromRequest, verifyAdminRequest } from "@/lib/auth";
import { getClientIp, logAudit } from "@/lib/audit";
import { ROLE_MATRIX, SystemRole } from "@/lib/rbac";

/**
 * MODULE 1.4.3 & 1.4.4: Tamper-Proof System Audit Trails & RBAC Matrix API
 * - Scoped strictly by `storeId` when called from an authenticated store session so
 *   Store Owner A never sees Store Owner B's audit trail.
 */

export async function GET(req: NextRequest) {
  try {
    const authGuard = await verifyAdminRequest(req);
    if (!authGuard.authorized || !authGuard.session) {
      return NextResponse.json(
        { success: false, message: authGuard.message || "Authentication required." },
        { status: authGuard.status || 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action")?.trim() || undefined;
    const entity = searchParams.get("entity")?.trim() || undefined;
    const branchIdParam = searchParams.get("branchId");
    const userIdParam = searchParams.get("userId");
    const search = searchParams.get("search")?.trim() || undefined;
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    // Strictly isolate audit logs by the logged-in user's Store Tenant ID
    if (authGuard.session.storeId) {
      where.storeId = authGuard.session.storeId;
    }

    // RBAC: Non-admin staff without audit/settings permissions only see their own activities
    const isFullAuditor =
      authGuard.session.role === "admin" ||
      authGuard.session.permissions.includes("manage_users") ||
      authGuard.session.permissions.includes("manage_settings");

    if (!isFullAuditor) {
      where.userId = authGuard.session.userId;
    } else if (userIdParam) {
      where.userId = Number(userIdParam);
    }

    if (action) where.action = action;
    if (entity) where.entity = entity;
    if (branchIdParam && branchIdParam !== "all") {
      where.branchId = Number(branchIdParam);
    }
    if (search) {
      where.OR = [
        { action: { contains: search, mode: "insensitive" } },
        { entity: { contains: search, mode: "insensitive" } },
        { details: { contains: search, mode: "insensitive" } },
        { ipAddress: { contains: search, mode: "insensitive" } },
      ];
    }

    const [logs, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              role: true,
            },
          },
          branch: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      logs,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      roleMatrix: ROLE_MATRIX,
    });
  } catch (error) {
    console.error("[GET /api/admin/audit-logs Error]:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch system audit logs." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const auth = getSessionFromRequest(req);

  try {
    const body = await req.json();

    // Sub-action: Update User Role & Granular Permissions (1.4.3)
    if (body.operation === "update_user_rbac") {
      const adminGuard = await verifyAdminRequest(req, { requiredRole: "admin" });
      if (!adminGuard.authorized) {
        return NextResponse.json(
          {
            success: false,
            message:
              adminGuard.message ||
              "Only an authenticated Super Admin can modify role & permission matrices.",
          },
          { status: adminGuard.status }
        );
      }

      const targetUserId = Number(body.userId);
      const nextRole = String(body.role || "staff").toLowerCase() as SystemRole;
      const nextBranchId =
        body.branchId === null || body.branchId === undefined || body.branchId === ""
          ? null
          : Number(body.branchId);
      const permissionsPayload =
        typeof body.permissions === "object" && body.permissions !== null
          ? JSON.stringify(body.permissions)
          : typeof body.permissions === "string"
          ? body.permissions
          : null;

      if (!targetUserId || !ROLE_MATRIX[nextRole]) {
        return NextResponse.json(
          { success: false, message: "Valid userId and system role are required." },
          { status: 400 }
        );
      }

      const existingUser = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!existingUser) {
        return NextResponse.json(
          { success: false, message: "Target user not found." },
          { status: 404 }
        );
      }

      // Prevent cross-store user modification
      if (
        adminGuard.session?.storeId &&
        existingUser.storeId &&
        existingUser.storeId !== adminGuard.session.storeId
      ) {
        return NextResponse.json(
          { success: false, message: "Cross-Store Access Denied." },
          { status: 403 }
        );
      }

      // Branch isolation: verify nextBranchId belongs to this store
      if (nextBranchId !== null && adminGuard.session?.storeId) {
        const branchExists = await prisma.branch.findFirst({
          where: { id: nextBranchId, storeId: adminGuard.session.storeId },
        });
        if (!branchExists) {
          return NextResponse.json(
            { success: false, message: "Selected branch does not belong to your store." },
            { status: 400 }
          );
        }
      }

      // Edge Case Guard: Last-Admin Demotion Protection (scoped to this store tenant)
      if (existingUser.role.toLowerCase() === "admin" && nextRole !== "admin" && existingUser.active) {
        const activeAdminCount = await prisma.user.count({
          where: {
            role: "admin",
            active: true,
            ...(existingUser.storeId ? { storeId: existingUser.storeId } : {}),
          },
        });
        if (activeAdminCount <= 1) {
          return NextResponse.json(
            {
              success: false,
              message:
                "Last-Admin Protection: Cannot demote the only active Super Admin account.",
            },
            { status: 400 }
          );
        }
      }

      const updatedUser = await prisma.user.update({
        where: { id: targetUserId },
        data: {
          role: nextRole,
          branchId: nextBranchId,
          permissions: permissionsPayload,
        },
        select: {
          id: true,
          storeId: true,
          username: true,
          name: true,
          email: true,
          role: true,
          branchId: true,
          permissions: true,
          active: true,
        },
      });

      await logAudit({
        storeId: auth.session?.storeId ?? existingUser.storeId ?? null,
        userId: auth.session?.userId ?? null,
        branchId: nextBranchId,
        action: "ROLE_PERMISSION_UPDATED",
        entity: "users",
        entityId: targetUserId,
        details: {
          username: existingUser.username,
          previousRole: existingUser.role,
          newRole: nextRole,
          previousBranchId: existingUser.branchId,
          newBranchId: nextBranchId,
          permissions: body.permissions ?? null,
        },
        ipAddress: ip,
      });

      return NextResponse.json({
        success: true,
        user: updatedUser,
        message: "User role and permissions updated and logged to audit trail.",
      });
    }

    // Default: Append an immutable audit trail entry (1.4.4)
    const authGuard = await verifyAdminRequest(req);
    if (!authGuard.authorized || !authGuard.session) {
      return NextResponse.json(
        { success: false, message: authGuard.message || "Authentication required to append audit events." },
        { status: authGuard.status || 401 }
      );
    }

    const { action, entity, entityId, details, branchId } = body;
    if (!action || !entity) {
      return NextResponse.json(
        { success: false, message: "action and entity are required for audit logging." },
        { status: 400 }
      );
    }

    await logAudit({
      storeId: authGuard.session.storeId ?? null,
      userId: authGuard.session.userId,
      branchId: branchId ? Number(branchId) : authGuard.session.branchId ?? null,
      action: String(action),
      entity: String(entity),
      entityId: entityId ? Number(entityId) : null,
      details: details ?? null,
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      message: "Audit event recorded.",
    });
  } catch (error) {
    console.error("[POST /api/admin/audit-logs Error]:", error);
    return NextResponse.json(
      { success: false, message: "Failed to process audit log request." },
      { status: 500 }
    );
  }
}

export async function PUT() {
  return NextResponse.json(
    {
      success: false,
      message:
        "Tamper-Proof Security Policy: System audit logs are immutable and cannot be modified.",
    },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    {
      success: false,
      message:
        "Tamper-Proof Security Policy: System audit logs are immutable and cannot be deleted.",
    },
    { status: 405 }
  );
}
