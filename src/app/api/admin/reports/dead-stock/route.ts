import { NextRequest, NextResponse } from "next/server";
import { authorizeReportRequest, queryDeadStock } from "@/lib/reports";

/**
 * MODULE 2.15.3: Dead Stock & Slow-Moving Inventory Identification API
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");

  const authCtx = await authorizeReportRequest(req, branchIdParam);
  if (!authCtx.authorized) return authCtx.response!;

  const thresholdDays = Math.max(30, parseInt(searchParams.get("thresholdDays") || "90", 10));
  const search = searchParams.get("search")?.trim() || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

  try {
    const result = await queryDeadStock({
      storeId: authCtx.storeId,
      branchId: authCtx.branchId,
      thresholdDays,
      search,
      page,
      limit,
    });

    return NextResponse.json({
      success: true,
      thresholdDays: result.thresholdDays,
      pagination: result.pagination,
      summary: result.summary,
      records: result.records,
    });
  } catch (error: any) {
    console.error("GET /api/admin/reports/dead-stock error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to identify dead stock" },
      { status: 500 }
    );
  }
}
