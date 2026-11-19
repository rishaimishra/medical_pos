import { NextRequest, NextResponse } from "next/server";
import { authorizeReportRequest, queryScheduleDrugs } from "@/lib/reports";

/**
 * MODULE 2.14.1: Schedule H / H1 / X Prescription Drug Audit Register API
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");

  const authCtx = await authorizeReportRequest(req, branchIdParam, { feature: "gstAndRegulatoryReports" });
  if (!authCtx.authorized) return authCtx.response!;

  const scheduleType = searchParams.get("scheduleType");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const search = searchParams.get("search")?.trim() || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

  try {
    const result = await queryScheduleDrugs({
      storeId: authCtx.storeId,
      branchId: authCtx.branchId,
      scheduleType,
      startDate,
      endDate,
      search,
      page,
      limit,
    });

    return NextResponse.json({
      success: true,
      records: result.records,
      pagination: result.pagination,
      summary: result.summary,
    });
  } catch (error: any) {
    console.error("GET /api/admin/reports/schedule-drugs error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch prescription drug register" },
      { status: 500 }
    );
  }
}
