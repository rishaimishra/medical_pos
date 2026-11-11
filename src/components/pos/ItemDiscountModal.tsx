"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Percent, Tag, ShieldCheck, AlertCircle } from "lucide-react";
import { CartItem, useCartStore } from "@/stores/useCartStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "@/stores/useToastStore";
import { ManagerApprovalModal } from "./ManagerApprovalModal";

interface ItemDiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: CartItem | null;
}

export function ItemDiscountModal({ isOpen, onClose, item }: ItemDiscountModalProps) {
  const { updateItemDiscount, removeItemDiscount } = useCartStore();
  const { user } = useAuthStore();

  const maxAllowablePercent = user?.maxDiscountPercent ?? (user?.role === "admin" ? 100 : 10);

  const [mode, setMode] = useState<"percent" | "flat">("percent");
  const [val, setVal] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
  const [pendingDiscountPct, setPendingDiscountPct] = useState<number>(0);

  useEffect(() => {
    if (isOpen && item) {
      if (item.discountPercent && item.discountPercent > 0) {
        setMode("percent");
        setVal(String(item.discountPercent));
      } else if (item.discountAmount && item.discountAmount > 0) {
        setMode("flat");
        setVal(String(item.discountAmount));
      } else {
        setVal("");
      }
      setError(null);
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const lineGross = item.unitPrice * item.quantity;
  const numVal = parseFloat(val) || 0;

  let calculatedDiscount = 0;
  let effectivePercent = 0;

  if (mode === "percent") {
    effectivePercent = numVal;
    calculatedDiscount = (lineGross * numVal) / 100;
  } else {
    calculatedDiscount = numVal;
    effectivePercent = lineGross > 0 ? (numVal / lineGross) * 100 : 0;
  }

  calculatedDiscount = Math.min(calculatedDiscount, lineGross);
  const lineNet = Math.max(0, lineGross - calculatedDiscount);
  const exceedsCashierLimit = effectivePercent > maxAllowablePercent && user?.role !== "admin";

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (numVal <= 0) {
      removeItemDiscount(item.batchId);
      toast.info(`Discount removed from ${item.medicineName}`);
      onClose();
      return;
    }

    if (exceedsCashierLimit) {
      // Require Manager Approval
      setPendingDiscountPct(effectivePercent);
      setIsManagerModalOpen(true);
      return;
    }

    // Cashier is within limit or admin
    updateItemDiscount(item.batchId, calculatedDiscount, effectivePercent);
    toast.success(`Discount of ₹${calculatedDiscount.toFixed(2)} (${effectivePercent.toFixed(1)}%) applied to ${item.medicineName}`);
    onClose();
  };

  const handleManagerAuthorized = (auth: { managerName: string; managerId: number; percent: number }) => {
    updateItemDiscount(item.batchId, calculatedDiscount, auth.percent, auth.managerName);
    setIsManagerModalOpen(false);
    toast.success(`Discount authorized by ${auth.managerName} and applied!`);
    onClose();
  };

  const handleRemove = () => {
    removeItemDiscount(item.batchId);
    toast.info("Item discount cleared");
    onClose();
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Item-Level Discount"
        description={`Set line discount for ${item.medicineName}`}
        headerIcon={
          <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-[#1F4E5B] flex items-center justify-center">
            <Tag className="w-5 h-5" />
          </div>
        }
        size="md"
      >
        <form onSubmit={handleApply} className="space-y-4">
          {/* Item Details Card */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1">
            <div className="flex justify-between items-center font-bold text-slate-800">
              <span className="truncate max-w-[200px]">{item.medicineName}</span>
              <span className="font-mono text-slate-500">Batch: {item.batchNo}</span>
            </div>
            <div className="flex justify-between text-slate-600 text-[11px] pt-1 border-t border-slate-200/60">
              <span>{item.quantity} units @ ₹{item.unitPrice.toFixed(2)}</span>
              <span className="font-extrabold text-slate-900">Gross: ₹{lineGross.toFixed(2)}</span>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">
                Discount Mode
              </label>
              <span className="text-[11px] text-slate-500">
                Cashier limit: <strong className="text-amber-700">{maxAllowablePercent}%</strong>
              </span>
            </div>

            <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setMode("percent")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  mode === "percent"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Percentage (%)
              </button>
              <button
                type="button"
                onClick={() => setMode("flat")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  mode === "flat"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Flat Amount (₹)
              </button>
            </div>

            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                autoFocus
                value={val}
                onChange={(e) => setVal(e.target.value)}
                placeholder={mode === "percent" ? "e.g. 5, 10" : "e.g. 15, 20"}
                className="w-full bg-white border border-slate-300 focus:border-[#1F4E5B] rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:outline-none"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-slate-400">
                {mode === "percent" ? "%" : "₹"}
              </span>
            </div>
          </div>

          {/* Preset Buttons */}
          {mode === "percent" && (
            <div className="flex items-center gap-1.5">
              {[5, 10, 15, 20].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setVal(String(pct))}
                  className={`flex-1 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                    val === String(pct)
                      ? "bg-teal-50 border-teal-300 text-[#1F4E5B]"
                      : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          )}

          {/* Calculation summary */}
          <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs space-y-1">
            <div className="flex justify-between text-amber-900">
              <span>Item Deduction:</span>
              <span className="font-extrabold">-₹{calculatedDiscount.toFixed(2)} ({effectivePercent.toFixed(1)}%)</span>
            </div>
            <div className="flex justify-between text-slate-900 font-bold pt-1 border-t border-amber-200/60">
              <span>Net Item Line:</span>
              <span className="text-sm font-extrabold text-[#1F4E5B]">₹{lineNet.toFixed(2)}</span>
            </div>
          </div>

          {/* Manager override indicator */}
          {exceedsCashierLimit && (
            <div className="p-3 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 text-xs flex items-center gap-2 font-semibold">
              <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Discount exceeds {maxAllowablePercent}%. Clicking apply will request Manager Authorization.</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {(item.discountAmount ?? 0) > 0 && (
              <button
                type="button"
                onClick={handleRemove}
                className="text-xs text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
              >
                Clear Discount
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel (Esc)
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                {exceedsCashierLimit ? "Authorize & Apply" : "Apply Discount"}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Manager Approval Modal */}
      <ManagerApprovalModal
        isOpen={isManagerModalOpen}
        onClose={() => setIsManagerModalOpen(false)}
        requestedPercent={pendingDiscountPct}
        cashierLimit={maxAllowablePercent}
        itemDescription={`${item.medicineName} (Batch ${item.batchNo})`}
        onAuthorized={handleManagerAuthorized}
      />
    </>
  );
}
