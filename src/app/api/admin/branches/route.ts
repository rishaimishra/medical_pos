import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { getClientIp, logAudit } from "@/lib/audit";

/**
 * API: /api/admin/branches
 * Multi-Tenant / Multi-Outlet Branch Management Engine:
 * - Strictly isolates branches by `storeId = auth.session.storeId`.
 * - Guarded by verifyAdminRequest (requires active authenticated session).
 */

export async function GET(req: NextRequest) {
  try {
    const authGuard = await verifyAdminRequest(req);
    if (!authGuard.authorized || !authGuard.session) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          data: [],
          count: 0,
          error: authGuard.message || "Authentication required.",
        },
        { status: authGuard.status || 401 }
      );
    }

    const storeId = authGuard.session.storeId;
    if (!storeId) {
      return NextResponse.json({
        success: true,
        data: [],
        count: 0,
      });
    }

    let branches = await prisma.branch.findMany({
      where: { storeId },
      orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
      include: {
        _count: {
          select: {
            batches: true,
            sales: true,
            users: true,
            purchaseOrders: true,
            returns: true,
          },
        },
      },
    });

    // Self-Healing: If 0 branches exist for THIS store owner, auto-provision MAIN branch from their Settings
    if (branches.length === 0) {
      const settings = await prisma.settings.findUnique({ where: { id: storeId } });
      if (settings?.setupDone && settings.storeName) {
        await prisma.branch.create({
          data: {
            storeId: settings.id,
            code: "MAIN",
            name: settings.storeName,
            address: settings.storeAddress || null,
            phone: settings.storePhone || null,
            email: settings.storeEmail || null,
            gstNo: settings.storeGst || null,
            dlNo: settings.storeDl || null,
            isMain: true,
            active: true,
          },
        });

        branches = await prisma.branch.findMany({
          where: { storeId },
          orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
          include: {
            _count: {
              select: {
                batches: true,
                sales: true,
                users: true,
                purchaseOrders: true,
                returns: true,
              },
            },
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: branches,
      count: branches.length,
    });
  } catch (err: any) {
    console.error("[API /api/admin/branches GET error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to fetch branches" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authGuard = await verifyAdminRequest(req, { requiredPermission: "manage_settings" });
    if (!authGuard.authorized || !authGuard.session) {
      return NextResponse.json(
        { success: false, error: authGuard.message || "Unauthorized: 'manage_settings' permission required." },
        { status: authGuard.status || 403 }
      );
    }

    const storeId = authGuard.session.storeId;
    if (!storeId) {
      return NextResponse.json(
        { success: false, error: "Store tenant not found for this account." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { code, name, tagline, address, phone, email, gstNo, dlNo, active } = body;

    if (!code || !code.trim()) {
      return NextResponse.json(
        { success: false, error: "Branch Code (e.g. BR-02) is required." },
        { status: 400 }
      );
    }
    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Branch Name is required." },
        { status: 400 }
      );
    }

    const cleanCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,20}$/.test(cleanCode)) {
      return NextResponse.json(
        {
          success: false,
          error: "Branch Code must be 2–20 characters using only letters, numbers, hyphens, or underscores (e.g. BR-02).",
        },
        { status: 400 }
      );
    }

    // Check uniqueness ONLY within this store owner's tenant (storeId) - case-insensitive
    const existing = await prisma.branch.findFirst({
      where: { storeId, code: { equals: cleanCode, mode: "insensitive" } },
    });

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: `Branch code '${cleanCode}' is already registered in your store.`,
        },
        { status: 409 }
      );
    }

    const newBranch = await prisma.branch.create({
      data: {
        storeId,
        code: cleanCode,
        name: name.trim(),
        tagline: tagline ? tagline.trim() : null,
        address: address ? address.trim() : null,
        phone: phone ? phone.trim() : null,
        email: email ? email.trim() : null,
        gstNo: gstNo ? gstNo.trim().toUpperCase() : null,
        dlNo: dlNo ? dlNo.trim() : null,
        isMain: false,
        active: active !== undefined ? Boolean(active) : true,
      },
    });

    await logAudit({
      storeId,
      userId: authGuard.session.userId,
      branchId: newBranch.id,
      action: "BRANCH_CREATED",
      entity: "branches",
      entityId: newBranch.id,
      details: {
        code: newBranch.code,
        name: newBranch.name,
        gstNo: newBranch.gstNo,
        dlNo: newBranch.dlNo,
      },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Branch '${newBranch.name}' (${newBranch.code}) created successfully.`,
      data: newBranch,
    });
  } catch (err: any) {
    console.error("[API /api/admin/branches POST error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to create branch" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authGuard = await verifyAdminRequest(req, { requiredPermission: "manage_settings" });
    if (!authGuard.authorized || !authGuard.session) {
      return NextResponse.json(
        { success: false, error: authGuard.message || "Unauthorized: 'manage_settings' permission required." },
        { status: authGuard.status || 403 }
      );
    }

    const storeId = authGuard.session.storeId;
    const body = await req.json();
    const { id, code, name, tagline, address, phone, email, gstNo, dlNo, active } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Branch ID is required." },
        { status: 400 }
      );
    }

    const branch = await prisma.branch.findFirst({
      where: { id: Number(id), storeId },
    });

    if (!branch) {
      return NextResponse.json(
        { success: false, error: "Branch not found in your store." },
        { status: 404 }
      );
    }

    if (branch.isMain && active === false) {
      return NextResponse.json(
        { success: false, error: "The primary (MAIN) branch cannot be deactivated." },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (name !== undefined) {
      if (!name || !name.trim()) {
        return NextResponse.json(
          { success: false, error: "Branch name cannot be empty." },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }
    if (tagline !== undefined) updateData.tagline = tagline ? tagline.trim() : null;
    if (address !== undefined) updateData.address = address ? address.trim() : null;
    if (phone !== undefined) updateData.phone = phone ? phone.trim() : null;
    if (email !== undefined) updateData.email = email ? email.trim() : null;
    if (gstNo !== undefined) updateData.gstNo = gstNo ? gstNo.trim().toUpperCase() : null;
    if (dlNo !== undefined) updateData.dlNo = dlNo ? dlNo.trim() : null;
    if (active !== undefined && !branch.isMain) updateData.active = Boolean(active);

    if (code && !branch.isMain) {
      const cleanCode = code.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{2,20}$/.test(cleanCode)) {
        return NextResponse.json(
          {
            success: false,
            error: "Branch Code must be 2–20 characters (letters, numbers, hyphens, underscores).",
          },
          { status: 400 }
        );
      }
      if (cleanCode !== branch.code) {
        const conflict = await prisma.branch.findFirst({
          where: {
            storeId,
            code: { equals: cleanCode, mode: "insensitive" },
            NOT: { id: branch.id },
          },
        });
        if (conflict) {
          return NextResponse.json(
            { success: false, error: `Branch code '${cleanCode}' is already taken in your store.` },
            { status: 409 }
          );
        }
        updateData.code = cleanCode;
      }
    }

    const updated = await prisma.branch.update({
      where: { id: Number(id) },
      data: updateData,
    });

    if (branch.isMain && storeId) {
      await prisma.settings.update({
        where: { id: storeId },
        data: {
          storeName: updated.name,
          storeAddress: updated.address,
          storePhone: updated.phone,
          storeEmail: updated.email,
          storeGst: updated.gstNo,
          storeDl: updated.dlNo,
        },
      });
    }

    await logAudit({
      storeId,
      userId: authGuard.session.userId,
      branchId: updated.id,
      action: "BRANCH_UPDATED",
      entity: "branches",
      entityId: updated.id,
      details: {
        code: updated.code,
        name: updated.name,
        active: updated.active,
      },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Branch '${updated.name}' updated successfully.`,
      data: updated,
    });
  } catch (err: any) {
    console.error("[API /api/admin/branches PATCH error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update branch" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authGuard = await verifyAdminRequest(req, { requiredPermission: "manage_settings" });
    if (!authGuard.authorized || !authGuard.session) {
      return NextResponse.json(
        { success: false, error: authGuard.message || "Unauthorized: 'manage_settings' permission required." },
        { status: authGuard.status || 403 }
      );
    }

    const storeId = authGuard.session.storeId;
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Branch ID parameter is required." },
        { status: 400 }
      );
    }

    const branch = await prisma.branch.findFirst({
      where: { id, storeId },
      include: {
        _count: {
          select: {
            batches: true,
            sales: true,
            purchaseOrders: true,
            returns: true,
            stockAdjustments: true,
            users: true,
          },
        },
      },
    });

    if (!branch) {
      return NextResponse.json(
        { success: false, error: "Branch not found in your store." },
        { status: 404 }
      );
    }

    if (branch.isMain) {
      return NextResponse.json(
        { success: false, error: "Cannot delete the primary (MAIN) branch." },
        { status: 400 }
      );
    }

    // Privilege Escalation Guard: Cannot delete branch if staff are assigned to it
    if (branch._count.users > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete branch '${branch.name}'. It has ${branch._count.users} assigned user account(s). Please reassign or remove staff members first.`,
        },
        { status: 400 }
      );
    }

    const totalLinked =
      branch._count.batches +
      branch._count.sales +
      branch._count.purchaseOrders +
      branch._count.returns +
      branch._count.stockAdjustments;

    if (totalLinked > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete branch '${branch.name}'. It has linked records (${branch._count.batches} batches, ${branch._count.sales} sales, ${branch._count.purchaseOrders} POs, ${branch._count.returns} returns). Please deactivate it instead to preserve financial & inventory audit trails.`,
        },
        { status: 400 }
      );
    }

    await prisma.branch.delete({ where: { id } });

    await logAudit({
      storeId,
      userId: authGuard.session.userId,
      branchId: null,
      action: "BRANCH_DELETED",
      entity: "branches",
      entityId: id,
      details: {
        deletedCode: branch.code,
        deletedName: branch.name,
      },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Branch '${branch.name}' (${branch.code}) deleted successfully.`,
    });
  } catch (err: any) {
    console.error("[API /api/admin/branches DELETE error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to delete branch" },
      { status: 500 }
    );
  }
}
