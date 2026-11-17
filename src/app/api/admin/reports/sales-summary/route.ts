import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { queryAdminSalesSummary } from "@/lib/salesReport";

/**
 * MODULE 2.16.4: Comprehensive Sales Report Metrics (Admin Only)
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json(
      { success: false, message: auth.message || "Unauthorized" },
      { status: auth.status }
    );
  }

  // Strictly Admin-Only per Module 2.16.4
  if (auth.session.role !== "admin") {
    return NextResponse.json(
      { success: false, message: "Forbidden: Sales summary metrics are restricted to Administrators" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const branchParam = searchParams.get("branchId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const storeId = auth.session.storeId ?? null;
  let targetBranchId: number | null = auth.session.branchId ?? null;

  if (branchParam === "all") {
    targetBranchId = canAccessBranch(auth.session, null) ? null : auth.session.branchId ?? null;
  } else if (branchParam) {
    const bId = parseInt(branchParam, 10);
    if (isNaN(bId)) {
      return NextResponse.json({ success: false, message: "Invalid branchId" }, { status: 400 });
    }
    if (!canAccessBranch(auth.session, bId)) {
      return NextResponse.json({ success: false, message: "Forbidden: Unauthorized branch access" }, { status: 403 });
    }
    if (storeId) {
      const br = await prisma.branch.findUnique({ where: { id: bId }, select: { storeId: true } });
      if (!br || (br.storeId && br.storeId !== storeId)) {
        return NextResponse.json(
          { success: false, message: "Forbidden: Branch belongs to another store" },
          { status: 403 }
        );
      }
    }
    targetBranchId = bId;
  }

  try {
    const data = await queryAdminSalesSummary({
      storeId,
      branchId: targetBranchId,
      startDate,
      endDate,
    });

    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error: any) {
    console.error("GET /api/admin/reports/sales-summary error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to generate admin sales summary", error: error.message },
      { status: 500 }
    );
  }
}
