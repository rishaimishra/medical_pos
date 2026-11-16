import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";

/**
 * MODULE 2.13.1: Master Financial Ledger CSV / Excel Export
 * 
 * Generates an Excel-ready CSV export with UTF-8 BOM (`\uFEFF`)
 * matching all filters applied to the Master Financial Ledger.
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    // Re-use internal ledger fetch logic by querying GET /api/admin/ledger with limit=10000
    const url = new URL(req.url);
    url.pathname = "/api/admin/ledger";
    url.searchParams.set("limit", "10000");
    url.searchParams.set("page", "1");

    // Internal fetch using same headers / cookies
    const response = await fetch(url.toString(), {
      headers: {
        cookie: req.headers.get("cookie") || "",
        authorization: req.headers.get("authorization") || "",
      },
      cache: "no-store",
    });

    const data = await response.json();
    if (!data.success) {
      return NextResponse.json({ success: false, message: data.message || "Failed to load ledger data" }, { status: 500 });
    }

    const entries = data.entries || [];
    const summary = data.summary || {};

    const csvRows: string[] = [];

    // Header row
    csvRows.push([
      "Date & Time",
      "Reference Number",
      "Transaction Type",
      "Category / Source",
      "Party Name",
      "Party Contact",
      "Branch",
      "Payment Mode",
      "Credit (₹)",
      "Debit (₹)",
      "Running Balance (₹)",
      "Notes",
    ].map((h) => `"${h}"`).join(","));

    for (const item of entries) {
      const formattedDate = new Date(item.date).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      });

      const row = [
        formattedDate,
        item.refNo || "",
        item.entryType ? item.entryType.toUpperCase() : "",
        item.category || "",
        item.partyName || "",
        item.partyPhone || "",
        item.branchCode ? `[${item.branchCode}] ${item.branchName || ""}` : (item.branchName || ""),
        item.paymentMode || "",
        Number(item.credit || 0).toFixed(2),
        Number(item.debit || 0).toFixed(2),
        Number(item.runningBalance || 0).toFixed(2),
        (item.notes || "").replace(/"/g, '""'),
      ];

      csvRows.push(row.map((cell) => `"${cell}"`).join(","));
    }

    // Append Summary Rows
    csvRows.push("");
    csvRows.push(`"--- SUMMARY TOTALS ---"`);
    csvRows.push(`"Total Inflow / Credits","","","","","","","","₹${Number(summary.totalCredit || 0).toFixed(2)}"`);
    csvRows.push(`"Total Outflow / Debits","","","","","","","","","₹${Number(summary.totalDebit || 0).toFixed(2)}"`);
    csvRows.push(`"Net Cash Flow","","","","","","","","","","₹${Number(summary.netCashFlow || 0).toFixed(2)}"`);
    csvRows.push(`"Total Records Count","${summary.totalTransactions || entries.length}"`);
    csvRows.push(`"Export Timestamp","${new Date().toISOString()}"`);

    // Prepend UTF-8 BOM so Excel opens Indian Rupees and non-ASCII cleanly
    const csvContent = "\uFEFF" + csvRows.join("\r\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="financial_ledger_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/ledger/export error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to generate CSV export" },
      { status: 500 }
    );
  }
}
