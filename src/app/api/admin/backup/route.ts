import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { generateSqlDump, listSavedBackups, BACKUP_DIR } from "@/lib/backup";
import { logAudit, getClientIp } from "@/lib/audit";
import path from "path";
import fs from "fs";

/**
 * API: /api/admin/backup
 * MODULE 1.14.1: One-Click Full Database Backup (.sql download)
 * Admin-only endpoint that generates standard SQL dump and serves it as an attachment.
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
        { success: false, error: "Forbidden: Superadmin access required for database backups." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);

    // List past backups
    if (searchParams.get("list") === "true") {
      const backups = listSavedBackups();
      return NextResponse.json({
        success: true,
        backups,
      });
    }

    // Download a specific existing backup file
    const specificFile = searchParams.get("file");
    if (specificFile) {
      const safeFilename = path.basename(specificFile);
      const filePath = path.join(BACKUP_DIR, safeFilename);

      if (!fs.existsSync(filePath)) {
        return NextResponse.json(
          { success: false, error: "Requested backup file does not exist." },
          { status: 404 }
        );
      }

      const fileContent = fs.readFileSync(filePath, "utf-8");
      return new NextResponse(fileContent, {
        status: 200,
        headers: {
          "Content-Type": "application/sql; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeFilename}"`,
        },
      });
    }

    // Generate fresh SQL dump
    const dumpResult = await generateSqlDump({
      storeId: auth.session.storeId,
      saveToFile: true,
    });

    // Log audit
    await logAudit({
      storeId: auth.session.storeId,
      userId: auth.session.userId,
      action: "DATABASE_BACKUP_EXPORTED",
      entity: "database_backup",
      details: {
        filename: dumpResult.filename,
        totalRows: dumpResult.totalRows,
        totalTables: dumpResult.totalTables,
        tableStats: dumpResult.tableStats,
      },
      ipAddress: getClientIp(req),
    });

    // If client requested JSON format
    const acceptHeader = req.headers.get("accept") || "";
    if (searchParams.get("format") === "json" || acceptHeader.includes("application/json")) {
      return NextResponse.json({
        success: true,
        filename: dumpResult.filename,
        totalRows: dumpResult.totalRows,
        totalTables: dumpResult.totalTables,
        tableStats: dumpResult.tableStats,
        sql: dumpResult.sql,
      });
    }

    // Return SQL file attachment
    return new NextResponse(dumpResult.sql, {
      status: 200,
      headers: {
        "Content-Type": "application/sql; charset=utf-8",
        "Content-Disposition": `attachment; filename="${dumpResult.filename}"`,
      },
    });
  } catch (err: any) {
    console.error("[API /api/admin/backup GET error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to generate database backup." },
      { status: 500 }
    );
  }
}
