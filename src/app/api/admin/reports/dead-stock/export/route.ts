import { NextRequest, NextResponse } from "next/server";
import { authorizeReportRequest, queryDeadStock } from "@/lib/reports";
import { escapeCsvCell } from "@/lib/csv";
import { buildXlsxBuffer } from "@/lib/excel";

/**
 * GET /api/admin/reports/dead-stock/export
 * Exports stagnant inventory & dead stock report to CSV or Excel (.xlsx).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");
  const format = (searchParams.get("format") || "csv").toLowerCase();

  const authCtx = await authorizeReportRequest(req, branchIdParam);
  if (!authCtx.authorized) return authCtx.response!;

  try {
    const thresholdDays = Math.max(30, parseInt(searchParams.get("thresholdDays") || "90", 10));
    const search = searchParams.get("search")?.trim() || "";

    const data = await queryDeadStock({
      storeId: authCtx.storeId,
      branchId: authCtx.branchId,
      thresholdDays,
      search,
    });

    const records = data.allRecords;
    const summary = data.summary;

    if (format === "xlsx" || format === "excel") {
      const xlsxBuf = buildXlsxBuffer([
        {
          name: "Dead Stock",
          headers: [
            "Medicine Name",
            "Company",
            "Dosage Form",
            "Composition",
            "Rack Location",
            "Batch Number",
            "Stock Qty",
            "Purchase Cost (INR)",
            "Unit MRP (INR)",
            "Blocked Capital (INR)",
            "Expiry Date",
            "Days To Expiry",
            "Aging Category",
            "Days Since Last Sale",
            "Store Branch",
          ],
          rows: records.map((r: any) => [
            r.name,
            r.company,
            r.category,
            r.genericName || "-",
            r.rackLocation,
            r.batchNumber,
            r.stockQuantity,
            Number(r.purchasePrice || 0).toFixed(2),
            Number(r.mrp || 0).toFixed(2),
            Number(r.blockedCapital || 0).toFixed(2),
            new Date(r.expiryDate).toLocaleDateString("en-IN"),
            r.daysToExpiry,
            r.agingCategory,
            r.daysSinceLastSale,
            `[${r.branch.code}] ${r.branch.name}`,
          ]),
        },
        {
          name: "Summary",
          headers: ["Metric", "Value"],
          rows: [
            ["Threshold Days", data.thresholdDays],
            ["Total Stagnant Batches", summary.totalDeadBatches],
            ["Total Blocked Capital (INR)", Number(summary.totalBlockedCapital || 0).toFixed(2)],
            ["High Expiry Risk (<90d)", summary.highExpiryRiskCount],
          ],
        },
      ]);

      return new NextResponse(new Uint8Array(xlsxBuf), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="dead_stock_report_${new Date().toISOString().slice(0, 10)}.xlsx"`,
        },
      });
    }

    const csvRows: string[] = [];
    csvRows.push(`"DEAD STOCK & STAGNANT INVENTORY REPORT (Threshold: ${data.thresholdDays} Days Without Sales)"`);
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
        .map((h) => escapeCsvCell(h))
        .join(",")
    );

    for (const r of records) {
      const expDate = new Date(r.expiryDate).toLocaleDateString("en-IN");
      const row = [
        r.name,
        r.company,
        r.category,
        r.genericName || "-",
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

      csvRows.push(row.map((c) => escapeCsvCell(c)).join(","));
    }

    csvRows.push("");
    csvRows.push(`"--- REPORT SUMMARY ---"`);
    csvRows.push(`"Total Stagnant Batches","${summary.totalDeadBatches}"`);
    csvRows.push(`"Total Blocked Capital (₹)","₹${Number(summary.totalBlockedCapital || 0).toFixed(2)}"`);
    csvRows.push(`"High Expiry Risk Batches (<90 Days)","${summary.highExpiryRiskCount}"`);

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
