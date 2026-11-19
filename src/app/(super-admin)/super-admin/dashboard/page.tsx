"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Building2,
  CheckCircle2,
  CreditCard,
  Flame,
  GitBranch,
  IndianRupee,
  Layers,
  Loader2,
  Megaphone,
  Receipt,
  RefreshCw,
  Settings,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "@/stores/useToastStore";

const QUICK_PANELS = [
  { title: "Stores Directory", href: "/super-admin/stores", icon: Building2 },
  { title: "Branches Explorer", href: "/super-admin/branches", icon: GitBranch },
  { title: "Global Users & Roles", href: "/super-admin/users", icon: Users },
  { title: "Plans & Razorpay Sync", href: "/super-admin/plans", icon: Layers },
  { title: "Platform Broadcasts", href: "/super-admin/announcements", icon: Megaphone },
  { title: "Store Subscriptions", href: "/super-admin/subscriptions", icon: CreditCard },
  { title: "Payments & Invoices", href: "/super-admin/payments", icon: Receipt },
  { title: "CEO BI Reports", href: "/super-admin/reports", icon: BarChart3 },
  { title: "Platform Settings", href: "/super-admin/settings", icon: Settings },
];

function formatInr(val: number): string {
  return `₹${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export default function SuperAdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [dash, setDash] = useState<any>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/dashboard", { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setDash(json);
      } else {
        toast.error(json.message || "Failed to load executive KPIs");
      }
    } catch {
      toast.error("Failed to connect to executive telemetry API");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const fk = dash?.financialKpis;
  const op = dash?.operationalPulse;
  const feeds = dash?.feeds;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Executive Header Banner */}
      <div className="bg-gradient-to-r from-[#0F172A] to-[#134E4A] text-white rounded-2xl p-6 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-teal-300">
            SaaS Platform CEO Command Tower
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight mt-1">
            Real-Time MRR, Retail GMV &amp; Growth Intelligence
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            Unified subscription telemetry, upsell capacity leads, churn alerts &amp; Razorpay gateway health across all pharmacy tenants.
          </p>
        </div>

        <button
          type="button"
          onClick={loadDashboard}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Telemetry
        </button>
      </div>

      {loading && !dash ? (
        <div className="bg-white border border-slate-200 rounded-2xl py-20 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-7 h-7 animate-spin text-teal-700 mb-2" />
          <p className="text-xs font-semibold">Aggregating real-time SaaS &amp; retail metrics...</p>
        </div>
      ) : (
        <>
          {/* 3.8.1 Core SaaS Financial KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Monthly Recurring Revenue (MRR)</span>
                <TrendingUp className="w-4 h-4 text-teal-700" />
              </div>
              <div className="text-2xl font-extrabold text-slate-900">{formatInr(fk?.mrr || 0)}</div>
              <div className="text-[11px] text-slate-500">
                ARR: <strong className="text-teal-700">{formatInr(fk?.arr || 0)}</strong> • ARPU:{" "}
                <strong>{formatInr(fk?.arpu || 0)}</strong>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Net SaaS Revenue (MTD)</span>
                <IndianRupee className="w-4 h-4 text-emerald-700" />
              </div>
              <div className="text-2xl font-extrabold text-emerald-700">
                {formatInr(fk?.mtdCollected?.total || 0)}
              </div>
              <div className="text-[11px] text-slate-500">
                All-Time: <strong>{formatInr(fk?.allTimeCollected?.total || 0)}</strong> (Taxable{" "}
                {formatInr(fk?.allTimeCollected?.preGst || 0)} + GST {formatInr(fk?.allTimeCollected?.gst || 0)})
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Store Cohorts ({fk?.totalStores || 0} Total)</span>
                <Building2 className="w-4 h-4 text-indigo-700" />
              </div>
              <div className="text-2xl font-extrabold text-slate-900">
                {fk?.activePaidStores || 0}{" "}
                <span className="text-xs font-semibold text-slate-500">Paid</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Trialing: <strong className="text-indigo-700">{fk?.trialingStores || 0}</strong> • Grace:{" "}
                <strong className="text-amber-700">{fk?.pastDueGraceStores || 0}</strong> • Churned:{" "}
                <strong className="text-rose-700">{fk?.churnedStores || 0}</strong>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Conversion &amp; Logo Churn</span>
                <ShieldCheck className="w-4 h-4 text-teal-700" />
              </div>
              <div className="text-2xl font-extrabold text-slate-900">
                {fk?.trialToPaidConversionPct ?? 0}%{" "}
                <span className="text-xs font-semibold text-slate-500">Trial-to-Paid</span>
              </div>
              <div className="text-[11px] text-slate-500">
                30d Logo Churn Rate:{" "}
                <strong className={fk?.monthlyChurnRatePct > 5 ? "text-rose-600" : "text-emerald-700"}>
                  {fk?.monthlyChurnRatePct ?? 0}%
                </strong>
              </div>
            </div>
          </div>

          {/* 3.8.2 Platform Retail GMV & Razorpay Health Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <div className="text-xs font-bold text-slate-500">Platform Retail GMV (Today)</div>
              <div className="text-xl font-extrabold text-slate-900 mt-1">{formatInr(op?.gmvToday || 0)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{op?.invoicesToday || 0} retail bills today</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <div className="text-xs font-bold text-slate-500">30-Day Retail GMV</div>
              <div className="text-xl font-extrabold text-teal-700 mt-1">{formatInr(op?.gmv30d || 0)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                All-Time GMV: <strong>{formatInr(op?.gmvAllTime || 0)}</strong>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <div className="text-xs font-bold text-slate-500">Platform Volume Telemetry</div>
              <div className="text-xl font-extrabold text-slate-900 mt-1">
                {(op?.totalRetailInvoices || 0).toLocaleString("en-IN")}{" "}
                <span className="text-xs font-semibold text-slate-500">Bills</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Digital Patient Rx Uploads: <strong>{op?.totalRxUploads || 0}</strong>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Razorpay &amp; Webhooks</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    op?.webhookHealth?.status === "healthy"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}
                >
                  {op?.webhookHealth?.status === "healthy" ? "Healthy" : "Needs Check"}
                </span>
              </div>
              <div className="text-xl font-extrabold text-slate-900 mt-1">
                {op?.paymentSuccessRatePct ?? 100}%{" "}
                <span className="text-xs font-semibold text-slate-500">30d Auth Rate</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Captured: <strong>{op?.pay30dSuccess || 0}</strong> • Failed:{" "}
                <strong>{op?.pay30dFailed || 0}</strong> • Errors: <strong>{op?.webhookHealth?.errorCount || 0}</strong>
              </div>
            </div>
          </div>

          {/* 3.8.3 Actionable CEO Intelligence Feeds */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Upsell Leads >= 80% */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-amber-500" />
                  Upsell Leads (&ge;80% Quota)
                </h2>
                <Link href="/super-admin/stores?filter=near_quota" className="text-[11px] font-bold text-teal-700 hover:underline">
                  View All
                </Link>
              </div>
              {!feeds?.upsellLeads?.length ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  No stores near plan capacity thresholds right now.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {feeds.upsellLeads.map((lead: any) => (
                    <Link
                      key={lead.storeId}
                      href={`/super-admin/stores/${lead.storeId}`}
                      className="block p-3 rounded-xl bg-amber-50/50 border border-amber-200/70 hover:bg-amber-50 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                        <span>{lead.storeName}</span>
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px]">
                          {lead.maxUsagePct}% max
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1">{lead.planName} • {lead.triggers.join(", ")}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* At-Risk / Churn Alerts */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  At-Risk / Churn Alerts
                </h2>
                <Link href="/super-admin/stores?filter=inactive_14d" className="text-[11px] font-bold text-teal-700 hover:underline">
                  Filter Stores
                </Link>
              </div>
              {!feeds?.atRiskAlerts?.length ? (
                <p className="text-xs text-emerald-700 py-6 text-center flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Zero churn/payment alerts!
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {feeds.atRiskAlerts.map((al: any, idx: number) => (
                    <Link
                      key={`${al.storeId}-${idx}`}
                      href={`/super-admin/stores/${al.storeId}`}
                      className={`block p-3 rounded-xl border transition-colors ${
                        al.severity === "urgent"
                          ? "bg-rose-50/60 border-rose-200 hover:bg-rose-50"
                          : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                        <span>{al.storeName}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            al.severity === "urgent" ? "bg-rose-100 text-rose-800" : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {al.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1">{al.reason}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Recent SaaS Payments & Registrations Feed */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-teal-700" />
                  Recent SaaS Activity
                </h2>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto text-xs">
                {(feeds?.recentPayments || []).map((p: any) => (
                  <Link
                    key={`pay-${p.id}`}
                    href={`/super-admin/stores/${p.storeId}`}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-slate-900 truncate">{p.storeName}</div>
                      <div className="text-[10px] text-slate-500">
                        {p.planName} • <span className="font-mono">{p.invoiceNo}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-extrabold text-teal-700">{formatInr(p.totalAmount)}</div>
                      <div className="text-[10px] uppercase font-bold text-slate-500">{p.status}</div>
                    </div>
                  </Link>
                ))}
                {(feeds?.recentStores || []).slice(0, 4).map((st: any) => (
                  <Link
                    key={`st-${st.id}`}
                    href={`/super-admin/stores/${st.id}`}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-teal-50/40 border border-teal-100 hover:bg-teal-50"
                  >
                    <div className="font-semibold text-slate-800 truncate">{st.storeName}</div>
                    <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold uppercase text-slate-700 shrink-0">
                      {st.storeStatus}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Control Tower Navigation Grid */}
          <div className="space-y-2.5">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              Control Tower Panels
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {QUICK_PANELS.map((panel) => {
                const Icon = panel.icon;
                return (
                  <Link
                    key={panel.href}
                    href={panel.href}
                    className="group bg-white border border-slate-200 hover:border-teal-600 rounded-xl p-3.5 shadow-2xs transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 group-hover:bg-teal-700 group-hover:text-white transition-colors">
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 truncate group-hover:text-teal-700">
                        {panel.title}
                      </span>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-700 shrink-0" />
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
