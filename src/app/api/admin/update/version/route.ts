import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { APP_VERSION } from "@/lib/config";
import { listSavedBackups } from "@/lib/backup";

/**
 * API: /api/admin/update/version
 * Check current installed version and system update readiness.
 */

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { success: false, error: auth.message || "Unauthorized access." },
        { status: auth.status || 401 }
      );
    }

    const recentBackups = listSavedBackups();
    const lastBackup = recentBackups.length > 0 ? recentBackups[0] : null;

    return NextResponse.json({
      success: true,
      data: {
        appName: "Medical POS & Pharmacy Management System",
        currentVersion: APP_VERSION,
        environment: process.env.NODE_ENV || "development",
        status: "healthy",
        lastBackupAt: lastBackup?.createdAt || null,
        totalBackupsAvailable: recentBackups.length,
      },
    });
  } catch (err: any) {
    console.error("[API /api/admin/update/version GET error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to fetch software version." },
      { status: 500 }
    );
  }
}
