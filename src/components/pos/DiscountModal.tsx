"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Percent, Tag, AlertTriangle, Check } from "lucide-react";
import { useCartStore } from "@/stores/useCartStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "@/stores/useToastStore";

interface DiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  masterDiscounts?: Array<{ id: number; name: string; type: string; value: number; minAmount: number }>;
}

export function DiscountModal({ isOpen, onClose, masterDiscounts = [] }: DiscountModalProps) {
  const { getSubtotal, setDiscount, discountAmount, discountPercent, discountId } = useCartStore();
  const { user } = useAuthStore();

  const subtotal = getSubtotal();
  const maxAllowablePercent = user?.maxDiscountPercent ?? (user?.role === "admin" ? 100 : 10);

  const [mode, setMode] = useState<"percent" | "flat">("percent");
  const [val, setVal] = useState<string>(discountPercent > 0 ? String(discountPercent) : "");
  const [selectedMasterId, setSelectedMasterId] = useState<number | null>(discountId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (discountPercent > 0) {
        setMode("percent");
        setVal(String(discountPercent));
      } else if (discountAmount > 0) {
        setMode("flat");
        setVal(String(discountAmount));
      } else {
        setVal("");
      }
      setSelectedMasterId(discountId);
      setError(null);
    }
  }, [isOpen, discountAmount, discountPercent, discountId]);

  const numVal = parseFloat(val) || 0;

  // Calculate calculated discount in rupees
  let calculatedDiscount = 0;
  if (mode === "percent") {
    calculatedDiscount = (subtotal * numVal) / 100;
  } else {
    calculatedDiscount = numVal;
  }
  calculatedDiscount = Math.min(calculatedDiscount, subtotal);

  const resultingTotal = Math.max(0, subtotal - calculatedDiscount);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "percent") {
      if (numVal > maxAllowablePercent) {
        setError(
          `Permission Denied: Your staff role (${user?.role}) has a maximum discount limit of ${maxAllowablePercent}%. Manager authorization is required for higher discounts.`
        );
        return;
      }
      setDiscount(calculatedDiscount, numVal, selectedMasterId);
    } else {
      const effectivePercent = subtotal > 0 ? (calculatedDiscount / subtotal) * 100 : 0;
      if (effectivePercent > maxAllowablePercent && user?.role !== "admin") {
        setError(
          `Flat discount of ₹${calculatedDiscount.toFixed(2)} equals ${effectivePercent.toFixed(1)}%, which exceeds your maximum allowable limit of ${maxAllowablePercent}%.`
        );
        return;
      }
      setDiscount(calculatedDiscount, 0, selectedMasterId);
    }

    toast.success(`Discount of ₹${calculatedDiscount.toFixed(2)} applied!`);
    onClose();
  };

  const handleMasterSelect = (d: { id: number; name: string; type: string; value: number; minAmount: number }) => {
    if (subtotal < d.minAmount) {
      setError(`Minimum invoice amount for '${d.name}' is ₹${d.minAmount.toFixed(2)}.`);
      return;
    }
    setError(null);
    setSelectedMasterId(d.id);
    if (d.type === "percent") {
      setMode("percent");
      setVal(String(d.value));
    } else {
      setMode("flat");
      setVal(String(d.value));
    }
  };

  const handleClearDiscount = () => {
    setDiscount(0, 0, null);
    toast.info("Bill discount cleared.");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Apply Bill-Level Discount"
      description="Apply promotional schemes, master policies, or custom cashier discounts"
      headerIcon={
        <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
          <Percent className="w-5 h-5" />
        </div>
      }
      size="md"
    >
      <form onSubmit={handleApply} className="space-y-4">
        {/* Subtotal card */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-600 font-medium">Cart Subtotal:</span>
          <span className="text-base font-extrabold text-slate-900">
            ₹{subtotal.toFixed(2)}
          </span>
        </div>

        {/* Master Discounts */}
        {masterDiscounts.length > 0 && (
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Quick Scheme Policies
            </label>
            <div className="grid grid-cols-2 gap-2">
              {masterDiscounts.map((d) => {
                const isSelected = selectedMasterId === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleMasterSelect(d)}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                      isSelected
                        ? "bg-amber-50 border-amber-400 text-amber-900 font-bold shadow-2xs"
                        : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate font-semibold">{d.name}</span>
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800">
                        {d.type === "percent" ? `${d.value}%` : `₹${d.value}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Custom Discount Type Switcher */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-700">
              Custom Discount
            </label>
            <span className="text-[11px] text-slate-500 font-medium">
              Max allowable: <strong className="text-amber-700">{maxAllowablePercent}%</strong>
            </span>
          </div>

          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setMode("percent");
                setSelectedMasterId(null);
              }}
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
              onClick={() => {
                setMode("flat");
                setSelectedMasterId(null);
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                mode === "flat"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Flat Currency (₹)
            </button>
          </div>

          <div className="relative">
            <input
              type="number"
              step="any"
              min="0"
              autoFocus
              value={val}
              onChange={(e) => {
                setVal(e.target.value);
                setSelectedMasterId(null);
              }}
              placeholder={mode === "percent" ? "e.g. 5, 10" : "e.g. 50, 100"}
              className="w-full bg-white border border-slate-300 focus:border-[#1F4E5B] rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-bold focus:outline-none"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-slate-400">
              {mode === "percent" ? "%" : "₹"}
            </span>
          </div>
        </div>

        {/* Preset Percentage Buttons */}
        {mode === "percent" && (
          <div className="flex items-center gap-1.5">
            {[5, 10, 15, 20].map((pct) => (
              <button
                key={pct}
                type="button"
                disabled={pct > maxAllowablePercent && user?.role !== "admin"}
                onClick={() => {
                  setVal(String(pct));
                  setSelectedMasterId(null);
                }}
                className={`flex-1 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                  pct > maxAllowablePercent && user?.role !== "admin"
                    ? "opacity-30 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400"
                    : val === String(pct)
                    ? "bg-amber-100 border-amber-300 text-amber-900"
                    : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        )}

        {/* Calculation summary */}
        <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs space-y-1.5">
          <div className="flex justify-between text-amber-900">
            <span>Deduction Amount:</span>
            <span className="font-extrabold">-₹{calculatedDiscount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-slate-900 pt-1 border-t border-amber-200/60 font-bold">
            <span>Net Payable Total:</span>
            <span className="text-sm font-extrabold text-[#1F4E5B]">
              ₹{resultingTotal.toFixed(2)}
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          {discountAmount > 0 && (
            <button
              type="button"
              onClick={handleClearDiscount}
              className="text-xs text-rose-600 hover:text-rose-800 font-bold"
            >
              Remove Discount
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
              Apply Discount
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
