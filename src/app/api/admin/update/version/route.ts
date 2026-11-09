import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { getInstalledVersion } from "@/lib/software-update";
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

    if (auth.session.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden: Superadmin access required for software update information." },
        { status: 403 }
      );
    }

    const recentBackups = listSavedBackups();
    const lastBackup = recentBackups.length > 0 ? recentBackups[0] : null;

    return NextResponse.json({
      success: true,
      data: {
        appName: "Medical POS & Pharmacy Management System",
        currentVersion: getInstalledVersion(),
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
