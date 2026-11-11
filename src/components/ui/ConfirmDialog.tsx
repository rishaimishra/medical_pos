"use client";

import React, { useEffect } from "react";
import { useConfirmStore } from "@/stores/useConfirmStore";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";

export function ConfirmDialog() {
  const { isOpen, options, close } = useConfirmStore();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        close(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  if (!isOpen || !options) return null;

  const isDanger = options.type === "danger";
  const isWarning = options.type === "warning";

  return (
    <div
      className="fixed inset-0 z-[9990] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-fadeIn"
      onClick={() => close(false)}
    >
      <div
        className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl p-6 space-y-4 animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              isDanger
                ? "bg-rose-50 border border-rose-200 text-rose-600"
                : isWarning
                ? "bg-amber-50 border border-amber-200 text-amber-600"
                : "bg-cyan-50 border border-cyan-200 text-cyan-600"
            }`}
          >
            {isDanger ? (
              <AlertCircle className="w-6 h-6" />
            ) : isWarning ? (
              <AlertTriangle className="w-6 h-6" />
            ) : (
              <Info className="w-6 h-6" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-extrabold text-slate-900 leading-tight">
              {options.title}
            </h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              {options.message}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => close(false)}
            className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
          >
            {options.cancelText || "Cancel"} (Esc)
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => close(true)}
            className={`px-4 py-2 rounded-xl text-white text-xs font-bold shadow-xs transition-colors cursor-pointer ${
              isDanger
                ? "bg-rose-600 hover:bg-rose-700"
                : isWarning
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-[#1F4E5B] hover:bg-[#163a44]"
            }`}
          >
            {options.confirmText || "Confirm"} (Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
