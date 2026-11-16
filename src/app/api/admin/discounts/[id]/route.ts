import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const { id } = await params;
  const discountId = parseInt(id, 10);
  if (isNaN(discountId)) {
    return NextResponse.json({ success: false, error: "Invalid discount ID" }, { status: 400 });
  }

  try {
    const discount = await prisma.discount.findUnique({
      where: { id: discountId },
      include: {
        _count: { select: { sales: true } },
      },
    });

    if (!discount) {
      return NextResponse.json({ success: false, error: "Discount policy not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      discount: {
        id: discount.id,
        name: discount.name,
        type: discount.type,
        value: Number(discount.value),
        minAmount: Number(discount.minAmount),
        active: discount.active,
        salesCount: discount._count.sales,
        createdAt: discount.createdAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    console.error("Failed to fetch discount:", error);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  if (auth.session.role !== "admin" && auth.session.role !== "manager") {
    return NextResponse.json(
      { success: false, error: "Permission Denied: Only Admins or Managers can edit discount policies" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const discountId = parseInt(id, 10);
  if (isNaN(discountId)) {
    return NextResponse.json({ success: false, error: "Invalid discount ID" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { name, type, value, minAmount, active } = body;

    const existing = await prisma.discount.findUnique({
      where: { id: discountId },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Discount policy not found" }, { status: 404 });
    }

    const updateData: {
      name?: string;
      type?: string;
      value?: number;
      minAmount?: number;
      active?: boolean;
    } = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ success: false, error: "Name cannot be empty" }, { status: 400 });
      }
      updateData.name = name.trim();
    }

    if (type !== undefined) {
      if (type !== "percent" && type !== "flat") {
        return NextResponse.json({ success: false, error: "Type must be 'percent' or 'flat'" }, { status: 400 });
      }
      updateData.type = type;
    }

    if (value !== undefined) {
      const numVal = parseFloat(value);
      if (isNaN(numVal) || numVal <= 0) {
        return NextResponse.json({ success: false, error: "Value must be positive" }, { status: 400 });
      }
      const targetType = type || existing.type;
      if (targetType === "percent" && numVal > 100) {
        return NextResponse.json({ success: false, error: "Percentage discount cannot exceed 100%" }, { status: 400 });
      }
      updateData.value = numVal;
    }

    if (minAmount !== undefined) {
      updateData.minAmount = Math.max(0, parseFloat(minAmount) || 0);
    }

    if (active !== undefined) {
      updateData.active = Boolean(active);
    }

    const updated = await prisma.discount.update({
      where: { id: discountId },
      data: updateData,
    });

    await logAudit({
      storeId: auth.session.storeId ?? null,
      userId: auth.session.userId,
      branchId: auth.session.branchId ?? null,
      action: "update_discount_policy",
      entity: "discount",
      entityId: discountId,
      details: JSON.stringify({
        from: {
          name: existing.name,
          type: existing.type,
          value: Number(existing.value),
          active: existing.active,
        },
        to: {
          name: updated.name,
          type: updated.type,
          value: Number(updated.value),
          active: updated.active,
        },
      }),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      discount: {
        id: updated.id,
        name: updated.name,
        type: updated.type,
        value: Number(updated.value),
        minAmount: Number(updated.minAmount),
        active: updated.active,
      },
      message: "Discount policy updated successfully",
    });
  } catch (error: unknown) {
    console.error("Failed to update discount:", error);
    return NextResponse.json({ success: false, error: "Failed to update discount policy" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  if (auth.session.role !== "admin" && auth.session.role !== "manager") {
    return NextResponse.json(
      { success: false, error: "Permission Denied: Only Admins or Managers can delete discount policies" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const discountId = parseInt(id, 10);
  if (isNaN(discountId)) {
    return NextResponse.json({ success: false, error: "Invalid discount ID" }, { status: 400 });
  }

  try {
    const existing = await prisma.discount.findUnique({
      where: { id: discountId },
      include: {
        _count: { select: { sales: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Discount policy not found" }, { status: 404 });
    }

    // Safety guard: if discount was already applied in historical sales, deactivate rather than hard delete
    if (existing._count.sales > 0) {
      await prisma.discount.update({
        where: { id: discountId },
        data: { active: false },
      });

      await logAudit({
        storeId: auth.session.storeId ?? null,
        userId: auth.session.userId,
        branchId: auth.session.branchId ?? null,
        action: "deactivate_discount_policy",
        entity: "discount",
        entityId: discountId,
        details: JSON.stringify({
          reason: `Policy has ${existing._count.sales} historical sales records; soft-deactivated to preserve ledger integrity`,
        }),
        ipAddress: getClientIp(req),
      });

      return NextResponse.json({
        success: true,
        deactivated: true,
        message: `Policy '${existing.name}' is referenced in ${existing._count.sales} sale(s); deactivated instead of deleted to protect financial history.`,
      });
    }

    // Otherwise, clean delete
    await prisma.discount.delete({
      where: { id: discountId },
    });

    await logAudit({
      storeId: auth.session.storeId ?? null,
      userId: auth.session.userId,
      branchId: auth.session.branchId ?? null,
      action: "delete_discount_policy",
      entity: "discount",
      entityId: discountId,
      details: JSON.stringify({ deletedName: existing.name }),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Discount policy '${existing.name}' deleted successfully`,
    });
  } catch (error: unknown) {
    console.error("Failed to delete discount:", error);
    return NextResponse.json({ success: false, error: "Failed to delete discount policy" }, { status: 500 });
  }
}
