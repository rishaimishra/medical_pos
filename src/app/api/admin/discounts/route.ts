import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";

/**
 * MODULE 2.4.1: Master Discount Architecture & Policy Management
 * Endpoints for listing and creating discount policies and promotional schemes.
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active") === "true";

  try {
    const discounts = await prisma.discount.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      include: {
        _count: {
          select: { sales: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      discounts: discounts.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        value: Number(d.value),
        minAmount: Number(d.minAmount),
        active: d.active,
        salesCount: d._count.sales,
        createdAt: d.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    console.error("Failed to fetch discounts:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load discount policies" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  // Only admin and manager can create master discount policies
  if (auth.session.role !== "admin" && auth.session.role !== "manager") {
    return NextResponse.json(
      { success: false, error: "Permission Denied: Only Admins or Managers can create discount policies" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { name, type = "percent", value, minAmount = 0, active = true } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Discount policy name is required" },
        { status: 400 }
      );
    }

    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      return NextResponse.json(
        { success: false, error: "Discount value must be a positive number" },
        { status: 400 }
      );
    }

    if (type !== "percent" && type !== "flat") {
      return NextResponse.json(
        { success: false, error: "Discount type must be either 'percent' or 'flat'" },
        { status: 400 }
      );
    }

    if (type === "percent" && numValue > 100) {
      return NextResponse.json(
        { success: false, error: "Percentage discount cannot exceed 100%" },
        { status: 400 }
      );
    }

    const numMinAmount = parseFloat(minAmount) || 0;

    const discount = await prisma.discount.create({
      data: {
        name: name.trim(),
        type,
        value: numValue,
        minAmount: numMinAmount,
        active: Boolean(active),
      },
    });

    await logAudit({
      storeId: auth.session.storeId ?? null,
      userId: auth.session.userId,
      branchId: auth.session.branchId ?? null,
      action: "create_discount_policy",
      entity: "discount",
      entityId: discount.id,
      details: JSON.stringify({
        name: discount.name,
        type: discount.type,
        value: Number(discount.value),
        minAmount: Number(discount.minAmount),
      }),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      discount: {
        id: discount.id,
        name: discount.name,
        type: discount.type,
        value: Number(discount.value),
        minAmount: Number(discount.minAmount),
        active: discount.active,
      },
      message: `Discount policy '${discount.name}' created successfully`,
    });
  } catch (error: unknown) {
    console.error("Failed to create discount policy:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create discount policy" },
      { status: 500 }
    );
  }
}
