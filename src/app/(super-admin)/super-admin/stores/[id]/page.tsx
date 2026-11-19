"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Building2,
  CheckCircle2,
  CreditCard,
  GitBranch,
  KeyRound,
  Loader2,
  Package,
  ShieldAlert,
  Sliders,
  Users,
  X,
} from "lucide-react";
import { toast } from "@/stores/useToastStore";
import { formatLimit } from "@/lib/saasFeatures";

type TabKey = "overview" | "branches" | "staff" | "subscription" | "audit" | "operations";

export default function SuperAdminStoreDetailPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = String(params?.id || "");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<TabKey>("overview");

  // Support Modals
  const [impOpen, setImpOpen] = useState(false);
  const [impReason, setImpReason] = useState("");
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantPlanId, setGrantPlanId] = useState("");
  const [grantDays, setGrantDays] = useState("30");
  const [pwUser, setPwUser] = useState<any>(null);
  const [newUserPw, setNewUserPw] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideLimits, setOverrideLimits] = useState<Record<string, string>>({});
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [offPlanId, setOffPlanId] = useState("");
  const [offAmount, setOffAmount] = useState("");
  const [offDays, setOffDays] = useState("365");
  const [offMethod, setOffMethod] = useState("neft");
  const [offRef, setOffRef] = useState("");
  const [saving, setSaving] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/super-admin/stores/${storeId}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setData(json);
        if (json.plans?.length && !grantPlanId) {
          setGrantPlanId(String(json.plans[0].id));
        }
      } else {
        toast.error(json.message || "Failed to load store");
      }
    } catch {
      toast.error("Network error loading store 360° workspace");
    } finally {
      setLoading(false);
    }
  }, [storeId, grantPlanId]);

  useEffect(() => {
    if (storeId) loadWorkspace();
  }, [storeId, loadWorkspace]);

  const handleImpersonate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: Number(storeId), reason: impReason }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success("Entered audited Store Support Session (30m limit)");
        router.push(json.redirectUrl || "/admin/dashboard");
      } else {
        toast.error(json.message || "Failed to start support session");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleBranch = async (branchId: number, active: boolean) => {
    const res = await fetch(`/api/super-admin/stores/${storeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_branch_active", branchId, active }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      toast.success("Branch status updated");
      loadWorkspace();
    } else {
      toast.error(json.message || "Failed");
    }
  };

  const handleToggleUser = async (userId: number, active: boolean) => {
    const res = await fetch(`/api/super-admin/stores/${storeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_user_active", userId, active }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      toast.success("Staff status updated");
      loadWorkspace();
    } else {
      toast.error(json.message || "Failed");
    }
  };

  const handleResetStaffPw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwUser) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/stores/${storeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset_staff_password",
          userId: pwUser.id,
          newPassword: newUserPw,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(json.message || "Password reset!");
        setPwUser(null);
        setNewUserPw("");
      } else {
        toast.error(json.message || "Failed to reset password");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleGrantPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/stores/${storeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grant_plan",
          planId: Number(grantPlanId),
          durationDays: Number(grantDays),
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success("Plan granted cleanly!");
        setGrantOpen(false);
        loadWorkspace();
      } else {
        toast.error(json.message || "Grant failed");
      }
    } finally {
      setSaving(false);
    }
  };

  const openOverridesModal = () => {
    const curr = data?.subscription?.current?.customLimits || {};
    const initial: Record<string, string> = {};
    for (const m of data?.subscription?.usageMeters || []) {
      initial[m.key] = curr[m.key] !== undefined ? String(curr[m.key]) : "";
    }
    setOverrideLimits(initial);
    setOverrideOpen(true);
  };

  const handleSaveOverrides = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const cleaned: Record<string, number> = {};
      for (const [k, v] of Object.entries(overrideLimits)) {
        if (v.trim() !== "") {
          const parsed = parseInt(v, 10);
          if (!isNaN(parsed) && parsed >= -1) cleaned[k] = parsed;
        }
      }
      const res = await fetch(`/api/super-admin/stores/${storeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_overrides",
          customLimits: Object.keys(cleaned).length > 0 ? cleaned : null,
          customFeatures: data?.subscription?.current?.customFeatures || null,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success("Custom quota overrides saved!");
        setOverrideOpen(false);
        loadWorkspace();
      } else {
        toast.error(json.message || "Failed saving overrides");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleExtendGrace = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/stores/${storeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extend_grace", days: 7 }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success("Grace period extended by +7 days");
        loadWorkspace();
      } else {
        toast.error(json.message || "Failed to extend grace");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRecordOfflinePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/stores/${storeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record_offline_payment",
          planId: Number(offPlanId || grantPlanId),
          amountSubtotal: offAmount ? Number(offAmount) : undefined,
          durationDays: Number(offDays || 365),
          paymentMethod: offMethod,
          referenceNo: offRef,
          activatePlan: true,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(`Offline payment logged (${json.invoiceNo})`);
        setOfflineOpen(false);
        setOffAmount("");
        setOffRef("");
        loadWorkspace();
      } else {
        toast.error(json.message || "Failed to record offline payment");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRefundPayment = async (paymentId: number, invoiceNo: string) => {
    if (!window.confirm(`Mark ${invoiceNo} as Refunded?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/stores/${storeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_payment_refunded",
          paymentId,
          reason: "Refund processed via Super Admin Panel",
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(`${invoiceNo} marked as refunded`);
        loadWorkspace();
      } else {
        toast.error(json.message || "Refund status update failed");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="py-20 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
        <span>Loading 360° Store Workspace...</span>
      </div>
    );
  }

  const { overview, branches, staff, subscription, audit, operations } = data;
  const subCur = subscription?.current;

  const TABS: Array<{ key: TabKey; label: string; icon: any }> = [
    { key: "overview", label: "Overview & KPIs", icon: Building2 },
    { key: "branches", label: `Store Branches (${branches.length})`, icon: GitBranch },
    { key: "staff", label: `Staff & Users (${staff.length})`, icon: Users },
    { key: "subscription", label: "Subscription & Quotas", icon: CreditCard },
    { key: "audit", label: "Audit Logs", icon: Activity },
    { key: "operations", label: "Inventory, Sales & POs", icon: Package },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/super-admin/stores"
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-teal-700"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-slate-900">
                {overview.storeName || `Store #${overview.id}`}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-teal-50 text-teal-800 border border-teal-200">
                {overview.storeStatus}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {overview.ownerName || "Owner"} • {overview.ownerEmail || overview.storeEmail || "No email"} • GST:{" "}
              {overview.storeGst || "N/A"} • DL: {overview.storeDl || "N/A"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setGrantOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:border-teal-600 text-xs font-bold text-slate-700 cursor-pointer"
          >
            Grant Plan
          </button>
          <button
            type="button"
            onClick={() => setImpOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Support View (30m)</span>
          </button>
        </div>
      </div>

      {/* 6 Inspection Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                tab === t.key
                  ? "bg-[#0F172A] text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: Overview & KPIs */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-[11px] font-bold uppercase text-slate-400">Today Gross Sales</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">
                ₹{overview.kpis.revenueToday.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">{overview.kpis.invoicesToday} invoices today</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-[11px] font-bold uppercase text-slate-400">30-Day Retail GMV</p>
              <p className="text-2xl font-extrabold text-teal-700 mt-1">
                ₹{overview.kpis.revenue30d.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">{overview.kpis.invoices30d} bills last 30d</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-[11px] font-bold uppercase text-slate-400">All-Time Platform GMV</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">
                ₹{overview.kpis.revenueAllTime.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">{overview.kpis.invoicesAllTime} total bills</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-[11px] font-bold uppercase text-slate-400">Inventory Cost Value</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">
                ₹{overview.kpis.inventoryCostValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Low-qty alert &le; {overview.lowQty}</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <p className="font-extrabold text-slate-800">Store Profile</p>
              <p className="text-slate-600">Address: {overview.storeAddress || "—"}</p>
              <p className="text-slate-600">Location: {[overview.city, overview.state].filter(Boolean).join(", ") || "—"}</p>
              <p className="text-slate-600">Phone: {overview.storePhone || "—"} • Currency: {overview.currency}</p>
            </div>
            <div className="space-y-1.5">
              <p className="font-extrabold text-slate-800">Compliance & Email Gateway</p>
              <p className="text-slate-600">GSTIN: {overview.storeGst || "Missing"} • DL: {overview.storeDl || "Missing"}</p>
              <p className="text-slate-600">
                Email Provider: <span className="uppercase font-bold">{overview.emailProvider}</span> (
                {overview.hasSendgrid || overview.hasSmtp ? "Configured" : "Not configured"})
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Store Branches */}
      {tab === "branches" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                <th className="py-3 px-4">Branch</th>
                <th className="py-3 px-3">DL / GSTIN</th>
                <th className="py-3 px-3">Staff / SKUs</th>
                <th className="py-3 px-3 text-right">Stock Cost</th>
                <th className="py-3 px-3 text-right">30d Sales</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branches.map((b: any) => (
                <tr key={b.id}>
                  <td className="py-3 px-4">
                    <Link
                      href={`/super-admin/branches/${b.id}`}
                      className="font-extrabold text-slate-900 hover:text-teal-700"
                    >
                      {b.name} ({b.code})
                    </Link>
                    {b.isMain && (
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 text-[10px] font-bold">
                        MAIN
                      </span>
                    )}
                    <p className="text-[11px] text-slate-500">{b.address || "—"}</p>
                  </td>
                  <td className="py-3 px-3 text-[11px] font-mono">
                    <div>GST: {b.gstNo || overview.storeGst || "Missing"}</div>
                    <div>DL: {b.dlNo || overview.storeDl || "Missing"}</div>
                  </td>
                  <td className="py-3 px-3 text-[11px]">
                    {b.staffCount} staff • {b.batchSkuCount} active batches
                  </td>
                  <td className="py-3 px-3 text-right font-mono">₹{b.stockValue.toLocaleString("en-IN")}</td>
                  <td className="py-3 px-3 text-right font-mono font-bold">
                    ₹{b.sales30d.toLocaleString("en-IN")} ({b.invoices30d})
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <Link
                      href={`/super-admin/branches/${b.id}`}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold"
                    >
                      Deep-Dive
                    </Link>
                    {!b.isMain && (
                      <button
                        type="button"
                        onClick={() => handleToggleBranch(b.id, !b.active)}
                        className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                          b.active ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {b.active ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: Staff & Users */}
      {tab === "staff" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-3">Role / Branch</th>
                <th className="py-3 px-3">Last Login</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-4 text-right">Support Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map((u: any) => (
                <tr key={u.id}>
                  <td className="py-3 px-4">
                    <p className="font-bold text-slate-900">{u.name}</p>
                    <p className="text-[11px] text-slate-500">
                      @{u.username} • {u.email}
                    </p>
                  </td>
                  <td className="py-3 px-3">
                    <span className="uppercase font-bold text-slate-700">{u.role}</span> •{" "}
                    <span className="text-slate-500">{u.branch ? `${u.branch.name} (${u.branch.code})` : "All Branches"}</span>
                  </td>
                  <td className="py-3 px-3 text-slate-500">
                    {u.lastLogin ? new Date(u.lastLogin).toLocaleString("en-IN") : "Never"}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        u.active ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {u.active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => setPwUser(u)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold cursor-pointer inline-flex items-center gap-1"
                    >
                      <KeyRound className="w-3 h-3" /> Reset PW
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleUser(u.id, !u.active)}
                      className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                        u.active ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {u.active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: Subscription & Quotas */}
      {tab === "subscription" && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase text-slate-400">Current Subscription</p>
              <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
                {subCur ? `${subCur.plan.name} (${subCur.plan.code})` : "No Subscription Assigned"}
              </h2>
              {subCur && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Status: <strong className="uppercase">{subCur.status}</strong> • Mode: {subCur.billingMode} • Ends{" "}
                  {new Date(subCur.currentPeriodEnd).toLocaleDateString("en-IN")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {subCur && (
                <>
                  <button
                    type="button"
                    onClick={openOverridesModal}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 hover:border-teal-600 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5" /> Custom Limit Overrides
                  </button>
                  <button
                    type="button"
                    onClick={handleExtendGrace}
                    disabled={saving}
                    className="px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold cursor-pointer"
                  >
                    +7d Grace Period
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setOffPlanId(String((data.plans || [])[0]?.id || ""));
                  setOfflineOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl border border-slate-300 hover:border-teal-600 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5" /> Record Offline NEFT/Cheque
              </button>
              <button
                type="button"
                onClick={() => setGrantOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer"
              >
                Assign / Grant Plan
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {subscription.usageMeters.map((m: any) => {
              const pct = m.limit > 0 ? Math.min(100, Math.round((m.used / m.limit) * 100)) : 0;
              return (
                <div key={m.key} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>{m.label}</span>
                    <span className="font-mono">
                      {m.used} / {formatLimit(m.limit)}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        m.limit < 0
                          ? "bg-teal-500 w-1/4"
                          : pct >= 95
                          ? "bg-rose-500"
                          : pct >= 75
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                      style={m.limit > 0 ? { width: `${pct}%` } : undefined}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {subCur?.effectiveFeatures && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-xs font-extrabold text-slate-800 mb-3">Effective Plan Feature Entitlements</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                {subscription.featureRegistry.map((f: any) => {
                  const enabled = Boolean(subCur.effectiveFeatures[f.key]);
                  return (
                    <div
                      key={f.key}
                      className={`px-3 py-2 rounded-xl border flex items-center gap-2 ${
                        enabled
                          ? "bg-emerald-50/70 border-emerald-200 text-emerald-800"
                          : "bg-slate-50 border-slate-200 text-slate-400"
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate font-semibold">{f.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Payments & GST Invoices Ledger */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <p className="text-xs font-extrabold text-slate-800">
                SaaS Subscription Payments & GST Invoices ({subscription.payments?.length || 0})
              </p>
            </div>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                  <th className="py-2.5 px-4">Invoice No</th>
                  <th className="py-2.5 px-3">Plan & Mode</th>
                  <th className="py-2.5 px-3 text-right">Total (incl. GST)</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(subscription.payments || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No subscription payments or offline GST invoices recorded yet.
                    </td>
                  </tr>
                ) : (
                  subscription.payments.map((pay: any) => (
                    <tr key={pay.id}>
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                        <div>{pay.invoiceNo}</div>
                        <div className="text-[10px] text-slate-400 font-normal">
                          {pay.paidAt ? new Date(pay.paidAt).toLocaleDateString("en-IN") : new Date(pay.createdAt).toLocaleDateString("en-IN")}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800">{pay.plan?.name || pay.plan?.code}</div>
                        <div className="text-[10px] text-slate-500 uppercase">
                          {pay.paymentType} • {pay.paymentMethod || "razorpay"}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        ₹{Number(pay.totalAmount).toLocaleString("en-IN")}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            pay.status === "captured"
                              ? "bg-emerald-50 text-emerald-700"
                              : pay.status === "refunded"
                              ? "bg-slate-200 text-slate-700"
                              : pay.status === "failed"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {pay.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {pay.status === "captured" && (
                          <button
                            type="button"
                            onClick={() => handleRefundPayment(pay.id, pay.invoiceNo)}
                            disabled={saving}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-rose-300 text-rose-700 text-[11px] font-bold cursor-pointer"
                          >
                            Mark Refunded
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: Audit Logs */}
      {tab === "audit" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase">Store Audit Trail</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto text-xs">
              {audit.storeAuditLogs.map((l: any) => (
                <div key={l.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>{l.action}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(l.createdAt).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    User: {l.user?.username || "System"} • Entity: {l.entity} ({l.entityId ?? "-"})
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase">Platform CEO Logs For Store</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto text-xs">
              {audit.platformAuditLogs.map((l: any) => (
                <div key={l.id} className="p-2.5 rounded-xl bg-teal-50/40 border border-teal-100">
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>{l.action}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(l.createdAt).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Operator: {l.platformUser?.name || "System"} ({l.platformUser?.role || "-"})
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: Inventory, Sales & POs */}
      {tab === "operations" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
            <h3 className="font-extrabold text-slate-800">Recent POS Bills</h3>
            {operations.recentSales.map((s: any) => (
              <div key={s.id} className="flex justify-between py-1.5 border-b border-slate-100">
                <div>
                  <span className="font-mono font-bold text-slate-800">{s.invoiceNo}</span>
                  <span className="text-slate-500 ml-2">{s.customerName} ({s.branchName})</span>
                </div>
                <span className="font-mono font-bold text-emerald-700">₹{s.grandTotal.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
            <h3 className="font-extrabold text-slate-800">Recent Medicines ({operations.recentMedicines.length})</h3>
            {operations.recentMedicines.map((m: any) => (
              <div key={m.id} className="flex justify-between py-1.5 border-b border-slate-100">
                <div>
                  <span className="font-bold text-slate-800">{m.name}</span>
                  <span className="text-slate-500 ml-2">{m.company}</span>
                </div>
                <span className="font-mono text-slate-700">{m.totalStock} units</span>
              </div>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
            <h3 className="font-extrabold text-slate-800">Recent Purchase Orders</h3>
            {operations.recentPOs.map((po: any) => (
              <div key={po.id} className="flex justify-between py-1.5 border-b border-slate-100">
                <div>
                  <span className="font-mono font-bold">{po.poNumber}</span>
                  <span className="text-slate-500 ml-2">{po.supplierName}</span>
                </div>
                <span className="font-mono">₹{po.total.toFixed(2)} ({po.status})</span>
              </div>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
            <h3 className="font-extrabold text-slate-800">Recent Expenses / Vouchers</h3>
            {operations.recentExpenses.map((e: any) => (
              <div key={e.id} className="flex justify-between py-1.5 border-b border-slate-100">
                <div>
                  <span className="font-mono font-bold">{e.voucherNo}</span>
                  <span className="text-slate-500 ml-2">{e.title} ({e.category})</span>
                </div>
                <span className="font-mono">₹{e.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Impersonation Modal */}
      {impOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" onClick={() => setImpOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Enter 30-Min Support Session</h3>
              <button type="button" onClick={() => setImpOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleImpersonate} className="space-y-3 text-xs">
              <textarea
                required
                minLength={5}
                rows={3}
                value={impReason}
                onChange={(e) => setImpReason(e.target.value)}
                placeholder="Mandatory audit reason for entering store admin..."
                className="w-full border border-slate-300 rounded-xl p-3"
              />
              <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-rose-600 text-white font-bold cursor-pointer">
                {saving ? "Launching..." : "Start Audited Support View"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Grant Plan Modal */}
      {grantOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" onClick={() => setGrantOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Grant Subscription Plan</h3>
              <button type="button" onClick={() => setGrantOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleGrantPlan} className="space-y-3 text-xs">
              <select value={grantPlanId} onChange={(e) => setGrantPlanId(e.target.value)} className="w-full border border-slate-300 rounded-xl px-3 py-2">
                {data.plans.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code}) — ₹{p.priceInr}/{p.billingCycle}</option>
                ))}
              </select>
              <input type="number" min={1} value={grantDays} onChange={(e) => setGrantDays(e.target.value)} className="w-full border border-slate-300 rounded-xl px-3 py-2" placeholder="Duration in days" />
              <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-teal-700 text-white font-bold cursor-pointer">
                {saving ? "Granting..." : "Grant Plan"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Custom Quota Overrides Modal */}
      {overrideOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" onClick={() => setOverrideOpen(false)}>
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Custom Quota Overrides (-1 = Unlimited, blank = plan default)</h3>
              <button type="button" onClick={() => setOverrideOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSaveOverrides} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                {subscription.usageMeters.map((m: any) => (
                  <div key={m.key}>
                    <label className="block font-bold text-slate-700 mb-1">{m.label}</label>
                    <input
                      type="number"
                      min={-1}
                      value={overrideLimits[m.key] ?? ""}
                      onChange={(e) => setOverrideLimits({ ...overrideLimits, [m.key]: e.target.value })}
                      placeholder={`Plan: ${formatLimit(m.limit)}`}
                      className="w-full border border-slate-300 rounded-xl px-3 py-1.5"
                    />
                  </div>
                ))}
              </div>
              <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-teal-700 text-white font-bold cursor-pointer">
                {saving ? "Saving..." : "Save Custom Overrides"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Reset Staff Password Modal */}
      {pwUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" onClick={() => setPwUser(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold">Reset Password: @{pwUser.username}</h3>
              <button type="button" onClick={() => setPwUser(null)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleResetStaffPw} className="space-y-3 text-xs">
              <input
                type="password"
                required
                minLength={6}
                value={newUserPw}
                onChange={(e) => setNewUserPw(e.target.value)}
                placeholder="New temporary password (min 6 chars)"
                className="w-full border border-slate-300 rounded-xl px-3 py-2"
              />
              <button type="submit" disabled={saving} className="w-full py-2 rounded-xl bg-teal-700 text-white font-bold cursor-pointer">
                {saving ? "Resetting..." : "Update Staff Password"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Record Offline NEFT/RTGS/Cheque Payment Modal */}
      {offlineOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" onClick={() => setOfflineOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Record Offline Enterprise Payment</h3>
              <button type="button" onClick={() => setOfflineOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleRecordOfflinePayment} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Subscription Plan</label>
                <select
                  value={offPlanId}
                  onChange={(e) => setOffPlanId(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white"
                >
                  {(data.plans || []).map((p: any) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name} ({p.code}) — ₹{p.priceInr}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Taxable Amount (₹ pre-GST)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={offAmount}
                    onChange={(e) => setOffAmount(e.target.value)}
                    placeholder="Auto from plan price"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contract Duration (Days)</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={offDays}
                    onChange={(e) => setOffDays(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Mode</label>
                  <select
                    value={offMethod}
                    onChange={(e) => setOffMethod(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white"
                  >
                    <option value="neft">NEFT / RTGS</option>
                    <option value="bank_transfer">IMPS / Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="cash">Enterprise Cash Receipt</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Bank UTR / Cheque Ref</label>
                  <input
                    type="text"
                    value={offRef}
                    onChange={(e) => setOffRef(e.target.value)}
                    placeholder="e.g. UTR12345678"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-mono"
                  />
                </div>
              </div>
              <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-teal-700 text-white font-bold cursor-pointer">
                {saving ? "Recording & Issuing SUB-INV..." : "Record Payment & Activate Plan"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
