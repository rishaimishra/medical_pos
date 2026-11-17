import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";

/**
 * GET /api/admin/reports/schedule-drugs/export
 * Generates an official Drug Inspector Inspection Register CSV conforming to Form 35.
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const url = new URL(req.url);
    url.pathname = "/api/admin/reports/schedule-drugs";
    url.searchParams.set("limit", "10000");
    url.searchParams.set("page", "1");

    const response = await fetch(url.toString(), {
      headers: {
        cookie: req.headers.get("cookie") || "",
        authorization: req.headers.get("authorization") || "",
      },
      cache: "no-store",
    });

    const data = await response.json();
    if (!data.success) {
      return NextResponse.json(
        { success: false, message: data.message || "Failed to load audit register" },
        { status: 500 }
      );
    }

    const records = data.records || [];
    const summary = data.summary || {};

    const csvRows: string[] = [];

    // Official Govt Drug Audit Register Header
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
        .map((h) => `"${h}"`)
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
        r.patient.address.replace(/"/g, '""'),
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

      csvRows.push(row.map((c) => `"${c}"`).join(","));
    }

    csvRows.push("");
    csvRows.push(`"--- REGISTER SUMMARY ---"`);
    csvRows.push(`"Total Scheduled Dispenses","${summary.totalRecords || records.length}"`);
    csvRows.push(`"Total Units Sold","${summary.totalQuantity || 0}"`);
    csvRows.push(`"Total Value (₹)","₹${Number(summary.totalValue || 0).toFixed(2)}"`);
    csvRows.push(`"Schedule H Units","${summary.countScheduleH || 0}"`);
    csvRows.push(`"Schedule H1 Units","${summary.countScheduleH1 || 0}"`);
    csvRows.push(`"Schedule X Units","${summary.countScheduleX || 0}"`);
    csvRows.push(`"Unique Prescribers","${summary.uniqueDoctorsCount || 0}"`);

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
