import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { restoreSqlDump } from "@/lib/backup";
import { getClientIp } from "@/lib/audit";

/**
 * API: /api/admin/backup/restore
 * MODULE 1.14.2: Restore From SQL File
 * Admin-only endpoint to parse, validate, and restore SQL dump.
 */

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { success: false, error: auth.message || "Unauthorized access." },
        { status: auth.status || 401 }
      );
    }

    if (auth.session.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden: Superadmin access required for database restore." },
        { status: 403 }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let sqlContent = "";
    let confirmOverwrite = false;
    let dryRun = false;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("backupFile") as File | null;
      const confirmField = formData.get("confirmOverwrite");
      const dryRunField = formData.get("dryRun");

      if (!file) {
        return NextResponse.json(
          { success: false, error: "Please upload an SQL backup file." },
          { status: 400 }
        );
      }

      sqlContent = await file.text();
      confirmOverwrite =
        confirmField === "true" || confirmField === "YES" || confirmField === "1";
      dryRun = dryRunField === "true" || dryRunField === "1";
    } else {
      const body = await req.json().catch(() => ({}));
      sqlContent = body.sql || body.sqlContent || "";
      confirmOverwrite =
        body.confirmOverwrite === true ||
        body.confirmOverwrite === "true" ||
        body.confirmOverwrite === "YES";
      dryRun = Boolean(body.dryRun);
    }

    if (!sqlContent || sqlContent.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "SQL backup content is empty or unreadable." },
        { status: 400 }
      );
    }

    // Dry-run inspection
    if (dryRun) {
      const dryRunResult = await restoreSqlDump(sqlContent, { dryRun: true });
      return NextResponse.json({
        success: true,
        dryRun: true,
        statementsCount: dryRunResult.statementsExecuted,
        tablesAffected: dryRunResult.tablesAffected,
        warning:
          "Dry run complete. Applying restore will overwrite existing table rows. Confirmation is required.",
      });
    }

    // Overwrite confirmation guard
    if (!confirmOverwrite) {
      return NextResponse.json(
        {
          success: false,
          requiresConfirmation: true,
          error:
            "Warning: Restoring will overwrite existing database data. Please confirm overwrite to proceed.",
        },
        { status: 400 }
      );
    }

    // Execute restore
    const restoreResult = await restoreSqlDump(sqlContent, {
      confirmOverwrite: true,
      storeId: auth.session.storeId,
      userId: auth.session.userId,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Database successfully restored. Executed ${restoreResult.statementsExecuted} statements across ${restoreResult.tablesAffected.length} tables.`,
      statementsExecuted: restoreResult.statementsExecuted,
      tablesAffected: restoreResult.tablesAffected,
    });
  } catch (err: any) {
    console.error("[API /api/admin/backup/restore POST error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to restore database backup." },
      { status: 500 }
    );
  }
}
