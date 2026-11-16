import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";

/**
 * GET /api/admin/reports/dead-stock/export
 * Exports stagnant inventory & dead stock report to CSV.
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const url = new URL(req.url);
    url.pathname = "/api/admin/reports/dead-stock";
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
        { success: false, message: data.message || "Failed to load dead stock report" },
        { status: 500 }
      );
    }

    const records = data.records || [];
    const summary = data.summary || {};

    const csvRows: string[] = [];

    csvRows.push(`"DEAD STOCK & STAGNANT INVENTORY REPORT (Threshold: ${data.thresholdDays || 90} Days Without Sales)"`);
    csvRows.push(`"Generated On: ${new Date().toLocaleString("en-IN")}"`);
    csvRows.push("");

    csvRows.push(
      [
        "Medicine Name",
        "Manufacturer / Company",
        "Dosage Form",
        "Composition (Salt)",
        "Rack Location",
        "Batch Number",
        "Current Stock Qty",
        "Purchase Cost (₹)",
        "Unit MRP (₹)",
        "Blocked Capital (₹)",
        "Expiry Date",
        "Days To Expiry",
        "Aging Classification",
        "Days Stagnant / Since Sale",
        "Store Branch",
      ]
        .map((h) => `"${h}"`)
        .join(",")
    );

    for (const r of records) {
      const expDate = new Date(r.expiryDate).toLocaleDateString("en-IN");
      const row = [
        r.name,
        r.company,
        r.category,
        (r.genericName || "-").replace(/"/g, '""'),
        r.rackLocation,
        r.batchNumber,
        r.stockQuantity,
        r.purchasePrice.toFixed(2),
        r.mrp.toFixed(2),
        r.blockedCapital.toFixed(2),
        expDate,
        r.daysToExpiry,
        r.agingCategory,
        r.daysSinceLastSale,
        `[${r.branch.code}] ${r.branch.name}`,
      ];

      csvRows.push(row.map((c) => `"${c}"`).join(","));
    }

    csvRows.push("");
    csvRows.push(`"--- REPORT SUMMARY ---"`);
    csvRows.push(`"Total Stagnant Batches","${summary.totalDeadBatches || records.length}"`);
    csvRows.push(`"Total Blocked Capital (₹)","₹${Number(summary.totalBlockedCapital || 0).toFixed(2)}"`);
    csvRows.push(`"High Expiry Risk Batches (<90 Days)","${summary.highExpiryRiskCount || 0}"`);

    const csvContent = "\uFEFF" + csvRows.join("\r\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="dead_stock_report_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/reports/dead-stock/export error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to export dead stock report" },
      { status: 500 }
    );
  }
}
