"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  GitBranch,
  Layers,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { toast } from "@/stores/useToastStore";

function formatInr(val: number): string {
  return `₹${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

type ReportTab = "saas_mrr" | "stores_branches" | "risk_compliance" | "capacity_adoption";

export default function SuperAdminReportsPage() {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);
  const [tab, setTab] = useState<ReportTab>("saas_mrr");

  // Filters (3.9.2)
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [planCodeFilter, setPlanCodeFilter] = useState("ALL");
  const [storeFilter, setStoreFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [sortBy, setSortBy] = useState("gmv");

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ sortBy });
      if (startDate) qs.set("startDate", startDate);
      if (endDate) qs.set("endDate", endDate);
      if (stateFilter !== "all") qs.set("state", stateFilter);
      if (cityFilter !== "all") qs.set("city", cityFilter);
      if (planCodeFilter !== "ALL") qs.set("planCode", planCodeFilter);
      if (storeFilter !== "all") qs.set("storeId", storeFilter);
      if (branchFilter !== "all") qs.set("branchId", branchFilter);

      const res = await fetch(`/api/super-admin/reports?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setReport(json);
      } else {
        toast.error(json.message || "Failed to load CEO BI reports");
      }
    } catch {
      toast.error("Network error loading CEO analytics");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, stateFilter, cityFilter, planCodeFilter, storeFilter, branchFilter, sortBy]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const triggerExport = (format: "xlsx" | "csv", type = "board_pack") => {
    const qs = new URLSearchParams({ format, type, sortBy });
    if (startDate) qs.set("startDate", startDate);
    if (endDate) qs.set("endDate", endDate);
    if (stateFilter !== "all") qs.set("state", stateFilter);
    if (cityFilter !== "all") qs.set("city", cityFilter);
    if (planCodeFilter !== "ALL") qs.set("planCode", planCodeFilter);
    if (storeFilter !== "all") qs.set("storeId", storeFilter);
    if (branchFilter !== "all") qs.set("branchId", branchFilter);
    window.open(`/api/super-admin/reports/export?${qs.toString()}`, "_blank");
  };

  const kpis = report?.executiveKpis;
  const pnl = report?.consolidatedPnl;
  const tax = report?.taxSummary;
  const risk = report?.riskAndCompliance;
  const maxMrrBar = Math.max(
    1,
    ...(report?.mrrBridge12m || []).map((m: any) => Math.max(m.endingMrr, m.netCollectedRevenue))
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header + Export Pack Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-teal-700" />
            <span>CEO Executive BI Reports, MRR Bridge &amp; P&amp;L Analytics</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            12-month SaaS MRR movement, SAC {tax?.sacCode || "998314"} tax liability, cross-store retail P&amp;L leaderboards, inventory risk &amp; 7-tab Excel board pack.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => triggerExport("xlsx", "board_pack")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export 7-Sheet Board Pack (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => triggerExport("csv", tab === "saas_mrr" ? "mrr" : "stores")}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            type="button"
            onClick={loadReports}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 text-xs">
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">From Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">To Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">State</label>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold"
          >
            <option value="all">All States</option>
            {(report?.filterOptions?.states || []).map((st: string) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">City</label>
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold"
          >
            <option value="all">All Cities</option>
            {(report?.filterOptions?.cities || []).map((c: string) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Plan Tier</label>
          <select
            value={planCodeFilter}
            onChange={(e) => setPlanCodeFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold"
          >
            <option value="ALL">All Plans</option>
            {(report?.filterOptions?.plans || []).map((pl: any) => (
              <option key={pl.code} value={pl.code}>
                {pl.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Store Scope</label>
          <select
            value={storeFilter}
            onChange={(e) => {
              setStoreFilter(e.target.value);
              setBranchFilter("all");
            }}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold"
          >
            <option value="all">All Pharmacies</option>
            {(report?.filterOptions?.stores || []).map((st: any) => (
              <option key={st.id} value={String(st.id)}>
                {st.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Branch Scope</label>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold"
          >
            <option value="all">All Branches</option>
            {(report?.filterOptions?.branches || [])
              .filter((b: any) => storeFilter === "all" || String(b.storeId) === storeFilter)
              .map((b: any) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Sort Stores By</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold"
          >
            <option value="gmv">Gross Retail GMV</option>
            <option value="profit">Net Profit</option>
            <option value="invoices">Invoices Volume</option>
            <option value="stockValue">Inventory Valuation</option>
            <option value="adoption">Portal Adoption Score</option>
            <option value="growth">Period Growth %</option>
          </select>
        </div>
      </div>

      {/* Top Executive KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>Normalized Active MRR</span>
            <TrendingUp className="w-4 h-4 text-teal-700" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{formatInr(kpis?.currentMrr || 0)}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">ARR Run Rate: {formatInr(kpis?.currentArr || 0)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500">Period SaaS GST Liability (18%)</div>
          <div className="text-2xl font-extrabold text-teal-700 mt-1">{formatInr(tax?.netGstLiability || 0)}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Taxable Net: {formatInr(tax?.netTaxableLiability || 0)} • SAC {tax?.sacCode || "998314"}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500">Consolidated Retail Net Sales</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{formatInr(pnl?.netRevenue || 0)}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {pnl?.invoicesCount || 0} bills • Net Profit: {formatInr(pnl?.netProfit || 0)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500">Risk &amp; Credit Exposure</div>
          <div className="text-2xl font-extrabold text-rose-700 mt-1">{formatInr(risk?.totalExpiredValue || 0)}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Baki Due: {formatInr(risk?.totalCustomerBakiDue || 0)} • H/H1 Doc: {risk?.scheduleCompliancePct ?? 100}%
          </div>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="flex flex-wrap gap-2 bg-white border border-slate-200 p-1.5 rounded-2xl w-fit text-xs font-bold">
        {[
          { id: "saas_mrr", label: "SaaS Revenue & 12M MRR Bridge", icon: Layers },
          { id: "stores_branches", label: "Store & Branch P&L Leaderboards", icon: Building2 },
          { id: "risk_compliance", label: "Inventory Risk & Compliance", icon: AlertTriangle },
          { id: "capacity_adoption", label: "Storage & Feature Adoption", icon: Database },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as ReportTab)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl cursor-pointer transition-colors ${
                active ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {loading && !report ? (
        <div className="bg-white border border-slate-200 rounded-2xl py-20 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-7 h-7 animate-spin text-teal-700 mb-2" />
          <p className="text-xs font-semibold">Aggregating multi-tenant BI analytics...</p>
        </div>
      ) : (
        <>
          {/* TAB 1: SaaS Revenue, 12M MRR Movement & Plan Tier Breakdown (3.9.1) */}
          {tab === "saas_mrr" && report && (
            <div className="space-y-5">
              {/* Visual 12M MRR & Revenue Trend Bars + Bridge Table */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold text-slate-900">
                    Trailing 12-Month MRR Movement &amp; SaaS Collections Bridge
                  </h2>
                  <button
                    type="button"
                    onClick={() => triggerExport("csv", "mrr")}
                    className="text-xs font-bold text-teal-700 hover:underline cursor-pointer"
                  >
                    Download MRR CSV
                  </button>
                </div>

                <div className="grid grid-cols-12 gap-2 items-end h-36 pt-4 pb-2 border-b border-slate-100">
                  {(report.mrrBridge12m || []).map((m: any) => {
                    const hPct = Math.max(6, Math.round((m.endingMrr / maxMrrBar) * 100));
                    return (
                      <div key={m.monthKey} className="flex flex-col items-center gap-1 h-full justify-end">
                        <div className="text-[9px] font-mono text-slate-500">
                          {m.endingMrr > 0 ? `₹${Math.round(m.endingMrr)}` : "0"}
                        </div>
                        <div
                          className="w-full max-w-[32px] rounded-t-md bg-teal-700 transition-all"
                          style={{ height: `${hPct}%` }}
                          title={`${m.label}: MRR ${formatInr(m.endingMrr)} | Collected ${formatInr(m.netCollectedRevenue)}`}
                        />
                        <div className="text-[9px] font-bold text-slate-500 truncate w-full text-center">
                          {m.label.split(" ")[0]}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                        <th className="py-2.5">Month</th>
                        <th className="py-2.5 text-right">New MRR</th>
                        <th className="py-2.5 text-right">Expansion</th>
                        <th className="py-2.5 text-right">Churned</th>
                        <th className="py-2.5 text-right">Ending MRR</th>
                        <th className="py-2.5 text-right">Taxable Sales</th>
                        <th className="py-2.5 text-right">GST 18%</th>
                        <th className="py-2.5 text-right">Net Collected</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(report.mrrBridge12m || []).map((m: any) => (
                        <tr key={m.monthKey} className="hover:bg-slate-50">
                          <td className="py-2 font-bold text-slate-800">{m.label}</td>
                          <td className="py-2 text-right font-mono text-emerald-700">+{formatInr(m.newMrr)}</td>
                          <td className="py-2 text-right font-mono text-teal-700">+{formatInr(m.expansionMrr)}</td>
                          <td className="py-2 text-right font-mono text-rose-600">-{formatInr(m.churnedMrr)}</td>
                          <td className="py-2 text-right font-mono font-extrabold text-slate-900">
                            {formatInr(m.endingMrr)}
                          </td>
                          <td className="py-2 text-right font-mono">{formatInr(m.taxableRevenue)}</td>
                          <td className="py-2 text-right font-mono">{formatInr(m.gstCollected)}</td>
                          <td className="py-2 text-right font-mono font-bold text-slate-900">
                            {formatInr(m.netCollectedRevenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Plan Tier Breakdown + Razorpay Settlement Tax Summary */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                  <h2 className="text-sm font-extrabold text-slate-900">Plan Tier MRR Share &amp; Conversion</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                          <th className="py-2">Plan</th>
                          <th className="py-2 text-right">Paid</th>
                          <th className="py-2 text-right">Trials</th>
                          <th className="py-2 text-right">MRR</th>
                          <th className="py-2 text-right">MRR %</th>
                          <th className="py-2 text-right">Avg Tenure</th>
                          <th className="py-2 text-right">Conv %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(report.planTierBreakdown || []).map((t: any) => (
                          <tr key={t.planId}>
                            <td className="py-2.5">
                              <div className="font-bold text-slate-900">{t.name}</div>
                              <div className="text-[10px] font-mono text-slate-500">
                                {t.code} • {formatInr(t.priceInr)}/{t.billingCycle}
                              </div>
                            </td>
                            <td className="py-2.5 text-right font-mono font-bold">{t.subscriberCount}</td>
                            <td className="py-2.5 text-right font-mono">{t.trialCount}</td>
                            <td className="py-2.5 text-right font-mono font-bold text-teal-700">
                              {formatInr(t.mrr)}
                            </td>
                            <td className="py-2.5 text-right font-mono">{t.mrrSharePct}%</td>
                            <td className="py-2.5 text-right font-mono">{t.avgTenureDays}d</td>
                            <td className="py-2.5 text-right font-mono">{t.conversionRatePct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 space-y-3 text-xs">
                  <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-teal-700" />
                    Platform GSTR-1 SaaS Tax Summary
                  </h2>
                  <div className="space-y-2 bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Legal Entity:</span>
                      <strong className="text-slate-900">{tax?.legalEntityName}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">SAC Classification:</span>
                      <strong className="font-mono">{tax?.sacCode || "998314"} (18%)</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Taxable Base (Net):</span>
                      <strong className="font-mono">{formatInr(tax?.netTaxableLiability || 0)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Output CGST (9%) + SGST (9%):</span>
                      <strong className="font-mono">
                        {formatInr(tax?.cgstOutput || 0)} + {formatInr(tax?.sgstOutput || 0)}
                      </strong>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-2">
                      <span className="font-bold text-slate-800">Net Payable SaaS Total:</span>
                      <strong className="font-mono text-teal-700">{formatInr(tax?.netTotalCollected || 0)}</strong>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 space-y-1">
                    <div>
                      Razorpay Gateway: <strong>{formatInr(tax?.razorpayCapturedTotal || 0)}</strong>
                    </div>
                    <div>
                      Offline Bank NEFT/Cheque: <strong>{formatInr(tax?.offlineCapturedTotal || 0)}</strong>
                    </div>
                    <div>
                      Refund Deductions ({tax?.refundedCount || 0}):{" "}
                      <strong>{formatInr(tax?.periodRefundsTotal || 0)}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Store & Branch P&L Leaderboards (3.9.2) */}
          {tab === "stores_branches" && report && (
            <div className="space-y-5">
              {/* Consolidated P&L Strip */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 grid grid-cols-2 sm:grid-cols-6 gap-4 text-xs">
                <div>
                  <div className="text-slate-500 font-bold">Gross Retail Sales</div>
                  <div className="text-lg font-extrabold mt-0.5">{formatInr(pnl?.grossSales || 0)}</div>
                </div>
                <div>
                  <div className="text-slate-500 font-bold">Processed Refunds</div>
                  <div className="text-lg font-extrabold text-rose-600 mt-0.5">-{formatInr(pnl?.refunds || 0)}</div>
                </div>
                <div>
                  <div className="text-slate-500 font-bold">Retail COGS</div>
                  <div className="text-lg font-extrabold mt-0.5">{formatInr(pnl?.cogs || 0)}</div>
                </div>
                <div>
                  <div className="text-slate-500 font-bold">Gross Margin ({pnl?.grossMarginPct || 0}%)</div>
                  <div className="text-lg font-extrabold text-teal-700 mt-0.5">{formatInr(pnl?.grossProfit || 0)}</div>
                </div>
                <div>
                  <div className="text-slate-500 font-bold">Operating Expenses</div>
                  <div className="text-lg font-extrabold mt-0.5">{formatInr(pnl?.operatingExpenses || 0)}</div>
                </div>
                <div>
                  <div className="text-slate-500 font-bold">Consolidated Net Profit</div>
                  <div className="text-lg font-extrabold text-emerald-700 mt-0.5">{formatInr(pnl?.netProfit || 0)}</div>
                </div>
              </div>

              {/* Payment Tender Split Strip (Cash vs UPI vs Card vs Credit) */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
                  <div className="text-[11px] font-bold text-emerald-800">Cash Tendered</div>
                  <div className="text-sm font-extrabold font-mono text-emerald-900 mt-0.5">
                    {formatInr(pnl?.paymentSplit?.cash || 0)}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-teal-50/70 border border-teal-100">
                  <div className="text-[11px] font-bold text-teal-800">UPI Collections</div>
                  <div className="text-sm font-extrabold font-mono text-teal-900 mt-0.5">
                    {formatInr(pnl?.paymentSplit?.upi || 0)}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-100">
                  <div className="text-[11px] font-bold text-indigo-800">Card Terminals</div>
                  <div className="text-sm font-extrabold font-mono text-indigo-900 mt-0.5">
                    {formatInr(pnl?.paymentSplit?.card || 0)}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-100">
                  <div className="text-[11px] font-bold text-amber-800">Customer Baki Credit</div>
                  <div className="text-sm font-extrabold font-mono text-amber-900 mt-0.5">
                    {formatInr(pnl?.paymentSplit?.credit || 0)}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-600">Cheque / Other</div>
                  <div className="text-sm font-extrabold font-mono text-slate-800 mt-0.5">
                    {formatInr(pnl?.paymentSplit?.other || 0)}
                  </div>
                </div>
              </div>

              {/* Store Leaderboard Table */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-extrabold text-slate-900">
                  Cross-Store Retail Leaderboard &amp; P&amp;L Matrix
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                        <th className="py-2.5">Store Tenant</th>
                        <th className="py-2.5">Plan</th>
                        <th className="py-2.5 text-right">Bills</th>
                        <th className="py-2.5 text-right">Gross GMV</th>
                        <th className="py-2.5 text-right">Avg Basket</th>
                        <th className="py-2.5 text-right">Net Profit</th>
                        <th className="py-2.5 text-right">Stock Val</th>
                        <th className="py-2.5 text-right">Portal Score</th>
                        <th className="py-2.5 text-right">Growth %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(report.storeLeaderboard || []).map((st: any) => (
                        <tr key={st.storeId} className="hover:bg-slate-50">
                          <td className="py-2.5">
                            <Link
                              href={`/super-admin/stores/${st.storeId}`}
                              className="font-bold text-slate-900 hover:text-teal-700 inline-flex items-center gap-1"
                            >
                              <span>{st.storeName}</span>
                              <ExternalLink className="w-3 h-3 text-slate-400" />
                            </Link>
                            <div className="text-[10px] text-slate-500">
                              {[st.city, st.state].filter(Boolean).join(", ") || "India"} • {st.branchesCount} branch(es)
                            </div>
                          </td>
                          <td className="py-2.5 font-mono text-[11px] font-bold">{st.planCode}</td>
                          <td className="py-2.5 text-right font-mono">{st.invoicesCount}</td>
                          <td className="py-2.5 text-right font-mono font-bold">{formatInr(st.grossRetailGmv)}</td>
                          <td className="py-2.5 text-right font-mono">{formatInr(st.avgBasketSize)}</td>
                          <td className="py-2.5 text-right font-mono font-bold text-emerald-700">
                            {formatInr(st.netProfit)}
                          </td>
                          <td className="py-2.5 text-right font-mono">{formatInr(st.inventoryValuation)}</td>
                          <td className="py-2.5 text-right font-mono">{st.portalAdoptionScore}/100</td>
                          <td
                            className={`py-2.5 text-right font-mono font-bold ${
                              st.growthPct >= 0 ? "text-emerald-700" : "text-rose-600"
                            }`}
                          >
                            {st.growthPct >= 0 ? `+${st.growthPct}%` : `${st.growthPct}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cross-Branch Outlets */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                  <GitBranch className="w-4 h-4 text-teal-700" />
                  Top Pharmacy Counters &amp; Compliance Matrix
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                        <th className="py-2.5">Branch Outlet</th>
                        <th className="py-2.5">Parent Store</th>
                        <th className="py-2.5">DL / GSTIN Compliance</th>
                        <th className="py-2.5 text-right">Bills</th>
                        <th className="py-2.5 text-right">Net Revenue</th>
                        <th className="py-2.5 text-right">Margin %</th>
                        <th className="py-2.5 text-right">Stock Val</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(report.branchLeaderboard || []).map((b: any) => (
                        <tr key={b.branchId} className="hover:bg-slate-50">
                          <td className="py-2.5">
                            <Link
                              href={`/super-admin/branches/${b.branchId}`}
                              className="font-bold text-slate-900 hover:text-teal-700"
                            >
                              [{b.branchCode}] {b.branchName}
                            </Link>
                          </td>
                          <td className="py-2.5 text-slate-600">{b.storeName}</td>
                          <td className="py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                b.complianceComplete
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-800"
                              }`}
                            >
                              {b.complianceComplete ? "Verified" : "Missing DL/GST"}
                            </span>
                          </td>
                          <td className="py-2.5 text-right font-mono">{b.invoicesCount}</td>
                          <td className="py-2.5 text-right font-mono font-bold">{formatInr(b.netRevenue)}</td>
                          <td className="py-2.5 text-right font-mono">{b.grossMarginPct}%</td>
                          <td className="py-2.5 text-right font-mono">{formatInr(b.stockValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Inventory Risk & Regulatory Compliance (3.9.2) */}
          {tab === "risk_compliance" && report && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                  <div className="text-rose-800 font-bold">Expired Stock Value</div>
                  <div className="text-lg font-extrabold text-rose-900 mt-0.5">
                    {formatInr(risk?.totalExpiredValue || 0)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-amber-800 font-bold">Expiring &lt;=30d / 90d</div>
                  <div className="text-lg font-extrabold text-amber-900 mt-0.5">
                    {risk?.expiring30dCount || 0} / {risk?.expiring90dCount || 0}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-slate-600 font-bold">Dead Stock (60/90/180d)</div>
                  <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                    {risk?.deadStock60dCount || 0} / {risk?.deadStock90dCount || 0} / {risk?.deadStock180dCount || 0}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-teal-50 border border-teal-200">
                  <div className="text-teal-800 font-bold">Customer Baki Khata</div>
                  <div className="text-lg font-extrabold text-teal-900 mt-0.5">
                    {formatInr(risk?.totalCustomerBakiDue || 0)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                  <div className="text-indigo-800 font-bold">Supplier Payables Due</div>
                  <div className="text-lg font-extrabold text-indigo-900 mt-0.5">
                    {formatInr(risk?.totalSupplierPayableDue || 0)}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                      <th className="py-2.5">Store Tenant</th>
                      <th className="py-2.5 text-right">Expired Val</th>
                      <th className="py-2.5 text-right">&lt;=30d Batches</th>
                      <th className="py-2.5 text-right">Dead Stock 90d</th>
                      <th className="py-2.5 text-right">H/H1 Rx Compliance</th>
                      <th className="py-2.5 text-right">Baki Receivable</th>
                      <th className="py-2.5 text-right">Supplier Payable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(report.storeLeaderboard || []).map((st: any) => (
                      <tr key={st.storeId} className="hover:bg-slate-50">
                        <td className="py-2.5 font-bold text-slate-900">{st.storeName}</td>
                        <td className="py-2.5 text-right font-mono text-rose-700">
                          {formatInr(st.expiredStockValue)}
                        </td>
                        <td className="py-2.5 text-right font-mono">{st.expiring30dCount}</td>
                        <td className="py-2.5 text-right font-mono">{st.deadStock90dCount}</td>
                        <td className="py-2.5 text-right font-mono font-bold">
                          {st.scheduleCompliancePct}% ({st.scheduleDrugItemsSold} lines)
                        </td>
                        <td className="py-2.5 text-right font-mono">{formatInr(st.customerBakiDue)}</td>
                        <td className="py-2.5 text-right font-mono">{formatInr(st.supplierPayableDue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: Capacity, Storage & Feature Adoption Telemetry (3.9.3) */}
          {tab === "capacity_adoption" && report && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-extrabold text-slate-900">Platform Feature Adoption Matrix</h2>
                <div className="space-y-3 text-xs">
                  {(report.featureAdoption || []).map((f: any) => (
                    <div key={f.key} className="space-y-1">
                      <div className="flex justify-between font-bold text-slate-700">
                        <span>{f.label}</span>
                        <span className="font-mono text-teal-700">
                          {f.adoptedStores}/{f.eligiblePlanStores} eligible ({f.adoptionPctOfEligible}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-teal-600 rounded-full"
                          style={{ width: `${Math.min(100, f.adoptionPctOfEligible)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-extrabold text-slate-900">
                  Database &amp; Rx File Storage Footprint per Store
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                        <th className="py-2">Store Tenant</th>
                        <th className="py-2 text-right">Medicines</th>
                        <th className="py-2 text-right">Batches</th>
                        <th className="py-2 text-right">Customers</th>
                        <th className="py-2 text-right">Period Bills</th>
                        <th className="py-2 text-right">Rx Files</th>
                        <th className="py-2 text-right">Disk (MB)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(report.storageFootprint || []).map((sf: any) => (
                        <tr key={sf.storeId}>
                          <td className="py-2 font-bold text-slate-900">{sf.storeName}</td>
                          <td className="py-2 text-right font-mono">{sf.medicineRows}</td>
                          <td className="py-2 text-right font-mono">{sf.batchRows}</td>
                          <td className="py-2 text-right font-mono">{sf.customerRows}</td>
                          <td className="py-2 text-right font-mono">{sf.invoiceRows}</td>
                          <td className="py-2 text-right font-mono">{sf.rxFileCount}</td>
                          <td className="py-2 text-right font-mono font-bold text-teal-700">
                            {sf.rxStorageMb} MB
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
