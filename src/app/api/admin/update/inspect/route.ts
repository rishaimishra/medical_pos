import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { inspectUpdateZip } from "@/lib/software-update";
import { logAudit, getClientIp } from "@/lib/audit";

/**
 * API: /api/admin/update/inspect
 * MODULE 1.15.1: Admin-Only Update From Version ZIP - Safety Inspector
 * Scans uploaded ZIP package for path traversal vulnerabilities, extracts manifest,
 * compares version, and reports changed files list.
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

    const formData = await req.formData();
    const file = formData.get("package") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Please upload an update ZIP package." },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      return NextResponse.json(
        { success: false, error: "Invalid file type. Only .zip packages are accepted." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Run security and diff inspection
    const inspection = await inspectUpdateZip(buffer);

    // Log audit inspection
    await logAudit({
      storeId: auth.session.storeId,
      userId: auth.session.userId,
      action: "SOFTWARE_UPDATE_INSPECTED",
      entity: "system_update",
      details: {
        currentVersion: inspection.currentVersion,
        newVersion: inspection.newVersion,
        totalFiles: inspection.totalFiles,
        isUpgrade: inspection.isUpgrade,
        packageName: file.name,
      },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      data: inspection,
    });
  } catch (err: any) {
    console.error("[API /api/admin/update/inspect POST error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to inspect update package." },
      { status: 400 }
    );
  }
}
