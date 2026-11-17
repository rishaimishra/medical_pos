import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { queryAdminSalesSummary } from "@/lib/salesReport";
import { buildCsvContent } from "@/lib/csv";
import { buildXlsxBuffer } from "@/lib/excel";

/**
 * MODULE 2.16.4 & 2.16.5: Admin Sales Summary Export (CSV UTF-8 BOM & Excel .xlsx)
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json(
      { success: false, message: auth.message || "Unauthorized" },
      { status: auth.status }
    );
  }

  if (auth.session.role !== "admin") {
    return NextResponse.json(
      { success: false, message: "Forbidden: Admin role required to export sales summary" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const branchParam = searchParams.get("branchId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const format = (searchParams.get("format") || "csv").toLowerCase();

  const storeId = auth.session.storeId ?? null;
  let targetBranchId: number | null = auth.session.branchId ?? null;

  if (branchParam === "all") {
    targetBranchId = canAccessBranch(auth.session, null) ? null : auth.session.branchId ?? null;
  } else if (branchParam) {
    const bId = parseInt(branchParam, 10);
    if (isNaN(bId)) {
      return NextResponse.json({ success: false, message: "Invalid branchId" }, { status: 400 });
    }
    if (!canAccessBranch(auth.session, bId)) {
      return NextResponse.json({ success: false, message: "Forbidden: Unauthorized branch access" }, { status: 403 });
    }
    if (storeId) {
      const br = await prisma.branch.findUnique({ where: { id: bId }, select: { storeId: true } });
      if (!br || (br.storeId && br.storeId !== storeId)) {
        return NextResponse.json(
          { success: false, message: "Forbidden: Branch belongs to another store" },
          { status: 403 }
        );
      }
    }
    targetBranchId = bId;
  }

  try {
    const report = await queryAdminSalesSummary({
      storeId,
      branchId: targetBranchId,
      startDate,
      endDate,
    });

    const dateTag = `${report.range.startDate}_to_${report.range.endDate}`;

    if (format === "xlsx" || format === "excel") {
      const xlsxBuf = buildXlsxBuffer([
        {
          name: "Summary",
          headers: ["Metric", "Value"],
          rows: [
            ["Period Start", report.range.startDate],
            ["Period End", report.range.endDate],
            ["Days in Range", report.range.daysCount],
            ["Total Invoices", report.summary.invoicesCount],
            ["Processed Returns", report.summary.returnsCount],
            ["Gross Sales (INR)", report.summary.grossSales.toFixed(2)],
            ["Processed Refunds (INR)", report.summary.refunds.toFixed(2)],
            ["Net Revenue (INR)", report.summary.netRevenue.toFixed(2)],
            ["GST Collected (INR)", report.summary.gstAmount.toFixed(2)],
            ["Discounts Given (INR)", report.summary.discountAmount.toFixed(2)],
            ["COGS (INR)", report.summary.cogs.toFixed(2)],
            ["Gross Profit (INR)", report.summary.grossProfit.toFixed(2)],
            ["Gross Margin (%)", report.summary.grossMarginPercent.toFixed(2)],
            ["Operating Expenses (INR)", report.summary.operatingExpenses.toFixed(2)],
            ["Other Income (INR)", report.summary.otherIncome.toFixed(2)],
            ["Net Profit (INR)", report.summary.netProfit.toFixed(2)],
            ["Daily Average Revenue (INR)", report.summary.dailyAverage.toFixed(2)],
            ["Current Month Revenue (INR)", report.summary.currentMonthRevenue.toFixed(2)],
            ["Previous Month Revenue (INR)", report.summary.previousMonthRevenue.toFixed(2)],
            ["MoM Growth (%)", report.summary.momGrowthPercent.toFixed(2)],
          ],
        },
        {
          name: "12-Month Trend",
          headers: [
            "Month",
            "Month Key",
            "Invoices",
            "Returns",
            "Gross Sales (INR)",
            "Refunds (INR)",
            "Net Revenue (INR)",
            "GST (INR)",
            "Discounts (INR)",
            "COGS (INR)",
            "Gross Profit (INR)",
            "Expenses (INR)",
            "Net Profit (INR)",
          ],
          rows: report.months.map((m) => [
            m.label,
            m.monthKey,
            m.salesCount,
            m.returnsCount,
            m.grossSales.toFixed(2),
            m.refunds.toFixed(2),
            m.netRevenue.toFixed(2),
            m.gstAmount.toFixed(2),
            m.discountAmount.toFixed(2),
            m.cogs.toFixed(2),
            m.grossProfit.toFixed(2),
            m.operatingExpenses.toFixed(2),
            m.netProfit.toFixed(2),
          ]),
        },
        {
          name: "Top 10 Medicines",
          headers: [
            "Rank",
            "Medicine",
            "Company",
            "Category",
            "Gross Units",
            "Returned Units",
            "Net Units Sold",
            "Net Revenue (INR)",
            "COGS (INR)",
            "Gross Profit (INR)",
          ],
          rows: report.topMedicines.map((m, idx) => [
            idx + 1,
            m.name,
            m.company,
            m.category,
            m.unitsSold,
            m.returnedUnits,
            m.netUnitsSold,
            m.netRevenue.toFixed(2),
            m.cogs.toFixed(2),
            m.profit.toFixed(2),
          ]),
        },
        {
          name: "Top 5 Customers",
          headers: ["Rank", "Customer Name", "Phone", "Orders", "Gross Spend (INR)", "Refunds (INR)", "Net Spend (INR)"],
          rows: report.topCustomers.map((c, idx) => [
            idx + 1,
            c.name,
            c.phone,
            c.ordersCount,
            c.grossSpend.toFixed(2),
            c.refunds.toFixed(2),
            c.netSpend.toFixed(2),
          ]),
        },
        {
          name: "Payment Methods",
          headers: ["Method", "Count", "Amount (INR)", "Share (%)"],
          rows: report.paymentMethods.map((p) => [
            p.label,
            p.count,
            p.amount.toFixed(2),
            p.percentage.toFixed(2),
          ]),
        },
      ]);

      return new NextResponse(new Uint8Array(xlsxBuf), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="admin-sales-summary-${dateTag}.xlsx"`,
        },
      });
    }

    // Default UTF-8 BOM CSV combining key tables cleanly
    const csvRows: (string | number)[][] = [];
    for (const m of report.months) {
      csvRows.push([
        "12M Trend",
        m.label,
        m.salesCount,
        m.grossSales.toFixed(2),
        m.refunds.toFixed(2),
        m.netRevenue.toFixed(2),
        m.gstAmount.toFixed(2),
        m.discountAmount.toFixed(2),
        m.cogs.toFixed(2),
        m.grossProfit.toFixed(2),
      ]);
    }
    for (const pm of report.paymentMethods) {
      csvRows.push([
        "Payment Method",
        pm.label,
        pm.count,
        pm.amount.toFixed(2),
        `${pm.percentage.toFixed(2)}%`,
        "",
        "",
        "",
        "",
        "",
      ]);
    }

    const csv = buildCsvContent(
      [
        "Section",
        "Period / Method",
        "Count",
        "Gross / Amount",
        "Refunds / Share",
        "Net Revenue",
        "GST Amount",
        "Discount Amount",
        "COGS",
        "Gross Profit",
      ],
      csvRows,
      [
        `Range,${report.range.startDate} to ${report.range.endDate}`,
        `Net Revenue,${report.summary.netRevenue.toFixed(2)}`,
        `Daily Average,${report.summary.dailyAverage.toFixed(2)}`,
        `MoM Growth %,${report.summary.momGrowthPercent.toFixed(2)}%`,
        `Gross Profit (COGS),${report.summary.grossProfit.toFixed(2)}`,
      ]
    );

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="admin-sales-summary-${dateTag}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/reports/sales-summary/export error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to export sales summary", error: error.message },
      { status: 500 }
    );
  }
}
