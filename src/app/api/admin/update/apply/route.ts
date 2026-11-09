import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { applyUpdateZip } from "@/lib/software-update";
import { getClientIp } from "@/lib/audit";

/**
 * API: /api/admin/update/apply
 * MODULE 1.15.1: Admin-Only Update From Version ZIP - Update Executor
 * Enforces pre-update backup confirmation, snapshots files, applies updates, and logs audit.
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
    const confirmField = formData.get("confirmBackup");

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

    const confirmBackup =
      confirmField === "true" ||
      confirmField === "YES" ||
      confirmField === "1" ||
      confirmField === "on";

    if (!confirmBackup) {
      return NextResponse.json(
        {
          success: false,
          requiresConfirmation: true,
          error:
            "Backup confirmation required: You must confirm that a current system backup has been completed before applying software updates.",
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await applyUpdateZip(buffer, {
      confirmBackup: true,
      storeId: auth.session.storeId,
      userId: auth.session.userId,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `System successfully updated to version ${result.newVersion}! (${result.filesUpdated} files updated)`,
      data: result,
    });
  } catch (err: any) {
    console.error("[API /api/admin/update/apply POST error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to apply software update package." },
      { status: 400 }
    );
  }
}
