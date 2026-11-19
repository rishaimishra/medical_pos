"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarPlus,
  CreditCard,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "@/stores/useToastStore";
import { confirmAction } from "@/stores/useConfirmStore";

function formatInr(val: number): string {
  return `₹${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function SuperAdminSubscriptionsPage() {
  const [loading, setLoading] = useState(true);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Grant Plan Modal
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantStoreId, setGrantStoreId] = useState("");
  const [grantPlanId, setGrantPlanId] = useState("");
  const [grantDays, setGrantDays] = useState("");
  const [grantNotes, setGrantNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        status: statusFilter,
        billingMode: modeFilter,
        ...(search.trim() ? { search: search.trim() } : {}),
      });
      const res = await fetch(`/api/super-admin/subscriptions?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setSubscriptions(json.subscriptions || []);
        setPlans(json.plans || []);
        setStores(json.stores || []);
        setSummary(json.summary || null);
      } else {
        toast.error(json.message || "Failed to load store subscriptions");
      }
    } catch {
      toast.error("Network error loading store subscriptions");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, modeFilter, search]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const handleGrantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantStoreId || !grantPlanId) {
      toast.error("Select both a store and a subscription plan.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/super-admin/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grant_plan",
          storeId: Number(grantStoreId),
          planId: Number(grantPlanId),
          periodDays: grantDays ? Number(grantDays) : undefined,
          notes: grantNotes,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(json.message || "Plan assigned!");
        setGrantOpen(false);
        setGrantNotes("");
        setGrantDays("");
        fetchSubscriptions();
      } else {
        toast.error(json.message || "Failed to assign plan");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleExtend = async (sub: any, days = 7) => {
    const res = await fetch("/api/super-admin/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "extend_period", subscriptionId: sub.id, days }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      toast.success(json.message || `Extended by +${days}d`);
      fetchSubscriptions();
    } else {
      toast.error(json.message || "Failed to extend subscription");
    }
  };

  const handleCancel = async (sub: any) => {
    const ok = await confirmAction({
      title: `Cancel Subscription for ${sub.storeName}?`,
      message: "This will mark the subscription cancelled and disable auto-renewal.",
      confirmText: "Cancel Subscription",
      cancelText: "Keep Active",
      type: "danger",
    });
    if (!ok) return;

    const res = await fetch("/api/super-admin/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel_subscription", subscriptionId: sub.id }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      toast.success(json.message || "Subscription cancelled");
      fetchSubscriptions();
    } else {
      toast.error(json.message || "Failed to cancel subscription");
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-teal-700" />
            <span>Store Subscriptions &amp; Lifecycle Registry</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor active Razorpay mandates, one-time orders, trial expiries, grace windows &amp; manual enterprise grants.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setGrantOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Assign / Grant Plan
          </button>
          <button
            type="button"
            onClick={fetchSubscriptions}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500">Normalized Active MRR</div>
          <div className="text-xl font-extrabold text-teal-700 mt-1">{formatInr(summary?.mrr || 0)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500">Active Paid</div>
          <div className="text-xl font-extrabold text-emerald-700 mt-1">{summary?.activePaid || 0}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500">Free Trialing</div>
          <div className="text-xl font-extrabold text-indigo-700 mt-1">{summary?.trialing || 0}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500">Grace / Past Due</div>
          <div className="text-xl font-extrabold text-amber-700 mt-1">{summary?.gracePeriod || 0}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500">Expired / Cancelled</div>
          <div className="text-xl font-extrabold text-slate-600 mt-1">{summary?.cancelledOrExpired || 0}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="grace_period">Grace Period</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
          </select>

          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50"
          >
            <option value="all">All Billing Modes</option>
            <option value="razorpay_subscription">Razorpay Auto-Renew</option>
            <option value="razorpay_order">Razorpay One-Time Order</option>
            <option value="manual_grant">Manual / Enterprise Grant</option>
          </select>
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search store, plan, sub_id..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-teal-700 mb-2" />
            <p className="text-xs font-semibold">Loading subscriptions...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                  <th className="py-3 px-4">Store Tenant</th>
                  <th className="py-3 px-3">Plan &amp; Price</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Billing Mode / Razorpay ID</th>
                  <th className="py-3 px-3">Current Period End</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subscriptions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      No matching store subscriptions found.
                    </td>
                  </tr>
                ) : (
                  subscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4">
                        <Link
                          href={`/super-admin/stores/${sub.storeId}`}
                          className="font-bold text-slate-900 hover:text-teal-700 inline-flex items-center gap-1"
                        >
                          <span>{sub.storeName}</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </Link>
                        <div className="text-[11px] text-slate-500">{sub.ownerEmail || "—"}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{sub.planName}</div>
                        <div className="text-[11px] text-slate-500">
                          {formatInr(sub.priceInr)} / {sub.billingCycle}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            sub.status === "active"
                              ? "bg-emerald-50 text-emerald-700"
                              : sub.status === "trialing"
                              ? "bg-indigo-50 text-indigo-700"
                              : sub.status === "grace_period"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {sub.status}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-700">{sub.billingMode}</div>
                        {sub.razorpaySubscriptionId && (
                          <div className="font-mono text-[10px] text-slate-500">{sub.razorpaySubscriptionId}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-700">
                        {new Date(sub.currentPeriodEnd).toLocaleDateString("en-IN")}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => handleExtend(sub, 7)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 font-bold text-slate-700 cursor-pointer"
                        >
                          <CalendarPlus className="w-3 h-3" /> +7d
                        </button>
                        {["active", "trialing", "grace_period"].includes(sub.status) && (
                          <button
                            type="button"
                            onClick={() => handleCancel(sub)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 font-bold text-rose-700 cursor-pointer"
                          >
                            <XCircle className="w-3 h-3" /> Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assign / Grant Plan Modal */}
      {grantOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
          onClick={() => setGrantOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">Assign / Grant Subscription Plan</h3>
              <button type="button" onClick={() => setGrantOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleGrantSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Pharmacy Store</label>
                <select
                  required
                  value={grantStoreId}
                  onChange={(e) => setGrantStoreId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                >
                  <option value="">Select Store...</option>
                  {stores.map((st) => (
                    <option key={st.id} value={st.id}>
                      #{st.id} — {st.storeName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Target Plan</label>
                <select
                  required
                  value={grantPlanId}
                  onChange={(e) => setGrantPlanId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                >
                  <option value="">Select Plan...</option>
                  {plans.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name} ({pl.code}) — {formatInr(pl.priceInr)}/{pl.billingCycle}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Custom Duration Days (Optional)</label>
                <input
                  type="number"
                  min={1}
                  value={grantDays}
                  onChange={(e) => setGrantDays(e.target.value)}
                  placeholder="Default plan billing cycle"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Audit Notes</label>
                <input
                  type="text"
                  value={grantNotes}
                  onChange={(e) => setGrantNotes(e.target.value)}
                  placeholder="e.g. Annual enterprise agreement"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setGrantOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold cursor-pointer"
                >
                  {submitting ? "Assigning..." : "Confirm Grant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
