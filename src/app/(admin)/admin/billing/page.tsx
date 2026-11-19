"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  FileText,
  Loader2,
  Printer,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";
import { toast } from "@/stores/useToastStore";
import { confirmAction } from "@/stores/useConfirmStore";

declare global {
  interface Window {
    Razorpay: any;
  }
}

function loadRazorpayCheckoutScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.getElementById("razorpay-checkout-js");
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-checkout-js";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function formatInr(val: number): string {
  return `₹${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function AdminBillingContent() {
  const searchParams = useSearchParams();
  const highlightFeature = searchParams?.get("highlight") || "";

  const { user } = useAuthStore();
  const {
    loading,
    loaded,
    entitlements,
    subscriptionDetails,
    storeInfo,
    platformCompany,
    usageMeters,
    plans,
    payments,
    razorpayConfigured,
    fetchBillingStatus,
  } = useSubscriptionStore();

  const [billingFilter, setBillingFilter] = useState<"all" | "monthly" | "yearly">("all");
  const [payingPlanId, setPayingPlanId] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState<any | null>(null);

  useEffect(() => {
    fetchBillingStatus();
  }, [fetchBillingStatus]);

  const isStoreAdmin = user?.role === "admin";

  const handleCheckout = useCallback(
    async (plan: any, preferredMode: "subscription" | "order" = "order") => {
      if (!isStoreAdmin) {
        toast.error("Only the Store Administrator can subscribe or change plans.");
        return;
      }

      // Downgrade Capacity Safety Warning (3.7.2)
      if (usageMeters.length > 0) {
        const warnings: string[] = [];
        for (const m of usageMeters) {
          const nextLim = Number(plan.limits?.[m.key] ?? -1);
          if (nextLim > 0 && m.used > nextLim) {
            warnings.push(`${m.label}: currently using ${m.used}, ${plan.name} limit is ${nextLim}`);
          }
        }
        if (warnings.length > 0) {
          const ok = await confirmAction({
            title: "Current Usage Exceeds Target Plan Quotas",
            message: `Warning before switching to ${plan.name}: ${warnings.join(
              "; "
            )}. Existing data remains intact, but adding new records will be paused until capacity is freed or upgraded. Continue?`,
            confirmText: "Proceed Anyway",
            cancelText: "Cancel",
            type: "warning",
          });
          if (!ok) return;
        }
      }

      setPayingPlanId(plan.id);
      try {
        const res = await fetch("/api/admin/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: plan.id, mode: preferredMode }),
        });
        const checkoutJson = await res.json();
        if (!res.ok || !checkoutJson.success) {
          toast.error(checkoutJson.message || "Failed to initiate Razorpay checkout");
          setPayingPlanId(null);
          return;
        }

        const loadedJs = await loadRazorpayCheckoutScript();
        if (!loadedJs || !window.Razorpay) {
          toast.error("Could not load Razorpay Checkout SDK. Check internet connectivity.");
          setPayingPlanId(null);
          return;
        }

        const rzpOptions: any = {
          key: checkoutJson.razorpayKeyId,
          name: platformCompany?.platformName || "Medical POS Cloud",
          description: `${plan.name} (${plan.billingCycle}) Subscription`,
          currency: checkoutJson.currency || "INR",
          prefill: checkoutJson.prefill || {},
          notes: {
            planCode: plan.code,
            storeName: storeInfo?.storeName || "",
          },
          theme: { color: "#1F4E5B" },
          handler: async (rzpResp: any) => {
            try {
              const verRes = await fetch("/api/admin/billing/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  planId: plan.id,
                  mode: checkoutJson.mode,
                  razorpay_payment_id: rzpResp.razorpay_payment_id,
                  razorpay_order_id: rzpResp.razorpay_order_id || undefined,
                  razorpay_subscription_id: rzpResp.razorpay_subscription_id || undefined,
                  razorpay_customer_id: checkoutJson.customerId || undefined,
                  razorpay_signature: rzpResp.razorpay_signature,
                }),
              });
              const verJson = await verRes.json();
              if (verRes.ok && verJson.success) {
                toast.success(verJson.message || `${plan.name} activated!`);
                await fetchBillingStatus();
              } else {
                toast.error(verJson.message || "Payment verification failed");
              }
            } catch {
              toast.error("Verification request failed after Razorpay callback.");
            } finally {
              setPayingPlanId(null);
            }
          },
          modal: {
            ondismiss: () => {
              setPayingPlanId(null);
              toast.info("Razorpay checkout closed before completion.");
            },
          },
        };

        if (checkoutJson.mode === "subscription") {
          rzpOptions.subscription_id = checkoutJson.subscriptionId;
        } else {
          rzpOptions.order_id = checkoutJson.orderId;
          rzpOptions.amount = checkoutJson.amountPaise;
        }

        const rzp = new window.Razorpay(rzpOptions);
        rzp.on("payment.failed", (failResp: any) => {
          toast.error(failResp?.error?.description || "Razorpay payment failed");
          setPayingPlanId(null);
        });
        rzp.open();
      } catch {
        toast.error("Error initiating checkout");
        setPayingPlanId(null);
      }
    },
    [isStoreAdmin, usageMeters, platformCompany, storeInfo, fetchBillingStatus]
  );

  const handleCancelRenewal = async () => {
    const ok = await confirmAction({
      title: "Cancel Auto-Renewal at Period End?",
      message:
        "Your current features will remain active until the end of the current billing period. Future automatic renewals will be stopped.",
      confirmText: "Confirm Cancel Auto-Renew",
      cancelText: "Keep Active",
      type: "danger",
    });
    if (!ok) return;

    setCancelling(true);
    try {
      const res = await fetch("/api/admin/billing/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_subscription" }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(json.message || "Auto-renewal scheduled for cancellation");
        await fetchBillingStatus();
      } else {
        toast.error(json.message || "Failed to update cancellation setting");
      }
    } finally {
      setCancelling(false);
    }
  };

  if (loading && !loaded) {
    return (
      <div className="max-w-7xl mx-auto py-20 flex flex-col items-center justify-center text-slate-500">
        <Loader2 className="w-7 h-7 animate-spin text-[#1F4E5B] mb-2" />
        <p className="text-xs font-semibold">Loading store subscription & billing portal...</p>
      </div>
    );
  }

  const paidPlans = plans.filter((p) => {
    if (p.priceInr <= 0) return false;
    if (billingFilter === "monthly") return p.billingCycle === "monthly";
    if (billingFilter === "yearly") return p.billingCycle === "yearly";
    return true;
  });

  const prorationCredit = Number(subscriptionDetails?.prorationCreditInr || 0);
  const currentPrice = Number(subscriptionDetails?.currentPlanPriceInr || 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#1F4E5B]" />
            <span>Subscription, Quotas & Billing Portal</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor store capacity in real time, upgrade via Razorpay, manage auto-renewal, and download GST tax invoices.
          </p>
        </div>

        {!razorpayConfigured && (
          <span className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
            Razorpay keys not configured on server
          </span>
        )}
      </div>

      {!isStoreAdmin && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>
            You are viewing Billing in <strong>Read-Only mode</strong> ({user?.role}). Only the Pharmacy Store Admin can purchase plans or modify renewals.
          </span>
        </div>
      )}

      {/* Active Plan Hero Card */}
      <div className="bg-gradient-to-r from-[#1F4E5B] to-[#0F766E] text-white rounded-3xl p-6 shadow-md flex flex-wrap items-center justify-between gap-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-white/15 text-emerald-200">
              Current Plan
            </span>
            <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-white text-[#1F4E5B]">
              {entitlements?.subscriptionStatus || "active"}
            </span>
            {subscriptionDetails?.cancelAtPeriodEnd && (
              <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-rose-500 text-white">
                Cancels at Period End
              </span>
            )}
          </div>
          <h2 className="text-2xl font-extrabold">{entitlements?.planName || "Standard Workspace"}</h2>
          <p className="text-xs text-teal-100">
            {entitlements?.currentPeriodEnd
              ? `Current billing cycle ends on ${new Date(entitlements.currentPeriodEnd).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}`
              : entitlements?.isLegacyUnassigned
              ? "Legacy / Starter Workspace — Pick a managed cloud plan below for Razorpay billing & automated GST invoices."
              : "Active subscription workspace."}
            {prorationCredit > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded bg-white/15 font-bold text-amber-200">
                Upgrading today credits {formatInr(prorationCredit)} unused balance!
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isStoreAdmin &&
            subscriptionDetails &&
            !subscriptionDetails.cancelAtPeriodEnd &&
            entitlements?.subscriptionStatus === "active" && (
              <button
                type="button"
                onClick={handleCancelRenewal}
                disabled={cancelling}
                className="px-4 py-2 rounded-xl border border-white/30 bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {cancelling ? "Scheduling..." : "Cancel Auto-Renew"}
              </button>
            )}
        </div>
      </div>

      {/* Live Usage Meters Grid (Module 3.7.1) */}
      <div className="space-y-3">
        <h3 className="text-sm font-extrabold text-slate-900">Live Workspace Capacity & Quotas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {usageMeters.map((m) => {
            const unlimited = m.limit === -1;
            const barColor = unlimited
              ? "bg-teal-500 w-1/4"
              : m.percent >= 95
              ? "bg-rose-500"
              : m.percent >= 70
              ? "bg-amber-500"
              : "bg-emerald-500";
            return (
              <div key={m.key} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>{m.label}</span>
                  <span className="font-mono text-slate-900">
                    {m.used} / {unlimited ? "∞" : m.limit}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={!unlimited ? { width: `${Math.min(100, m.percent)}%` } : undefined}
                  />
                </div>
                <p className="text-[10px] text-slate-500">
                  {unlimited ? "Unlimited on current tier" : `${m.percent}% of ${m.limit} ${m.unit} used`}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Plan Comparison & Razorpay Purchase Grid */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              Compare Plans & Upgrade Instantly
            </h3>
            {highlightFeature && (
              <p className="text-[11px] text-teal-700 font-semibold mt-0.5">
                Plans unlocking <strong>{highlightFeature}</strong> are highlighted below.
              </p>
            )}
          </div>

          <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 text-xs font-bold">
            {[
              { id: "all", label: "All Tiers" },
              { id: "monthly", label: "Monthly" },
              { id: "yearly", label: "Yearly (Save 2 Months)" },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setBillingFilter(opt.id as any)}
                className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  billingFilter === opt.id ? "bg-[#1F4E5B] text-white" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {paidPlans.map((plan) => {
            const isCurrent = entitlements?.planId === plan.id && !entitlements?.isReadOnlyLocked;
            const unlocksHighlighted = highlightFeature ? Boolean(plan.features?.[highlightFeature]) : false;
            const isUpgrade = currentPrice > 0 && plan.priceInr > currentPrice && prorationCredit > 0;
            const netPayableBeforeGst = isUpgrade
              ? Math.max(1, Math.round((plan.priceInr - prorationCredit) * 100) / 100)
              : plan.priceInr;
            const busy = payingPlanId === plan.id;

            return (
              <div
                key={plan.id}
                className={`bg-white rounded-3xl border p-5 shadow-xs flex flex-col justify-between space-y-5 ${
                  unlocksHighlighted
                    ? "border-teal-600 ring-2 ring-teal-500/25"
                    : plan.isRecommended
                    ? "border-[#1F4E5B] ring-1 ring-[#1F4E5B]/20"
                    : "border-slate-200"
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {plan.code}
                    </span>
                    <div className="flex items-center gap-1">
                      {unlocksHighlighted && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                          <Sparkles className="w-3 h-3" /> Unlocks Requested
                        </span>
                      )}
                      {plan.isRecommended && (
                        <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 text-[10px] font-bold">
                          Recommended
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-lg font-extrabold text-slate-900">{plan.name}</h4>
                    {plan.tagline && <p className="text-xs text-slate-500 mt-0.5">{plan.tagline}</p>}
                  </div>

                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold text-slate-900">
                        {formatInr(netPayableBeforeGst)}
                      </span>
                      <span className="text-xs text-slate-500 font-semibold">
                        / {plan.billingCycle} (+18% GST)
                      </span>
                    </div>
                    {isUpgrade && (
                      <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                        Original {formatInr(plan.priceInr)} minus {formatInr(prorationCredit)} proration credit!
                      </p>
                    )}
                  </div>

                  {/* Key Limits */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 grid grid-cols-2 gap-1.5 text-[11px]">
                    <div>
                      Branches:{" "}
                      <strong>{plan.limits.maxBranches === -1 ? "Unlimited" : plan.limits.maxBranches}</strong>
                    </div>
                    <div>
                      Staff:{" "}
                      <strong>{plan.limits.maxStaffUsers === -1 ? "Unlimited" : plan.limits.maxStaffUsers}</strong>
                    </div>
                    <div>
                      SKUs:{" "}
                      <strong>{plan.limits.maxMedicines === -1 ? "Unlimited" : plan.limits.maxMedicines}</strong>
                    </div>
                    <div>
                      Bills/mo:{" "}
                      <strong>
                        {plan.limits.maxMonthlyInvoices === -1 ? "Unlimited" : plan.limits.maxMonthlyInvoices}
                      </strong>
                    </div>
                  </div>

                  {/* Feature Checklist */}
                  <div className="space-y-1.5 text-xs">
                    {[
                      { k: "multiBranchManagement", label: "Multi-Branch Management" },
                      { k: "supplierPortalAndGrn", label: "Supplier Portal & Extranet" },
                      { k: "patientPortalAndRxQueue", label: "Customer Rx Upload Portal" },
                      { k: "twoWayMessagingInboxes", label: "Two-Way Messaging Inboxes" },
                      { k: "gstAndRegulatoryReports", label: "GSTR-1/3B & Schedule H/H1" },
                      { k: "advancedBiAndProfitReports", label: "Sales BI, P&L & Dead Stock" },
                      { k: "excelAndCsvExports", label: "Excel (.xlsx) & CSV Exports" },
                      { k: "customDiscountsAndDayEndClose", label: "Discounts & Day-End Z-Report" },
                    ].map((row) => {
                      const on = Boolean(plan.features?.[row.k]);
                      return (
                        <div
                          key={row.k}
                          className={`flex items-center gap-2 ${
                            on ? "text-slate-800 font-semibold" : "text-slate-400"
                          }`}
                        >
                          {on ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          )}
                          <span>{row.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  {isCurrent ? (
                    <div className="w-full py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-extrabold text-center">
                      Currently Active Tier
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={!isStoreAdmin || busy || !razorpayConfigured}
                        onClick={() => handleCheckout(plan, "order")}
                        className="w-full py-2.5 px-4 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                        <span>
                          {isUpgrade ? `Upgrade Now (${formatInr(netPayableBeforeGst)} + GST)` : "Pay / Subscribe via Razorpay"}
                        </span>
                      </button>
                      {plan.razorpayReady && plan.billingCycle !== "lifetime" && (
                        <button
                          type="button"
                          disabled={!isStoreAdmin || busy || !razorpayConfigured}
                          onClick={() => handleCheckout(plan, "subscription")}
                          className="w-full py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                        >
                          Setup Auto-Renew Mandate (e-Mandate / UPI)
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment History & Printable SaaS GST Invoices */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#1F4E5B]" />
            <h3 className="text-sm font-extrabold text-slate-900">
              Payment History & GST Tax Invoices (SAC {platformCompany?.sacCode || "998314"})
            </h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                <th className="py-3 px-4">Invoice No</th>
                <th className="py-3 px-3">Plan</th>
                <th className="py-3 px-3">Method / Type</th>
                <th className="py-3 px-3 text-right">Taxable</th>
                <th className="py-3 px-3 text-right">GST (18%)</th>
                <th className="py-3 px-3 text-right">Total</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-4 text-right">Tax Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    No subscription invoices generated yet.
                  </td>
                </tr>
              ) : (
                payments.map((pay) => (
                  <tr key={pay.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      <div>{pay.invoiceNo}</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        {new Date(pay.paidAt || pay.createdAt).toLocaleDateString("en-IN")}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-800">{pay.planName}</td>
                    <td className="py-3 px-3 text-[11px] text-slate-500 uppercase">
                      {pay.paymentMethod || "razorpay"} • {pay.paymentType}
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
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setInvoiceModal(pay)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 font-bold text-slate-700 cursor-pointer"
                      >
                        <Printer className="w-3 h-3" /> Print GST Invoice
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Printable SaaS GST Tax Invoice Modal (Module 3.7.2) */}
      {invoiceModal && (
        <div
          className="fixed inset-0 z-[9992] bg-slate-950/60 flex items-center justify-center p-4"
          onClick={() => setInvoiceModal(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between print:hidden">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#1F4E5B]" />
                Tax Invoice — {invoiceModal.invoiceNo}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#1F4E5B] text-white text-xs font-bold cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" /> Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceModal(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5 text-xs text-slate-800">
              <div className="flex flex-wrap justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <h4 className="text-base font-extrabold text-slate-900">
                    {platformCompany?.legalEntityName || platformCompany?.platformName || "Medical POS Cloud"}
                  </h4>
                  <p className="text-slate-500 mt-0.5">{platformCompany?.billingAddress || "India"}</p>
                  <p className="font-mono mt-1">
                    <strong>GSTIN:</strong> {platformCompany?.gstNo || "Registered SaaS Supplier"} •{" "}
                    <strong>SAC:</strong> {platformCompany?.sacCode || "998314"}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-extrabold uppercase text-[#1F4E5B]">TAX INVOICE</div>
                  <div className="font-mono font-bold">{invoiceModal.invoiceNo}</div>
                  <div className="text-slate-500">
                    Date: {new Date(invoiceModal.paidAt || invoiceModal.createdAt).toLocaleDateString("en-IN")}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Billed To (Store Tenant)</div>
                  <div className="font-extrabold text-slate-900 mt-0.5">{storeInfo?.storeName || "Pharmacy Store"}</div>
                  <div className="text-slate-600">{storeInfo?.storeAddress || "—"}</div>
                  <div className="font-mono mt-1">
                    <strong>Buyer GSTIN:</strong> {storeInfo?.storeGst || "Unregistered"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Payment Status</div>
                  <div className="font-extrabold uppercase mt-0.5">{invoiceModal.status}</div>
                  <div className="text-slate-600 uppercase">Mode: {invoiceModal.paymentMethod || "razorpay"}</div>
                </div>
              </div>

              {(() => {
                const sellerGst = (platformCompany?.gstNo || "").trim();
                const buyerGst = (storeInfo?.storeGst || "").trim();
                const sellerState = /^\d{2}/.test(sellerGst) ? sellerGst.slice(0, 2) : null;
                const buyerState = /^\d{2}/.test(buyerGst) ? buyerGst.slice(0, 2) : null;
                const isInterState = Boolean(sellerState && buyerState && sellerState !== buyerState);

                return (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                        <th className="py-2">Description (SaaS Cloud License)</th>
                        <th className="py-2">SAC</th>
                        <th className="py-2 text-right">Taxable Value</th>
                        {isInterState ? (
                          <th className="py-2 text-right">IGST (18%)</th>
                        ) : (
                          <>
                            <th className="py-2 text-right">CGST (9%)</th>
                            <th className="py-2 text-right">SGST (9%)</th>
                          </>
                        )}
                        <th className="py-2 text-right">Total (INR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="py-3 font-semibold">
                          {invoiceModal.planName} ({invoiceModal.planCode}) — {invoiceModal.paymentType}
                        </td>
                        <td className="py-3 font-mono">{platformCompany?.sacCode || "998314"}</td>
                        <td className="py-3 text-right font-mono">{formatInr(invoiceModal.amountSubtotal)}</td>
                        {isInterState ? (
                          <td className="py-3 text-right font-mono">{formatInr(invoiceModal.gstAmount)}</td>
                        ) : (
                          <>
                            <td className="py-3 text-right font-mono">{formatInr(invoiceModal.gstAmount / 2)}</td>
                            <td className="py-3 text-right font-mono">{formatInr(invoiceModal.gstAmount / 2)}</td>
                          </>
                        )}
                        <td className="py-3 text-right font-mono font-extrabold text-slate-900">
                          {formatInr(invoiceModal.totalAmount)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()}

              <div className="text-[11px] text-slate-500 pt-2">
                This is a system-generated B2B SaaS Tax Invoice under SAC {platformCompany?.sacCode || "998314"} (Software Publishing & Cloud POS Services). Input Tax Credit eligible where Buyer GSTIN is recorded.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminBillingPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto py-20 flex flex-col items-center justify-center text-slate-500">
          <Loader2 className="w-7 h-7 animate-spin text-[#1F4E5B] mb-2" />
          <p className="text-xs font-semibold">Loading billing workspace...</p>
        </div>
      }
    >
      <AdminBillingContent />
    </Suspense>
  );
}
