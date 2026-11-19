"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Loader2,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "@/stores/useToastStore";
import { confirmAction } from "@/stores/useConfirmStore";

function formatInr(val: number): string {
  return `₹${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function SuperAdminPaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<any[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [platformCompany, setPlatformCompany] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [invoiceModal, setInvoiceModal] = useState<any | null>(null);

  // Offline Payment Modal
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [offStoreId, setOffStoreId] = useState("");
  const [offPlanId, setOffPlanId] = useState("");
  const [offAmount, setOffAmount] = useState("");
  const [offMethod, setOffMethod] = useState("bank_neft");
  const [offNotes, setOffNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        status: statusFilter,
        ...(search.trim() ? { search: search.trim() } : {}),
      });
      const res = await fetch(`/api/super-admin/payments?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setPayments(json.payments || []);
        setWebhooks(json.recentWebhooks || []);
        setPlans(json.plans || []);
        setStores(json.stores || []);
        setPlatformCompany(json.platformCompany || null);
        setSummary(json.summary || null);
      } else {
        toast.error(json.message || "Failed to load payments ledger");
      }
    } catch {
      toast.error("Network error loading payments ledger");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleRecordOffline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offStoreId || !offPlanId) {
      toast.error("Select both a store and a plan.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/super-admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record_offline_payment",
          storeId: Number(offStoreId),
          planId: Number(offPlanId),
          amountSubtotal: offAmount ? Number(offAmount) : undefined,
          paymentMethod: offMethod,
          referenceNotes: offNotes,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(json.message || "Offline payment recorded");
        setOfflineOpen(false);
        setOffAmount("");
        setOffNotes("");
        fetchPayments();
      } else {
        toast.error(json.message || "Failed to record payment");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefund = async (pay: any) => {
    const ok = await confirmAction({
      title: `Mark Invoice ${pay.invoiceNo} Refunded?`,
      message: `This will deduct ${formatInr(pay.totalAmount)} from Net Collected SaaS Revenue.`,
      confirmText: "Confirm Refund",
      cancelText: "Cancel",
      type: "danger",
    });
    if (!ok) return;

    const res = await fetch("/api/super-admin/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mark_refunded",
        paymentId: pay.id,
        reason: "Refund approved by Super Admin",
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      toast.success(json.message || "Payment marked refunded");
      fetchPayments();
    } else {
      toast.error(json.message || "Failed to mark refunded");
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-teal-700" />
            <span>SaaS Payments, Webhooks &amp; GST Invoices Ledger</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Inspect Razorpay transactions, record offline NEFT/RTGS enterprise payments, issue refunds &amp; print SAC 998314 GST invoices.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOfflineOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Record Offline NEFT / Cheque
          </button>
          <button
            type="button"
            onClick={fetchPayments}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500">Net Collected (Incl. GST)</div>
          <div className="text-xl font-extrabold text-emerald-700 mt-1">{formatInr(summary?.netTotal || 0)}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{summary?.capturedCount || 0} captured invoices</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500">Net Taxable SaaS Base</div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{formatInr(summary?.netPreGst || 0)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500">18% Output GST Collected</div>
          <div className="text-xl font-extrabold text-teal-700 mt-1">{formatInr(summary?.netGst || 0)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500">Refunds &amp; Failed Charges</div>
          <div className="text-xl font-extrabold text-rose-700 mt-1">{formatInr(summary?.totalRefunded || 0)}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {summary?.refundedCount || 0} refunded • {summary?.failedCount || 0} failed
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50"
        >
          <option value="all">All Payment Statuses</option>
          <option value="captured">Captured</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
          <option value="created">Pending / Created</option>
        </select>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SUB-INV, pay_id, store..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs"
          />
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-teal-700 mb-2" />
            <p className="text-xs font-semibold">Loading payments &amp; invoices...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                  <th className="py-3 px-4">Invoice No</th>
                  <th className="py-3 px-3">Store Tenant</th>
                  <th className="py-3 px-3">Plan &amp; Type</th>
                  <th className="py-3 px-3 text-right">Taxable</th>
                  <th className="py-3 px-3 text-right">GST (18%)</th>
                  <th className="py-3 px-3 text-right">Total</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      No payment records found.
                    </td>
                  </tr>
                ) : (
                  payments.map((pay) => (
                    <tr key={pay.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        <div>{pay.invoiceNo}</div>
                        <div className="text-[10px] text-slate-400 font-normal">
                          {new Date(pay.paidAt || pay.createdAt).toLocaleDateString("en-IN")}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <Link
                          href={`/super-admin/stores/${pay.storeId}`}
                          className="font-bold text-slate-900 hover:text-teal-700 inline-flex items-center gap-1"
                        >
                          <span>{pay.storeName}</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </Link>
                        {pay.razorpayPaymentId && (
                          <div className="font-mono text-[10px] text-slate-500">{pay.razorpayPaymentId}</div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800">{pay.planName}</div>
                        <div className="text-[10px] uppercase text-slate-500">
                          {pay.paymentMethod || "razorpay"} • {pay.paymentType}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono">{formatInr(pay.amountSubtotal)}</td>
                      <td className="py-3 px-3 text-right font-mono">{formatInr(pay.gstAmount)}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                        {formatInr(pay.totalAmount)}
                      </td>
                      <td className="py-3 px-3">
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
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => setInvoiceModal(pay)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 font-bold text-slate-700 cursor-pointer"
                        >
                          <Printer className="w-3 h-3" /> Invoice
                        </button>
                        {pay.status === "captured" && (
                          <button
                            type="button"
                            onClick={() => handleRefund(pay)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 font-bold text-rose-700 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" /> Refund
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

      {/* Recent Razorpay Webhook Events Queue */}
      {webhooks.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
            Recent Idempotent Razorpay Webhook Deliveries
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold uppercase text-slate-400">
                  <th className="py-2">Event ID</th>
                  <th className="py-2">Event Type</th>
                  <th className="py-2">Processed</th>
                  <th className="py-2">Received At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {webhooks.slice(0, 10).map((w) => (
                  <tr key={w.id}>
                    <td className="py-2 font-mono text-[11px]">{w.eventId}</td>
                    <td className="py-2 font-semibold">{w.eventType}</td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          w.processed && !w.errorMessage
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {w.processed ? "Processed" : "Error"}
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

      {/* Printable GST Tax Invoice Modal */}
      {invoiceModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
          onClick={() => setInvoiceModal(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-700" />
                SaaS Tax Invoice — {invoiceModal.invoiceNo}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-700 text-white text-xs font-bold cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
                <button type="button" onClick={() => setInvoiceModal(null)} className="text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="flex justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="font-extrabold text-sm">{platformCompany?.legalEntityName}</div>
                  <div className="text-slate-500">
                    GSTIN: {platformCompany?.gstNo || "Registered SaaS Supplier"} • SAC:{" "}
                    {platformCompany?.sacCode || "998314"}
                  </div>
                </div>
                <div className="text-right font-mono font-bold">{invoiceModal.invoiceNo}</div>
              </div>
              <div className="flex justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Billed To</div>
                  <div className="font-bold text-slate-900">{invoiceModal.storeName}</div>
                  <div className="font-mono text-[11px]">GSTIN: {invoiceModal.storeGst || "Unregistered"}</div>
                </div>
                <div className="text-right">
                  <div>Taxable: {formatInr(invoiceModal.amountSubtotal)}</div>
                  <div>GST (18%): {formatInr(invoiceModal.gstAmount)}</div>
                  <div className="font-extrabold text-sm mt-1">Total: {formatInr(invoiceModal.totalAmount)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Offline Payment Modal */}
      {offlineOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
          onClick={() => setOfflineOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">Record Offline Enterprise Payment</h3>
              <button type="button" onClick={() => setOfflineOpen(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleRecordOffline} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Store Tenant</label>
                <select
                  required
                  value={offStoreId}
                  onChange={(e) => setOffStoreId(e.target.value)}
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
                <label className="block font-bold text-slate-700 mb-1">Subscription Plan</label>
                <select
                  required
                  value={offPlanId}
                  onChange={(e) => setOffPlanId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                >
                  <option value="">Select Plan...</option>
                  {plans.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name} ({pl.code}) — {formatInr(pl.priceInr)} (+18% GST)
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Pre-GST Subtotal (INR)</label>
                  <input
                    type="number"
                    min={0}
                    value={offAmount}
                    onChange={(e) => setOffAmount(e.target.value)}
                    placeholder="Default plan price"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Mode</label>
                  <select
                    value={offMethod}
                    onChange={(e) => setOffMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  >
                    <option value="bank_neft">NEFT / RTGS</option>
                    <option value="cheque">Cheque</option>
                    <option value="upi_offline">Corporate UPI</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">UTR / Cheque Reference</label>
                <input
                  type="text"
                  value={offNotes}
                  onChange={(e) => setOffNotes(e.target.value)}
                  placeholder="UTR / Reference No."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOfflineOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold cursor-pointer"
                >
                  {submitting ? "Recording..." : "Issue GST Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
