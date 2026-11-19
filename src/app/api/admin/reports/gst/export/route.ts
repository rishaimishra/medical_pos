import { NextRequest, NextResponse } from "next/server";
import { authorizeReportRequest, queryGstReport } from "@/lib/reports";
import { escapeCsvCell } from "@/lib/csv";
import { buildXlsxBuffer } from "@/lib/excel";

/**
 * GET /api/admin/reports/gst/export
 * Exports GSTR-1 HSN-wise sales summary and GSTR-3B reconciliation to CSV or Excel (.xlsx).
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
    const data = await queryGstReport({
      storeId: authCtx.storeId,
      branchId: authCtx.branchId,
      month: searchParams.get("month"),
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
    });

    const gstr1 = data.gstr1;
    const hsnList = gstr1.hsnBreakdown || [];
    const gstr3b = data.gstr3b;

    if (format === "xlsx" || format === "excel") {
      const xlsxBuf = buildXlsxBuffer([
        {
          name: "GSTR-1 HSN",
          headers: [
            "HSN Code",
            "Description",
            "UQC",
            "Total Quantity Sold",
            "Total Value (INR)",
            "Taxable Value (INR)",
            "IGST (INR)",
            "CGST (INR)",
            "SGST (INR)",
            "Total Tax (INR)",
          ],
          rows: hsnList.map((h: any) => [
            h.hsnCode,
            h.description || "",
            h.uqc || "NOS",
            h.totalQty,
            Number(h.totalValue || 0).toFixed(2),
            Number(h.taxableValue || 0).toFixed(2),
            Number(h.igstAmount || 0).toFixed(2),
            Number(h.cgstAmount || 0).toFixed(2),
            Number(h.sgstAmount || 0).toFixed(2),
            Number(h.totalTax || 0).toFixed(2),
          ]),
        },
        {
          name: "GSTR-3B Summary",
          headers: ["Line Item", "Taxable Value (INR)", "Tax Amount (INR)", "Details"],
          rows: [
            [
              "Outward Taxable Supplies",
              gstr3b.outwardTaxableSupplies.taxableValue,
              gstr3b.outwardTaxableSupplies.totalLiability,
              "Output GST Liability",
            ],
            [
              "Eligible Input Tax Credit (ITC)",
              gstr3b.eligibleITC.taxableValue,
              gstr3b.eligibleITC.totalCredit,
              "Inward Verified Purchases",
            ],
            [
              "Net GST Payable / (Credit)",
              "",
              gstr3b.netTaxPayable.totalPayable,
              gstr3b.netTaxPayable.status,
            ],
          ],
        },
      ]);

      return new NextResponse(new Uint8Array(xlsxBuf), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="gstr_report_${new Date().toISOString().slice(0, 10)}.xlsx"`,
        },
      });
    }

    const csvRows: string[] = [];
    csvRows.push(`"GSTR-1 HSN-WISE SUMMARY REPORT"`);
    csvRows.push(`"Generated On: ${new Date().toLocaleString("en-IN")}"`);
    csvRows.push("");

    csvRows.push(
      [
        "HSN Code",
        "Description",
        "UQC",
        "Total Quantity Sold",
        "Total Value (₹)",
        "Taxable Value (₹)",
        "Integrated Tax IGST (₹)",
        "Central Tax CGST (₹)",
        "State/UT Tax SGST (₹)",
        "Total Tax Amount (₹)",
      ]
        .map((h) => escapeCsvCell(h))
        .join(",")
    );

    for (const h of hsnList) {
      const row = [
        h.hsnCode,
        h.description || "",
        h.uqc || "NOS",
        h.totalQty,
        h.totalValue.toFixed(2),
        h.taxableValue.toFixed(2),
        h.igstAmount.toFixed(2),
        h.cgstAmount.toFixed(2),
        h.sgstAmount.toFixed(2),
        h.totalTax.toFixed(2),
      ];
      csvRows.push(row.map((c) => escapeCsvCell(c)).join(","));
    }

    csvRows.push("");
    csvRows.push(`"--- GSTR-3B SUMMARY ---"`);
    csvRows.push(
      `"Outward Taxable Turnover","${gstr3b.outwardTaxableSupplies.taxableValue}","Output GST Liability","${gstr3b.outwardTaxableSupplies.totalLiability}"`
    );
    csvRows.push(
      `"Inward Verified Purchases","${gstr3b.eligibleITC.taxableValue}","Eligible Input Tax Credit (ITC)","${gstr3b.eligibleITC.totalCredit}"`
    );
    csvRows.push(
      `"Net GST Payable / (Credit)","${gstr3b.netTaxPayable.totalPayable}","Status","${gstr3b.netTaxPayable.status}"`
    );

    const csvContent = "\uFEFF" + csvRows.join("\r\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gstr_report_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/reports/gst/export error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to export GST report" },
      { status: 500 }
    );
  }
}
