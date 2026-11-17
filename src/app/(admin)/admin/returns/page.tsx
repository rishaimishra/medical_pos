"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  RotateCcw,
  Search,
  ScanBarcode,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Printer,
  Calendar,
  Building2,
  User,
  ArrowRight,
  Loader2,
  Package,
  Trash2,
  ExternalLink,
  X,
  CreditCard,
  FileText,
} from "lucide-react";
import { numberToIndianWords } from "@/lib/numberToWords";

interface ReturnableItem {
  saleItemId: number;
  medicineId: number;
  medicineName: string;
  genericName?: string;
  company?: string;
  hsnCode?: string;
  batchId: number;
  batchNo: string;
  expiryDate: string;
  currentStockInBatch: number;
  purchasedQty: number;
  alreadyReturnedQty: number;
  remainingReturnableQty: number;
  isFullyReturned: boolean;
  mrp: number;
  unitGrossPrice: number;
  unitRefundPrice: number;
  discountRatioApplied: number;
}

interface SaleLookupData {
  id: number;
  invoiceNo: string;
  saleDate: string;
  createdAt: string;
  totalAmount: number;
  discountAmount: number;
  grandTotal: number;
  paymentMethod: string;
  discountRatio: number;
  customer?: { id: number; name: string; phone: string } | null;
  branch?: { id: number; name: string; code: string; phone?: string } | null;
  cashier?: { id: number; name: string; username: string } | null;
  isFullyReturned: boolean;
  items: ReturnableItem[];
}

function ReturnsContent() {
  const searchParams = useSearchParams();
  const prefilledInvoice = searchParams.get("invoiceNo") || "";

  const [activeTab, setActiveTab] = useState<"process" | "history">("process");

  // Lookup state
  const [invoiceQuery, setInvoiceQuery] = useState(prefilledInvoice);
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [saleData, setSaleData] = useState<SaleLookupData | null>(null);

  // Return Form State
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [restockActions, setRestockActions] = useState<Record<number, "restock" | "damaged_write_off">>({});
  const [returnReason, setReturnReason] = useState("Doctor changed prescription / dosage");
  const [refundMethod, setRefundMethod] = useState<"cash" | "store_credit" | "upi">("cash");
  const [processingReturn, setProcessingReturn] = useState(false);
  const [processSuccess, setProcessSuccess] = useState<string | null>(null);

  // Returns History State
  const [returnsList, setReturnsList] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("all");
  const [historySummary, setHistorySummary] = useState({ totalReturns: 0, totalRefundAmount: 0 });
  const [selectedCreditNote, setSelectedCreditNote] = useState<any | null>(null);

  // Lookup Invoice
  const handleLookup = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setLookupError(null);
    setProcessSuccess(null);
    try {
      const res = await fetch(`/api/admin/returns/lookup?invoiceNo=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setSaleData(json.sale);
        // Initialize return quantities to 0
        const qtys: Record<number, number> = {};
        const actions: Record<number, "restock" | "damaged_write_off"> = {};
        json.sale.items.forEach((it: ReturnableItem) => {
          qtys[it.saleItemId] = 0;
          actions[it.saleItemId] = "restock";
        });
        setReturnQtys(qtys);
        setRestockActions(actions);
      } else {
        setLookupError(json.message || "Invoice not found.");
        setSaleData(null);
      }
    } catch {
      setLookupError("Network error while searching for invoice.");
      setSaleData(null);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (prefilledInvoice) {
      handleLookup(prefilledInvoice);
    }
  }, [prefilledInvoice, handleLookup]);

  // Load Returns History
  const fetchReturnsHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (historySearch.trim()) params.set("search", historySearch.trim());
      if (historyStatusFilter !== "all") params.set("status", historyStatusFilter);
      const res = await fetch(`/api/admin/returns?${params.toString()}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setReturnsList(json.data || []);
        if (json.summary) setHistorySummary(json.summary);
      }
    } catch (err) {
      console.error("Failed to load returns history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, [historySearch, historyStatusFilter]);

  const handleReturnStatusAction = async (returnId: number, status: "processed" | "rejected") => {
    try {
      const res = await fetch(`/api/admin/returns/${returnId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        fetchReturnsHistory();
      } else {
        alert(json.message || `Failed to mark return as ${status}`);
      }
    } catch {
      alert("Network error while updating return status");
    }
  };

  useEffect(() => {
    if (activeTab === "history") {
      fetchReturnsHistory();
    }
  }, [activeTab, fetchReturnsHistory]);

  // Calculate live refund amount
  const totalRefundAmount = saleData
    ? saleData.items.reduce((sum, it) => {
        const qty = returnQtys[it.saleItemId] || 0;
        return sum + qty * it.unitRefundPrice;
      }, 0)
    : 0;

  const totalReturnUnits = Object.values(returnQtys).reduce((a, b) => a + b, 0);

  // Submit Return
  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleData) return;

    if (totalReturnUnits <= 0) {
      alert("Please enter at least 1 unit to return.");
      return;
    }

    setProcessingReturn(true);
    setLookupError(null);
    try {
      const itemsPayload = saleData.items
        .filter((it) => (returnQtys[it.saleItemId] || 0) > 0)
        .map((it) => ({
          saleItemId: it.saleItemId,
          quantity: returnQtys[it.saleItemId],
          restockAction: restockActions[it.saleItemId] || "restock",
        }));

      const res = await fetch("/api/admin/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: saleData.id,
          reason: returnReason,
          refundMethod,
          items: itemsPayload,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setProcessSuccess(json.message);
        // Refresh lookup to show updated remaining quantities
        handleLookup(saleData.invoiceNo);
      } else {
        setLookupError(json.message || "Failed to process return.");
      }
    } catch {
      setLookupError("Network error occurred during return submission.");
    } finally {
      setProcessingReturn(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <RotateCcw className="w-7 h-7 text-[#1F4E5B]" />
            <span>Sales Returns & Refund Desk</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Module 2.10 & 2.11: Invoice-linked returns, already-returned protection, restocking vs discard & credit notes
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-white border border-slate-200 rounded-2xl shadow-xs text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab("process")}
            className={`px-4 py-2 rounded-xl transition-all ${
              activeTab === "process"
                ? "bg-[#1F4E5B] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Process New Return
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 rounded-xl transition-all ${
              activeTab === "history"
                ? "bg-[#1F4E5B] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Returns History & Credit Notes
          </button>
        </div>
      </div>

      {activeTab === "process" ? (
        <div className="space-y-6">
          {/* Invoice Lookup Bar */}
          <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-xs space-y-3">
            <label className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
              <ScanBarcode className="w-4 h-4 text-[#1F4E5B]" />
              <span>Scan Barcode or Enter Invoice Number to Start Return:</span>
            </label>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLookup(invoiceQuery);
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  value={invoiceQuery}
                  onChange={(e) => setInvoiceQuery(e.target.value)}
                  placeholder="e.g. INV-2026-00001 (or scan thermal barcode)"
                  className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold uppercase tracking-wider focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1F4E5B]/20"
                />
              </div>

              <button
                type="submit"
                disabled={searching || !invoiceQuery.trim()}
                className="px-6 py-3 bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-black rounded-2xl shadow-xs flex items-center gap-2 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>Fetch Invoice</span>
              </button>
            </form>

            {lookupError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{lookupError}</span>
              </div>
            )}

            {processSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{processSuccess}</span>
              </div>
            )}
          </div>

          {/* Sale Details & Return Form */}
          {saleData && (
            <form onSubmit={handleSubmitReturn} className="space-y-6">
              {/* Sale Summary Banner */}
              <div className="p-4 bg-slate-900 text-white rounded-3xl shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black tracking-tight">{saleData.invoiceNo}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-800 text-emerald-400">
                      Paid: {saleData.paymentMethod.toUpperCase()}
                    </span>
                    {saleData.discountAmount > 0 && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-950 text-rose-300">
                        {saleData.discountRatio}% Bill Discount
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 text-xs text-slate-400 font-medium">
                    <span>Date: {new Date(saleData.createdAt).toLocaleString()}</span>
                    <span>Customer: {saleData.customer?.name || "Walk-in Customer"}</span>
                    <span>Branch: {saleData.branch?.code || "MAIN"}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                    Original Bill Net
                  </span>
                  <span className="text-xl font-black text-white">
                    ₹{saleData.grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {saleData.isFullyReturned && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <span>
                    All medicines on this invoice have already been fully returned. No further items can be returned (Already-Returned Guard Active).
                  </span>
                </div>
              )}

              {/* Items Table with Quantity & Restock Action Controls */}
              <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                      Select Medicines & Quantities to Return
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Refunds are automatically computed discount-proportional to match original payment.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 font-extrabold text-slate-600 uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Medicine [Batch]</th>
                        <th className="py-3 px-4 text-center">Purchased</th>
                        <th className="py-3 px-4 text-center">Prev. Returned</th>
                        <th className="py-3 px-4 text-center">Available to Return</th>
                        <th className="py-3 px-4 text-center w-32">Return Qty</th>
                        <th className="py-3 px-4 text-center w-52">Inventory Action</th>
                        <th className="py-3 px-4 text-right">Refund Rate</th>
                        <th className="py-3 px-4 text-right">Line Refund</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {saleData.items.map((it) => {
                        const currentReturnQty = returnQtys[it.saleItemId] || 0;
                        const lineRefund = currentReturnQty * it.unitRefundPrice;
                        const action = restockActions[it.saleItemId] || "restock";

                        return (
                          <tr
                            key={it.saleItemId}
                            className={
                              it.isFullyReturned ? "bg-slate-50/70 opacity-60" : "hover:bg-slate-50/50"
                            }
                          >
                            <td className="py-3 px-4">
                              <strong className="text-slate-900 block">{it.medicineName}</strong>
                              <span className="text-[10px] text-slate-400 font-mono">
                                Batch: {it.batchNo} | Exp: {new Date(it.expiryDate).toLocaleDateString("en-IN")}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center font-bold text-slate-700">
                              {it.purchasedQty}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-500">
                              {it.alreadyReturnedQty > 0 ? (
                                <span className="text-rose-600 font-bold">{it.alreadyReturnedQty}</span>
                              ) : (
                                "0"
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {it.isFullyReturned ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-700 uppercase">
                                  Fully Returned
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-xs font-black bg-emerald-100 text-emerald-800">
                                  {it.remainingReturnableQty} max
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <input
                                type="number"
                                min="0"
                                max={it.remainingReturnableQty}
                                disabled={it.isFullyReturned}
                                value={currentReturnQty}
                                onChange={(e) => {
                                  const val = Math.min(
                                    it.remainingReturnableQty,
                                    Math.max(0, parseInt(e.target.value, 10) || 0)
                                  );
                                  setReturnQtys((prev) => ({
                                    ...prev,
                                    [it.saleItemId]: val,
                                  }));
                                }}
                                className="w-20 px-2 py-1.5 text-center font-black rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1F4E5B]/20 disabled:bg-slate-100 text-xs"
                              />
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold">
                                <button
                                  type="button"
                                  disabled={it.isFullyReturned}
                                  onClick={() =>
                                    setRestockActions((prev) => ({
                                      ...prev,
                                      [it.saleItemId]: "restock",
                                    }))
                                  }
                                  className={`px-2 py-1 rounded-lg border transition-all ${
                                    action === "restock"
                                      ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                                  }`}
                                >
                                  Restock (+Qty)
                                </button>
                                <button
                                  type="button"
                                  disabled={it.isFullyReturned}
                                  onClick={() =>
                                    setRestockActions((prev) => ({
                                      ...prev,
                                      [it.saleItemId]: "damaged_write_off",
                                    }))
                                  }
                                  className={`px-2 py-1 rounded-lg border transition-all ${
                                    action === "damaged_write_off"
                                      ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                                  }`}
                                >
                                  Write-Off (Discard)
                                </button>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums text-slate-600">
                              ₹{it.unitRefundPrice.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums font-black text-slate-900">
                              ₹{lineRefund.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Settlement & Reason Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-xs space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 block">Reason for Return *</label>
                    <select
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none"
                    >
                      <option value="Doctor changed prescription / dosage">Doctor changed prescription / dosage</option>
                      <option value="Customer bought excess quantity">Customer bought excess quantity</option>
                      <option value="Patient experienced adverse reaction / allergic">Patient experienced adverse reaction / allergic</option>
                      <option value="Damaged packaging / broken seal upon delivery">Damaged packaging / broken seal upon delivery</option>
                      <option value="Dispensing error / wrong medicine packed">Dispensing error / wrong medicine packed</option>
                      <option value="Customer expired medication return">Customer expired medication return</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 block">Refund Payment Method *</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "cash", label: "Cash Refund" },
                        { id: "store_credit", label: "Store Credit" },
                        { id: "upi", label: "UPI Transfer" },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setRefundMethod(m.id as any)}
                          className={`py-2 px-1 text-center rounded-xl text-xs font-bold border transition-all ${
                            refundMethod === m.id
                              ? "bg-[#1F4E5B] text-white border-[#1F4E5B] shadow-xs"
                              : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Refund Calculation Summary Box */}
                <div className="p-5 bg-[#EAF5F0] border border-emerald-200 rounded-3xl shadow-xs flex flex-col justify-between space-y-4">
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-[#0F6E56] font-bold">
                      <span>Total Units Returning:</span>
                      <strong className="text-slate-900 text-sm">{totalReturnUnits} units</strong>
                    </div>
                    <div className="flex justify-between text-[#0F6E56] font-bold">
                      <span>Refund Mode:</span>
                      <strong className="text-slate-900 uppercase">{refundMethod}</strong>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-emerald-200 text-emerald-950 font-black">
                      <span className="text-sm uppercase tracking-wider">Total Refund Payable:</span>
                      <span className="text-2xl font-black text-slate-900 tabular-nums">
                        ₹{totalRefundAmount.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 italic">
                      Amount in words: {numberToIndianWords(totalRefundAmount)}
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={processingReturn || totalReturnUnits <= 0 || saleData.isFullyReturned}
                    className="w-full py-3 bg-[#0F6E56] hover:bg-[#0b5643] text-white text-xs font-black rounded-2xl shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {processingReturn ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>Process Return & Issue Refund</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      ) : (
        /* Tab 2: Returns History & Credit Notes */
        <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden space-y-4">
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search returns by return #, invoice #, customer..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3 text-xs font-bold text-slate-600 flex-wrap">
              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
              >
                <option value="all">All Statuses</option>
                <option value="processed">Processed</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
              <span>
                Total Returns: <strong>{historySummary.totalReturns}</strong>
              </span>
              <span>
                Total Refunded:{" "}
                <strong className="text-rose-600">
                  ₹{historySummary.totalRefundAmount.toFixed(2)}
                </strong>
              </span>
            </div>
          </div>

          {historyLoading ? (
            <div className="py-16 text-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[#1F4E5B]" />
              <span className="text-xs font-bold">Loading returns log...</span>
            </div>
          ) : returnsList.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <RotateCcw className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-extrabold text-slate-700">No Sales Returns Recorded</p>
              <p className="text-xs text-slate-400">All customer sales are intact.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 font-extrabold text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Return #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Original Invoice</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Branch</th>
                    <th className="py-3 px-4 text-center">Items Returned</th>
                    <th className="py-3 px-4 text-center">Status / Mode</th>
                    <th className="py-3 px-4 text-right">Refund Amount</th>
                    <th className="py-3 px-4 text-center">Credit Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {returnsList.map((ret) => (
                    <tr key={ret.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-black text-slate-900">
                        {ret.returnNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {new Date(ret.createdAt).toLocaleDateString("en-IN")}
                      </td>
                      <td className="py-3 px-4">
                        <Link
                          href={`/admin/pos/invoice/${ret.invoiceNo}`}
                          target="_blank"
                          className="font-bold text-[#1F4E5B] hover:underline flex items-center gap-1"
                        >
                          <span>{ret.invoiceNo}</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-slate-800 font-bold">
                        {ret.customer?.name || "Walk-in Customer"}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {ret.branch?.code || "MAIN"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-700">
                          {ret.itemsCount} units
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            ret.status === "processed"
                              ? "bg-emerald-100 text-emerald-800"
                              : ret.status === "pending"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {ret.status}
                        </span>
                        <span className="block text-[10px] text-slate-400 uppercase mt-0.5">
                          {ret.refundMethod || "cash"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-black text-rose-600">
                        ₹{ret.refundAmount.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1">
                          {ret.status === "pending" && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleReturnStatusAction(ret.id, "processed")}
                                className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReturnStatusAction(ret.id, "rejected")}
                                className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedCreditNote(ret)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold flex items-center gap-1"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>View Note</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Credit Note Modal */}
      {selectedCreditNote && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#1F4E5B]" />
                <h3 className="text-sm font-black text-slate-900">
                  Credit Note & Refund Voucher {selectedCreditNote.returnNumber}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCreditNote(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div id="printable-credit-note" className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span>Credit Note No:</span>
                <strong>{selectedCreditNote.returnNumber}</strong>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{new Date(selectedCreditNote.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Original Invoice:</span>
                <strong>{selectedCreditNote.invoiceNo}</strong>
              </div>
              <div className="flex justify-between">
                <span>Customer:</span>
                <span>{selectedCreditNote.customer?.name || "Walk-in Customer"}</span>
              </div>
              <div className="flex justify-between">
                <span>Refund Method / Status:</span>
                <span className="uppercase font-bold">
                  {(selectedCreditNote.refundMethod || "cash")} • {selectedCreditNote.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Reason:</span>
                <span>{selectedCreditNote.reason}</span>
              </div>
              <div className="pt-2 border-t border-dashed border-slate-300">
                <span className="font-bold block mb-1">Returned Items:</span>
                {selectedCreditNote.items?.map((it: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-slate-700">
                    <span>
                      {it.medicineName} (Qty: {it.quantity}) [{it.restockAction}]
                    </span>
                    <strong>₹{it.refundPrice.toFixed(2)}</strong>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-slate-400 flex justify-between font-black text-sm text-slate-900">
                <span>TOTAL REFUND:</span>
                <span>₹{selectedCreditNote.refundAmount.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-black rounded-xl flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Print Credit Note</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedCreditNote(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <style jsx global>{`
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #printable-credit-note,
                #printable-credit-note * {
                  visibility: visible !important;
                }
                #printable-credit-note {
                  position: fixed !important;
                  left: 10mm !important;
                  top: 10mm !important;
                  right: 10mm !important;
                  background: #fff !important;
                  border: 1px solid #cbd5e1 !important;
                }
              }
            `}</style>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReturnsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading Returns Desk...</div>}>
      <ReturnsContent />
    </Suspense>
  );
}
