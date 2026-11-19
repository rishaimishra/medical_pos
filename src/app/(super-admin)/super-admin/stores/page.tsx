"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CalendarPlus,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  GitBranch,
  Loader2,
  PauseCircle,
  PlayCircle,
  Search,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import { toast } from "@/stores/useToastStore";
import { formatLimit } from "@/lib/saasFeatures";

type FilterKey =
  | "all"
  | "active_paid"
  | "trial"
  | "expiring_7d"
  | "near_quota"
  | "past_due_suspended"
  | "inactive_14d";

export default function SuperAdminStoresPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [plans, setPlans] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });

  // Lifecycle Action Modal
  const [modalMode, setModalMode] = useState<
    null | { type: "suspend" | "trial" | "grant" | "impersonate"; store: any }
  >(null);
  const [reason, setReason] = useState("");
  const [trialDays, setTrialDays] = useState("14");
  const [grantPlanId, setGrantPlanId] = useState("");
  const [grantDays, setGrantDays] = useState("30");
  const [acting, setActing] = useState(false);

  const loadStores = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        filter,
        page: String(page),
        limit: "25",
        ...(search.trim() ? { search: search.trim() } : {}),
      });
      const res = await fetch(`/api/super-admin/stores?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setStores(json.stores || []);
        setSummary(json.summary || {});
        setPlans(json.plans || []);
        if (json.plans?.length && !grantPlanId) {
          setGrantPlanId(String(json.plans[0].id));
        }
        if (json.pagination) setPagination(json.pagination);
      } else {
        toast.error(json.message || "Failed to load stores");
      }
    } catch {
      toast.error("Network error loading stores directory");
    } finally {
      setLoading(false);
    }
  }, [filter, page, search, grantPlanId]);

  useEffect(() => {
    const t = setTimeout(() => loadStores(), 150);
    return () => clearTimeout(t);
  }, [loadStores]);

  const handleLifecycleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalMode || acting) return;
    setActing(true);
    try {
      if (modalMode.type === "impersonate") {
        const res = await fetch("/api/super-admin/impersonate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId: modalMode.store.id, reason }),
        });
        const json = await res.json();
        if (res.ok && json.success) {
          toast.success(`Entered Support View for ${modalMode.store.storeName}`);
          setModalMode(null);
          router.push(json.redirectUrl || "/admin/dashboard");
          return;
        }
        toast.error(json.message || "Failed to launch support mode");
      } else {
        let payload: any = {};
        if (modalMode.type === "suspend") {
          payload = { action: "set_status", storeStatus: "suspended", reason };
        } else if (modalMode.type === "trial") {
          payload = { action: "extend_trial", days: Number(trialDays) };
        } else if (modalMode.type === "grant") {
          payload = {
            action: "grant_plan",
            planId: Number(grantPlanId),
            durationDays: Number(grantDays),
            notes: reason || "Manual CEO Plan Grant",
          };
        }
        const res = await fetch(`/api/super-admin/stores/${modalMode.store.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (res.ok && json.success) {
          toast.success("Store updated cleanly!");
          setModalMode(null);
          setReason("");
          loadStores();
        } else {
          toast.error(json.message || "Action failed");
        }
      }
    } catch {
      toast.error("Network error executing store action");
    } finally {
      setActing(false);
    }
  };

  const quickSetStatus = async (store: any, nextStatus: "active" | "grace_period") => {
    try {
      const res = await fetch(`/api/super-admin/stores/${store.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_status", storeStatus: nextStatus }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(`${store.storeName} marked ${nextStatus.replace("_", " ")}`);
        loadStores();
      } else {
        toast.error(json.message || "Update failed");
      }
    } catch {
      toast.error("Network error updating status");
    }
  };

  const FILTER_PILLS: Array<{ key: FilterKey; label: string; countKey: string }> = [
    { key: "all", label: "All Stores", countKey: "all" },
    { key: "active_paid", label: "Active Paid", countKey: "activePaid" },
    { key: "trial", label: "Free Trial", countKey: "trial" },
    { key: "expiring_7d", label: "Expiring <= 7d", countKey: "expiring7d" },
    { key: "near_quota", label: "Near Quota >= 80%", countKey: "nearQuota" },
    { key: "past_due_suspended", label: "Past Due / Suspended", countKey: "pastDueSuspended" },
    { key: "inactive_14d", label: "Inactive >= 14d", countKey: "inactive14d" },
  ];

  const statusBadge = (st: string) => {
    switch (st) {
      case "active":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "trialing":
        return "bg-sky-50 text-sky-700 border-sky-200";
      case "grace_period":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "suspended":
      case "expired":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-teal-700" />
            <span>Stores Directory & Lifecycle Control</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Inspect every pharmacy store tenant, quota usage, GMV throughput, and manage trials or suspensions.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search store, owner, GSTIN, city..."
            className="w-full bg-white border border-slate-300 focus:border-teal-600 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none"
          />
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {FILTER_PILLS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setFilter(p.key);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
              filter === p.key
                ? "bg-teal-700 text-white border-teal-700"
                : "bg-white text-slate-700 border-slate-200 hover:border-teal-400"
            }`}
          >
            <span>{p.label}</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                filter === p.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {summary[p.countKey] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Directory Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
            <span>Loading store tenants...</span>
          </div>
        ) : stores.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-500">
            No pharmacy stores match this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                  <th className="py-3 px-4">Store Tenant</th>
                  <th className="py-3 px-3">Plan & Status</th>
                  <th className="py-3 px-3">Outlets / Staff</th>
                  <th className="py-3 px-3 text-right">30d GMV</th>
                  <th className="py-3 px-3">Last POS Activity</th>
                  <th className="py-3 px-4 text-right">CEO Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stores.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <Link
                        href={`/super-admin/stores/${s.id}`}
                        className="font-extrabold text-slate-900 hover:text-teal-700 flex items-center gap-1"
                      >
                        <span>{s.storeName}</span>
                        <ExternalLink className="w-3 h-3 opacity-50" />
                      </Link>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {s.ownerName || "Owner"} • {s.ownerEmail || s.storePhone || "No contact"}
                      </p>
                      {(s.city || s.storeGst) && (
                        <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                          {[s.city, s.state, s.storeGst].filter(Boolean).join(" • ")}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-800 border border-slate-200">
                          {s.subscription?.planName || "No Plan"}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${statusBadge(
                            s.storeStatus === "suspended"
                              ? "suspended"
                              : s.subscription?.status || s.storeStatus
                          )}`}
                        >
                          {s.storeStatus === "suspended"
                            ? "Suspended"
                            : s.subscription?.status?.replace("_", " ") || s.storeStatus}
                        </span>
                      </div>
                      {s.subscription?.currentPeriodEnd && (
                        <p className="text-[10px] text-slate-400 mt-1">
                          Ends {new Date(s.subscription.currentPeriodEnd).toLocaleDateString("en-IN")}
                        </p>
                      )}
                      {s.flags?.nearQuota && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 font-bold mt-0.5">
                          <AlertTriangle className="w-3 h-3" /> Near Quota (&gt;=80%)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px]">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <GitBranch className="w-3 h-3 text-teal-600" />
                        <span>
                          {s.branchCount} /{" "}
                          {s.subscription ? formatLimit(s.subscription.limits.maxBranches) : "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600 mt-0.5">
                        <Users className="w-3 h-3 text-slate-400" />
                        <span>
                          {s.staffCount} /{" "}
                          {s.subscription ? formatLimit(s.subscription.limits.maxStaffUsers) : "—"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                      ₹{Number(s.gmv30d || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      <div className="text-[10px] font-sans font-normal text-slate-400">
                        {s.monthlyInvoices} bills/mo
                      </div>
                    </td>
                    <td className="py-3 px-3 text-[11px] text-slate-500">
                      {s.lastSaleAt ? new Date(s.lastSaleAt).toLocaleString("en-IN") : "No sales yet"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        <Link
                          href={`/super-admin/stores/${s.id}`}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px]"
                        >
                          360° View
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setReason("");
                            setModalMode({ type: "impersonate", store: s });
                          }}
                          className="px-2 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-[11px] cursor-pointer"
                          title="Open 30m Support Session"
                        >
                          Support
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalMode({ type: "trial", store: s })}
                          className="p-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 cursor-pointer"
                          title="Extend Trial"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalMode({ type: "grant", store: s })}
                          className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 cursor-pointer"
                          title="Grant Custom Plan"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                        </button>
                        {s.storeStatus === "suspended" ? (
                          <button
                            type="button"
                            onClick={() => quickSetStatus(s, "active")}
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 cursor-pointer"
                            title="Reactivate Store"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setReason("");
                              setModalMode({ type: "suspend", store: s });
                            }}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer"
                            title="Suspend Store"
                          >
                            <PauseCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <span>
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} stores)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action Modal */}
      {modalMode && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setModalMode(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                {modalMode.type === "impersonate" && <ShieldAlert className="w-4 h-4 text-rose-600" />}
                {modalMode.type === "suspend" && <PauseCircle className="w-4 h-4 text-rose-600" />}
                {modalMode.type === "trial" && <CalendarPlus className="w-4 h-4 text-sky-600" />}
                {modalMode.type === "grant" && <CheckCircle2 className="w-4 h-4 text-teal-600" />}
                <span>
                  {modalMode.type === "impersonate" && `Support View: ${modalMode.store.storeName}`}
                  {modalMode.type === "suspend" && `Suspend Store: ${modalMode.store.storeName}`}
                  {modalMode.type === "trial" && `Extend Trial: ${modalMode.store.storeName}`}
                  {modalMode.type === "grant" && `Grant Plan: ${modalMode.store.storeName}`}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleLifecycleSubmit} className="space-y-4 text-xs">
              {modalMode.type === "trial" && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Extend / Grant Days</label>
                  <select
                    value={trialDays}
                    onChange={(e) => setTrialDays(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  >
                    <option value="7">+7 Days</option>
                    <option value="14">+14 Days</option>
                    <option value="30">+30 Days</option>
                  </select>
                </div>
              )}

              {modalMode.type === "grant" && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Subscription Plan</label>
                    <select
                      value={grantPlanId}
                      onChange={(e) => setGrantPlanId(e.target.value)}
                      required
                      className="w-full border border-slate-300 rounded-xl px-3 py-2"
                    >
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.code}) — ₹{p.priceInr}/{p.billingCycle}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Duration (Days)</label>
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      required
                      value={grantDays}
                      onChange={(e) => setGrantDays(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2"
                    />
                  </div>
                </>
              )}

              {(modalMode.type === "suspend" ||
                modalMode.type === "impersonate" ||
                modalMode.type === "grant") && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {modalMode.type === "grant" ? "Grant Notes (optional)" : "Mandatory Audit Reason"}
                  </label>
                  <textarea
                    rows={3}
                    required={modalMode.type !== "grant"}
                    minLength={modalMode.type !== "grant" ? 5 : 0}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={
                      modalMode.type === "impersonate"
                        ? "e.g., Debugging POS tax calculation with store owner on call"
                        : modalMode.type === "suspend"
                        ? "e.g., Unpaid invoice past 15-day grace window"
                        : "Offline NEFT reference / CEO enterprise deal note"
                    }
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 focus:border-teal-600 focus:outline-none"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={acting}
                className={`w-full py-2.5 rounded-xl text-white font-bold cursor-pointer ${
                  modalMode.type === "suspend"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-teal-700 hover:bg-teal-800"
                }`}
              >
                {acting ? "Processing..." : "Confirm Action"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
