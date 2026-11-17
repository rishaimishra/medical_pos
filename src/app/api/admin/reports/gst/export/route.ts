import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";

/**
 * GET /api/admin/reports/gst/export
 * Exports GSTR-1 HSN-wise sales summary to CSV format.
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const url = new URL(req.url);
    url.pathname = "/api/admin/reports/gst";

    const response = await fetch(url.toString(), {
      headers: {
        cookie: req.headers.get("cookie") || "",
        authorization: req.headers.get("authorization") || "",
      },
      cache: "no-store",
    });

    const data = await response.json();
    if (!data.success) {
      return NextResponse.json({ success: false, message: data.message || "Failed to load GST data" }, { status: 500 });
    }

    const gstr1 = data.gstr1 || {};
    const hsnList = gstr1.hsnBreakdown || [];
    const gstr3b = data.gstr3b || {};

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
        .map((h) => `"${h}"`)
        .join(",")
    );

    for (const h of hsnList) {
      const row = [
        h.hsnCode,
        (h.description || "").replace(/"/g, '""'),
        h.uqc || "NOS",
        h.totalQty,
        h.totalValue.toFixed(2),
        h.taxableValue.toFixed(2),
        h.igstAmount.toFixed(2),
        h.cgstAmount.toFixed(2),
        h.sgstAmount.toFixed(2),
        h.totalTax.toFixed(2),
      ];
      csvRows.push(row.map((c) => `"${c}"`).join(","));
    }

    csvRows.push("");
    csvRows.push(`"--- GSTR-3B SUMMARY ---"`);
    csvRows.push(
      `"Outward Taxable Turnover","${gstr3b.outwardTaxableSupplies?.taxableValue || 0}","Output GST Liability","${gstr3b.outwardTaxableSupplies?.totalLiability || 0}"`
    );
    csvRows.push(
      `"Inward Verified Purchases","${gstr3b.eligibleITC?.taxableValue || 0}","Eligible Input Tax Credit (ITC)","${gstr3b.eligibleITC?.totalCredit || 0}"`
    );
    csvRows.push(
      `"Net GST Payable / (Credit)","${gstr3b.netTaxPayable?.totalPayable || 0}","Status","${gstr3b.netTaxPayable?.status || "tax_payable"}"`
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
