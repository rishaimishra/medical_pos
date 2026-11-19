"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  CreditCard,
  Edit3,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "@/stores/useToastStore";
import type { FeatureMeta, QuotaMeta } from "@/lib/saasFeatures";

const BILLING_CYCLES = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "lifetime", label: "Lifetime / Custom" },
];

const FEATURE_CATEGORIES: FeatureMeta["category"][] = [
  "Core POS & Stock",
  "Portals & Messaging",
  "Compliance & Exports",
  "Analytics & Governance",
];

function formatLimitLabel(limit: number, unit: string): string {
  if (limit === -1) return "Unlimited";
  return `${limit.toLocaleString("en-IN")} ${unit}`;
}

export default function SuperAdminPlansPage() {
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [plans, setPlans] = useState<any[]>([]);
  const [featureRegistry, setFeatureRegistry] = useState<FeatureMeta[]>([]);
  const [quotaRegistry, setQuotaRegistry] = useState<QuotaMeta[]>([]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
  const [form, setForm] = useState<any>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/plans", { cache: "no-store" });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Failed to load subscription plans");
      } else {
        setPlans(json.plans || []);
        setFeatureRegistry(json.featureRegistry || []);
        setQuotaRegistry(json.quotaRegistry || []);
      }
    } catch {
      toast.error("Failed to fetch SaaS plan catalog");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/super-admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed_defaults" }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Failed to seed plans");
      } else {
        toast.success(
          `4-tier blueprint synced (${json.created ?? 0} created, ${json.updated ?? 0} updated).`
        );
        await loadPlans();
      }
    } catch {
      toast.error("Failed to run default plan seeder");
    } finally {
      setSeeding(false);
    }
  };

  const openCreateModal = () => {
    const defaultFeatures: Record<string, boolean> = {};
    featureRegistry.forEach((f) => {
      defaultFeatures[f.key] = f.key === "posBilling" || f.recommendedTier === "Starter";
    });
    setEditingPlan(null);
    setForm({
      code: "",
      name: "",
      tagline: "",
      description: "",
      billingCycle: "monthly",
      intervalCount: 1,
      priceInr: 999,
      setupFeeInr: 0,
      trialDays: 14,
      sortOrder: (plans.length + 1) * 10,
      isPublic: true,
      isRecommended: false,
      isActive: true,
      maxBranches: 1,
      maxStaffUsers: 4,
      maxMedicines: 2500,
      maxMonthlyInvoices: 2500,
      maxSuppliers: 25,
      maxRxStorageMb: 500,
      maxCustomers: -1,
      maxDiscountSchemes: 5,
      features: defaultFeatures,
    });
    setModalOpen(true);
  };

  const openEditModal = (plan: any) => {
    setEditingPlan(plan);
    setForm({
      code: plan.code,
      name: plan.name,
      tagline: plan.tagline || "",
      description: plan.description || "",
      billingCycle: plan.billingCycle,
      intervalCount: plan.intervalCount,
      priceInr: Number(plan.priceInr),
      setupFeeInr: Number(plan.setupFeeInr),
      trialDays: plan.trialDays,
      sortOrder: plan.sortOrder,
      isPublic: Boolean(plan.isPublic),
      isRecommended: Boolean(plan.isRecommended),
      isActive: Boolean(plan.isActive),
      maxBranches: plan.maxBranches,
      maxStaffUsers: plan.maxStaffUsers,
      maxMedicines: plan.maxMedicines,
      maxMonthlyInvoices: plan.maxMonthlyInvoices,
      maxSuppliers: plan.maxSuppliers,
      maxRxStorageMb: plan.maxRxStorageMb,
      maxCustomers: plan.maxCustomers,
      maxDiscountSchemes: plan.maxDiscountSchemes,
      features: { ...(plan.features || {}), posBilling: true },
    });
    setModalOpen(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const url = editingPlan
        ? `/api/super-admin/plans/${editingPlan.id}`
        : "/api/super-admin/plans";
      const method = editingPlan ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Failed to save subscription plan");
      } else {
        toast.success(
          editingPlan
            ? json.billingChanged
              ? "Plan updated (Razorpay sync set to pending)"
              : "Plan updated successfully"
            : `Plan '${json.plan?.code}' created`
        );
        setModalOpen(false);
        await loadPlans();
      }
    } catch {
      toast.error("Network error saving plan");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOrArchive = async (plan: any) => {
    const hasHistory = (plan.totalSubscriptions || 0) > 0 || (plan.totalPayments || 0) > 0;
    const msg = hasHistory
      ? `Plan "${plan.name}" has ${plan.totalSubscriptions} subscription record(s). It will be safely ARCHIVED (hidden from public signups without impacting existing stores). Continue?`
      : `Delete unused plan "${plan.name}" (${plan.code}) permanently?`;
    if (!window.confirm(msg)) return;

    setDeletingId(plan.id);
    try {
      const res = await fetch(`/api/super-admin/plans/${plan.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Action failed");
      } else {
        toast.success(json.message || (json.archived ? "Plan archived" : "Plan deleted"));
        await loadPlans();
      }
    } catch {
      toast.error("Failed to remove or archive plan");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSyncOne = async (plan: any) => {
    setSyncingId(plan.id);
    try {
      const res = await fetch("/api/super-admin/plans/sync-razorpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_one", planId: plan.id }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Razorpay sync failed");
      } else {
        toast.success(json.message || "Synced to Razorpay");
      }
      await loadPlans();
    } catch {
      toast.error("Failed to sync plan with Razorpay");
    } finally {
      setSyncingId(null);
    }
  };

  const handleReconcileAll = async () => {
    setReconciling(true);
    try {
      const res = await fetch("/api/super-admin/plans/sync-razorpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reconcile_all" }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message || "Reconciled all plans with Razorpay");
      } else {
        toast.error(json.message || "Reconciliation reported sync issues");
      }
      await loadPlans();
    } catch {
      toast.error("Failed to reconcile plans with Razorpay");
    } finally {
      setReconciling(false);
    }
  };

  const billingChangedWarning =
    editingPlan &&
    editingPlan.razorpayPlanId &&
    form &&
    (Number(form.priceInr) !== Number(editingPlan.priceInr) ||
      form.billingCycle !== editingPlan.billingCycle ||
      Number(form.intervalCount) !== Number(editingPlan.intervalCount));

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-teal-700" />
            <span>SaaS Subscription Plan Architect</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Design pricing tiers, configure 8 metered resource quotas, and toggle 16 pharmacy & portal capabilities.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleReconcileAll}
            disabled={reconciling || plans.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-teal-700 ${reconciling ? "animate-spin" : ""}`} />
            Reconcile All with Razorpay
          </button>
          <button
            onClick={handleSeedDefaults}
            disabled={seeding}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
          >
            {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-600" />}
            Seed Recommended 4 Tiers
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Create Custom Plan
          </button>
        </div>
      </div>

      {/* Plans Grid */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center text-slate-400 text-xs">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-700" />
          Loading subscription plans & feature matrix...
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-14 text-center space-y-3">
          <CreditCard className="w-10 h-10 text-slate-300 mx-auto" />
          <h2 className="text-base font-bold text-slate-900">No Subscription Plans Configured</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Seed the recommended 4-tier pharmacy SaaS blueprint (Free Trial, Starter, Growth, Enterprise) or build a custom tier from scratch.
          </p>
          <button
            onClick={handleSeedDefaults}
            disabled={seeding}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800"
          >
            {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Seed Recommended 4 Tiers
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {plans.map((p) => {
            const enabledCount = featureRegistry.filter((f) => Boolean(p.features?.[f.key])).length;
            const totalFeat = featureRegistry.length || 16;

            return (
              <div
                key={p.id}
                className={`bg-white rounded-xl border p-4 shadow-xs flex flex-col justify-between space-y-4 ${
                  !p.isActive
                    ? "border-slate-200 opacity-70 bg-slate-50/50"
                    : p.isRecommended
                    ? "border-teal-600 ring-1 ring-teal-600/20"
                    : "border-slate-200"
                }`}
              >
                <div className="space-y-3">
                  {/* Top Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {p.code}
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      {p.isRecommended && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                          Recommended
                        </span>
                      )}
                      {!p.isActive ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          Archived
                        </span>
                      ) : !p.isPublic ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                          Private / Custom
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                          Public
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Name & Price */}
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">{p.name}</h3>
                    {p.tagline && <p className="text-[11px] text-slate-500 mt-0.5">{p.tagline}</p>}
                  </div>

                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-extrabold text-slate-900">
                      ₹{Number(p.priceInr).toLocaleString("en-IN")}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      / {p.intervalCount > 1 ? `${p.intervalCount}x ` : ""}
                      {p.billingCycle}
                    </span>
                  </div>

                  {/* Meta Pills: Trial & Razorpay Sync & Active Subs */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      <Users className="w-3 h-3" /> {p.activeSubscribers} active ({p.totalSubscriptions} total)
                    </span>
                    {p.trialDays > 0 && (
                      <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                        {p.trialDays}d Trial
                      </span>
                    )}
                    <span
                      title={p.razorpaySyncError || p.razorpayPlanId || "Sync status"}
                      className={`px-2 py-0.5 rounded uppercase ${
                        p.razorpaySyncStatus === "synced"
                          ? "bg-emerald-50 text-emerald-700"
                          : p.razorpaySyncStatus === "failed"
                          ? "bg-rose-50 text-rose-700"
                          : p.razorpaySyncStatus === "pending"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      RZP: {p.razorpaySyncStatus}
                    </span>
                    {Number(p.priceInr) > 0 && p.billingCycle !== "lifetime" && (
                      <button
                        type="button"
                        onClick={() => handleSyncOne(p)}
                        disabled={syncingId === p.id}
                        title="Sync or create fresh version on Razorpay"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-2.5 h-2.5 ${syncingId === p.id ? "animate-spin" : ""}`} />
                        {p.razorpaySyncStatus === "failed" ? "Retry Sync" : "Sync RZP"}
                      </button>
                    )}
                  </div>

                  {/* 8 Quotas Summary */}
                  <div className="border-t border-slate-100 pt-3 space-y-1.5">
                    <div className="text-[10px] font-bold uppercase text-slate-400">
                      Resource Quotas (8 Meters)
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                      {quotaRegistry.map((q) => (
                        <div key={q.key} className="flex items-center justify-between text-slate-600 truncate">
                          <span className="truncate pr-1">{q.label.replace(/^Max\s+/i, "")}:</span>
                          <span className="font-bold text-slate-900 shrink-0">
                            {formatLimitLabel(Number(p[q.key] ?? 0), q.unit)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Feature Count */}
                  <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1 font-semibold text-teal-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                      {enabledCount} / {totalFeat} capabilities
                    </span>
                    <span className="text-[10px] text-slate-400">Order #{p.sortOrder}</span>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(p)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit Plan
                  </button>
                  <button
                    onClick={() => handleDeleteOrArchive(p)}
                    disabled={deletingId === p.id}
                    title={
                      p.totalSubscriptions > 0 || p.totalPayments > 0
                        ? "Archive plan (preserves existing subscriptions)"
                        : "Delete unused plan"
                    }
                    className="inline-flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-rose-700 hover:border-rose-200 disabled:opacity-50"
                  >
                    {deletingId === p.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : p.totalSubscriptions > 0 || p.totalPayments > 0 ? (
                      <Archive className="w-3.5 h-3.5" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Create / Edit Plan Modal */}
      {modalOpen && form && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">
                  {editingPlan ? `Edit Plan — ${editingPlan.name} (${editingPlan.code})` : "Create Custom SaaS Plan"}
                </h2>
                <p className="text-[11px] text-slate-500">
                  Configure billing, 8 resource limits (-1 = Unlimited), and 16 feature gates.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="overflow-y-auto p-6 space-y-6 text-xs">
              {billingChangedWarning && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <strong>Razorpay Re-Sync Notice:</strong> Changing price or billing cycle on an already-synced plan sets Razorpay sync status to <code className="font-mono">pending</code> while preserving existing grandfathered subscribers on their prior plan version.
                  </div>
                </div>
              )}

              {/* Section 1: Pricing & Identity */}
              <div className="space-y-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  1. Plan Identity & Billing
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Plan Code</label>
                    <input
                      type="text"
                      required
                      disabled={Boolean(editingPlan)}
                      value={form.code}
                      onChange={(e) =>
                        setForm((s: any) => ({
                          ...s,
                          code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
                        }))
                      }
                      placeholder="e.g. GROWTH_ANNUAL"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono uppercase disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Display Name</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm((s: any) => ({ ...s, name: e.target.value }))}
                      placeholder="e.g. Growth Pharmacy"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Tagline</label>
                    <input
                      type="text"
                      value={form.tagline}
                      onChange={(e) => setForm((s: any) => ({ ...s, tagline: e.target.value }))}
                      placeholder="Short value proposition"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block font-semibold text-slate-700 mb-1">Cycle</label>
                    <select
                      value={form.billingCycle}
                      onChange={(e) => setForm((s: any) => ({ ...s, billingCycle: e.target.value }))}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white"
                    >
                      {BILLING_CYCLES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Interval</label>
                    <input
                      type="number"
                      min={1}
                      value={form.intervalCount}
                      onChange={(e) =>
                        setForm((s: any) => ({ ...s, intervalCount: Math.max(1, Number(e.target.value)) }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Price (₹ INR)</label>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={form.priceInr}
                      onChange={(e) =>
                        setForm((s: any) => ({ ...s, priceInr: Math.max(0, Number(e.target.value)) }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Setup Fee (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={form.setupFeeInr}
                      onChange={(e) =>
                        setForm((s: any) => ({ ...s, setupFeeInr: Math.max(0, Number(e.target.value)) }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Trial Days</label>
                    <input
                      type="number"
                      min={0}
                      value={form.trialDays}
                      onChange={(e) =>
                        setForm((s: any) => ({ ...s, trialDays: Math.max(0, Number(e.target.value)) }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Sort Order</label>
                    <input
                      type="number"
                      value={form.sortOrder}
                      onChange={(e) => setForm((s: any) => ({ ...s, sortOrder: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm((s: any) => ({ ...s, description: e.target.value }))}
                    placeholder="Optional detailed summary shown on pricing table"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200"
                  />
                </div>

                <div className="flex flex-wrap gap-5 pt-1">
                  <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isPublic}
                      onChange={(e) => setForm((s: any) => ({ ...s, isPublic: e.target.checked }))}
                      className="rounded border-slate-300 text-teal-700"
                    />
                    Publicly Visible on Signup & Upgrade Page
                  </label>
                  <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isRecommended}
                      onChange={(e) => setForm((s: any) => ({ ...s, isRecommended: e.target.checked }))}
                      className="rounded border-slate-300 text-teal-700"
                    />
                    Highlight as Recommended
                  </label>
                  <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm((s: any) => ({ ...s, isActive: e.target.checked }))}
                      className="rounded border-slate-300 text-teal-700"
                    />
                    Active (Not Archived)
                  </label>
                </div>
              </div>

              {/* Section 2: 8 Quota Limits */}
              <div className="border-t border-slate-100 pt-5 space-y-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  2. Resource Quotas (8 Metered Limits)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {quotaRegistry.map((q) => {
                    const val = Number(form[q.key] ?? 1);
                    const isUnlimited = val === -1;
                    return (
                      <div key={q.key} className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">{q.label}</span>
                          <label className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isUnlimited}
                              onChange={(e) =>
                                setForm((s: any) => ({
                                  ...s,
                                  [q.key]: e.target.checked ? -1 : 10,
                                }))
                              }
                              className="rounded border-slate-300 text-teal-700"
                            />
                            Unlimited
                          </label>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            disabled={isUnlimited}
                            min={0}
                            value={isUnlimited ? "" : val}
                            placeholder={isUnlimited ? "∞ Unlimited" : "Limit"}
                            onChange={(e) =>
                              setForm((s: any) => ({
                                ...s,
                                [q.key]: Math.max(0, parseInt(e.target.value || "0", 10)),
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold disabled:bg-slate-100 disabled:text-slate-400"
                          />
                          <span className="text-[10px] font-semibold text-slate-500 shrink-0">{q.unit}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 3: 16-Feature Matrix Grouped by 4 Categories */}
              <div className="border-t border-slate-100 pt-5 space-y-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  3. Feature Entitlements Matrix ({featureRegistry.length} Capabilities)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {FEATURE_CATEGORIES.map((category) => {
                    const items = featureRegistry.filter((f) => f.category === category);
                    if (items.length === 0) return null;
                    return (
                      <div key={category} className="border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                        <div className="text-[11px] font-extrabold text-teal-800 uppercase tracking-wide border-b border-slate-100 pb-1.5">
                          {category}
                        </div>
                        <div className="space-y-2">
                          {items.map((feat) => {
                            const lockedCore = feat.key === "posBilling";
                            const checked = lockedCore ? true : Boolean(form.features?.[feat.key]);
                            return (
                              <label
                                key={feat.key}
                                className={`flex items-start gap-2.5 p-2 rounded-lg border transition-colors ${
                                  checked
                                    ? "bg-teal-50/40 border-teal-200"
                                    : "bg-white border-slate-100 hover:border-slate-200"
                                } ${lockedCore ? "opacity-80 cursor-not-allowed" : "cursor-pointer"}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={lockedCore}
                                  onChange={(e) =>
                                    setForm((s: any) => ({
                                      ...s,
                                      features: {
                                        ...s.features,
                                        [feat.key]: e.target.checked,
                                      },
                                    }))
                                  }
                                  className="mt-0.5 rounded border-slate-300 text-teal-700"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-slate-900">{feat.label}</span>
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-600 shrink-0">
                                      {feat.recommendedTier}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                    {feat.description}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2 sticky bottom-0 bg-white py-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-teal-700 text-white font-semibold hover:bg-teal-800 disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingPlan ? "Save Plan Changes" : "Create Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
