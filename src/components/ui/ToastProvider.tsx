"use client";

import React, { useEffect, useState } from "react";
import { useToastStore, ToastItem, ToastType } from "@/stores/useToastStore";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";

function ToastCard({ toast, onRemove }: { toast: ToastItem; onRemove: (id: string) => void }) {
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);
  const duration = toast.duration ?? 4500;

  useEffect(() => {
    if (isPaused) return;

    const intervalTime = 50;
    const decrement = (intervalTime / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= 0) {
          clearInterval(timer);
          onRemove(toast.id);
          return 0;
        }
        return Math.max(0, prev - decrement);
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [duration, isPaused, onRemove, toast.id]);

  const typeStyles: Record<
    ToastType,
    {
      bg: string;
      border: string;
      text: string;
      icon: React.ReactNode;
      barBg: string;
    }
  > = {
    success: {
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      text: "text-emerald-900",
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
      barBg: "bg-emerald-500",
    },
    error: {
      bg: "bg-rose-50",
      border: "border-rose-200",
      text: "text-rose-900",
      icon: <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />,
      barBg: "bg-rose-500",
    },
    warning: {
      bg: "bg-amber-50",
      border: "border-amber-200",
      text: "text-amber-900",
      icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />,
      barBg: "bg-amber-500",
    },
    info: {
      bg: "bg-cyan-50",
      border: "border-cyan-200",
      text: "text-cyan-900",
      icon: <Info className="w-5 h-5 text-cyan-600 shrink-0" />,
      barBg: "bg-cyan-500",
    },
  };

  const style = typeStyles[toast.type] || typeStyles.info;

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`relative w-full max-w-sm rounded-2xl border p-4 shadow-lg backdrop-blur-xs transition-all duration-300 pointer-events-auto overflow-hidden ${style.bg} ${style.border}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        {style.icon}
        <div className="flex-1 min-w-0 pr-2">
          {toast.title && (
            <h4 className={`text-xs font-bold leading-tight mb-0.5 ${style.text}`}>
              {toast.title}
            </h4>
          )}
          <p className={`text-xs leading-relaxed font-medium ${style.text}`}>
            {toast.message}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRemove(toast.id)}
          className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-black/5 transition-colors cursor-pointer"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress countdown bar (~4.5s indicator) */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/5">
        <div
          className={`h-full transition-all duration-75 ${style.barBg}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function ToastProvider() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 pointer-events-none select-none">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}
