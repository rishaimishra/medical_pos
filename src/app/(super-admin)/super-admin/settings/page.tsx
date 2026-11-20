"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Save,
  Settings,
  ShieldCheck,
  Webhook,
} from "lucide-react";
import { toast } from "@/stores/useToastStore";

export default function SuperAdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recentWebhooks, setRecentWebhooks] = useState<any[]>([]);
  const [meta, setMeta] = useState<{
    hasKeySecret: boolean;
    hasWebhookSecret: boolean;
    keySecretSource: string;
    webhookSecretSource: string;
    updatedAt: string | null;
  }>({
    hasKeySecret: false,
    hasWebhookSecret: false,
    keySecretSource: "unset",
    webhookSecretSource: "unset",
    updatedAt: null,
  });

  const [form, setForm] = useState({
    platformName: "Medical POS Cloud",
    legalEntityName: "Medical POS SaaS Pvt. Ltd.",
    gstNo: "",
    sacCode: "998314",
    billingAddress: "",
    supportEmail: "",
    supportPhone: "",
    defaultTrialDays: "14",
    gracePeriodDays: "7",
    razorpayMode: "test",
    razorpayKeyId: "",
    razorpayKeySecret: "",
    razorpayWebhookSecret: "",
  });

  const [maskedDisplay, setMaskedDisplay] = useState({
    keySecret: "",
    webhookSecret: "",
  });

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/settings", { cache: "no-store" });
      const json = await res.json();
      if (json.success && json.settings) {
        const s = json.settings;
        setForm({
          platformName: s.platformName || "Medical POS Cloud",
          legalEntityName: s.legalEntityName || "",
          gstNo: s.gstNo || "",
          sacCode: s.sacCode || "998314",
          billingAddress: s.billingAddress || "",
          supportEmail: s.supportEmail || "",
          supportPhone: s.supportPhone || "",
          defaultTrialDays: String(s.defaultTrialDays ?? 14),
          gracePeriodDays: String(s.gracePeriodDays ?? 7),
          razorpayMode: s.razorpayMode || "test",
          razorpayKeyId: s.razorpayKeyId || "",
          razorpayKeySecret: "",
          razorpayWebhookSecret: "",
        });
        setMaskedDisplay({
          keySecret: s.razorpayKeySecretMasked || "",
          webhookSecret: s.razorpayWebhookSecretMasked || "",
        });
        setMeta({
          hasKeySecret: Boolean(s.hasKeySecret),
          hasWebhookSecret: Boolean(s.hasWebhookSecret),
          keySecretSource: s.keySecretSource || "unset",
          webhookSecretSource: s.webhookSecretSource || "unset",
          updatedAt: s.updatedAt || null,
        });
        setRecentWebhooks(json.recentWebhooks || []);
      } else {
        toast.error(json.message || "Failed to load platform settings");
      }
    } catch {
      toast.error("Network error loading platform settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformName: form.platformName,
          legalEntityName: form.legalEntityName,
          gstNo: form.gstNo,
          sacCode: form.sacCode,
          billingAddress: form.billingAddress,
          supportEmail: form.supportEmail,
          supportPhone: form.supportPhone,
          defaultTrialDays: Number(form.defaultTrialDays || 14),
          gracePeriodDays: Number(form.gracePeriodDays || 7),
          razorpayMode: form.razorpayMode,
          razorpayKeyId: form.razorpayKeyId,
          ...(form.razorpayKeySecret.trim() ? { razorpayKeySecret: form.razorpayKeySecret.trim() } : {}),
          ...(form.razorpayWebhookSecret.trim()
            ? { razorpayWebhookSecret: form.razorpayWebhookSecret.trim() }
            : {}),
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(json.message || "Platform settings saved!");
        setForm((p) => ({ ...p, razorpayKeySecret: "", razorpayWebhookSecret: "" }));
        await loadSettings();
      } else {
        toast.error(json.message || "Failed to save platform settings");
      }
    } finally {
      setSaving(false);
    }
  };

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/razorpay`
      : "/api/webhooks/razorpay";

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-20 flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="w-7 h-7 animate-spin text-teal-700 mb-2" />
        <p className="text-xs font-semibold">Loading Platform Settings &amp; Security Vault...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-teal-700" />
            <span>Platform Settings, SaaS Tax &amp; Razorpay Vault</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure legal SaaS billing details (SAC {form.sacCode}), trial/grace rules &amp; AES-256 encrypted Razorpay secrets (always masked in API responses).
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
          <ShieldCheck className="w-3.5 h-3.5" /> Secrets Masked (`••••••••1a2b`)
        </span>
      </div>

      <form onSubmit={handleSave} className="space-y-5 text-xs">
        {/* Legal Entity & SaaS GST Billing Profile */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <Building2 className="w-4 h-4 text-teal-700" />
            Platform Legal Entity &amp; SaaS GST Tax Profile
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Platform Brand Name</label>
              <input
                type="text"
                required
                value={form.platformName}
                onChange={(e) => setForm((p) => ({ ...p, platformName: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Registered Legal Entity Name</label>
              <input
                type="text"
                value={form.legalEntityName}
                onChange={(e) => setForm((p) => ({ ...p, legalEntityName: e.target.value }))}
                placeholder="e.g. Medical POS Cloud Pvt. Ltd."
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Platform Company GSTIN</label>
              <input
                type="text"
                value={form.gstNo}
                onChange={(e) => setForm((p) => ({ ...p, gstNo: e.target.value.toUpperCase() }))}
                placeholder="e.g. 19AABCU9603R1ZM"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">SAC Code (SaaS License)</label>
              <input
                type="text"
                value={form.sacCode}
                onChange={(e) => setForm((p) => ({ ...p, sacCode: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Support Email</label>
              <input
                type="email"
                value={form.supportEmail}
                onChange={(e) => setForm((p) => ({ ...p, supportEmail: e.target.value }))}
                placeholder="billing@platform.com"
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Support Phone</label>
              <input
                type="text"
                value={form.supportPhone}
                onChange={(e) => setForm((p) => ({ ...p, supportPhone: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">Registered Billing Address</label>
              <input
                type="text"
                value={form.billingAddress}
                onChange={(e) => setForm((p) => ({ ...p, billingAddress: e.target.value }))}
                placeholder="Registered office address printed on SUB-INV-... invoices"
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Default Free Trial Days (New Signups)</label>
              <input
                type="number"
                min={1}
                max={90}
                value={form.defaultTrialDays}
                onChange={(e) => setForm((p) => ({ ...p, defaultTrialDays: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Renewal Failure Grace Period (Days)</label>
              <input
                type="number"
                min={0}
                max={30}
                value={form.gracePeriodDays}
                onChange={(e) => setForm((p) => ({ ...p, gracePeriodDays: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Masked Razorpay Gateway Vault */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-teal-700" />
              Razorpay Payment Gateway &amp; Webhook Security
            </h2>
            <div className="flex items-center gap-2 text-[11px]">
              <span
                className={`px-2 py-0.5 rounded-full font-bold ${
                  meta.hasKeySecret ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                API Key Secret: {meta.hasKeySecret ? `Active (${meta.keySecretSource})` : "Not Set"}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full font-bold ${
                  meta.hasWebhookSecret ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                Webhook Secret: {meta.hasWebhookSecret ? `Active (${meta.webhookSecretSource})` : "Not Set"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Gateway Mode</label>
              <select
                value={form.razorpayMode}
                onChange={(e) => setForm((p) => ({ ...p, razorpayMode: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-semibold"
              >
                <option value="test">Test / Sandbox (rzp_test_...)</option>
                <option value="live">Production Live (rzp_live_...)</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Razorpay Public Key ID</label>
              <input
                type="text"
                value={form.razorpayKeyId}
                onChange={(e) => setForm((p) => ({ ...p, razorpayKeyId: e.target.value }))}
                placeholder="rzp_test_xxxxxxxxxx"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Razorpay Key Secret{" "}
                {maskedDisplay.keySecret && (
                  <span className="font-mono text-teal-700 ml-1">({maskedDisplay.keySecret})</span>
                )}
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={form.razorpayKeySecret}
                onChange={(e) => setForm((p) => ({ ...p, razorpayKeySecret: e.target.value }))}
                placeholder={maskedDisplay.keySecret || "Enter new key secret (leave blank to keep existing)"}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Razorpay Webhook Secret{" "}
                {maskedDisplay.webhookSecret && (
                  <span className="font-mono text-teal-700 ml-1">({maskedDisplay.webhookSecret})</span>
                )}
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={form.razorpayWebhookSecret}
                onChange={(e) => setForm((p) => ({ ...p, razorpayWebhookSecret: e.target.value }))}
                placeholder={maskedDisplay.webhookSecret || "Enter webhook secret (leave blank to keep existing)"}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Webhook className="w-4 h-4 text-teal-700" />
              <span className="font-semibold text-slate-700">Webhook Endpoint:</span>
              <code className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-900">
                {webhookUrl}
              </code>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(webhookUrl);
                toast.success("Webhook endpoint copied");
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 font-bold text-slate-700 cursor-pointer"
            >
              <Copy className="w-3 h-3" /> Copy URL
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{saving ? "Encrypting & Saving..." : "Save Platform Settings"}</span>
          </button>
        </div>
      </form>

      {recentWebhooks.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Recent Webhook Signature Verifications
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] uppercase text-slate-400">
                  <th className="py-2">Event ID</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Signature</th>
                  <th className="py-2">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentWebhooks.map((w) => (
                  <tr key={w.id}>
                    <td className="py-2 font-mono">{w.eventId}</td>
                    <td className="py-2 font-semibold">{w.eventType}</td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          w.signatureVerified ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {w.signatureVerified ? "Verified HMAC" : "Invalid"}
                      </span>
                    </td>
                    <td className="py-2 text-slate-500">{new Date(w.createdAt).toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
