import { NextRequest, NextResponse } from "next/server";
import { authorizeReportRequest, queryScheduleDrugs } from "@/lib/reports";
import { escapeCsvCell } from "@/lib/csv";
import { buildXlsxBuffer } from "@/lib/excel";

/**
 * GET /api/admin/reports/schedule-drugs/export
 * Generates Form 35 Schedule H/H1/X Inspection Register in CSV or Excel (.xlsx).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");
  const format = (searchParams.get("format") || "csv").toLowerCase();

  const authCtx = await authorizeReportRequest(req, branchIdParam, {
    feature: "excelAndCsvExports",
    allowComplianceRead: true,
  });
  if (!authCtx.authorized) return authCtx.response!;

  try {
    const result = await queryScheduleDrugs({
      storeId: authCtx.storeId,
      branchId: authCtx.branchId,
      scheduleType: searchParams.get("scheduleType"),
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
      search: searchParams.get("search")?.trim() || "",
    });

    const records = result.allRecords;
    const summary = result.summary;

    if (format === "xlsx" || format === "excel") {
      const xlsxBuf = buildXlsxBuffer([
        {
          name: "Form 35 Register",
          headers: [
            "Date of Sale",
            "Invoice Number",
            "Patient Full Name",
            "Patient Contact",
            "Patient Full Address",
            "Prescribing Doctor Name",
            "Doctor Reg No",
            "Drug Trade Name",
            "Salt / Composition",
            "Schedule Category",
            "Batch Number",
            "Expiry Date",
            "Quantity Dispensed",
            "Unit MRP (INR)",
            "Total Value (INR)",
            "Dispensing Pharmacist",
            "Store Branch",
          ],
          rows: records.map((r: any) => [
            new Date(r.date).toLocaleDateString("en-IN"),
            r.invoiceNo,
            r.patient.name,
            r.patient.phone,
            r.patient.address,
            r.doctor.name,
            r.doctor.regNo,
            r.medicine.name,
            r.medicine.genericName,
            r.medicine.scheduleType ? r.medicine.scheduleType.toUpperCase() : "SCHEDULE H",
            r.batch.batchNumber,
            new Date(r.batch.expiryDate).toLocaleDateString("en-IN", { month: "2-digit", year: "2-digit" }),
            r.quantity,
            Number(r.mrp || 0).toFixed(2),
            Number(r.totalValue || 0).toFixed(2),
            r.dispensedBy,
            `[${r.branch.code}] ${r.branch.name}`,
          ]),
        },
        {
          name: "Summary",
          headers: ["Metric", "Value"],
          rows: [
            ["Total Scheduled Dispenses", summary.totalRecords],
            ["Total Units Sold", summary.totalQuantity],
            ["Total Value (INR)", Number(summary.totalValue || 0).toFixed(2)],
            ["Schedule H Units", summary.countScheduleH],
            ["Schedule H1 Units", summary.countScheduleH1],
            ["Schedule X Units", summary.countScheduleX],
            ["Unique Prescribers", summary.uniqueDoctorsCount],
          ],
        },
      ]);

      return new NextResponse(new Uint8Array(xlsxBuf), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="form35_schedule_drugs_${new Date().toISOString().slice(0, 10)}.xlsx"`,
        },
      });
    }

    const csvRows: string[] = [];
    csvRows.push(`"GOVERNMENT COMPLIANCE AUDIT REGISTER - SCHEDULE H / H1 / X DRUGS"`);
    csvRows.push(`"Generated On: ${new Date().toLocaleString("en-IN")}"`);
    csvRows.push("");

    csvRows.push(
      [
        "Date of Sale",
        "Invoice Number",
        "Patient Full Name",
        "Patient Contact",
        "Patient Full Address",
        "Prescribing Doctor Name",
        "Doctor Registration Number",
        "Drug Trade Name",
        "Salt / Composition",
        "Schedule Category",
        "Batch Number",
        "Expiry Date",
        "Quantity Dispensed",
        "Unit MRP (₹)",
        "Total Value (₹)",
        "Dispensing Pharmacist",
        "Store Outlet Branch",
      ]
        .map((h) => escapeCsvCell(h))
        .join(",")
    );

    for (const r of records) {
      const formattedDate = new Date(r.date).toLocaleDateString("en-IN");
      const expDate = new Date(r.batch.expiryDate).toLocaleDateString("en-IN", {
        month: "2-digit",
        year: "2-digit",
      });

      const row = [
        formattedDate,
        r.invoiceNo,
        r.patient.name,
        r.patient.phone,
        r.patient.address,
        r.doctor.name,
        r.doctor.regNo,
        r.medicine.name,
        r.medicine.genericName,
        r.medicine.scheduleType ? r.medicine.scheduleType.toUpperCase() : "SCHEDULE H",
        r.batch.batchNumber,
        expDate,
        r.quantity,
        r.mrp.toFixed(2),
        r.totalValue.toFixed(2),
        r.dispensedBy,
        `[${r.branch.code}] ${r.branch.name}`,
      ];

      csvRows.push(row.map((c) => escapeCsvCell(c)).join(","));
    }

    csvRows.push("");
    csvRows.push(`"--- REGISTER SUMMARY ---"`);
    csvRows.push(`"Total Scheduled Dispenses","${summary.totalRecords}"`);
    csvRows.push(`"Total Units Sold","${summary.totalQuantity}"`);
    csvRows.push(`"Total Value (₹)","₹${Number(summary.totalValue || 0).toFixed(2)}"`);
    csvRows.push(`"Schedule H Units","${summary.countScheduleH}"`);
    csvRows.push(`"Schedule H1 Units","${summary.countScheduleH1}"`);
    csvRows.push(`"Schedule X Units","${summary.countScheduleX}"`);
    csvRows.push(`"Unique Prescribers","${summary.uniqueDoctorsCount}"`);

    const csvContent = "\uFEFF" + csvRows.join("\r\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="schedule_drugs_register_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/reports/schedule-drugs/export error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to export drug register" },
      { status: 500 }
    );
  }
}
