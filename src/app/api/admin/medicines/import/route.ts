import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { formatPackMetadata } from "../route";

interface ParsedImportRow {
  rowIdx: number;
  name: string;
  genericName?: string;
  company: string;
  category: string;
  hsnCode?: string;
  gstPercent: number;
  rackLocation?: string;
  scheduleType: string;
  packUnit: string;
  looseUnit: string;
  unitsPerPack: number;
  description?: string;
  status: "ready" | "duplicate" | "invalid";
  reason?: string;
}

/**
 * Robust CSV Line Parser (handles quotes and commas inside cells)
 */
function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  // Normalize line breaks
  const clean = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = "";
    } else if (char === "\n" && !inQuotes) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c !== "")) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += char;
    }
  }

  if (currentCell !== "" || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c !== "")) {
      lines.push(currentRow);
    }
  }

  return lines;
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { requiredPermission: "manage_medicines" });
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const clientIp = getClientIp(req);

  try {
    const body = await req.json();
    const action = body.action || "preview"; // "preview" or "commit"

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION 1: PREVIEW (Parse CSV, check column aliases & detect duplicates)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "preview") {
      const csvText = (body.csvContent || "").trim();
      if (!csvText) {
        return NextResponse.json({ success: false, message: "CSV content is empty." }, { status: 400 });
      }

      const rows = parseCSV(csvText);
      if (rows.length < 2) {
        return NextResponse.json(
          {
            success: false,
            message: "CSV must contain a header row and at least one medicine data row.",
          },
          { status: 400 }
        );
      }

      // Map header aliases
      const rawHeaders = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, "_").trim());
      const headerMap: Record<string, number> = {};

      rawHeaders.forEach((h, idx) => {
        if (["name", "medicine_name", "medicine", "brand_name", "trade_name", "item_name", "drug_name"].includes(h)) headerMap["name"] = idx;
        else if (["generic", "generic_name", "composition", "formula", "chemical_name", "salt"].includes(h)) headerMap["generic"] = idx;
        else if (["company", "manufacturer", "mfg", "brand", "mfg_name", "manufacturer_name"].includes(h)) headerMap["company"] = idx;
        else if (["category", "dosage_form", "dosage", "type", "category_name", "form"].includes(h)) headerMap["category"] = idx;
        else if (["hsn", "hsn_code", "hsn_sac", "sac"].includes(h)) headerMap["hsn"] = idx;
        else if (["gst", "gst_percent", "gst_pct", "tax", "tax_percent", "gst_rate"].includes(h)) headerMap["gst"] = idx;
        else if (["rack", "rack_location", "shelf", "locator", "location", "box", "bin"].includes(h)) headerMap["rack"] = idx;
        else if (["schedule", "schedule_type", "drug_schedule"].includes(h)) headerMap["schedule"] = idx;
        else if (["pack_unit", "packing", "packaging"].includes(h)) headerMap["pack_unit"] = idx;
        else if (["loose_unit", "dispense_unit", "unit"].includes(h)) headerMap["loose_unit"] = idx;
        else if (["units_per_pack", "pack_size", "strip_size", "ratio", "conversion", "units_pack"].includes(h)) headerMap["units_per_pack"] = idx;
        else if (["description", "notes", "details", "remarks"].includes(h)) headerMap["description"] = idx;
      });

      if (headerMap["name"] === undefined) {
        return NextResponse.json(
          {
            success: false,
            message: "Missing required 'name' or 'medicine_name' column header in CSV.",
          },
          { status: 400 }
        );
      }

      // Fetch all existing medicines to detect duplicates case-insensitively on Name + Company (Bug 12)
      const existingMeds = await prisma.medicine.findMany({
        select: { name: true, company: true },
      });
      const existingSet = new Set(
        existingMeds.map((m) => `${m.name.toLowerCase().trim()}::${m.company.toLowerCase().trim()}`)
      );

      const parsedRows: ParsedImportRow[] = [];
      const seenInCsv = new Set<string>();

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const nameVal = (row[headerMap["name"]] || "").trim();
        const companyVal = headerMap["company"] !== undefined ? (row[headerMap["company"]] || "").trim() : "";
        const catVal = headerMap["category"] !== undefined ? (row[headerMap["category"]] || "").trim() : "Tablet";
        const genericVal = headerMap["generic"] !== undefined ? (row[headerMap["generic"]] || "").trim() : "";
        const hsnVal = headerMap["hsn"] !== undefined ? (row[headerMap["hsn"]] || "").trim() : "";
        const rackVal = headerMap["rack"] !== undefined ? (row[headerMap["rack"]] || "").trim() : "";
        const schedVal = headerMap["schedule"] !== undefined ? (row[headerMap["schedule"]] || "").toLowerCase().trim() : "normal";
        const packVal = headerMap["pack_unit"] !== undefined ? (row[headerMap["pack_unit"]] || "").trim() : "Strip";
        const looseVal = headerMap["loose_unit"] !== undefined ? (row[headerMap["loose_unit"]] || "").trim() : "Tablet";
        const descVal = headerMap["description"] !== undefined ? (row[headerMap["description"]] || "").trim() : "";

        const gstRaw = headerMap["gst"] !== undefined ? parseFloat(String(row[headerMap["gst"]]).replace(/[^0-9.]/g, "")) : 12;
        const gstVal = isNaN(gstRaw) || gstRaw < 0 ? 12 : gstRaw;

        const ratioRaw = headerMap["units_per_pack"] !== undefined ? parseInt(String(row[headerMap["units_per_pack"]]).replace(/[^0-9]/g, ""), 10) : 10;
        const ratioVal = isNaN(ratioRaw) || ratioRaw <= 0 ? 10 : ratioRaw;

        // Robust Regulatory Schedule Mapping (Bug 11)
        let normalizedSchedule = "normal";
        const cleanSched = schedVal.toLowerCase().replace(/[\s\-_]/g, "");
        if (cleanSched === "scheduleh" || cleanSched === "h" || cleanSched === "schh") {
          normalizedSchedule = "schedule_h";
        } else if (cleanSched === "scheduleh1" || cleanSched === "h1" || cleanSched === "schh1") {
          normalizedSchedule = "schedule_h1";
        } else if (cleanSched === "narcotic" || cleanSched === "nar") {
          normalizedSchedule = "narcotic";
        } else if (["schedule_h", "schedule_h1", "narcotic"].includes(schedVal)) {
          normalizedSchedule = schedVal;
        }

        if (!nameVal) {
          parsedRows.push({
            rowIdx: i + 1,
            name: "(Missing Name)",
            company: companyVal || "(Missing Company)",
            category: catVal,
            gstPercent: gstVal,
            scheduleType: normalizedSchedule,
            packUnit: packVal,
            looseUnit: looseVal,
            unitsPerPack: ratioVal,
            status: "invalid",
            reason: "Medicine name cannot be blank",
          });
          continue;
        }

        // Manufacturer is mandatory (Bug 10)
        if (!companyVal) {
          parsedRows.push({
            rowIdx: i + 1,
            name: nameVal,
            company: "(Missing Company)",
            category: catVal,
            gstPercent: gstVal,
            scheduleType: normalizedSchedule,
            packUnit: packVal,
            looseUnit: looseVal,
            unitsPerPack: ratioVal,
            status: "invalid",
            reason: "Manufacturer / Company name cannot be blank",
          });
          continue;
        }

        const itemKey = `${nameVal.toLowerCase()}::${companyVal.toLowerCase()}`;

        // Duplicate check (against DB and within CSV)
        if (existingSet.has(itemKey)) {
          parsedRows.push({
            rowIdx: i + 1,
            name: nameVal,
            genericName: genericVal,
            company: companyVal,
            category: catVal,
            hsnCode: hsnVal,
            gstPercent: gstVal,
            rackLocation: rackVal,
            scheduleType: normalizedSchedule,
            packUnit: packVal,
            looseUnit: looseVal,
            unitsPerPack: ratioVal,
            description: descVal,
            status: "duplicate",
            reason: `Already exists in database catalog ("${companyVal}")`,
          });
          continue;
        }

        if (seenInCsv.has(itemKey)) {
          parsedRows.push({
            rowIdx: i + 1,
            name: nameVal,
            genericName: genericVal,
            company: companyVal,
            category: catVal,
            hsnCode: hsnVal,
            gstPercent: gstVal,
            rackLocation: rackVal,
            scheduleType: normalizedSchedule,
            packUnit: packVal,
            looseUnit: looseVal,
            unitsPerPack: ratioVal,
            description: descVal,
            status: "duplicate",
            reason: `Duplicate entry within this CSV file ("${companyVal}")`,
          });
          continue;
        }

        seenInCsv.add(itemKey);

        parsedRows.push({
          rowIdx: i + 1,
          name: nameVal,
          genericName: genericVal,
          company: companyVal,
          category: catVal || "Tablet",
          hsnCode: hsnVal,
          gstPercent: gstVal,
          rackLocation: rackVal,
          scheduleType: normalizedSchedule,
          packUnit: packVal || "Strip",
          looseUnit: looseVal || "Tablet",
          unitsPerPack: ratioVal,
          description: descVal,
          status: "ready",
        });
      }

      const readyCount = parsedRows.filter((r) => r.status === "ready").length;
      const duplicateCount = parsedRows.filter((r) => r.status === "duplicate").length;
      const invalidCount = parsedRows.filter((r) => r.status === "invalid").length;

      return NextResponse.json({
        success: true,
        summary: {
          totalRows: parsedRows.length,
          readyToImport: readyCount,
          duplicatesSkipped: duplicateCount,
          invalidSkipped: invalidCount,
        },
        rows: parsedRows,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION 2: COMMIT (Persist approved non-duplicate rows to database)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "commit") {
      const rowsToImport: ParsedImportRow[] = body.rows || [];
      const readyRows = rowsToImport.filter((r) => r.status === "ready");

      if (readyRows.length === 0) {
        return NextResponse.json(
          { success: false, message: "No valid rows available to import." },
          { status: 400 }
        );
      }

      // Check categories in DB; auto-create custom categories if new (1.7.4)
      const existingCategories = await prisma.category.findMany();
      const catSet = new Set(existingCategories.map((c) => c.name.toLowerCase()));

      for (const r of readyRows) {
        const catLower = r.category.toLowerCase();
        if (!catSet.has(catLower) && r.category) {
          try {
            await prisma.category.create({
              data: { name: r.category, type: "custom" },
            });
            catSet.add(catLower);
          } catch {
            // Ignore if concurrently created
          }
        }
      }

      // Re-verify duplicates against DB to ensure zero duplicate insertion (Bug 12)
      const currentDbMeds = await prisma.medicine.findMany({
        select: { name: true, company: true },
      });
      const currentDbKeys = new Set(
        currentDbMeds.map((m) => `${m.name.toLowerCase().trim()}::${m.company.toLowerCase().trim()}`)
      );

      const toInsertRows = readyRows.filter(
        (r) => !currentDbKeys.has(`${r.name.toLowerCase().trim()}::${r.company.toLowerCase().trim()}`)
      );

      if (toInsertRows.length === 0) {
        return NextResponse.json(
          { success: false, message: "All selected rows already exist in the database." },
          { status: 400 }
        );
      }

      // Fast, batched insertion using createMany to prevent Neon serverless connection timeout
      const dataToInsert = toInsertRows.map((r) => {
        const fullDesc = formatPackMetadata(r.description || "", {
          packUnit: r.packUnit,
          looseUnit: r.looseUnit,
          unitsPerPack: r.unitsPerPack,
          minStockLevel: 10,
        });

        return {
          name: r.name.trim(),
          genericName: r.genericName ? r.genericName.trim() : null,
          company: r.company.trim(),
          category: r.category.trim(),
          hsnCode: r.hsnCode ? r.hsnCode.trim() : null,
          gstPercent: r.gstPercent,
          rackLocation: r.rackLocation ? r.rackLocation.trim() : null,
          scheduleType: r.scheduleType || "normal",
          description: fullDesc,
        };
      });

      const batchResult = await prisma.medicine.createMany({
        data: dataToInsert,
        skipDuplicates: true,
      });

      const importedCount = batchResult.count;

      // Audit Log
      await logAudit({
        action: "MEDICINE_CREATED",
        entity: "Medicine",
        entityId: 0,
        storeId: auth.session.storeId,
        branchId: auth.session.branchId,
        userId: auth.session.userId,
        ipAddress: clientIp,
        details: {
          bulkImport: true,
          importedCount,
          skippedDuplicates: rowsToImport.length - importedCount,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Successfully imported ${importedCount} medicine records.`,
        importedCount,
      });
    }

    return NextResponse.json({ success: false, message: "Invalid action." }, { status: 400 });
  } catch (err: any) {
    console.error("POST /api/admin/medicines/import error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Bulk import failed." },
      { status: 500 }
    );
  }
}
