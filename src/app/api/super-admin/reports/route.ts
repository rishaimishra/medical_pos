import { NextRequest, NextResponse } from "next/server";
import { verifySuperAdminRequest } from "@/lib/auth";
import { queryCeoBiReports } from "@/lib/superAdminReports";

/**
 * MODULE 3.9.1 – 3.9.3: CEO-Level BI Reports & Analytics API (`GET /api/super-admin/reports`)
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const storeIdRaw = searchParams.get("storeId");
  const branchIdRaw = searchParams.get("branchId");

  try {
    const report = await queryCeoBiReports({
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
      state: searchParams.get("state"),
      city: searchParams.get("city"),
      planCode: searchParams.get("planCode"),
      storeId: storeIdRaw && storeIdRaw !== "all" ? parseInt(storeIdRaw, 10) : null,
      branchId: branchIdRaw && branchIdRaw !== "all" ? parseInt(branchIdRaw, 10) : null,
      sortBy: searchParams.get("sortBy") || "gmv",
    });

    return NextResponse.json({
      success: true,
      ...report,
    });
  } catch (err: any) {
    console.error("[GET /api/super-admin/reports Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to compile CEO BI reports" },
      { status: 500 }
    );
  }
}
