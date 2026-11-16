import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, canAccessPage } from "@/lib/rbac";
import { logAudit, getClientIp } from "@/lib/audit";
import { getEscPosCashDrawerKickHex } from "@/lib/cashDrawer";

/**
 * POST /api/admin/pos/cash-drawer
 * MODULE 2.5.2: Records manual / automatic electronic cash drawer opening event.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }
  if (!canAccessPage(auth.session, "/admin/pos")) {
    return NextResponse.json({ success: false, message: "Forbidden: POS access denied" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const reason = body.reason || "Manual Cash Drawer Kick";
    const requestedBranchId = body.branchId ? parseInt(String(body.branchId), 10) : null;
    if (requestedBranchId && !canAccessBranch(auth.session, requestedBranchId)) {
      return NextResponse.json(
        { success: false, message: "Forbidden: No access to requested branch" },
        { status: 403 }
      );
    }
    const branchId = auth.session.branchId || requestedBranchId || null;

    await logAudit({
      storeId: auth.session.storeId ?? null,
      action: "CASH_DRAWER_KICK",
      entity: "CashDrawer",
      entityId: auth.session.userId,
      userId: auth.session.userId,
      branchId: branchId || undefined,
      ipAddress: getClientIp(req),
      details: {
        reason,
        commandHex: getEscPosCashDrawerKickHex(),
        triggeredAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      commandHex: getEscPosCashDrawerKickHex(),
      message: "Cash drawer kick pulse registered successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to trigger cash drawer" },
      { status: 500 }
    );
  }
}

