"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  CreditCard,
  Banknote,
  QrCode,
  FileCheck2,
  Users,
  AlertTriangle,
  Stethoscope,
  ArrowRight,
  ShieldAlert,
  Layers,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import { useCartStore } from "@/stores/useCartStore";
import { useBranchStore } from "@/stores/useBranchStore";
import { toast } from "@/stores/useToastStore";
import { triggerCashDrawerKick } from "@/lib/cashDrawer";

interface PaymentTenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaleCompleted: (saleData: any) => void;
  onOpenCustomerModal: () => void;
  storeUpiId?: string;
}

export function PaymentTenderModal({
  isOpen,
  onClose,
  onSaleCompleted,
  onOpenCustomerModal,
  storeUpiId = "drxstore@upi",
}: PaymentTenderModalProps) {
  const {
    items,
    getSubtotal,
    getTotalGst,
    getGrandTotal,
    discountAmount,
    paymentMethod,
    setPaymentMethod,
    tenderedAmount,
    setTenderedAmount,
    upiRef,
    chequeNo,
    chequeBank,
    chequeDate,
    setPaymentDetails,
    customer,
    doctorName,
    doctorRegNo,
    setDoctor,
  } = useCartStore();

  const { activeBranch } = useBranchStore();

  const grandTotal = getGrandTotal();
  const subtotal = getSubtotal();
  const totalGst = getTotalGst();

  // Single tender local states
  const [localTendered, setLocalTendered] = useState<string>(
    tenderedAmount > 0 ? String(tenderedAmount) : String(Math.ceil(grandTotal))
  );
  const [localUpiRef, setLocalUpiRef] = useState(upiRef);
  const [localCardAuth, setLocalCardAuth] = useState("");
  const [localCardLast4, setLocalCardLast4] = useState("");
  const [localChequeNo, setLocalChequeNo] = useState(chequeNo);
  const [localChequeBank, setLocalChequeBank] = useState(chequeBank);
  const [localChequeDate, setLocalChequeDate] = useState(chequeDate);
  const [localDoctorName, setLocalDoctorName] = useState(doctorName);
  const [localDoctorRegNo, setLocalDoctorRegNo] = useState(doctorRegNo);

  // Multi-tender split local states (Module 2.5.1)
  const [splitCash, setSplitCash] = useState<string>("");
  const [splitCashTendered, setSplitCashTendered] = useState<string>("");
  const [splitUpi, setSplitUpi] = useState<string>("");
  const [splitCard, setSplitCard] = useState<string>("");
  const [splitCheque, setSplitCheque] = useState<string>("");
  const [splitCredit, setSplitCredit] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset and sync state on modal open
  useEffect(() => {
    if (isOpen) {
      setLocalTendered(String(Math.ceil(grandTotal)));
      setTenderedAmount(Math.ceil(grandTotal));
      setError(null);

      // Default split allocations to zero/empty
      setSplitCash(String(Math.ceil(grandTotal)));
      setSplitCashTendered(String(Math.ceil(grandTotal)));
      setSplitUpi("");
      setSplitCard("");
      setSplitCheque("");
      setSplitCredit("");
    }
  }, [isOpen, grandTotal, setTenderedAmount]);

  // Single cash calculations
  const numSingleTendered = parseFloat(localTendered) || 0;
  const singleChangeDue = Math.max(0, numSingleTendered - grandTotal);
  const singleCashShortfall = Math.max(0, grandTotal - numSingleTendered);

  // Split tender calculations
  const numSplitCash = parseFloat(splitCash) || 0;
  const numSplitCashTendered = parseFloat(splitCashTendered) || numSplitCash;
  const numSplitUpi = parseFloat(splitUpi) || 0;
  const numSplitCard = parseFloat(splitCard) || 0;
  const numSplitCheque = parseFloat(splitCheque) || 0;
  const numSplitCredit = parseFloat(splitCredit) || 0;

  const totalSplitAllocated =
    numSplitCash + numSplitUpi + numSplitCard + numSplitCheque + numSplitCredit;
  const splitUnallocated = Math.max(0, Math.round((grandTotal - totalSplitAllocated) * 100) / 100);
  const splitOverAllocated = Math.max(0, Math.round((totalSplitAllocated - grandTotal) * 100) / 100);
  const splitCashChangeDue = Math.max(0, numSplitCashTendered - numSplitCash);

  // Customer Baki Khata credit calculations
  const creditLimit = customer ? Number(customer.creditLimit || 0) : 0;
  const currentDue = customer ? Number(customer.currentDue || 0) : 0;
  const availableCredit = Math.max(0, creditLimit - currentDue);

  const isCreditOverLimit =
    (paymentMethod === "credit" && currentDue + grandTotal > creditLimit) ||
    (paymentMethod === "split" && numSplitCredit > 0 && currentDue + numSplitCredit > creditLimit);

  // Schedule H / H1 drug check
  const hasScheduleDrugs = items.some(
    (item: any) => item.scheduleType === "schedule_h" || item.scheduleType === "schedule_h1"
  );

  const handleCashPreset = (amount: number) => {
    if (paymentMethod === "cash") {
      setLocalTendered(String(amount));
      setTenderedAmount(amount);
    } else if (paymentMethod === "split") {
      setSplitCashTendered(String(amount));
    }
  };

  const allocateRemainingTo = (tenderType: "cash" | "upi" | "card" | "cheque" | "credit") => {
    const currentTenderVal =
      tenderType === "cash"
        ? numSplitCash
        : tenderType === "upi"
        ? numSplitUpi
        : tenderType === "card"
        ? numSplitCard
        : tenderType === "cheque"
        ? numSplitCheque
        : numSplitCredit;

    const newTarget = Math.max(0, currentTenderVal + splitUnallocated);
    const rounded = Math.round(newTarget * 100) / 100;

    if (tenderType === "cash") {
      setSplitCash(rounded > 0 ? String(rounded) : "");
      setSplitCashTendered(rounded > 0 ? String(Math.ceil(rounded)) : "");
    } else if (tenderType === "upi") {
      setSplitUpi(rounded > 0 ? String(rounded) : "");
    } else if (tenderType === "card") {
      setSplitCard(rounded > 0 ? String(rounded) : "");
    } else if (tenderType === "cheque") {
      setSplitCheque(rounded > 0 ? String(rounded) : "");
    } else if (tenderType === "credit") {
      setSplitCredit(rounded > 0 ? String(rounded) : "");
    }
  };

  // Manual cash drawer kick button handler (Module 2.5.2)
  const handleManualDrawerKick = async () => {
    await triggerCashDrawerKick({ silent: false, recordAudit: true, reason: "Manual Kick from POS Modal" });
    toast.success("Cash drawer pulse sent and chime triggered!");
  };

  const handleFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (items.length === 0) {
      setError("Billing cart is empty.");
      return;
    }

    if (paymentMethod === "cash" && numSingleTendered < grandTotal) {
      setError(`Cash tendered (₹${numSingleTendered.toFixed(2)}) is less than bill amount (₹${grandTotal.toFixed(2)}).`);
      return;
    }

    if (paymentMethod === "split") {
      if (totalSplitAllocated < grandTotal - 0.01) {
        setError(
          `Split allocation total (₹${totalSplitAllocated.toFixed(2)}) is less than bill amount (₹${grandTotal.toFixed(2)}). Please allocate remaining ₹${splitUnallocated.toFixed(2)}.`
        );
        return;
      }

      if (numSplitCredit > 0 && !customer) {
        setError("A registered customer is required to allocate Store Credit (Baki Khata).");
        return;
      }

      if (numSplitCheque > 0 && (!localChequeNo.trim() || !localChequeBank.trim())) {
        setError("Cheque Number and Bank Name are required for cheque split tender.");
        return;
      }
    }

    if (paymentMethod === "credit") {
      if (!customer) {
        setError("A registered customer must be selected for Credit / Baki Khata sales.");
        return;
      }
      if (creditLimit <= 0) {
        setError(`Customer '${customer.name}' does not have an approved Baki Khata credit limit.`);
        return;
      }
      if (isCreditOverLimit) {
        setError(
          `Credit limit exceeded: ${customer.name}'s approved limit is ₹${creditLimit.toFixed(2)}, current outstanding due is ₹${currentDue.toFixed(2)}.`
        );
        return;
      }
    }

    if (paymentMethod === "cheque" && (!localChequeNo.trim() || !localChequeBank.trim())) {
      setError("Cheque Number and Bank Name are required for Cheque payment.");
      return;
    }

    setSubmitting(true);

    try {
      setPaymentDetails({
        upiRef: localUpiRef.trim(),
        chequeNo: localChequeNo.trim(),
        chequeBank: localChequeBank.trim(),
        chequeDate: localChequeDate,
      });
      setDoctor(localDoctorName.trim(), localDoctorRegNo.trim());

      const payload: any = {
        customerId: customer?.id || null,
        paymentMethod,
        branchId: activeBranch?.id || null,
        items: items.map((i) => ({
          batchId: i.batchId,
          quantity: i.quantity,
          discountAmount: i.discountAmount,
          discountPercent: i.discountPercent,
          managerApprovedBy: i.managerApprovedBy,
        })),
        discountAmount,
        doctorName: localDoctorName.trim() || null,
        doctorRegNo: localDoctorRegNo.trim() || null,
      };

      if (paymentMethod === "split") {
        payload.splitPayments = {
          cash: numSplitCash,
          cashTendered: numSplitCashTendered,
          upi: numSplitUpi,
          card: numSplitCard,
          cheque: numSplitCheque,
          credit: numSplitCredit,
        };
        payload.upiRef = numSplitUpi > 0 ? localUpiRef.trim() : null;
        payload.chequeNo = numSplitCheque > 0 ? localChequeNo.trim() : null;
        payload.chequeBank = numSplitCheque > 0 ? localChequeBank.trim() : null;
        payload.chequeDate = numSplitCheque > 0 ? localChequeDate : null;
      } else {
        payload.cashTendered = paymentMethod === "cash" ? numSingleTendered : undefined;
        payload.upiRef = paymentMethod === "upi" ? localUpiRef.trim() : null;
        payload.chequeNo = paymentMethod === "cheque" ? localChequeNo.trim() : null;
        payload.chequeBank = paymentMethod === "cheque" ? localChequeBank.trim() : null;
        payload.chequeDate = paymentMethod === "cheque" ? localChequeDate : null;
      }

      const res = await fetch("/api/admin/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (json.success && json.sale) {
        // MODULE 2.5.2: Electronic Cash Drawer Kick Trigger
        const involvesCash =
          paymentMethod === "cash" ||
          (paymentMethod === "split" && numSplitCash > 0) ||
          json.kickCashDrawer;

        if (involvesCash) {
          triggerCashDrawerKick({
            silent: false,
            reason: `Sale ${json.sale.invoiceNo} Tender Finalized`,
          }).catch(() => {});
        }

        toast.success(`Sale completed! Invoice: ${json.sale.invoiceNo}`);
        onSaleCompleted(json.sale);
        onClose();
      } else {
        setError(json.error || "Sale finalization failed");
      }
    } catch (err: any) {
      setError(err?.message || "Network error finalizing sale");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Dynamic UPI payment URL for single or split UPI
  const dynamicUpiAmount = paymentMethod === "split" ? (numSplitUpi > 0 ? numSplitUpi : grandTotal) : grandTotal;
  const upiPayUri = `upi://pay?pa=${encodeURIComponent(storeUpiId)}&pn=${encodeURIComponent(
    activeBranch?.name || "DRxStore Pharmacy"
  )}&am=${dynamicUpiAmount.toFixed(2)}&cu=INR`;
  const upiQrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
    upiPayUri
  )}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tender & Collect Payment"
      description={`Finalize Invoice — ${items.length} items (${activeBranch?.name || "Active Outlet"})`}
      headerIcon={
        <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-[#1F4E5B] flex items-center justify-center">
          <CreditCard className="w-5 h-5" />
        </div>
      }
      size="2xl"
    >
      <form onSubmit={handleFinalize} className="space-y-4">
        {/* Payable Grand Total Display Header */}
        <div className="bg-[#1F4E5B] text-white rounded-3xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-teal-200 font-extrabold block mb-0.5">
              Net Payable Grand Total
            </span>
            <div className="text-3xl font-black tracking-tight">
              ₹{grandTotal.toFixed(2)}
            </div>
            <div className="text-xs text-slate-200/80 mt-1 flex items-center gap-3">
              <span>Subtotal: ₹{subtotal.toFixed(2)}</span>
              <span>•</span>
              <span>GST Included: ₹{totalGst.toFixed(2)}</span>
              {discountAmount > 0 && (
                <>
                  <span>•</span>
                  <span className="text-amber-300 font-bold">
                    Discount: -₹{discountAmount.toFixed(2)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-teal-200 font-bold block uppercase">
              Billed To
            </span>
            <div className="text-sm font-extrabold text-white flex items-center gap-1.5 justify-end">
              <Users className="w-3.5 h-3.5" />
              <span>{customer ? customer.name : "Walk-in Customer"}</span>
            </div>
            {customer ? (
              <span className="text-[11px] text-teal-100 font-medium">
                {customer.phone}
              </span>
            ) : (
              <button
                type="button"
                onClick={onOpenCustomerModal}
                className="text-[11px] text-emerald-300 underline font-semibold hover:text-white cursor-pointer"
              >
                Attach Patient (F7)
              </button>
            )}

            {/* Quick manual cash drawer kick button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleManualDrawerKick}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-teal-800/60 hover:bg-teal-700/80 border border-teal-500/40 text-[10px] font-bold text-teal-100 transition-colors cursor-pointer"
                title="Test hardware cash drawer solenoid pulse"
              >
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>Test Drawer Kick</span>
              </button>
            </div>
          </div>
        </div>

        {/* Payment Method Selector Tabs (Module 2.5.1) */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700">
            Select Payment Tender Mode
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            {[
              { id: "cash", label: "Cash", icon: Banknote },
              { id: "upi", label: "Dynamic UPI", icon: QrCode },
              { id: "card", label: "Card / POS", icon: CreditCard },
              { id: "cheque", label: "Cheque", icon: FileCheck2 },
              { id: "credit", label: "Baki Khata", icon: Users },
              { id: "split", label: "Split Multi-Tender", icon: Layers, highlight: true },
            ].map((method) => {
              const Icon = method.icon;
              const isSelected = paymentMethod === method.id;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => {
                    setPaymentMethod(method.id as any);
                    setError(null);
                  }}
                  className={`py-2.5 px-2 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                    isSelected
                      ? "bg-teal-50 border-[#1F4E5B] text-[#1F4E5B] font-extrabold shadow-2xs ring-2 ring-[#1F4E5B]/20"
                      : method.highlight
                      ? "bg-indigo-50/60 border-indigo-200 hover:bg-indigo-50 text-indigo-900 font-semibold"
                      : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700 font-medium"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${method.highlight && !isSelected ? "text-indigo-600" : ""}`} />
                  <span className="text-xs leading-none">{method.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* MULTI-TENDER SPLIT PAYMENT MODE (MODULE 2.5.1) */}
        {/* ───────────────────────────────────────────────────────────── */}
        {paymentMethod === "split" && (
          <div className="p-4 rounded-3xl bg-slate-50 border border-slate-200 space-y-3.5 animate-fadeIn">
            {/* Live Split Tender Allocation Status Bar */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Due</span>
                <span className="text-base font-black text-slate-900">₹{grandTotal.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Allocated</span>
                <span className="text-base font-black text-[#1F4E5B]">₹{totalSplitAllocated.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Remaining</span>
                <span className={`text-base font-black ${splitUnallocated > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  ₹{splitUnallocated.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Change Return</span>
                <span className="text-base font-black text-emerald-700">₹{splitCashChangeDue.toFixed(2)}</span>
              </div>
            </div>

            {/* Split Tender Inputs Grid */}
            <div className="space-y-2.5">
              {/* Split 1: Cash */}
              <div className="p-3 bg-white rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <Banknote className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-800">Cash Amount</span>
                </div>
                <div className="flex items-center gap-2 flex-1 max-w-xs">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      value={splitCash}
                      onChange={(e) => setSplitCash(e.target.value)}
                      className="w-full pl-6 pr-2 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => allocateRemainingTo("cash")}
                    disabled={splitUnallocated <= 0}
                    className="px-2 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-bold text-slate-700 shrink-0 cursor-pointer disabled:opacity-40"
                    title="Fill remaining balance into cash"
                  >
                    + Remaining
                  </button>
                </div>
                {/* Cash Tendered & Change info */}
                {numSplitCash > 0 && (
                  <div className="w-full pt-1 flex items-center justify-end gap-3 text-xs border-t border-slate-100 text-slate-600">
                    <span>Cash Handed:</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={splitCashTendered}
                      onChange={(e) => setSplitCashTendered(e.target.value)}
                      placeholder={splitCash}
                      className="w-24 px-2 py-1 rounded-lg border border-slate-300 text-xs font-bold text-slate-900"
                    />
                    <span>Change: <strong className="text-emerald-700">₹{splitCashChangeDue.toFixed(2)}</strong></span>
                  </div>
                )}
              </div>

              {/* Split 2: Dynamic UPI */}
              <div className="p-3 bg-white rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <QrCode className="w-4 h-4 text-teal-600" />
                  <span className="text-xs font-bold text-slate-800">Dynamic UPI</span>
                </div>
                <div className="flex items-center gap-2 flex-1 max-w-xs">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      value={splitUpi}
                      onChange={(e) => setSplitUpi(e.target.value)}
                      className="w-full pl-6 pr-2 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => allocateRemainingTo("upi")}
                    disabled={splitUnallocated <= 0}
                    className="px-2 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-bold text-slate-700 shrink-0 cursor-pointer disabled:opacity-40"
                  >
                    + Remaining
                  </button>
                </div>
                {numSplitUpi > 0 && (
                  <div className="w-full pt-2 flex items-center gap-4 border-t border-slate-100">
                    <div className="w-16 h-16 shrink-0 bg-white border border-slate-200 p-1 rounded-xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={upiQrImageUrl} alt="UPI QR" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <span className="text-[11px] font-bold text-slate-700">
                        Scan to pay ₹{numSplitUpi.toFixed(2)} ({storeUpiId})
                      </span>
                      <input
                        type="text"
                        placeholder="UTR / UPI Ref (Optional)"
                        value={localUpiRef}
                        onChange={(e) => setLocalUpiRef(e.target.value)}
                        className="w-full max-w-xs px-2.5 py-1 text-[11px] rounded-lg border border-slate-300"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Split 3: Card / POS */}
              <div className="p-3 bg-white rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <CreditCard className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-800">Card / POS</span>
                </div>
                <div className="flex items-center gap-2 flex-1 max-w-xs">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      value={splitCard}
                      onChange={(e) => setSplitCard(e.target.value)}
                      className="w-full pl-6 pr-2 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => allocateRemainingTo("card")}
                    disabled={splitUnallocated <= 0}
                    className="px-2 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-bold text-slate-700 shrink-0 cursor-pointer disabled:opacity-40"
                  >
                    + Remaining
                  </button>
                </div>
                {numSplitCard > 0 && (
                  <div className="w-full pt-1 flex items-center gap-3 border-t border-slate-100 text-xs">
                    <input
                      type="text"
                      placeholder="Auth Code (Optional)"
                      value={localCardAuth}
                      onChange={(e) => setLocalCardAuth(e.target.value)}
                      className="w-32 px-2 py-1 rounded-lg border border-slate-300 text-xs"
                    />
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="Last 4 Digits"
                      value={localCardLast4}
                      onChange={(e) => setLocalCardLast4(e.target.value)}
                      className="w-28 px-2 py-1 rounded-lg border border-slate-300 text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Split 4: Cheque */}
              <div className="p-3 bg-white rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <FileCheck2 className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-bold text-slate-800">Cheque</span>
                </div>
                <div className="flex items-center gap-2 flex-1 max-w-xs">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      value={splitCheque}
                      onChange={(e) => setSplitCheque(e.target.value)}
                      className="w-full pl-6 pr-2 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => allocateRemainingTo("cheque")}
                    disabled={splitUnallocated <= 0}
                    className="px-2 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-bold text-slate-700 shrink-0 cursor-pointer disabled:opacity-40"
                  >
                    + Remaining
                  </button>
                </div>
                {numSplitCheque > 0 && (
                  <div className="w-full pt-1 grid grid-cols-1 sm:grid-cols-3 gap-2 border-t border-slate-100 text-xs">
                    <input
                      type="text"
                      required
                      placeholder="Cheque No *"
                      value={localChequeNo}
                      onChange={(e) => setLocalChequeNo(e.target.value)}
                      className="px-2 py-1 rounded-lg border border-slate-300 text-xs"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Bank Name *"
                      value={localChequeBank}
                      onChange={(e) => setLocalChequeBank(e.target.value)}
                      className="px-2 py-1 rounded-lg border border-slate-300 text-xs"
                    />
                    <input
                      type="date"
                      value={localChequeDate}
                      onChange={(e) => setLocalChequeDate(e.target.value)}
                      className="px-2 py-1 rounded-lg border border-slate-300 text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Split 5: Store Credit (Baki Khata) */}
              <div className="p-3 bg-white rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <Users className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-bold text-slate-800">Store Credit</span>
                </div>
                <div className="flex items-center gap-2 flex-1 max-w-xs">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      value={splitCredit}
                      onChange={(e) => setSplitCredit(e.target.value)}
                      className="w-full pl-6 pr-2 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => allocateRemainingTo("credit")}
                    disabled={splitUnallocated <= 0}
                    className="px-2 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-bold text-slate-700 shrink-0 cursor-pointer disabled:opacity-40"
                  >
                    + Remaining
                  </button>
                </div>
                {numSplitCredit > 0 && (
                  <div className="w-full pt-1 flex items-center justify-between text-[11px] border-t border-slate-100 text-slate-600">
                    <span>
                      Approved Limit: <strong>₹{creditLimit.toFixed(2)}</strong> | Current Due:{" "}
                      <strong className="text-rose-600">₹{currentDue.toFixed(2)}</strong>
                    </span>
                    <span className={availableCredit >= numSplitCredit ? "text-emerald-700 font-bold" : "text-rose-600 font-bold"}>
                      Space: ₹{availableCredit.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────── */}
        {/* SINGLE TENDER MODES */}
        {/* ───────────────────────────────────────────────────────────── */}

        {/* 1. CASH PAYMENT FIELDS */}
        {paymentMethod === "cash" && (
          <div className="p-4 rounded-3xl bg-slate-50 border border-slate-200 space-y-3.5 animate-fadeIn">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cash Tendered by Customer (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  autoFocus
                  value={localTendered}
                  onChange={(e) => {
                    setLocalTendered(e.target.value);
                    setTenderedAmount(parseFloat(e.target.value) || 0);
                  }}
                  className="w-full bg-white border border-slate-300 focus:border-[#1F4E5B] rounded-2xl px-4 py-3 text-lg font-black text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Change to Return (₹)
                </label>
                <div
                  className={`w-full rounded-2xl px-4 py-3 border text-lg font-black flex items-center justify-between ${
                    singleCashShortfall > 0
                      ? "bg-rose-50 border-rose-200 text-rose-700"
                      : "bg-emerald-50 border-emerald-200 text-emerald-800"
                  }`}
                >
                  <span>{singleCashShortfall > 0 ? "Shortfall:" : "Change Due:"}</span>
                  <span>
                    ₹{singleCashShortfall > 0 ? singleCashShortfall.toFixed(2) : singleChangeDue.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick cash denomination presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs font-bold text-slate-500 mr-1">Presets:</span>
              <button
                type="button"
                onClick={() => handleCashPreset(Math.ceil(grandTotal))}
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-800 cursor-pointer"
              >
                Exact (₹{Math.ceil(grandTotal)})
              </button>
              {[100, 200, 500, 1000, 2000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleCashPreset(amt)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-800 cursor-pointer"
                >
                  ₹{amt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 2. DYNAMIC UPI PAYMENT FIELDS */}
        {paymentMethod === "upi" && (
          <div className="p-4 rounded-3xl bg-slate-50 border border-slate-200 space-y-3 animate-fadeIn">
            <div className="flex flex-col sm:flex-row items-center gap-5">
              <div className="w-36 h-36 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-center shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={upiQrImageUrl}
                  alt="Dynamic UPI QR"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex-1 space-y-2 text-center sm:text-left">
                <div className="inline-flex items-center gap-1.5 text-xs font-extrabold px-3 py-1 rounded-full bg-teal-100 text-[#1F4E5B]">
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Scan with Any UPI App</span>
                </div>
                <p className="text-xs text-slate-600">
                  Ask customer to scan to pay exact amount:{" "}
                  <strong className="text-slate-900 font-extrabold text-sm">
                    ₹{grandTotal.toFixed(2)}
                  </strong>
                </p>
                <p className="text-[11px] text-slate-400">
                  VPA: <code className="bg-slate-200/60 px-1.5 py-0.5 rounded">{storeUpiId}</code>
                </p>

                <div className="pt-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    UPI Reference / UTR Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={localUpiRef}
                    onChange={(e) => setLocalUpiRef(e.target.value)}
                    placeholder="e.g. 403810294829"
                    className="w-full sm:max-w-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. CARD / POS FIELDS */}
        {paymentMethod === "card" && (
          <div className="p-4 rounded-3xl bg-slate-50 border border-slate-200 space-y-3 animate-fadeIn">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  POS Auth / Approval Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. 748921"
                  value={localCardAuth}
                  onChange={(e) => setLocalCardAuth(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Card Last 4 Digits
                </label>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="e.g. 4242"
                  value={localCardLast4}
                  onChange={(e) => setLocalCardLast4(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                />
              </div>
            </div>
          </div>
        )}

        {/* 4. CHEQUE FIELDS */}
        {paymentMethod === "cheque" && (
          <div className="p-4 rounded-3xl bg-slate-50 border border-slate-200 space-y-3 animate-fadeIn">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cheque Number *
                </label>
                <input
                  type="text"
                  required
                  value={localChequeNo}
                  onChange={(e) => setLocalChequeNo(e.target.value)}
                  placeholder="e.g. 000142"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Bank Name *
                </label>
                <input
                  type="text"
                  required
                  value={localChequeBank}
                  onChange={(e) => setLocalChequeBank(e.target.value)}
                  placeholder="e.g. State Bank of India"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cheque Date *
                </label>
                <input
                  type="date"
                  required
                  value={localChequeDate}
                  onChange={(e) => setLocalChequeDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                />
              </div>
            </div>
          </div>
        )}

        {/* 5. BAKI KHATA / CREDIT FIELDS */}
        {paymentMethod === "credit" && (
          <div className="p-4 rounded-3xl bg-slate-50 border border-slate-200 space-y-3 animate-fadeIn">
            {!customer ? (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <span>No customer selected. Baki Khata requires selecting a registered customer.</span>
                </div>
                <button
                  type="button"
                  onClick={onOpenCustomerModal}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 cursor-pointer"
                >
                  Select Customer (F7)
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-2xl bg-white border border-slate-200 text-xs">
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">
                      Approved Credit Limit
                    </span>
                    <span className="text-sm font-extrabold text-slate-900">
                      ₹{creditLimit.toFixed(2)}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-white border border-slate-200 text-xs">
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">
                      Current Outstanding Due
                    </span>
                    <span className="text-sm font-extrabold text-rose-600">
                      ₹{currentDue.toFixed(2)}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-white border border-slate-200 text-xs">
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">
                      Remaining Credit Space
                    </span>
                    <span
                      className={`text-sm font-extrabold ${
                        availableCredit >= grandTotal ? "text-emerald-700" : "text-rose-600"
                      }`}
                    >
                      ₹{availableCredit.toFixed(2)}
                    </span>
                  </div>
                </div>

                {isCreditOverLimit && (
                  <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                    <span>
                      Credit Limit Exceeded: Bill amount ₹{grandTotal.toFixed(2)} + current due ₹
                      {currentDue.toFixed(2)} exceeds approved limit ₹{creditLimit.toFixed(2)}.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Doctor Info Section (Schedule H/H1 Compliance) */}
        <div className="p-3.5 rounded-2xl border border-slate-200 bg-white space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Stethoscope className="w-4 h-4 text-[#1F4E5B]" />
              <span>Prescribing Doctor Information</span>
            </div>
            {hasScheduleDrugs && (
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                Schedule H / H1 Drug Present in Cart
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Doctor Name {hasScheduleDrugs && "*"}
              </label>
              <input
                type="text"
                required={hasScheduleDrugs}
                value={localDoctorName}
                onChange={(e) => setLocalDoctorName(e.target.value)}
                placeholder="Dr. S. K. Gupta"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Doctor Registration Number
              </label>
              <input
                type="text"
                value={localDoctorRegNo}
                onChange={(e) => setLocalDoctorRegNo(e.target.value)}
                placeholder="e.g. MCI-28491"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
          >
            Cancel (Esc)
          </button>

          <button
            type="submit"
            disabled={submitting || isCreditOverLimit || (paymentMethod === "credit" && !customer)}
            className={`px-6 py-2.5 rounded-xl text-white text-xs font-extrabold shadow-sm transition-all flex items-center gap-2 cursor-pointer ${
              submitting || isCreditOverLimit || (paymentMethod === "credit" && !customer)
                ? "bg-slate-400 cursor-not-allowed"
                : "bg-[#1F4E5B] hover:bg-[#163a44]"
            }`}
          >
            <span>{submitting ? "Finalizing Sale..." : "Complete & Print Invoice"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </Modal>
  );
}
