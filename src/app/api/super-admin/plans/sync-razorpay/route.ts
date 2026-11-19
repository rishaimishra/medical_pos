import { NextRequest, NextResponse } from "next/server";
import { verifySuperAdminRequest } from "@/lib/auth";
import { getClientIp, logPlatformAudit } from "@/lib/audit";
import { invalidateStoreEntitlements } from "@/lib/entitlements";
import {
  reconcileAllPlansWithRazorpay,
  syncPlanToRazorpay,
} from "@/lib/razorpay";

/**
 * MODULE 3.5.1: Super Admin Plan-to-Razorpay Sync & Reconciliation API (`/api/super-admin/plans/sync-razorpay`)
 */
export async function POST(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req, ["ceo", "platform_admin"]);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const ip = getClientIp(req);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || (body.planId ? "sync_one" : "reconcile_all")).toLowerCase();

    if (action === "sync_one") {
      const planId = parseInt(String(body.planId || ""), 10);
      if (!planId || isNaN(planId)) {
        return NextResponse.json({ success: false, message: "Valid planId is required." }, { status: 400 });
      }

      const result = await syncPlanToRazorpay(planId);
      invalidateStoreEntitlements();

      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        action: result.success ? "PLAN_SYNCED_TO_RAZORPAY" : "PLAN_RAZORPAY_SYNC_FAILED",
        entity: "subscription_plans",
        entityId: planId,
        details: result,
        ipAddress: ip,
      });

      return NextResponse.json(
        {
          ...result,
          message: result.skipped
            ? "Plan is free/lifetime; Razorpay recurring plan sync not required."
            : result.success
            ? `Synced cleanly to Razorpay (${result.razorpayPlanId}).`
            : result.error || "Razorpay sync failed",
        },
        { status: result.success ? 200 : 502 }
      );
    }

    if (action === "reconcile_all") {
      const report = await reconcileAllPlansWithRazorpay();
      invalidateStoreEntitlements();

      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        action: "RAZORPAY_PLANS_RECONCILED",
        entity: "subscription_plans",
        details: {
          totalLocalPlans: report.totalLocalPlans,
          totalRemotePlans: report.totalRemotePlans,
          syncedCount: report.syncedCount,
          failedCount: report.failedCount,
        },
        ipAddress: ip,
      });

      return NextResponse.json({
        success: report.failedCount === 0,
        ...report,
        message: `Reconciled ${report.totalLocalPlans} local plan(s) against ${report.totalRemotePlans} Razorpay plan(s).`,
      });
    }

    return NextResponse.json({ success: false, message: "Invalid sync action." }, { status: 400 });
  } catch (err: any) {
    console.error("[POST /api/super-admin/plans/sync-razorpay Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Razorpay reconciliation failed" },
      { status: err?.status || 500 }
    );
  }
}
