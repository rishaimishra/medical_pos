import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { migrateJsonToDatabase } from "@/lib/backup";
import { getClientIp } from "@/lib/audit";

/**
 * API: /api/admin/backup/migrate-json
 * MODULE 1.14.3: Local-JSON to Relational DB Migration Tool
 * Admin-only endpoint to import legacy JSON data and preserve fallback backup.
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

    const contentType = req.headers.get("content-type") || "";
    let payload: any = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { success: false, error: "Please upload a JSON file to migrate." },
          { status: 400 }
        );
      }
      const text = await file.text();
      try {
        payload = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid JSON file syntax." },
          { status: 400 }
        );
      }
    } else {
      payload = await req.json().catch(() => null);
    }

    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { success: false, error: "Missing or invalid JSON migration payload." },
        { status: 400 }
      );
    }

    const result = await migrateJsonToDatabase(payload, {
      storeId: auth.session.storeId,
      userId: auth.session.userId,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Migration complete! Preserved raw JSON backup at ${result.backupFile}.`,
      migrated: result.migrated,
      backupFile: result.backupFile,
    });
  } catch (err: any) {
    console.error("[API /api/admin/backup/migrate-json POST error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to execute JSON storage migration." },
      { status: 500 }
    );
  }
}
