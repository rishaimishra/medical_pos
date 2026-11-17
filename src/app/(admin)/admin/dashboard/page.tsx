"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock,
  IndianRupee,
  Layers,
  Package,
  PackageX,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useBranchStore } from "@/stores/useBranchStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { toLocalYMD } from "@/lib/csv";

interface RevenueBlock {
  grossSales: number;
  refunds: number;
  netRevenue: number;
  invoicesCount: number;
  cogs: number;
  grossProfit: number;
  expenses?: number;
  otherIncome?: number;
  netProfit?: number;
}

interface DashboardPayload {
  success: boolean;
  greeting: string;
  userName?: string;
  revenueSummary: {
    today: RevenueBlock;
    month: RevenueBlock;
    allTime: RevenueBlock;
  };
  poStatusCounts: {
    draft: number;
    pending: number;
    price_updated: number;
    confirmed: number;
    shipped: number;
    received: number;
    cancelled: number;
    total: number;
  };
  sevenDayChart: Array<{
    date: string;
    label: string;
    grossSales: number;
    refunds: number;
    netRevenue: number;
    cogs: number;
    grossProfit: number;
    invoicesCount: number;
  }>;
  sixMonthExpenseVsProfit: Array<{
    monthKey: string;
    label: string;
    expenses: number;
    grossProfit: number;
    netProfit: number;
  }>;
  topMedicines30d: Array<{
    medicineId: number;
    name: string;
    company: string;
    category: string;
    unitsSold: number;
    netRevenue: number;
  }>;
  recentSales: Array<{
    id: number;
    invoiceNo: string;
    saleDate: string;
    createdAt: string;
    grandTotal: number;
    paymentMethod: string;
    customerName: string;
    customerPhone: string;
    branchCode: string;
    branchName: string;
    itemsCount: number;
  }>;
  overview: {
    totalMedicines: number;
    totalStockUnits: number;
    soldUnits30d: number;
    outOfStockCount: number;
    lowStockCount: number;
    expiredCount: number;
    expiringSoonCount: number;
    pendingReturnCount: number;
    totalCustomers: number;
    inventoryCostValue: number;
    lowQtyThreshold: number;
  };
}

function formatINR(val: number): string {
  return `₹${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getClientGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

export default function AdminDashboardPage() {
  const { activeBranch } = useBranchStore();
  const { user } = useAuthStore();

  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dismissible Alert Banners persisted per day in sessionStorage (Module 2.16.2)
  const todayKey = useMemo(() => toLocalYMD(new Date()), []);
  const [dismissExpiry, setDismissExpiry] = useState(false);
  const [dismissStock, setDismissStock] = useState(false);

  useEffect(() => {
    try {
      setDismissExpiry(sessionStorage.getItem(`dash_dismiss_expiry_${todayKey}`) === "1");
      setDismissStock(sessionStorage.getItem(`dash_dismiss_stock_${todayKey}`) === "1");
    } catch {
      // Ignore SSR/storage unavailable
    }
  }, [todayKey]);

  const handleDismissExpiry = () => {
    setDismissExpiry(true);
    try {
      sessionStorage.setItem(`dash_dismiss_expiry_${todayKey}`, "1");
    } catch {
      // Ignore
    }
  };

  const handleDismissStock = () => {
    setDismissStock(true);
    try {
      sessionStorage.setItem(`dash_dismiss_stock_${todayKey}`, "1");
    } catch {
      // Ignore
    }
  };

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const branchIdParam = activeBranch?.id ? String(activeBranch.id) : "all";
      const res = await fetch(`/api/admin/dashboard?branchId=${branchIdParam}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || "Failed to load dashboard data");
      } else {
        setData(json);
      }
    } catch (err: any) {
      setError(err?.message || "Network error loading dashboard");
    } finally {
      setLoading(false);
    }
  }, [activeBranch?.id]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const greetingText = getClientGreeting() || data?.greeting || "Good Day";
  const displayName = user?.name || data?.userName || user?.username || "Team";

  const ov = data?.overview;
  const rev = data?.revenueSummary;
  const po = data?.poStatusCounts;
  const sevenDay = data?.sevenDayChart || [];
  const sixMonth = data?.sixMonthExpenseVsProfit || [];
  const topMeds = data?.topMedicines30d || [];
  const recentSales = data?.recentSales || [];

  const maxSevenDayRev = Math.max(1, ...sevenDay.map((d) => Math.max(d.netRevenue, d.grossProfit)));
  const maxTopMedRev = Math.max(1, ...topMeds.map((m) => m.netRevenue));

  // Build SVG coordinates for 6-month Expense vs COGS Profit chart
  const chartSvg = useMemo(() => {
    if (sixMonth.length === 0) return null;
    const width = 460;
    const height = 190;
    const padX = 28;
    const padY = 20;
    const usableW = width - padX * 2;
    const usableH = height - padY * 2;
    const maxVal = Math.max(
      100,
      ...sixMonth.flatMap((m) => [Math.max(0, m.grossProfit), m.expenses])
    );

    const stepX = sixMonth.length > 1 ? usableW / (sixMonth.length - 1) : 0;
    const toPoint = (idx: number, val: number) => {
      const clamped = Math.max(0, val);
      const x = padX + idx * stepX;
      const y = height - padY - (clamped / maxVal) * usableH;
      return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
    };

    const profitPts = sixMonth.map((m, i) => toPoint(i, m.grossProfit));
    const expensePts = sixMonth.map((m, i) => toPoint(i, m.expenses));

    const profitLine = profitPts.map((p) => `${p.x},${p.y}`).join(" ");
    const expenseLine = expensePts.map((p) => `${p.x},${p.y}`).join(" ");

    const profitArea = `${profitLine} ${profitPts[profitPts.length - 1].x},${height - padY} ${profitPts[0].x},${height - padY}`;
    const expenseArea = `${expenseLine} ${expensePts[expensePts.length - 1].x},${height - padY} ${expensePts[0].x},${height - padY}`;

    return { width, height, padY, profitPts, expensePts, profitLine, expenseLine, profitArea, expenseArea };
  }, [sixMonth]);

  const showExpiryBanner =
    !dismissExpiry && ov && (ov.expiredCount > 0 || ov.expiringSoonCount > 0);
  const showStockBanner =
    !dismissStock && ov && (ov.outOfStockCount > 0 || ov.lowStockCount > 0);

  return (
    <div className="space-y-5 font-sans select-text pb-8">
      {/* 1. Time-Based Greeting & Live Branch Bar (2.16.1) */}
      <section className="bg-gradient-to-r from-[#1F4E5B] to-[#163A44] text-white rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-200 text-xs font-bold uppercase tracking-wider mb-1">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {new Date().toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <span>•</span>
            <span>{activeBranch ? `${activeBranch.name} (${activeBranch.code})` : "All Branches"}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            {greetingText}, {displayName}!
          </h2>
          <p className="text-xs text-white/80 mt-0.5">
            Real-time pharmacy net revenue (sales minus processed refunds) & COGS profitability overview.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchDashboard}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Link
            href="/admin/pos"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-900 text-xs font-extrabold transition shadow-xs"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Open POS
          </Link>
          <Link
            href="/admin/reports"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-[#1F4E5B] hover:bg-slate-100 text-xs font-extrabold transition shadow-xs"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Reports
          </Link>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs font-semibold text-rose-700 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={fetchDashboard} className="underline font-bold cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {/* 2. Dismissible Alert Banners (2.16.2) */}
      {(showExpiryBanner || showStockBanner) && (
        <div className="space-y-2.5">
          {showExpiryBanner && ov && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-extrabold text-rose-900">
                    Expiry Risk Alert:{" "}
                    {ov.expiredCount > 0 ? `${ov.expiredCount} expired batch(es)` : ""}
                    {ov.expiredCount > 0 && ov.expiringSoonCount > 0 ? " and " : ""}
                    {ov.expiringSoonCount > 0 ? `${ov.expiringSoonCount} batch(es) expiring within 30 days` : ""}
                  </p>
                  <p className="text-[11px] text-rose-700 mt-0.5">
                    Review FEFO batches immediately to avoid expired stock dispensing and process supplier returns.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={ov.expiredCount > 0 ? "/admin/batches?tier=expired" : "/admin/batches?tier=critical_30"}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition"
                >
                  Inspect Batches
                </Link>
                <button
                  type="button"
                  onClick={handleDismissExpiry}
                  title="Dismiss Expiry Banner"
                  className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {showStockBanner && ov && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <PackageX className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-extrabold text-amber-950">
                    Low / Out-of-Stock Alert: {ov.outOfStockCount} medicine(s) out of stock, {ov.lowStockCount} below threshold ({ov.lowQtyThreshold} units)
                  </p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Raise purchase orders to replenish fast-moving stock before stockouts impact counter billing.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/admin/batches?stock=low_stock"
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold transition"
                >
                  View Low Stock
                </Link>
                <button
                  type="button"
                  onClick={handleDismissStock}
                  title="Dismiss Stock Banner"
                  className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Net Revenue & COGS Profit Summary Cards (2.16.1 + 2.16.3) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today Net Revenue */}
        <div className="bg-white rounded-2xl border border-emerald-200/80 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Today Net Revenue
            </span>
            <span className="p-2 rounded-xl bg-[#DDF3E8] text-[#1F4E5B]">
              <IndianRupee className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-2">
            {loading && !data ? "..." : formatINR(rev?.today.netRevenue || 0)}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>{rev?.today.invoicesCount || 0} bills</span>
            <span className="font-bold text-emerald-700">
              COGS Profit: {formatINR(rev?.today.grossProfit || 0)}
            </span>
          </div>
        </div>

        {/* Month Net Revenue */}
        <div className="bg-white rounded-2xl border border-cyan-200/80 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              This Month Net Revenue
            </span>
            <span className="p-2 rounded-xl bg-cyan-50 text-cyan-700">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-2">
            {loading && !data ? "..." : formatINR(rev?.month.netRevenue || 0)}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>Gross Profit: {formatINR(rev?.month.grossProfit || 0)}</span>
            <span className={`font-bold ${(rev?.month.netProfit || 0) >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
              Net: {formatINR(rev?.month.netProfit || 0)}
            </span>
          </div>
        </div>

        {/* All-Time Total Net Revenue */}
        <div className="bg-white rounded-2xl border border-indigo-200/80 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Net Revenue
            </span>
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
              <BarChart3 className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-2">
            {loading && !data ? "..." : formatINR(rev?.allTime.netRevenue || 0)}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>{rev?.allTime.invoicesCount || 0} total bills</span>
            <span className="font-bold text-indigo-700">
              COGS Profit: {formatINR(rev?.allTime.grossProfit || 0)}
            </span>
          </div>
        </div>

        {/* Inventory Cost Valuation */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Inventory Value (Cost)
            </span>
            <span className="p-2 rounded-xl bg-slate-100 text-[#1F4E5B]">
              <Layers className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-2">
            {loading && !data ? "..." : formatINR(ov?.inventoryCostValue || 0)}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>{(ov?.totalStockUnits || 0).toLocaleString()} active units</span>
            <span className="font-bold text-slate-700">
              30d Sold: {ov?.soldUnits30d || 0}
            </span>
          </div>
        </div>
      </section>

      {/* 4. Over View KPIs + PO Status Strip (2.16.1) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white rounded-2xl p-5 shadow-xs">
          <h2 className="text-sm font-extrabold text-slate-800 mb-3.5">Store Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="rounded-xl border border-emerald-200/70 bg-white p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#DDF3E8] text-[#1F4E5B] flex items-center justify-center shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <p className="text-lg font-extrabold text-slate-900 leading-tight">
                  {ov?.totalMedicines ?? 0}
                </p>
                <span className="text-[11px] font-semibold text-slate-500">Medicines</span>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200/70 bg-white p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#DDF3E8] text-[#1F4E5B] flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <p className="text-lg font-extrabold text-slate-900 leading-tight">
                  {ov?.totalStockUnits ?? 0}
                </p>
                <span className="text-[11px] font-semibold text-slate-500">Stock Units</span>
              </div>
            </div>

            <div className="rounded-xl border border-[#E2A99E] bg-[#FDF8F6] p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#F5DDD6] text-rose-800 flex items-center justify-center shrink-0">
                <PackageX className="w-5 h-5" />
              </div>
              <div>
                <p className="text-lg font-extrabold text-slate-900 leading-tight">
                  {ov?.outOfStockCount ?? 0}
                </p>
                <span className="text-[11px] font-semibold text-slate-500">Out of Stock</span>
              </div>
            </div>

            <div className="rounded-xl border border-cyan-200/70 bg-white p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-50 text-[#1F4E5B] flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-lg font-extrabold text-slate-900 leading-tight">
                  {ov?.totalCustomers ?? 0}
                </p>
                <span className="text-[11px] font-semibold text-slate-500">Customers</span>
              </div>
            </div>
          </div>
        </div>

        {/* PO Counts by Status */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[#1F4E5B]" />
              <h2 className="text-sm font-extrabold text-slate-800">Purchase Orders by Status</h2>
            </div>
            <Link
              href="/admin/purchases"
              className="text-[11px] font-bold text-[#1F4E5B] hover:underline inline-flex items-center gap-0.5"
            >
              Manage POs <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-3 gap-2">
            {[
              { label: "Pending", value: po?.pending ?? 0, tone: "bg-amber-50 text-amber-800 border-amber-200" },
              { label: "Price Upd.", value: po?.price_updated ?? 0, tone: "bg-purple-50 text-purple-800 border-purple-200" },
              { label: "Confirmed", value: po?.confirmed ?? 0, tone: "bg-blue-50 text-blue-800 border-blue-200" },
              { label: "Shipped", value: po?.shipped ?? 0, tone: "bg-cyan-50 text-cyan-800 border-cyan-200" },
              { label: "Received", value: po?.received ?? 0, tone: "bg-emerald-50 text-emerald-800 border-emerald-200" },
              { label: "Cancelled", value: po?.cancelled ?? 0, tone: "bg-rose-50 text-rose-700 border-rose-200" },
            ].map((item) => (
              <div key={item.label} className={`rounded-xl border px-2.5 py-2 text-center ${item.tone}`}>
                <p className="text-base font-extrabold leading-tight">{item.value}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Charts Row: 7-Day Net Revenue & 6-Month Expenses vs COGS Profit */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* 7-Day Net Revenue Chart */}
        <div className="lg:col-span-6 bg-white rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">Last 7 Days Net Revenue</h3>
              <p className="text-[11px] text-slate-400">Daily net sales (after processed refunds) vs COGS profit</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-bold">
              <span className="inline-flex items-center gap-1.5 text-[#1F4E5B]">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#1F4E5B]" /> Net Rev
              </span>
              <span className="inline-flex items-center gap-1.5 text-emerald-600">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-400" /> Profit
              </span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 items-end h-48 pt-4 border-b border-slate-100 pb-2">
            {sevenDay.map((d) => {
              const revPct = Math.max(4, Math.round((d.netRevenue / maxSevenDayRev) * 100));
              const profPct = Math.max(2, Math.round((Math.max(0, d.grossProfit) / maxSevenDayRev) * 100));
              return (
                <div key={d.date} className="flex flex-col items-center justify-end h-full group">
                  <div className="text-[9px] font-bold text-slate-500 mb-1 opacity-80 group-hover:opacity-100 text-center">
                    ₹{d.netRevenue >= 1000 ? `${(d.netRevenue / 1000).toFixed(1)}k` : Math.round(d.netRevenue)}
                  </div>
                  <div className="w-full max-w-[36px] flex items-end justify-center gap-1 flex-1">
                    <div
                      title={`${d.label}: Net Revenue ${formatINR(d.netRevenue)} (${d.invoicesCount} bills)`}
                      style={{ height: `${revPct}%` }}
                      className="w-3 sm:w-4 rounded-t-md bg-[#1F4E5B] transition-all group-hover:bg-[#163A44]"
                    />
                    <div
                      title={`${d.label}: COGS Profit ${formatINR(d.grossProfit)}`}
                      style={{ height: `${profPct}%` }}
                      className="w-2 sm:w-2.5 rounded-t-md bg-emerald-400 transition-all"
                    />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500 mt-2 truncate max-w-full">
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 6-Month Expenses vs COGS Profit */}
        <div className="lg:col-span-6 bg-white rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">6-Month COGS Profit vs Expenses</h3>
              <p className="text-[11px] text-slate-400">Monthly Gross Profit (COGS-based) against Operating Expenses</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-bold">
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3A8E62]" /> Gross Profit
              </span>
              <span className="inline-flex items-center gap-1.5 text-amber-700">
                <span className="w-2.5 h-2.5 rounded-full bg-[#D99B26]" /> Expenses
              </span>
            </div>
          </div>

          {chartSvg ? (
            <div className="relative flex-1 min-h-[180px] flex flex-col justify-end">
              <svg
                viewBox={`0 0 ${chartSvg.width} ${chartSvg.height}`}
                className="w-full h-44 overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="dashProfitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#86EFAC" stopOpacity="0.65" />
                    <stop offset="100%" stopColor="#86EFAC" stopOpacity="0.05" />
                  </linearGradient>
                  <linearGradient id="dashExpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FCD34D" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#FCD34D" stopOpacity="0.05" />
                  </linearGradient>
                </defs>
                <polygon points={chartSvg.profitArea} fill="url(#dashProfitGrad)" />
                <polygon points={chartSvg.expenseArea} fill="url(#dashExpGrad)" />
                <polyline fill="none" stroke="#3A8E62" strokeWidth="2.5" points={chartSvg.profitLine} />
                <polyline fill="none" stroke="#D99B26" strokeWidth="2.5" points={chartSvg.expenseLine} />
                {chartSvg.profitPts.map((pt, idx) => (
                  <circle key={`p_${idx}`} cx={pt.x} cy={pt.y} r="3.5" fill="#3A8E62" />
                ))}
                {chartSvg.expensePts.map((pt, idx) => (
                  <circle key={`e_${idx}`} cx={pt.x} cy={pt.y} r="3.5" fill="#D99B26" />
                ))}
              </svg>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 px-3 pt-1">
                {sixMonth.map((m) => (
                  <span key={m.monthKey}>{m.label}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-44 flex items-center justify-center text-xs text-slate-400">
              No monthly chart data yet.
            </div>
          )}
        </div>
      </section>

      {/* 6. Bottom Lists: Top 5 Medicines (30d) + Recent 8 Sales (2.16.1) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Top 5 Medicines (Last 30 Days) */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">Top 5 Medicines (30 Days)</h3>
              <p className="text-[11px] text-slate-400">Ranked by net sales revenue</p>
            </div>
            <Link
              href="/admin/reports"
              className="text-[11px] font-bold text-[#1F4E5B] hover:underline inline-flex items-center gap-0.5"
            >
              Full List <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          {topMeds.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No medicine sales recorded in the last 30 days.
            </div>
          ) : (
            <div className="space-y-3.5">
              {topMeds.map((med, idx) => {
                const widthPct = Math.max(8, Math.round((med.netRevenue / maxTopMedRev) * 100));
                return (
                  <div key={med.medicineId} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-[#EAF2F4] text-[#1F4E5B] text-[10px] font-extrabold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-slate-800 truncate">{med.name}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">({med.unitsSold} u)</span>
                      </div>
                      <span className="font-extrabold text-slate-900 shrink-0">
                        {formatINR(med.netRevenue)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#1F4E5B]"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent 8 Sales */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-5 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">Recent 8 Sales</h3>
              <p className="text-[11px] text-slate-400">Latest counter invoices generated</p>
            </div>
            <Link
              href="/admin/sales"
              className="text-[11px] font-bold text-[#1F4E5B] hover:underline inline-flex items-center gap-0.5"
            >
              All Invoices <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          {recentSales.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No invoices recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    <th className="py-2 pr-3">Invoice</th>
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 pr-3">Method</th>
                    <th className="py-2 pr-3 text-right">Items</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {recentSales.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 pr-3">
                        <Link
                          href={`/admin/sales?search=${encodeURIComponent(s.invoiceNo)}`}
                          className="font-extrabold text-[#1F4E5B] hover:underline"
                        >
                          {s.invoiceNo}
                        </Link>
                        <div className="text-[10px] text-slate-400">
                          {new Date(s.createdAt).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="font-semibold text-slate-800">{s.customerName}</span>
                        {s.branchCode && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold">
                            {s.branchCode}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase">
                          {s.paymentMethod}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right font-semibold text-slate-600">
                        {s.itemsCount}
                      </td>
                      <td className="py-2.5 text-right font-extrabold text-slate-900">
                        {formatINR(s.grandTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Pending Returns Quick Link Strip (2.16.2) */}
      {ov && ov.pendingReturnCount > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-700 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-amber-600" />
            <span>
              <strong>{ov.pendingReturnCount}</strong> pending sales return request(s) awaiting approval/refund.
            </span>
          </div>
          <Link
            href="/admin/returns"
            className="text-xs font-extrabold text-[#1F4E5B] hover:underline"
          >
            Process Returns →
          </Link>
        </div>
      )}
    </div>
  );
}
