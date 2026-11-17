import { NextRequest, NextResponse } from "next/server";
import { authorizeReportRequest, queryGstReport } from "@/lib/reports";

/**
 * MODULE 2.14.2: GST Outward & Inward Summary Reports (GSTR-1 & GSTR-3B)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");

  const authCtx = await authorizeReportRequest(req, branchIdParam);
  if (!authCtx.authorized) return authCtx.response!;

  try {
    const result = await queryGstReport({
      storeId: authCtx.storeId,
      branchId: authCtx.branchId,
      month: searchParams.get("month"),
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("GET /api/admin/reports/gst error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to generate GST reports" },
      { status: 500 }
    );
  }
}
