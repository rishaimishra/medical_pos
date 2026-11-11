"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ShieldCheck, Lock, AlertCircle, KeyRound } from "lucide-react";
import { toast } from "@/stores/useToastStore";

interface ManagerApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestedPercent: number;
  cashierLimit: number;
  itemDescription?: string;
  onAuthorized: (auth: { managerName: string; managerId: number; percent: number }) => void;
}

export function ManagerApprovalModal({
  isOpen,
  onClose,
  requestedPercent,
  cashierLimit,
  itemDescription = "Sale / Bill Discount",
  onAuthorized,
}: ManagerApprovalModalProps) {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!usernameOrEmail.trim() || !password) {
      setError("Please enter both Manager Username and Password");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/pos/manager-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernameOrEmail: usernameOrEmail.trim(),
          password,
          requestedDiscountPercent: requestedPercent,
          reason: `Discount of ${requestedPercent}% exceeds cashier threshold of ${cashierLimit}%`,
          itemDescription,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Manager authorization failed");
        setIsLoading(false);
        return;
      }

      toast.success(data.message || `Discount authorized by ${data.managerName}`);
      onAuthorized({
        managerName: data.managerName,
        managerId: data.managerId,
        percent: requestedPercent,
      });
      onClose();
    } catch {
      setError("Failed to connect to authentication service");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manager Override Authorization"
      description="Enter manager or administrator credentials to authorize high discount"
      headerIcon={
        <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5" />
        </div>
      }
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Warning notification */}
        <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Policy Threshold Exceeded</span>
          </div>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            Your cashier limit is <strong>{cashierLimit}%</strong>. You are requesting a <strong>{requestedPercent}%</strong> discount on <strong>{itemDescription}</strong>.
          </p>
        </div>

        {/* Manager Username / Email */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Manager Username or Email
          </label>
          <div className="relative">
            <input
              type="text"
              autoFocus
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              placeholder="e.g. manager, admin@drx.com"
              className="w-full bg-white border border-slate-300 focus:border-[#1F4E5B] rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 focus:outline-none"
            />
          </div>
        </div>

        {/* Manager Password */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Manager Password / PIN
          </label>
          <div className="relative">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white border border-slate-300 focus:border-[#1F4E5B] rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 focus:outline-none"
            />
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
          >
            Cancel (Esc)
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{isLoading ? "Verifying..." : "Authorize Discount"}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
