import React from "react";
import { ShoppingCart, CreditCard } from "lucide-react";

export default function POSBillingPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#EAF5F0] text-[#0F6E56] flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">
              Store Billing Counter (POS)
            </h1>
            <p className="text-xs text-slate-500">
              Search medicines, add to bill, and print customer receipt
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold bg-[#EAF5F0] text-[#0F6E56] border border-emerald-200 px-3.5 py-1.5 rounded-full">
          <span>Quick Keys: [F2] Search Medicine</span>
          <span>•</span>
          <span>[F4] Collect Payment</span>
          <span>•</span>
          <span>[Ctrl+P] Print Bill</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 min-h-[460px] shadow-xs">
          <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-3">
            Medicine Search & Billing List
          </h2>
          <p className="text-slate-500 text-xs mt-4">
            Select medicines and batches to add them to the customer&apos;s bill.
          </p>
        </div>
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 min-h-[460px] shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <CreditCard className="w-4 h-4 text-[#0F6E56]" />
            <h2 className="text-sm font-bold text-slate-800">
              Bill Total & Payment
            </h2>
          </div>
          <p className="text-slate-500 text-xs mt-4">
            View total bill amount, discount, and choose Cash, UPI, or Card payment.
          </p>
        </div>
      </div>
    </div>
  );
}
