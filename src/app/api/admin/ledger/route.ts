import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, canAccessPage } from "@/lib/rbac";
import { queryMasterLedger } from "@/lib/ledger";

export type { MasterLedgerEntry } from "@/lib/ledger";

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!canAccessPage(auth.session, "/admin/financials") && !canAccessPage(auth.session, "/admin/reports")) {
    return NextResponse.json({ success: false, message: "Forbidden: Access to financial ledger denied" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");
  const partyType = searchParams.get("partyType"); // "all" | "customer" | "supplier" | "expense_payee" | "general"
  const entryType = searchParams.get("entryType"); // "all" | "credit" | "debit"
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const search = searchParams.get("search")?.trim() || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

  try {
    let targetBranchId: number | null = auth.session.branchId;
    if (!targetBranchId && branchIdParam && branchIdParam !== "all") {
      const bId = parseInt(branchIdParam, 10);
      if (isNaN(bId)) {
        return NextResponse.json({ success: false, message: "Invalid branchId" }, { status: 400 });
      }
      if (!canAccessBranch(auth.session, bId)) {
        return NextResponse.json({ success: false, message: "Forbidden: Unauthorized branch access" }, { status: 403 });
      }
      targetBranchId = bId;
    }

    const result = await queryMasterLedger({
      storeId: auth.session.storeId,
      branchId: targetBranchId,
      partyType,
      entryType,
      startDate,
      endDate,
      search,
      page,
      limit,
    });

    return NextResponse.json({
      success: true,
      entries: result.entries,
      pagination: result.pagination,
      summary: result.summary,
    });
  } catch (error: any) {
    console.error("GET /api/admin/ledger error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch ledger" },
      { status: 500 }
    );
  }
}
