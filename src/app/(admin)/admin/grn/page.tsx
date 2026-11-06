"use client";

import React, { useState, useEffect, useTransition, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Truck,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Calendar,
  Layers,
  Sparkles,
  Building2,
  FileText,
  DollarSign,
  Plus,
} from "lucide-react";
import { useBranchStore } from "@/stores/useBranchStore";

interface GRNLineState {
  poItemId: number;
  medicineId: number;
  medicineName: string;
  company: string;
  category: string;
  orderedQty: number;
  previouslyReceived: number;
  remainingQty: number;
  receivedQty: number;
  bonusQty: number;
  batchNo: string;
  expiryDate: string;
  mfgDate: string;
  purchasePrice: number;
  tradeDiscount: number;
  mrp: number;
}

function GRNDeskContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { activeBranch } = useBranchStore();

  const urlPoId = searchParams.get("poId");

  const [availablePOs, setAvailablePOs] = useState<any[]>([]);
  const [selectedPOId, setSelectedPOId] = useState<string>(urlPoId || "");
  const [loadingPO, setLoadingPO] = useState(false);
  const [poDetails, setPoDetails] = useState<any | null>(null);

  const [invoiceNo, setInvoiceNo] = useState("");
  const [lines, setLines] = useState<GRNLineState[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [grnError, setGrnError] = useState<string | null>(null);
  const [grnSuccess, setGrnSuccess] = useState<any | null>(null);

  // Load active/pending POs for dropdown
  useEffect(() => {
    fetch("/api/admin/purchases?limit=100")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          // Filter POs that are not fully received or cancelled
          const active = (json.purchaseOrders || []).filter(
            (p: any) => p.status !== "received" && p.status !== "cancelled"
          );
          setAvailablePOs(active);
        }
      })
      .catch((err) => console.error("Failed to load POs:", err));
  }, []);

  // Load selected PO details
  useEffect(() => {
    if (!selectedPOId) {
      setPoDetails(null);
      setLines([]);
      return;
    }

    setLoadingPO(true);
    setGrnError(null);
    setGrnSuccess(null);

    fetch(`/api/admin/purchases/${selectedPOId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.purchaseOrder) {
          const po = json.purchaseOrder;
          setPoDetails(po);
          setInvoiceNo(po.invoiceNo || "");

          // Next year default expiry
          const defaultExp = new Date();
          defaultExp.setFullYear(defaultExp.getFullYear() + 2);
          const defaultExpStr = defaultExp.toISOString().slice(0, 10);

          const initialLines: GRNLineState[] = (po.items || []).map((it: any) => {
            const remaining = Math.max(0, it.quantity - it.receivedQty);
            const datePrefix = new Date().toISOString().slice(2, 10).replace(/-/g, "");
            const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();

            return {
              poItemId: it.id,
              medicineId: it.medicineId,
              medicineName: it.medicine.name,
              company: it.medicine.company,
              category: it.medicine.category,
              orderedQty: it.quantity,
              previouslyReceived: it.receivedQty,
              remainingQty: remaining,
              receivedQty: remaining, // Pre-fill with remaining
              bonusQty: 0,
              batchNo: it.batchNo || `B-${datePrefix}-${randomSuffix}`,
              expiryDate: it.expiryDate
                ? new Date(it.expiryDate).toISOString().slice(0, 10)
                : defaultExpStr,
              mfgDate: new Date().toISOString().slice(0, 10),
              purchasePrice: Number(it.price),
              tradeDiscount: 0,
              mrp: Number(it.mrp),
            };
          });

          setLines(initialLines);
        } else {
          setGrnError(json.message || "Failed to load Purchase Order");
        }
      })
      .catch((err) => setGrnError(err.message || "Network error loading PO"))
      .finally(() => setLoadingPO(false));
  }, [selectedPOId]);

  // Rapid Enter-key cell navigation without premature form submission
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (!form) return;
      const inputs = Array.from(form.querySelectorAll<HTMLInputElement>("input:not([disabled])"));
      const currentIndex = inputs.indexOf(e.currentTarget);
      if (currentIndex >= 0 && currentIndex < inputs.length - 1) {
        inputs[currentIndex + 1].focus();
      }
    }
  };

  // Handle GRN Submit
  const handleApproveGRN = async (e: React.FormEvent) => {
    e.preventDefault();
    setGrnError(null);

    if (!selectedPOId) {
      setGrnError("Please select a Purchase Order to inward");
      return;
    }

    const itemsToInward = lines.filter((l) => l.receivedQty > 0 || l.bonusQty > 0);
    if (itemsToInward.length === 0) {
      setGrnError("Please enter received quantity for at least one item");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/grn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poId: parseInt(selectedPOId, 10),
          invoiceNo: invoiceNo.trim() || undefined,
          branchId: poDetails?.branchId || activeBranch?.id,
          items: itemsToInward.map((l) => ({
            poItemId: l.poItemId,
            medicineId: l.medicineId,
            receivedQty: l.receivedQty,
            bonusQty: l.bonusQty,
            batchNo: l.batchNo,
            expiryDate: l.expiryDate,
            mfgDate: l.mfgDate || undefined,
            purchasePrice: l.purchasePrice,
            tradeDiscount: l.tradeDiscount || 0,
            mrp: l.mrp,
          })),
        }),
      });

      const json = await res.json();
      if (!json.success) {
        setGrnError(json.message || "Failed to approve GRN");
        setSubmitting(false);
        return;
      }

      setGrnSuccess(json);
      setLines([]);
      setPoDetails(null);
      setSelectedPOId("");
    } catch (err: any) {
      setGrnError(err.message || "GRN processing failed");
    } finally {
      setSubmitting(false);
    }
  };

  const totalInwardUnits = lines.reduce((sum, l) => sum + (l.receivedQty || 0) + (l.bonusQty || 0), 0);
  const totalInwardValue = lines.reduce((sum, l) => sum + (l.receivedQty || 0) * (l.purchasePrice || 0) * (1 - (l.tradeDiscount || 0) / 100), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* 1. Top Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs">
        <div className="flex items-center gap-3.5">
          <Link
            href="/admin/purchases"
            className="p-2.5 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>

          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md">
              Rapid Inwarding Desk
            </span>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              Goods Receipt Note (GRN)
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Inward vendor shipments, merge with active batches, and record bonus units into stock
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/batches"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors"
          >
            <Layers className="w-4 h-4 text-slate-500" />
            <span>View Current Batches</span>
          </Link>
        </div>
      </div>

      {/* Success Alert */}
      {grnSuccess && (
        <div className="p-6 rounded-3xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-extrabold text-emerald-900">
                Goods Receipt Note Inwarded Successfully!
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {grnSuccess.message}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            {grnSuccess.inwardedBatches?.map((b: any, idx: number) => (
              <div key={idx} className="bg-white p-3 rounded-2xl border border-emerald-200 text-xs space-y-1">
                <strong className="text-slate-900 block truncate">{b.medicineName}</strong>
                <div className="text-slate-500 text-[11px]">
                  Batch: <strong className="font-mono text-slate-700">{b.batchNo}</strong>
                </div>
                <div className="text-emerald-700 font-bold">
                  +{b.totalAdded} units (Now: {b.newStock} units)
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Link
              href="/admin/batches"
              className="px-4 py-2 rounded-xl bg-[#0F6E56] text-white text-xs font-extrabold"
            >
              Inspect Batches in Inventory
            </Link>
            <button
              onClick={() => setGrnSuccess(null)}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold"
            >
              Inward Another PO
            </button>
          </div>
        </div>
      )}

      {/* 2. PO Selection & Shipment Metadata */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs space-y-4">
        <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <Truck className="w-4 h-4 text-indigo-700" />
          <span>Step 1: Select Active Purchase Order</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="space-y-1 sm:col-span-2">
            <label className="font-bold text-slate-700">Choose Purchase Order *</label>
            <select
              value={selectedPOId}
              onChange={(e) => setSelectedPOId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20"
            >
              <option value="">Select a Purchase Order awaiting delivery...</option>
              {availablePOs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.poNumber} — {p.supplier.name} ({p.items?.length || 0} items, ₹{Number(p.total).toFixed(2)}) — [{p.status.toUpperCase()}]
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700">Supplier Invoice / Challan No</label>
            <input
              type="text"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              placeholder="e.g. INV-98432 / CH-450"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 font-bold"
            />
          </div>
        </div>

        {/* PO Details HUD */}
        {poDetails && (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase">Distributor:</span>
              <strong className="text-slate-900">{poDetails.supplier.name}</strong>
              <div className="text-[11px] text-slate-500">{poDetails.supplier.phone}</div>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase">Order Date:</span>
              <strong className="text-slate-900">{new Date(poDetails.poDate).toISOString().slice(0, 10)}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase">Target Branch:</span>
              <strong className="text-slate-900">{poDetails.branch?.name || "Main Counter"}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase">Status:</span>
              <span className="inline-block px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-extrabold text-[10px] uppercase">
                {poDetails.status}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3. GRN Inward Grid */}
      {selectedPOId && poDetails && (
        <form onSubmit={handleApproveGRN} className="space-y-6">
          <div className="bg-white border border-slate-200/90 rounded-3xl overflow-hidden shadow-xs space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900">
                  Step 2: Rapid Item-by-Item Stock Inwarding
                </h2>
                <p className="text-xs text-slate-500">
                  Verify quantities, enter manufacturer batch number, and mandatory expiry date
                </p>
              </div>

              <div className="text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                {lines.length} Line Item(s) in Order
              </div>
            </div>

            {grnError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{grnError}</span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                    <th className="py-2.5 px-3">Medicine</th>
                    <th className="py-2.5 px-3 text-center w-24">Ordered</th>
                    <th className="py-2.5 px-3 text-center w-28">Inward Qty *</th>
                    <th className="py-2.5 px-3 text-center w-24">Bonus Qty</th>
                    <th className="py-2.5 px-3 w-32">Batch No *</th>
                    <th className="py-2.5 px-3 w-36">Expiry Date *</th>
                    <th className="py-2.5 px-3 text-right w-24">Cost (₹)</th>
                    <th className="py-2.5 px-3 text-right w-20">Disc %</th>
                    <th className="py-2.5 px-3 text-right w-24">Selling MRP (₹)</th>
                    <th className="py-2.5 px-3 text-center w-24">Total Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {lines.map((l, idx) => (
                    <tr key={l.poItemId} className="hover:bg-slate-50/60">
                      {/* Medicine */}
                      <td className="py-3 px-3">
                        <strong className="text-slate-900 block text-xs">{l.medicineName}</strong>
                        <span className="text-[11px] text-slate-500 font-normal">
                          {l.company} ({l.category})
                        </span>
                      </td>

                      {/* Ordered / Received */}
                      <td className="py-3 px-3 text-center">
                        <span className="font-bold text-slate-700">{l.orderedQty}</span>
                        {l.previouslyReceived > 0 && (
                          <span className="block text-[10px] text-emerald-600">
                            (rec: {l.previouslyReceived})
                          </span>
                        )}
                      </td>

                      {/* Inward Qty */}
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          min="0"
                          value={l.receivedQty}
                          onKeyDown={handleInputKeyDown}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 0;
                            setLines(lines.map((item, i) => (i === idx ? { ...item, receivedQty: val } : item)));
                          }}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-center font-bold focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20"
                        />
                      </td>

                      {/* Bonus Free Qty */}
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          min="0"
                          value={l.bonusQty}
                          onKeyDown={handleInputKeyDown}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 0;
                            setLines(lines.map((item, i) => (i === idx ? { ...item, bonusQty: val } : item)));
                          }}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-center font-bold text-emerald-700 focus:outline-none"
                        />
                      </td>

                      {/* Batch No */}
                      <td className="py-3 px-3">
                        <input
                          type="text"
                          required
                          value={l.batchNo}
                          onKeyDown={handleInputKeyDown}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase();
                            setLines(lines.map((item, i) => (i === idx ? { ...item, batchNo: val } : item)));
                          }}
                          placeholder="e.g. B-0924"
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-mono font-bold focus:outline-none text-[11px]"
                        />
                      </td>

                      {/* Expiry Date */}
                      <td className="py-3 px-3">
                        <input
                          type="date"
                          required
                          value={l.expiryDate}
                          onKeyDown={handleInputKeyDown}
                          onChange={(e) => {
                            const val = e.target.value;
                            setLines(lines.map((item, i) => (i === idx ? { ...item, expiryDate: val } : item)));
                          }}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-bold focus:outline-none text-[11px]"
                        />
                      </td>

                      {/* Cost Price */}
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={l.purchasePrice}
                          onKeyDown={handleInputKeyDown}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setLines(lines.map((item, i) => (i === idx ? { ...item, purchasePrice: val } : item)));
                          }}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-right font-bold focus:outline-none text-[11px]"
                        />
                      </td>

                      {/* Trade Discount */}
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={l.tradeDiscount || ""}
                          placeholder="0%"
                          onKeyDown={handleInputKeyDown}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setLines(lines.map((item, i) => (i === idx ? { ...item, tradeDiscount: val } : item)));
                          }}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-right font-bold focus:outline-none text-[11px]"
                        />
                      </td>

                      {/* Selling MRP */}
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={l.mrp}
                          onKeyDown={handleInputKeyDown}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setLines(lines.map((item, i) => (i === idx ? { ...item, mrp: val } : item)));
                          }}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-right font-bold focus:outline-none text-[11px]"
                        />
                      </td>

                      {/* Net Total Units Added */}
                      <td className="py-3 px-3 text-center">
                        <span className="font-extrabold text-[#0F6E56] text-xs">
                          +{l.receivedQty + l.bonusQty}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Summary & Approve Action */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl bg-[#EAF5F0] border border-emerald-200">
              <div className="flex flex-wrap items-center gap-6 text-xs">
                <div>
                  <span className="text-slate-500 block">Total Units Inwarded:</span>
                  <span className="text-lg font-extrabold text-slate-900">{totalInwardUnits} units</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Inward Inventory Value:</span>
                  <span className="text-lg font-extrabold text-[#0F6E56]">
                    ₹{totalInwardValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="px-8 py-3.5 rounded-2xl bg-[#0F6E56] hover:bg-[#0b5643] text-white text-xs font-extrabold shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Approve & Ingest GRN into Branch Inventory</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

export default function GRNDeskPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-400">Loading GRN Desk...</div>}>
      <GRNDeskContent />
    </Suspense>
  );
}

