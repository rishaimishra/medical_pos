import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, canAccessPage } from "@/lib/rbac";
import { queryMasterLedger } from "@/lib/ledger";
import { buildCsvContent } from "@/lib/csv";
import { buildXlsxBuffer } from "@/lib/excel";
import { requireStoreFeature } from "@/lib/entitlements";

/**
 * MODULE 2.13.1 & 2.16.5: Master Financial Ledger CSV / Excel (.xlsx) Export
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!canAccessPage(auth.session, "/admin/financials") && !canAccessPage(auth.session, "/admin/reports")) {
    return NextResponse.json({ success: false, message: "Forbidden: Access to financial ledger export denied" }, { status: 403 });
  }

  const exportGate = await requireStoreFeature(auth.session.storeId, "excelAndCsvExports", {
    allowComplianceRead: true,
  });
  if (!exportGate.allowed) return exportGate.response!;

  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");
  const partyType = searchParams.get("partyType");
  const entryType = searchParams.get("entryType");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const search = searchParams.get("search")?.trim() || "";
  const format = (searchParams.get("format") || "csv").toLowerCase();

  try {
    let targetBranchId: number | null = auth.session.branchId;
    if (!targetBranchId && branchIdParam && branchIdParam !== "all") {
      const bId = parseInt(branchIdParam, 10);
      if (isNaN(bId)) {
        return NextResponse.json({ success: false, message: "Invalid branchId" }, { status: 400 });
      }
      if (!canAccessBranch(auth.session, bId)) {
        return NextResponse.json({ success: false, message: "Forbidden: Unauthorized branch access" }, { status: 403 });
      }
      targetBranchId = bId;
    }

    const result = await queryMasterLedger({
      storeId: auth.session.storeId,
      branchId: targetBranchId,
      partyType,
      entryType,
      startDate,
      endDate,
      search,
    });

    const entries = result.allFilteredEntries;
    const summary = result.summary;

    const headers = [
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
    ];

    const rows = entries.map((item) => {
      const formattedDate = new Date(item.date).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      });

      return [
        formattedDate,
        item.refNo || "",
        item.entryType ? item.entryType.toUpperCase() : "",
        item.category || "",
        item.partyName || "",
        item.partyPhone || "",
        item.branchCode ? `[${item.branchCode}] ${item.branchName || ""}` : item.branchName || "",
        item.paymentMode || "",
        Number(item.credit || 0).toFixed(2),
        Number(item.debit || 0).toFixed(2),
        Number(item.runningBalance || 0).toFixed(2),
        item.notes || "",
      ];
    });

    if (format === "xlsx" || format === "excel") {
      const xlsxBuf = buildXlsxBuffer([
        {
          name: "Master Ledger",
          headers,
          rows,
        },
        {
          name: "Summary",
          headers: ["Metric", "Value"],
          rows: [
            ["Total Inflow / Credits (INR)", Number(summary.totalCredit || 0).toFixed(2)],
            ["Total Outflow / Debits (INR)", Number(summary.totalDebit || 0).toFixed(2)],
            ["Net Cash Flow (INR)", Number(summary.netCashFlow || 0).toFixed(2)],
            ["Total Transactions", summary.totalTransactions || entries.length],
            ["Export Timestamp", new Date().toISOString()],
          ],
        },
      ]);

      return new NextResponse(new Uint8Array(xlsxBuf), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="financial_ledger_${new Date().toISOString().slice(0, 10)}.xlsx"`,
        },
      });
    }

    const footerLines = [
      "",
      `"--- SUMMARY TOTALS ---"`,
      `"Total Inflow / Credits","","","","","","","","₹${Number(summary.totalCredit || 0).toFixed(2)}"`,
      `"Total Outflow / Debits","","","","","","","","","₹${Number(summary.totalDebit || 0).toFixed(2)}"`,
      `"Net Cash Flow","","","","","","","","","","₹${Number(summary.netCashFlow || 0).toFixed(2)}"`,
      `"Total Records Count","${summary.totalTransactions || entries.length}"`,
      `"Export Timestamp","${new Date().toISOString()}"`,
    ];

    const csvContent = buildCsvContent(headers, rows, footerLines);

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
