"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Megaphone,
  PauseCircle,
  PlayCircle,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "@/stores/useToastStore";

function formatDateTime(iso?: string | null): string {
  if (!iso) return "No Expiry";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SuperAdminAnnouncementsPage() {
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [stores, setStores] = useState<{ id: number; storeName: string }[]>([]);
  const [plans, setPlans] = useState<{ code: string; name: string }[]>([]);

  const [form, setForm] = useState({
    title: "",
    message: "",
    severity: "info",
    targetStoreId: "",
    targetPlanCode: "",
    expiresAt: "",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/announcements", { cache: "no-store" });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Failed to load announcements");
      } else {
        setAnnouncements(json.announcements || []);
        setStores(json.stores || []);
        setPlans(json.plans || []);
      }
    } catch {
      toast.error("Failed to fetch platform broadcasts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      toast.error("Title and message are required.");
      return;
    }
    setPublishing(true);
    try {
      const payload = {
        title: form.title.trim(),
        message: form.message.trim(),
        severity: form.severity,
        targetStoreId: form.targetStoreId ? Number(form.targetStoreId) : null,
        targetPlanCode: form.targetPlanCode || null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      };
      const res = await fetch("/api/super-admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Failed to publish announcement");
      } else {
        toast.success("Broadcast published to store admin notifications!");
        setForm({
          title: "",
          message: "",
          severity: "info",
          targetStoreId: "",
          targetPlanCode: "",
          expiresAt: "",
        });
        await loadData();
      }
    } catch {
      toast.error("Network error publishing broadcast");
    } finally {
      setPublishing(false);
    }
  };

  const handleToggleActive = async (item: any) => {
    setBusyId(item.id);
    try {
      const res = await fetch("/api/super-admin/announcements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, active: !item.active }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Failed to update broadcast");
      } else {
        toast.success(json.announcement?.active ? "Broadcast resumed" : "Broadcast paused");
        await loadData();
      }
    } catch {
      toast.error("Failed to toggle broadcast status");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: number) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/super-admin/announcements?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Failed to delete broadcast");
      } else {
        toast.success("Broadcast deleted");
        setConfirmDeleteId(null);
        await loadData();
      }
    } catch {
      toast.error("Failed to delete broadcast");
    } finally {
      setBusyId(null);
    }
  };

  const storeMap = new Map(stores.map((s) => [s.id, s.storeName]));

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-teal-700" />
          <span>Platform Broadcast Announcements</span>
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Publish maintenance notices, compliance alerts, or feature updates directly into Store Admin Notification Bells.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Composer Card */}
        <form
          onSubmit={handlePublish}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4 text-xs"
        >
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <BellRing className="w-4 h-4 text-teal-700" />
            <h2 className="text-sm font-extrabold text-slate-900">Compose Platform Broadcast</h2>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Announcement Headline</label>
            <input
              type="text"
              maxLength={255}
              required
              value={form.title}
              onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
              placeholder="e.g. Scheduled GST Portal Maintenance — Sunday 2 AM"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Severity Level</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "info", label: "Info", cls: "border-sky-300 bg-sky-50 text-sky-800" },
                { id: "warning", label: "Warning", cls: "border-amber-300 bg-amber-50 text-amber-800" },
                { id: "urgent", label: "Urgent", cls: "border-rose-300 bg-rose-50 text-rose-800" },
              ].map((sev) => (
                <button
                  key={sev.id}
                  type="button"
                  onClick={() => setForm((s) => ({ ...s, severity: sev.id }))}
                  className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${
                    form.severity === sev.id
                      ? `${sev.cls} ring-2 ring-offset-1 ring-slate-300`
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {sev.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Target Store</label>
              <select
                value={form.targetStoreId}
                onChange={(e) => setForm((s) => ({ ...s, targetStoreId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
              >
                <option value="">All Stores (Global)</option>
                {stores.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    #{s.id} — {s.storeName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Target Plan Tier</label>
              <select
                value={form.targetPlanCode}
                onChange={(e) => setForm((s) => ({ ...s, targetPlanCode: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
              >
                <option value="">All Plan Tiers</option>
                {plans.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Auto-Expire At (Optional)</label>
            <input
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) => setForm((s) => ({ ...s, expiresAt: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Broadcast Message</label>
            <textarea
              required
              rows={4}
              value={form.message}
              onChange={(e) => setForm((s) => ({ ...s, message: e.target.value }))}
              placeholder="Write clear instructions or notice displayed inside Store Admin notification feeds..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            />
          </div>

          <button
            type="submit"
            disabled={publishing}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-teal-700 text-white font-semibold hover:bg-teal-800 disabled:opacity-50"
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Publish Broadcast
          </button>
        </form>

        {/* Broadcasts History & Live Controls */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900">
              Published Broadcasts ({announcements.length})
            </h2>
          </div>

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1 text-teal-700" />
              Loading broadcasts...
            </div>
          ) : announcements.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs">
              No platform broadcasts published yet. Use the composer on the left to notify store admins.
            </div>
          ) : (
            announcements.map((a) => {
              const isExpired = a.expiresAt && new Date(a.expiresAt) < new Date();
              const busy = busyId === a.id;

              return (
                <div
                  key={a.id}
                  className={`bg-white border rounded-xl p-4 shadow-xs space-y-2.5 ${
                    a.active && !isExpired ? "border-slate-200" : "border-slate-200 opacity-75 bg-slate-50/50"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {a.severity === "urgent" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 uppercase">
                            <AlertTriangle className="w-3 h-3" /> Urgent
                          </span>
                        )}
                        {a.severity === "warning" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase">
                            <AlertTriangle className="w-3 h-3" /> Warning
                          </span>
                        )}
                        {a.severity === "info" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200 uppercase">
                            <Info className="w-3 h-3" /> Info
                          </span>
                        )}

                        {a.active && !isExpired ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Live
                          </span>
                        ) : isExpired ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                            <Clock className="w-3 h-3" /> Expired
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                            Paused
                          </span>
                        )}

                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                          {a.targetStoreId
                            ? `Store: ${storeMap.get(a.targetStoreId) || `#${a.targetStoreId}`}`
                            : "Global (All Stores)"}
                        </span>

                        {a.targetPlanCode && (
                          <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-semibold">
                            Plan: {a.targetPlanCode}
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-bold text-slate-900">{a.title}</h3>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleToggleActive(a)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        {a.active ? (
                          <>
                            <PauseCircle className="w-3.5 h-3.5 text-amber-600" /> Pause
                          </>
                        ) : (
                          <>
                            <PlayCircle className="w-3.5 h-3.5 text-emerald-600" /> Activate
                          </>
                        )}
                      </button>

                      {confirmDeleteId === a.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(a.id)}
                            disabled={busy}
                            className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-semibold hover:bg-rose-700"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 rounded-lg border border-slate-200 text-[11px] text-slate-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(a.id)}
                          disabled={busy}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200"
                          title="Delete announcement"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">{a.message}</p>

                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span>
                      Published by <strong>{a.author?.name || "Platform Admin"}</strong> •{" "}
                      {formatDateTime(a.createdAt)}
                    </span>
                    <span>Expires: {formatDateTime(a.expiresAt)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
