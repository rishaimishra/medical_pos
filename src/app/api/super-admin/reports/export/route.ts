import { NextRequest, NextResponse } from "next/server";
import { verifySuperAdminRequest } from "@/lib/auth";
import { queryCeoBiReports } from "@/lib/superAdminReports";
import { buildXlsxBuffer } from "@/lib/excel";
import { buildCsvContent } from "@/lib/csv";

/**
 * MODULE 3.9.4: CEO Executive Report Exports (`GET /api/super-admin/reports/export?type=...&format=csv|xlsx`)
 * Workbook `.xlsx` Tabs:
 *  1. Executive Summary
 *  2. 12M MRR & Revenue
 *  3. Plan Tier Breakdown
 *  4. Stores Health & Quota Matrix
 *  5. Branches Directory
 *  6. Upsell & Churn Pipeline
 *  7. SaaS Payment Ledger
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const format = (searchParams.get("format") || "xlsx").toLowerCase();
  const type = (searchParams.get("type") || "board_pack").toLowerCase();
  const storeIdRaw = searchParams.get("storeId");
  const branchIdRaw = searchParams.get("branchId");

  try {
    const report = await queryCeoBiReports({
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
      state: searchParams.get("state"),
      city: searchParams.get("city"),
      planCode: searchParams.get("planCode"),
      storeId: storeIdRaw && storeIdRaw !== "all" ? parseInt(storeIdRaw, 10) : null,
      branchId: branchIdRaw && branchIdRaw !== "all" ? parseInt(branchIdRaw, 10) : null,
      sortBy: searchParams.get("sortBy") || "gmv",
    });

    const dateTag = `${report.range.startDate}_to_${report.range.endDate}`;

    if (format === "xlsx" || format === "excel") {
      const xlsxBuf = buildXlsxBuffer([
        {
          name: "Executive Summary",
          headers: ["Metric", "Value"],
          rows: [
            ["Reporting Period", `${report.range.startDate} to ${report.range.endDate}`],
            ["Current Active MRR (INR)", report.executiveKpis.currentMrr.toFixed(2)],
            ["Current Run-Rate ARR (INR)", report.executiveKpis.currentArr.toFixed(2)],
            ["Total Registered Stores", report.executiveKpis.totalNonDraftStores],
            ["Total Pharmacy Branches", report.executiveKpis.totalBranches],
            ["SaaS Taxable Revenue (INR)", report.taxSummary.periodTaxableSales.toFixed(2)],
            ["SaaS 18% GST Collected (INR)", report.taxSummary.periodGstCollected.toFixed(2)],
            ["SaaS Net Collected After Refunds (INR)", report.taxSummary.netTotalCollected.toFixed(2)],
            ["Retail Consolidated Gross GMV (INR)", report.consolidatedPnl.grossSales.toFixed(2)],
            ["Retail Refunds (INR)", report.consolidatedPnl.refunds.toFixed(2)],
            ["Retail Net Revenue (INR)", report.consolidatedPnl.netRevenue.toFixed(2)],
            ["Retail COGS (INR)", report.consolidatedPnl.cogs.toFixed(2)],
            ["Retail Gross Profit (INR)", report.consolidatedPnl.grossProfit.toFixed(2)],
            ["Retail Operating Expenses (INR)", report.consolidatedPnl.operatingExpenses.toFixed(2)],
            ["Retail Consolidated Net Profit (INR)", report.consolidatedPnl.netProfit.toFixed(2)],
            ["Expired Stock Exposure (INR)", report.riskAndCompliance.totalExpiredValue.toFixed(2)],
            ["Customer Baki Receivables (INR)", report.riskAndCompliance.totalCustomerBakiDue.toFixed(2)],
            ["Supplier Payable Exposure (INR)", report.riskAndCompliance.totalSupplierPayableDue.toFixed(2)],
          ],
        },
        {
          name: "12M MRR & Revenue",
          headers: [
            "Month",
            "Month Key",
            "New MRR (INR)",
            "Expansion MRR (INR)",
            "Churned MRR (INR)",
            "Net Ending MRR (INR)",
            "Taxable SaaS Sales (INR)",
            "GST 18% (INR)",
            "Refunds (INR)",
            "Net Collected (INR)",
            "Paid Invoices",
          ],
          rows: report.mrrBridge12m.map((m) => [
            m.label,
            m.monthKey,
            m.newMrr.toFixed(2),
            m.expansionMrr.toFixed(2),
            m.churnedMrr.toFixed(2),
            m.endingMrr.toFixed(2),
            m.taxableRevenue.toFixed(2),
            m.gstCollected.toFixed(2),
            m.refundedAmount.toFixed(2),
            m.netCollectedRevenue.toFixed(2),
            m.paymentsCount,
          ]),
        },
        {
          name: "Plan Tier Breakdown",
          headers: [
            "Plan Code",
            "Plan Name",
            "Billing Cycle",
            "Base Price (INR)",
            "Active Paid Stores",
            "Trialing Stores",
            "MRR (INR)",
            "MRR Share (%)",
            "Avg Tenure (Days)",
            "Conversion Rate (%)",
          ],
          rows: report.planTierBreakdown.map((t) => [
            t.code,
            t.name,
            t.billingCycle,
            t.priceInr.toFixed(2),
            t.subscriberCount,
            t.trialCount,
            t.mrr.toFixed(2),
            t.mrrSharePct.toFixed(1),
            t.avgTenureDays,
            t.conversionRatePct.toFixed(1),
          ]),
        },
        {
          name: "Stores Health & Quota Matrix",
          headers: [
            "Store ID",
            "Store Name",
            "City",
            "State",
            "Status",
            "Plan",
            "Branches",
            "Invoices",
            "Gross GMV (INR)",
            "Net Revenue (INR)",
            "Net Profit (INR)",
            "Inventory Value (INR)",
            "Portal Adoption Score",
            "Growth %",
            "Schedule Compliance %",
            "Quota: Branches",
            "Quota: Staff",
            "Quota: Medicines",
            "Quota: Monthly Bills",
          ],
          rows: report.storeLeaderboard.map((s) => [
            s.storeId,
            s.storeName,
            s.city || "",
            s.state || "",
            s.storeStatus,
            s.planCode,
            s.branchesCount,
            s.invoicesCount,
            s.grossRetailGmv.toFixed(2),
            s.netRevenue.toFixed(2),
            s.netProfit.toFixed(2),
            s.inventoryValuation.toFixed(2),
            s.portalAdoptionScore,
            s.growthPct.toFixed(1),
            s.scheduleCompliancePct.toFixed(1),
            s.quotaUsage.branches,
            s.quotaUsage.staff,
            s.quotaUsage.medicines,
            s.quotaUsage.monthlyBills,
          ]),
        },
        {
          name: "Branches Directory",
          headers: [
            "Branch ID",
            "Store Name",
            "Branch Code",
            "Branch Name",
            "Main Outlet",
            "Active",
            "GST & DL Complete",
            "Invoices",
            "Net Revenue (INR)",
            "Gross Margin %",
            "Net Profit (INR)",
            "Stock Valuation (INR)",
          ],
          rows: report.branchLeaderboard.map((b) => [
            b.branchId,
            b.storeName,
            b.branchCode,
            b.branchName,
            b.isMain ? "YES" : "NO",
            b.active ? "YES" : "NO",
            b.complianceComplete ? "COMPLETE" : "MISSING",
            b.invoicesCount,
            b.netRevenue.toFixed(2),
            b.grossMarginPct.toFixed(1),
            b.netProfit.toFixed(2),
            b.stockValue.toFixed(2),
          ]),
        },
        {
          name: "Upsell & Churn Pipeline",
          headers: ["Store ID", "Store Name", "Status", "Plan", "Signal Type", "Triggers / Details"],
          rows: report.upsellAndChurnRows.map((u) => [
            u.storeId,
            u.storeName,
            u.storeStatus,
            u.planCode,
            u.signalType,
            u.details,
          ]),
        },
        {
          name: "SaaS Payment Ledger",
          headers: [
            "Invoice No",
            "Store Name",
            "Buyer GSTIN",
            "Plan",
            "Type",
            "Method",
            "Status",
            "Taxable (INR)",
            "GST 18% (INR)",
            "Total (INR)",
            "Date",
          ],
          rows: report.paymentsLedger.map((p) => [
            p.invoiceNo,
            p.storeName,
            p.storeGst || "Unregistered",
            `${p.planName} (${p.planCode})`,
            p.paymentType,
            p.paymentMethod,
            p.status,
            p.amountSubtotal.toFixed(2),
            p.gstAmount.toFixed(2),
            p.totalAmount.toFixed(2),
            p.paidAt.slice(0, 10),
          ]),
        },
      ]);

      return new NextResponse(new Uint8Array(xlsxBuf), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="ceo_board_pack_${dateTag}.xlsx"`,
        },
      });
    }

    // CSV export per requested table type
    let headers: string[] = [];
    let rows: Array<Array<string | number>> = [];
    if (type === "mrr") {
      headers = ["Month", "New MRR", "Expansion MRR", "Churned MRR", "Ending MRR", "Net Revenue"];
      rows = report.mrrBridge12m.map((m) => [
        m.label,
        m.newMrr.toFixed(2),
        m.expansionMrr.toFixed(2),
        m.churnedMrr.toFixed(2),
        m.endingMrr.toFixed(2),
        m.netCollectedRevenue.toFixed(2),
      ]);
    } else if (type === "payments") {
      headers = ["Invoice No", "Store", "Plan", "Status", "Taxable", "GST", "Total", "Date"];
      rows = report.paymentsLedger.map((p) => [
        p.invoiceNo,
        p.storeName,
        p.planCode,
        p.status,
        p.amountSubtotal.toFixed(2),
        p.gstAmount.toFixed(2),
        p.totalAmount.toFixed(2),
        p.paidAt.slice(0, 10),
      ]);
    } else if (type === "branches") {
      headers = ["Branch", "Store", "Compliance", "Invoices", "Net Revenue", "Net Profit", "Stock Value"];
      rows = report.branchLeaderboard.map((b) => [
        `${b.branchCode} - ${b.branchName}`,
        b.storeName,
        b.complianceComplete ? "COMPLETE" : "MISSING",
        b.invoicesCount,
        b.netRevenue.toFixed(2),
        b.netProfit.toFixed(2),
        b.stockValue.toFixed(2),
      ]);
    } else {
      headers = ["Store ID", "Store Name", "Plan", "Status", "Invoices", "Gross GMV", "Net Profit", "Adoption Score"];
      rows = report.storeLeaderboard.map((s) => [
        s.storeId,
        s.storeName,
        s.planCode,
        s.storeStatus,
        s.invoicesCount,
        s.grossRetailGmv.toFixed(2),
        s.netProfit.toFixed(2),
        s.portalAdoptionScore,
      ]);
    }

    const csv = buildCsvContent(headers, rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ceo_bi_${type}_${dateTag}.csv"`,
      },
    });
  } catch (err: any) {
    console.error("[GET /api/super-admin/reports/export Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to export CEO BI report" },
      { status: 500 }
    );
  }
}
