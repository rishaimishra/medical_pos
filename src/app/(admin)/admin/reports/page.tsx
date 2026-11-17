"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toLocalYMD } from "@/lib/csv";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  FileText,
  ShieldCheck,
  Calendar,
  Building2,
  Download,
  Search,
  Filter,
  RefreshCw,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  PieChart,
  ShoppingBag,
  Clock,
  Printer,
  FileCheck2,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Users,
  CreditCard,
  FileSpreadsheet,
} from "lucide-react";

interface BranchOption {
  id: number;
  code: string;
  name: string;
}

export default function ReportsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const [activeTab, setActiveTab] = useState<
    "analytics" | "pnl" | "deadstock" | "schedule" | "gst" | "sales_summary"
  >("analytics");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");

  // Date filters
  const getPresetRange = useCallback((preset: "today" | "week" | "month" | "year") => {
    const now = new Date();
    const end = toLocalYMD(now);
    if (preset === "today") return { start: end, end };
    if (preset === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { start: toLocalYMD(d), end };
    }
    if (preset === "year") {
      return { start: toLocalYMD(new Date(now.getFullYear(), 0, 1)), end };
    }
    return { start: toLocalYMD(new Date(now.getFullYear(), now.getMonth(), 1)), end };
  }, []);

  const [datePreset, setDatePreset] = useState<"today" | "week" | "month" | "year" | "custom">("month");
  const [startDate, setStartDate] = useState<string>(() => getPresetRange("month").start);
  const [endDate, setEndDate] = useState<string>(() => getPresetRange("month").end);

  // ==========================================
  // TAB 1: ANALYTICS STATE (2.15.1)
  // ==========================================
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<any | null>(null);

  // ==========================================
  // TAB 2: P&L ENGINE STATE (2.15.2)
  // ==========================================
  const [pnlLoading, setPnlLoading] = useState(false);
  const [pnlData, setPnlData] = useState<any | null>(null);

  // ==========================================
  // TAB 3: DEAD STOCK STATE (2.15.3)
  // ==========================================
  const [deadStockLoading, setDeadStockLoading] = useState(false);
  const [deadStockThreshold, setDeadStockThreshold] = useState<number>(90);
  const [deadStockSearch, setDeadStockSearch] = useState<string>("");
  const [deadStockData, setDeadStockData] = useState<any | null>(null);

  // ==========================================
  // TAB 4: SCHEDULE DRUGS AUDIT REGISTER (2.14.1)
  // ==========================================
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleTypeFilter, setScheduleTypeFilter] = useState<string>("all");
  const [scheduleSearch, setScheduleSearch] = useState<string>("");
  const [scheduleData, setScheduleData] = useState<any | null>(null);

  // ==========================================
  // TAB 5: GST TAX REPORTS (2.14.2)
  // ==========================================
  const [gstLoading, setGstLoading] = useState(false);
  const [gstData, setGstData] = useState<any | null>(null);

  // ==========================================
  // TAB 6: ADMIN SALES SUMMARY (2.16.4 - ADMIN ONLY)
  // ==========================================
  const [salesSummaryLoading, setSalesSummaryLoading] = useState(false);
  const [salesSummaryData, setSalesSummaryData] = useState<any | null>(null);
  const [salesSummaryError, setSalesSummaryError] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    fetch("/api/admin/branches")
      .then((r) => r.json())
      .then((d) => {
        const list = d.branches || d.data;
        if (d.success && Array.isArray(list)) {
          setBranches(list);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch Analytics
  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("range", datePreset);
      if (selectedBranchId !== "all") params.set("branchId", selectedBranchId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/admin/reports/analytics?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setAnalyticsData(data);
      }
    } catch (err) {
      console.error("fetchAnalytics error:", err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [datePreset, selectedBranchId, startDate, endDate]);

  // Fetch P&L
  const fetchPnl = useCallback(async () => {
    setPnlLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranchId !== "all") params.set("branchId", selectedBranchId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/admin/reports/profit-loss?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setPnlData(data);
      }
    } catch (err) {
      console.error("fetchPnl error:", err);
    } finally {
      setPnlLoading(false);
    }
  }, [selectedBranchId, startDate, endDate]);

  // Fetch Dead Stock
  const fetchDeadStock = useCallback(async () => {
    setDeadStockLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("thresholdDays", String(deadStockThreshold));
      if (selectedBranchId !== "all") params.set("branchId", selectedBranchId);
      if (deadStockSearch.trim()) params.set("search", deadStockSearch.trim());
      params.set("limit", "100");

      const res = await fetch(`/api/admin/reports/dead-stock?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setDeadStockData(data);
      }
    } catch (err) {
      console.error("fetchDeadStock error:", err);
    } finally {
      setDeadStockLoading(false);
    }
  }, [deadStockThreshold, selectedBranchId, deadStockSearch]);

  // Fetch Schedule Drugs Register
  const fetchScheduleDrugs = useCallback(async () => {
    setScheduleLoading(true);
    try {
      const params = new URLSearchParams();
      if (scheduleTypeFilter !== "all") params.set("scheduleType", scheduleTypeFilter);
      if (selectedBranchId !== "all") params.set("branchId", selectedBranchId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (scheduleSearch.trim()) params.set("search", scheduleSearch.trim());
      params.set("limit", "100");

      const res = await fetch(`/api/admin/reports/schedule-drugs?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setScheduleData(data);
      }
    } catch (err) {
      console.error("fetchScheduleDrugs error:", err);
    } finally {
      setScheduleLoading(false);
    }
  }, [scheduleTypeFilter, selectedBranchId, startDate, endDate, scheduleSearch]);

  // Fetch GST Reports
  const fetchGst = useCallback(async () => {
    setGstLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranchId !== "all") params.set("branchId", selectedBranchId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/admin/reports/gst?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setGstData(data);
      }
    } catch (err) {
      console.error("fetchGst error:", err);
    } finally {
      setGstLoading(false);
    }
  }, [selectedBranchId, startDate, endDate]);

  // Fetch Admin Sales Summary (2.16.4)
  const fetchSalesSummary = useCallback(async () => {
    if (!isAdmin) return;
    setSalesSummaryLoading(true);
    setSalesSummaryError(null);
    try {
      const params = new URLSearchParams();
      if (selectedBranchId !== "all") params.set("branchId", selectedBranchId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/admin/reports/sales-summary?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setSalesSummaryData(data);
      } else {
        setSalesSummaryError(data.message || "Unable to load sales summary");
      }
    } catch (err: any) {
      setSalesSummaryError(err?.message || "Network error");
    } finally {
      setSalesSummaryLoading(false);
    }
  }, [isAdmin, selectedBranchId, startDate, endDate]);

  // Trigger loading based on active tab
  useEffect(() => {
    if (activeTab === "analytics") fetchAnalytics();
    else if (activeTab === "pnl") fetchPnl();
    else if (activeTab === "deadstock") fetchDeadStock();
    else if (activeTab === "schedule") fetchScheduleDrugs();
    else if (activeTab === "gst") fetchGst();
    else if (activeTab === "sales_summary" && isAdmin) fetchSalesSummary();
  }, [activeTab, isAdmin, fetchAnalytics, fetchPnl, fetchDeadStock, fetchScheduleDrugs, fetchGst, fetchSalesSummary]);

  return (
    <div className="space-y-6 select-text max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-sm">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Reports, Business Intelligence &amp; Compliance
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Sales performance analytics, COGS profit engine, dead-stock audit, Schedule H/H1 registers &amp; GSTR
            </p>
          </div>
        </div>

        {/* Global Outlet Branch Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {branches.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="text-xs font-semibold text-slate-700 bg-transparent border-none focus:outline-hidden"
              >
                <option value="all">All Outlets / Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    [{b.code}] {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Export Buttons depending on active tab */}
          {activeTab === "sales_summary" && isAdmin && (
            <>
              <button
                onClick={() => {
                  const p = new URLSearchParams();
                  if (selectedBranchId !== "all") p.set("branchId", selectedBranchId);
                  if (startDate) p.set("startDate", startDate);
                  if (endDate) p.set("endDate", endDate);
                  p.set("format", "csv");
                  window.open(`/api/admin/reports/sales-summary/export?${p.toString()}`, "_blank");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition shadow-2xs"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                Export CSV
              </button>
              <button
                onClick={() => {
                  const p = new URLSearchParams();
                  if (selectedBranchId !== "all") p.set("branchId", selectedBranchId);
                  if (startDate) p.set("startDate", startDate);
                  if (endDate) p.set("endDate", endDate);
                  p.set("format", "xlsx");
                  window.open(`/api/admin/reports/sales-summary/export?${p.toString()}`, "_blank");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-2xs"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Export Excel (.xlsx)
              </button>
            </>
          )}

          {activeTab === "deadstock" && (
            <>
              <button
                onClick={() => {
                  const p = new URLSearchParams();
                  p.set("thresholdDays", String(deadStockThreshold));
                  if (selectedBranchId !== "all") p.set("branchId", selectedBranchId);
                  if (deadStockSearch.trim()) p.set("search", deadStockSearch.trim());
                  window.open(`/api/admin/reports/dead-stock/export?${p.toString()}`, "_blank");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition shadow-2xs"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                Export CSV
              </button>
              <button
                onClick={() => {
                  const p = new URLSearchParams();
                  p.set("thresholdDays", String(deadStockThreshold));
                  if (selectedBranchId !== "all") p.set("branchId", selectedBranchId);
                  if (deadStockSearch.trim()) p.set("search", deadStockSearch.trim());
                  p.set("format", "xlsx");
                  window.open(`/api/admin/reports/dead-stock/export?${p.toString()}`, "_blank");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-2xs"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Export Excel (.xlsx)
              </button>
            </>
          )}

          {activeTab === "schedule" && (
            <>
              <button
                onClick={() => {
                  const p = new URLSearchParams();
                  if (scheduleTypeFilter !== "all") p.set("scheduleType", scheduleTypeFilter);
                  if (selectedBranchId !== "all") p.set("branchId", selectedBranchId);
                  if (startDate) p.set("startDate", startDate);
                  if (endDate) p.set("endDate", endDate);
                  if (scheduleSearch.trim()) p.set("search", scheduleSearch.trim());
                  window.open(`/api/admin/reports/schedule-drugs/export?${p.toString()}`, "_blank");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition shadow-2xs"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                Export Form 35 CSV
              </button>
              <button
                onClick={() => {
                  const p = new URLSearchParams();
                  if (scheduleTypeFilter !== "all") p.set("scheduleType", scheduleTypeFilter);
                  if (selectedBranchId !== "all") p.set("branchId", selectedBranchId);
                  if (startDate) p.set("startDate", startDate);
                  if (endDate) p.set("endDate", endDate);
                  if (scheduleSearch.trim()) p.set("search", scheduleSearch.trim());
                  p.set("format", "xlsx");
                  window.open(`/api/admin/reports/schedule-drugs/export?${p.toString()}`, "_blank");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-2xs"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Export Excel (.xlsx)
              </button>
            </>
          )}

          {activeTab === "gst" && (
            <>
              <button
                onClick={() => {
                  const p = new URLSearchParams();
                  if (selectedBranchId !== "all") p.set("branchId", selectedBranchId);
                  if (startDate) p.set("startDate", startDate);
                  if (endDate) p.set("endDate", endDate);
                  window.open(`/api/admin/reports/gst/export?${p.toString()}`, "_blank");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition shadow-2xs"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                Export GSTR CSV
              </button>
              <button
                onClick={() => {
                  const p = new URLSearchParams();
                  if (selectedBranchId !== "all") p.set("branchId", selectedBranchId);
                  if (startDate) p.set("startDate", startDate);
                  if (endDate) p.set("endDate", endDate);
                  p.set("format", "xlsx");
                  window.open(`/api/admin/reports/gst/export?${p.toString()}`, "_blank");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-2xs"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Export Excel (.xlsx)
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-1 sm:gap-2 overflow-x-auto text-xs">
        <button
          onClick={() => setActiveTab("analytics")}
          className={`flex items-center gap-2 px-3.5 py-2.5 font-bold border-b-2 whitespace-nowrap transition ${
            activeTab === "analytics"
              ? "border-teal-600 text-teal-700 bg-teal-50/50 rounded-t-lg"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          Analytics &amp; BI (2.15.1)
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab("sales_summary")}
            className={`flex items-center gap-2 px-3.5 py-2.5 font-bold border-b-2 whitespace-nowrap transition ${
              activeTab === "sales_summary"
                ? "border-teal-600 text-teal-700 bg-teal-50/50 rounded-t-lg"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Admin Sales Summary (2.16.4)
          </button>
        )}
        <button
          onClick={() => setActiveTab("pnl")}
          className={`flex items-center gap-2 px-3.5 py-2.5 font-bold border-b-2 whitespace-nowrap transition ${
            activeTab === "pnl"
              ? "border-teal-600 text-teal-700 bg-teal-50/50 rounded-t-lg"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <DollarSign className="h-4 w-4" />
          Profit &amp; Loss Engine (2.15.2)
        </button>
        <button
          onClick={() => setActiveTab("deadstock")}
          className={`flex items-center gap-2 px-3.5 py-2.5 font-bold border-b-2 whitespace-nowrap transition ${
            activeTab === "deadstock"
              ? "border-teal-600 text-teal-700 bg-teal-50/50 rounded-t-lg"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Dead Stock &amp; Aging (2.15.3)
        </button>
        <button
          onClick={() => setActiveTab("schedule")}
          className={`flex items-center gap-2 px-3.5 py-2.5 font-bold border-b-2 whitespace-nowrap transition ${
            activeTab === "schedule"
              ? "border-teal-600 text-teal-700 bg-teal-50/50 rounded-t-lg"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          Schedule H / H1 Register (2.14.1)
        </button>
        <button
          onClick={() => setActiveTab("gst")}
          className={`flex items-center gap-2 px-3.5 py-2.5 font-bold border-b-2 whitespace-nowrap transition ${
            activeTab === "gst"
              ? "border-teal-600 text-teal-700 bg-teal-50/50 rounded-t-lg"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <FileCheck2 className="h-4 w-4" />
          GST Reports (GSTR-1 &amp; 3B) (2.14.2)
        </button>
      </div>

      {/* Date Filter Bar (for Analytics, P&L, Schedule, GST) */}
      {activeTab !== "deadstock" && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-400 font-semibold flex items-center gap-1 mr-1">
              <Calendar className="h-3.5 w-3.5" /> Timeframe:
            </span>
            {(["today", "week", "month", "year"] as const).map((preset) => (
              <button
                key={preset}
                onClick={() => {
                  const rangeDates = getPresetRange(preset);
                  setDatePreset(preset);
                  setStartDate(rangeDates.start);
                  setEndDate(rangeDates.end);
                }}
                className={`px-2.5 py-1 rounded-md font-semibold capitalize transition ${
                  datePreset === preset
                    ? "bg-teal-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {preset === "today"
                  ? "Today"
                  : preset === "week"
                  ? "Last 7 Days"
                  : preset === "month"
                  ? "This Month"
                  : "This Year"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset("custom");
              }}
              className="border border-slate-200 rounded-md px-2 py-1 text-slate-700 font-medium"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDatePreset("custom");
              }}
              className="border border-slate-200 rounded-md px-2 py-1 text-slate-700 font-medium"
            />
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: ANALYTICS & BUSINESS INTELLIGENCE (2.15.1)         */}
      {/* ========================================================= */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gross Sales Turnover</span>
              <p className="text-2xl font-black text-slate-900 mt-1">
                ₹{Number(analyticsData?.summary?.grossSales || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Invoices: {analyticsData?.summary?.totalInvoices || 0} • Avg: ₹
                {Number(analyticsData?.summary?.averageTicketSize || 0).toFixed(2)}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Net Realized Revenue</span>
              <p className="text-2xl font-black text-teal-700 mt-1">
                ₹{Number(analyticsData?.summary?.netRevenue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                After ₹{Number(analyticsData?.summary?.totalRefunds || 0).toFixed(2)} refunds
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cost of Goods (COGS)</span>
              <p className="text-2xl font-black text-rose-700 mt-1">
                ₹{Number(analyticsData?.summary?.cogs || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Batch acquisition cost of sold items</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gross Profit Margin</span>
              <p className="text-2xl font-black text-emerald-700 mt-1">
                {Number(analyticsData?.summary?.grossMarginPercent || 0).toFixed(1)}%
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Gross Profit: ₹{Number(analyticsData?.summary?.grossProfit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Time Series Sales Trend Bar Meter */}
          {analyticsData?.trend && analyticsData.trend.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Sales &amp; Revenue Trend</h3>
                  <p className="text-[11px] text-slate-500">Chronological distribution across selected timeframe</p>
                </div>
                <span className="text-xs font-bold text-teal-700">
                  Total: ₹{Number(analyticsData.summary.grossSales).toLocaleString("en-IN")}
                </span>
              </div>

              {/* Responsive Bar Grid */}
              <div className="flex items-end gap-2 h-44 pt-4 pb-2 overflow-x-auto">
                {analyticsData.trend.map((pt: any, idx: number) => {
                  const maxRev = Math.max(...analyticsData.trend.map((t: any) => t.revenue), 1);
                  const barHeightPercent = Math.max(8, Math.min(100, Math.round((pt.revenue / maxRev) * 100)));
                  return (
                    <div key={idx} className="flex-1 min-w-[36px] flex flex-col items-center gap-1 group h-full justify-end">
                      <div className="text-[9px] font-mono font-bold text-slate-600 opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                        ₹{pt.revenue.toFixed(0)}
                      </div>
                      <div
                        style={{ height: `${barHeightPercent}%` }}
                        className="w-full rounded-t-md bg-teal-500 group-hover:bg-teal-600 transition shadow-2xs relative"
                        title={`${pt.label}: ₹${pt.revenue} (${pt.count} bills)`}
                      />
                      <span className="text-[9px] text-slate-500 font-semibold truncate max-w-[40px] text-center">
                        {pt.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dual Tables: Top 10 Revenue Medicines & Payment Mode Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Top 10 Revenue Medicines (7 Cols) */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Top 10 Revenue-Generating Medicines</h3>
                  <p className="text-[11px] text-slate-500">Highest gross sales value contributors</p>
                </div>
                <ShoppingBag className="h-4 w-4 text-slate-400" />
              </div>

              <div className="overflow-x-auto text-xs">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-slate-400 font-bold uppercase text-[9px] border-b border-slate-100">
                      <th className="py-2">#</th>
                      <th className="py-2">Medicine</th>
                      <th className="py-2">Company</th>
                      <th className="py-2 text-right">Units</th>
                      <th className="py-2 text-right">Revenue (₹)</th>
                      <th className="py-2 text-right">Share %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {analyticsData?.topRevenueMedicines?.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400">
                          No product sales records in this timeframe.
                        </td>
                      </tr>
                    ) : (
                      analyticsData?.topRevenueMedicines?.map((m: any) => (
                        <tr key={m.id} className="hover:bg-slate-50/70">
                          <td className="py-2 text-slate-400 font-bold">{m.rank}</td>
                          <td className="py-2 font-bold text-slate-900">{m.name}</td>
                          <td className="py-2 text-slate-500 text-[11px]">{m.company}</td>
                          <td className="py-2 text-right font-mono">{m.unitsSold}</td>
                          <td className="py-2 text-right font-mono font-bold text-teal-800">
                            ₹{m.totalRevenue.toFixed(2)}
                          </td>
                          <td className="py-2 text-right text-slate-500">{m.revenueSharePercent}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Mode Breakdown (5 Cols) */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Payment Mode Breakdown</h3>
                  <p className="text-[11px] text-slate-500">Counter collection channels</p>
                </div>
                <PieChart className="h-4 w-4 text-slate-400" />
              </div>

              <div className="space-y-3 pt-1 text-xs">
                {analyticsData?.paymentBreakdown?.map((p: any) => (
                  <div key={p.mode} className="space-y-1">
                    <div className="flex justify-between font-semibold">
                      <span className="text-slate-700">{p.mode}</span>
                      <span className="font-mono font-bold text-slate-900">
                        ₹{p.amount.toFixed(2)} ({p.sharePercent}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        style={{ width: `${Math.min(100, p.sharePercent)}%` }}
                        className={`h-full rounded-full ${
                          p.mode === "CASH"
                            ? "bg-emerald-500"
                            : p.mode === "UPI"
                            ? "bg-teal-500"
                            : p.mode === "CARD"
                            ? "bg-indigo-500"
                            : "bg-amber-500"
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: PROFIT & LOSS ENGINE (2.15.2)                      */}
      {/* ========================================================= */}
      {activeTab === "pnl" && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="font-black text-slate-900 text-lg tracking-tight">
                  Retail Pharmacy Profit &amp; Loss Statement
                </h3>
                <p className="text-xs text-slate-500">
                  Accurate COGS margin and operational overhead netting
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                  pnlData?.statement?.status === "profitable"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {pnlData?.statement?.status === "profitable" ? "Profitable Business" : "Loss Incident"}
              </span>
            </div>

            {/* Accounting Waterfall Structure */}
            <div className="space-y-3 font-mono text-xs divide-y divide-slate-100">
              {/* Gross Turnover */}
              <div className="flex justify-between py-2 text-slate-800 font-bold">
                <span>1. GROSS POS REVENUE</span>
                <span className="text-sm">
                  ₹{Number(pnlData?.statement?.grossSales || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Deductions: Returns */}
              <div className="flex justify-between py-2 text-rose-700 pl-4">
                <span>• Less: Customer Sales Returns &amp; Counter Refunds</span>
                <span>
                  -₹{Number(pnlData?.statement?.totalRefunds || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Net Sales */}
              <div className="flex justify-between py-2.5 text-teal-900 font-black bg-teal-50/50 px-2 rounded-lg">
                <span>2. NET REALIZED REVENUE (A)</span>
                <span className="text-sm">
                  ₹{Number(pnlData?.statement?.netTurnover || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* COGS */}
              <div className="flex justify-between py-2 text-rose-700 pl-4">
                <span>3. LESS: COST OF GOODS SOLD (COGS: Batch Purchase Cost) (B)</span>
                <span>
                  -₹{Number(pnlData?.statement?.cogs || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Gross Profit */}
              <div className="flex justify-between py-2.5 text-emerald-900 font-black bg-emerald-50/60 px-2 rounded-lg">
                <span>4. GROSS PROFIT [A - B]</span>
                <span className="text-base">
                  ₹{Number(pnlData?.statement?.grossProfit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })} (
                  {Number(pnlData?.statement?.grossMarginPercent || 0).toFixed(1)}%)
                </span>
              </div>

              {/* Operational Income */}
              <div className="flex justify-between py-2 text-emerald-700 pl-4">
                <span>• Add: Other Non-Sales Operational Incomes</span>
                <span>
                  +₹{Number(pnlData?.statement?.otherIncomes || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Operating Expenses Breakdown */}
              <div className="py-2 pl-4 space-y-1.5">
                <div className="flex justify-between text-rose-700 font-bold">
                  <span>5. LESS: OPERATING OVERHEAD EXPENSES</span>
                  <span>
                    -₹{Number(pnlData?.statement?.operatingExpenses || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {pnlData?.statement?.expenseCategoryBreakdown &&
                  Object.entries(pnlData.statement.expenseCategoryBreakdown).map(([cat, amt]) => (
                    <div key={cat} className="flex justify-between text-slate-500 pl-4 text-[11px]">
                      <span>- {cat}</span>
                      <span>₹{Number(amt).toFixed(2)}</span>
                    </div>
                  ))}
              </div>

              {/* Net Profit */}
              <div
                className={`flex justify-between py-4 px-3 rounded-xl font-black text-base border-t-2 ${
                  pnlData?.statement?.netProfit >= 0
                    ? "bg-emerald-100 text-emerald-950 border-emerald-400"
                    : "bg-rose-100 text-rose-950 border-rose-400"
                }`}
              >
                <span>NET OPERATING PROFIT / (LOSS)</span>
                <span>
                  ₹{Number(pnlData?.statement?.netProfit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })} (
                  {Number(pnlData?.statement?.netMarginPercent || 0).toFixed(1)}% Net Margin)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: DEAD STOCK & SLOW MOVING INVENTORY (2.15.3)        */}
      {/* ========================================================= */}
      {activeTab === "deadstock" && (
        <div className="space-y-6">
          {/* Threshold Selector & KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Blocked Capital</span>
              <p className="text-2xl font-black text-rose-700 mt-1">
                ₹{Number(deadStockData?.summary?.totalBlockedCapital || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Unsold purchase investment at risk</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Stagnant Batches</span>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {deadStockData?.summary?.totalDeadBatches || 0}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Batches with zero sales</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">High Expiry Risk</span>
              <p className="text-2xl font-black text-amber-700 mt-1">
                {deadStockData?.summary?.highExpiryRiskCount || 0}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Expiring within 90 days</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Aging Threshold</span>
              <div className="flex gap-1 mt-2">
                {[60, 90, 180, 365].map((days) => (
                  <button
                    key={days}
                    onClick={() => setDeadStockThreshold(days)}
                    className={`px-2 py-1 rounded text-xs font-bold transition ${
                      deadStockThreshold === days
                        ? "bg-teal-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {days}D
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex items-center justify-between gap-3 text-xs">
            <div className="relative min-w-[260px]">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search medicine, company, batch..."
                value={deadStockSearch}
                onChange={(e) => setDeadStockSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:border-teal-500"
              />
            </div>

            <button
              onClick={fetchDeadStock}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition"
            >
              <RefreshCw className={`h-3 w-3 ${deadStockLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Medicine</th>
                    <th className="py-3 px-3">Manufacturer</th>
                    <th className="py-3 px-3">Rack</th>
                    <th className="py-3 px-3">Batch #</th>
                    <th className="py-3 px-3 text-right">Stock Qty</th>
                    <th className="py-3 px-3 text-right">Cost (₹)</th>
                    <th className="py-3 px-3 text-right">Blocked Capital</th>
                    <th className="py-3 px-3">Expiry Date</th>
                    <th className="py-3 px-4 text-center">Aging Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {deadStockLoading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-teal-600" />
                        Scanning unsold inventory...
                      </td>
                    </tr>
                  ) : deadStockData?.records?.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                        Great news! No dead stock found beyond {deadStockThreshold} days.
                      </td>
                    </tr>
                  ) : (
                    deadStockData?.records?.map((b: any) => (
                      <tr key={b.batchId} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 px-4 font-bold text-slate-900">{b.name}</td>
                        <td className="py-2.5 px-3 text-slate-600">{b.company}</td>
                        <td className="py-2.5 px-3 text-slate-500">{b.rackLocation}</td>
                        <td className="py-2.5 px-3 font-mono font-bold">{b.batchNumber}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">{b.stockQuantity}</td>
                        <td className="py-2.5 px-3 text-right font-mono">₹{b.purchasePrice.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700">
                          ₹{b.blockedCapital.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {new Date(b.expiryDate).toLocaleDateString("en-IN")}
                          {b.isHighExpiryRisk && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800">
                              Expiring Soon
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              b.daysSinceLastSale >= 180
                                ? "bg-rose-100 text-rose-800"
                                : b.daysSinceLastSale >= 90
                                ? "bg-amber-100 text-amber-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {b.agingCategory}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: SCHEDULE H / H1 / X COMPLIANCE REGISTER (2.14.1)  */}
      {/* ========================================================= */}
      {activeTab === "schedule" && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Scheduled Transactions</span>
              <p className="text-2xl font-black text-slate-900 mt-1">{scheduleData?.summary?.totalRecords || 0}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Dispensed line items</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Units Dispensed</span>
              <p className="text-2xl font-black text-teal-700 mt-1">{scheduleData?.summary?.totalQuantity || 0}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Audit-tracked units</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Schedule H vs H1</span>
              <p className="text-2xl font-black text-indigo-700 mt-1">
                {scheduleData?.summary?.countScheduleH || 0} / {scheduleData?.summary?.countScheduleH1 || 0}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Schedule H / Schedule H1 units</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Prescribing Doctors</span>
              <p className="text-2xl font-black text-slate-800 mt-1">{scheduleData?.summary?.uniqueDoctorsCount || 0}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Verified medical practitioners</p>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative min-w-[240px]">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search patient, doctor, medicine, batch..."
                  value={scheduleSearch}
                  onChange={(e) => setScheduleSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:border-teal-500"
                />
              </div>

              <select
                value={scheduleTypeFilter}
                onChange={(e) => setScheduleTypeFilter(e.target.value)}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-semibold focus:outline-hidden"
              >
                <option value="all">All Scheduled Drugs (H, H1, X)</option>
                <option value="schedule_h">Schedule H Only</option>
                <option value="schedule_h1">Schedule H1 (High Risk / Antibiotics)</option>
                <option value="schedule_x">Schedule X (Narcotics)</option>
              </select>
            </div>

            <button
              onClick={fetchScheduleDrugs}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition"
            >
              <RefreshCw className={`h-3 w-3 ${scheduleLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {/* Official Audit Register Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-3">Invoice #</th>
                    <th className="py-3 px-3">Patient Name &amp; Address</th>
                    <th className="py-3 px-3">Prescribing Doctor &amp; Reg No</th>
                    <th className="py-3 px-3">Drug Name &amp; Salt</th>
                    <th className="py-3 px-3">Schedule</th>
                    <th className="py-3 px-3">Batch &amp; Exp</th>
                    <th className="py-3 px-3 text-right">Qty</th>
                    <th className="py-3 px-4">Pharmacist</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {scheduleLoading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-teal-600" />
                        Loading compliance drug audit records...
                      </td>
                    </tr>
                  ) : scheduleData?.records?.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                        No Schedule H/H1 records found for this period.
                      </td>
                    </tr>
                  ) : (
                    scheduleData?.records?.map((r: any) => (
                      <tr key={r.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                          {new Date(r.date).toLocaleDateString("en-IN")}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {r.invoiceNo}
                        </td>
                        <td className="py-2.5 px-3 max-w-[200px]">
                          <p className="font-bold text-slate-900 truncate">{r.patient.name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{r.patient.address}</p>
                        </td>
                        <td className="py-2.5 px-3 max-w-[180px]">
                          <p className="font-bold text-slate-900 truncate">{r.doctor.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">Reg: {r.doctor.regNo}</p>
                        </td>
                        <td className="py-2.5 px-3 max-w-[200px]">
                          <p className="font-bold text-slate-900 truncate">{r.medicine.name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{r.medicine.genericName}</p>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              r.medicine.scheduleType === "schedule_h1"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-indigo-100 text-indigo-800"
                            }`}
                          >
                            {r.medicine.scheduleType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px]">
                          {r.batch.batchNumber} (
                          {new Date(r.batch.expiryDate).toLocaleDateString("en-IN", {
                            month: "2-digit",
                            year: "2-digit",
                          })}
                          )
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{r.quantity}</td>
                        <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">{r.dispensedBy}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: GST TAX REPORTS (GSTR-1 & GSTR-3B) (2.14.2)        */}
      {/* ========================================================= */}
      {activeTab === "gst" && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Taxable Turnover</span>
              <p className="text-2xl font-black text-slate-900 mt-1">
                ₹{Number(gstData?.gstr1?.summary?.totalTaxableValue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Outward taxable base</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Output GST Collected</span>
              <p className="text-2xl font-black text-teal-700 mt-1">
                ₹{Number(gstData?.gstr1?.summary?.totalGst || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                CGST: ₹{Number(gstData?.gstr1?.summary?.totalCgst || 0).toFixed(2)} • SGST: ₹
                {Number(gstData?.gstr1?.summary?.totalSgst || 0).toFixed(2)}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Eligible Input Tax Credit (ITC)</span>
              <p className="text-2xl font-black text-indigo-700 mt-1">
                ₹{Number(gstData?.gstr3b?.eligibleITC?.totalCredit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                From {gstData?.gstr3b?.eligibleITC?.verifiedPOCount || 0} purchase orders
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Net GST Payable</span>
              <p className="text-2xl font-black text-rose-700 mt-1">
                ₹{Number(gstData?.gstr3b?.netTaxPayable?.totalPayable || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Output Liability minus ITC Credit</p>
            </div>
          </div>

          {/* GSTR-1 HSN Summary Table */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">GSTR-1 HSN-Wise Outward Supplies Summary</h3>
                <p className="text-[11px] text-slate-500">Government GST portal filing format</p>
              </div>
              <span className="text-xs font-bold text-slate-500">
                HSN Codes: {gstData?.gstr1?.hsnBreakdown?.length || 0}
              </span>
            </div>

            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-slate-400 font-bold uppercase text-[9px] border-b border-slate-100">
                    <th className="py-2.5 px-3">HSN Code</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Taxable Value (₹)</th>
                    <th className="py-2.5 px-3 text-right">CGST (₹)</th>
                    <th className="py-2.5 px-3 text-right">SGST (₹)</th>
                    <th className="py-2.5 px-3 text-right">Total Tax (₹)</th>
                    <th className="py-2.5 px-4 text-right">Total Invoice Value (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium font-mono text-[11px]">
                  {gstData?.gstr1?.hsnBreakdown?.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 font-sans">
                        No HSN transactions recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    gstData?.gstr1?.hsnBreakdown?.map((h: any) => (
                      <tr key={h.hsnCode} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-bold text-slate-900">{h.hsnCode}</td>
                        <td className="py-2 px-3 font-sans text-slate-600 max-w-[200px] truncate">{h.description}</td>
                        <td className="py-2 px-3 text-right text-slate-800">{h.totalQty}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">
                          ₹{h.taxableValue.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600">₹{h.cgstAmount.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-slate-600">₹{h.sgstAmount.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-bold text-teal-800">₹{h.totalTax.toFixed(2)}</td>
                        <td className="py-2 px-4 text-right font-bold text-slate-900">₹{h.totalValue.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================================================
          TAB 6: ADMIN SALES SUMMARY (MODULE 2.16.4 - ADMIN ONLY)
         ========================================================================== */}
      {activeTab === "sales_summary" && isAdmin && (
        <div className="space-y-6">
          {salesSummaryError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-xs font-semibold text-rose-700">
              {salesSummaryError}
            </div>
          )}

          {/* Top KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Net Revenue ({salesSummaryData?.summary?.invoicesCount ?? 0} bills)
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {salesSummaryLoading ? "..." : `₹${Number(salesSummaryData?.summary?.netRevenue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Gross: ₹{Number(salesSummaryData?.summary?.grossSales || 0).toFixed(2)} • Refunds: ₹{Number(salesSummaryData?.summary?.refunds || 0).toFixed(2)}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                MoM Growth %
              </div>
              <div
                className={`text-2xl font-black mt-1 ${
                  (salesSummaryData?.summary?.momGrowthPercent || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {salesSummaryLoading
                  ? "..."
                  : `${(salesSummaryData?.summary?.momGrowthPercent || 0) >= 0 ? "+" : ""}${Number(
                      salesSummaryData?.summary?.momGrowthPercent || 0
                    ).toFixed(2)}%`}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                This Month: ₹{Number(salesSummaryData?.summary?.currentMonthRevenue || 0).toFixed(0)} vs Prev: ₹
                {Number(salesSummaryData?.summary?.previousMonthRevenue || 0).toFixed(0)}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Daily Average ({salesSummaryData?.range?.daysCount ?? 1}d)
              </div>
              <div className="text-2xl font-black text-teal-700 mt-1">
                {salesSummaryLoading
                  ? "..."
                  : `₹${Number(salesSummaryData?.summary?.dailyAverage || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                GST Collected: ₹{Number(salesSummaryData?.summary?.gstAmount || 0).toFixed(2)}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                COGS Gross Profit ({Number(salesSummaryData?.summary?.grossMarginPercent || 0).toFixed(1)}%)
              </div>
              <div className="text-2xl font-black text-emerald-700 mt-1">
                {salesSummaryLoading
                  ? "..."
                  : `₹${Number(salesSummaryData?.summary?.grossProfit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                COGS: ₹{Number(salesSummaryData?.summary?.cogs || 0).toFixed(2)} • Net Profit: ₹
                {Number(salesSummaryData?.summary?.netProfit || 0).toFixed(2)}
              </div>
            </div>
          </div>

          {/* 12-Month Trend Bar Chart & Payment Method Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800">12-Month Net Revenue Trend</h3>
                  <p className="text-[11px] text-slate-400">Monthly net sales vs COGS gross profit over the trailing 12 months</p>
                </div>
                <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full">
                  Admin Exclusive
                </span>
              </div>

              {(() => {
                const months = salesSummaryData?.months || [];
                const maxM = Math.max(1, ...months.map((m: any) => Math.max(m.netRevenue, m.grossProfit)));
                return (
                  <div className="grid grid-cols-12 gap-1.5 items-end h-44 pt-4 border-b border-slate-100 pb-2">
                    {months.map((m: any) => {
                      const hRev = Math.max(4, Math.round((m.netRevenue / maxM) * 100));
                      const hProf = Math.max(2, Math.round((Math.max(0, m.grossProfit) / maxM) * 100));
                      return (
                        <div key={m.monthKey} className="flex flex-col items-center justify-end h-full group">
                          <div className="w-full flex items-end justify-center gap-0.5 flex-1">
                            <div
                              title={`${m.label}: Net Revenue ₹${Number(m.netRevenue).toFixed(2)}`}
                              style={{ height: `${hRev}%` }}
                              className="w-2.5 sm:w-3 rounded-t bg-teal-700 group-hover:bg-teal-900 transition-all"
                            />
                            <div
                              title={`${m.label}: COGS Profit ₹${Number(m.grossProfit).toFixed(2)}`}
                              style={{ height: `${hProf}%` }}
                              className="w-1.5 sm:w-2 rounded-t bg-emerald-400"
                            />
                          </div>
                          <span className="text-[9px] font-semibold text-slate-500 mt-1.5 truncate max-w-full">
                            {String(m.label).split(" ")[0]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Payment Method Breakdown */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="h-4 w-4 text-teal-700" />
                <h3 className="text-sm font-extrabold text-slate-800">Payment-Method Breakdown</h3>
              </div>

              <div className="space-y-3">
                {(salesSummaryData?.paymentMethods || []).length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center">No payments in selected period.</p>
                ) : (
                  (salesSummaryData?.paymentMethods || []).map((pm: any) => (
                    <div key={pm.method} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700">
                          {pm.label} ({pm.count})
                        </span>
                        <span className="font-extrabold text-slate-900">
                          ₹{Number(pm.amount || 0).toFixed(2)} ({Number(pm.percentage || 0).toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-teal-600"
                          style={{ width: `${Math.min(100, Math.max(4, pm.percentage))}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 12-Month Summary Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                12-Month Sales &amp; COGS Profit Summary Table
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-extrabold uppercase text-slate-500">
                    <th className="py-2.5 px-3">Month</th>
                    <th className="py-2.5 px-3 text-right">Bills</th>
                    <th className="py-2.5 px-3 text-right">Gross Sales</th>
                    <th className="py-2.5 px-3 text-right">Refunds</th>
                    <th className="py-2.5 px-3 text-right">Net Revenue</th>
                    <th className="py-2.5 px-3 text-right">GST</th>
                    <th className="py-2.5 px-3 text-right">Discounts</th>
                    <th className="py-2.5 px-3 text-right">COGS</th>
                    <th className="py-2.5 px-3 text-right">Gross Profit</th>
                    <th className="py-2.5 px-3 text-right">Net Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {(salesSummaryData?.months || []).map((m: any) => (
                    <tr key={m.monthKey} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-sans font-bold text-slate-800">{m.label}</td>
                      <td className="py-2 px-3 text-right">{m.salesCount}</td>
                      <td className="py-2 px-3 text-right">₹{Number(m.grossSales).toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-rose-600">₹{Number(m.refunds).toFixed(2)}</td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">₹{Number(m.netRevenue).toFixed(2)}</td>
                      <td className="py-2 px-3 text-right">₹{Number(m.gstAmount).toFixed(2)}</td>
                      <td className="py-2 px-3 text-right">₹{Number(m.discountAmount).toFixed(2)}</td>
                      <td className="py-2 px-3 text-right">₹{Number(m.cogs).toFixed(2)}</td>
                      <td className="py-2 px-3 text-right font-bold text-emerald-700">₹{Number(m.grossProfit).toFixed(2)}</td>
                      <td className={`py-2 px-3 text-right font-bold ${m.netProfit >= 0 ? "text-teal-700" : "text-rose-600"}`}>
                        ₹{Number(m.netProfit).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top 10 Medicines & Top 5 Customers */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70">
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  Top 10 Medicines (Selected Period)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-extrabold uppercase text-slate-500">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Medicine</th>
                      <th className="py-2 px-3 text-right">Net Units</th>
                      <th className="py-2 px-3 text-right">Net Revenue</th>
                      <th className="py-2 px-3 text-right">COGS Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(salesSummaryData?.topMedicines || []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          No medicines sold in selected date range.
                        </td>
                      </tr>
                    ) : (
                      (salesSummaryData?.topMedicines || []).map((m: any, idx: number) => (
                        <tr key={m.medicineId} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold text-slate-500">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-slate-800">{m.name}</div>
                            <div className="text-[10px] text-slate-400">{m.company}</div>
                          </td>
                          <td className="py-2 px-3 text-right font-semibold">{m.netUnitsSold}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">₹{Number(m.netRevenue).toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-bold text-emerald-700">₹{Number(m.profit).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-teal-700" />
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  Top 5 Customers (Selected Period)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-extrabold uppercase text-slate-500">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Customer</th>
                      <th className="py-2 px-3 text-right">Orders</th>
                      <th className="py-2 px-3 text-right">Net Spend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(salesSummaryData?.topCustomers || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400">
                          No registered customer purchases in selected range.
                        </td>
                      </tr>
                    ) : (
                      (salesSummaryData?.topCustomers || []).map((c: any, idx: number) => (
                        <tr key={c.customerId} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold text-slate-500">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-slate-800">{c.name}</div>
                            <div className="text-[10px] text-slate-400">{c.phone}</div>
                          </td>
                          <td className="py-2 px-3 text-right font-semibold">{c.ordersCount}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">₹{Number(c.netSpend).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
