"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";

export type ResetPanelType = "admin" | "super_admin" | "customer" | "supplier";

interface ForgotPasswordModalProps {
  open: boolean;
  panel: ResetPanelType;
  defaultIdentifier?: string;
  onClose: () => void;
  onSuccess?: (message: string, identifierUsed: string) => void;
}

interface ThemeConfig {
  title: string;
  identifierLabel: string;
  identifierPlaceholder: string;
  minPasswordLength: number;
  helperNote: string;
  dark: boolean;
  headerBg: string;
  accentBtn: string;
  focusBorder: string;
  badgeClass: string;
}

const THEME_CONFIG: Record<ResetPanelType, ThemeConfig> = {
  admin: {
    title: "Staff & Store Admin Password Reset",
    identifierLabel: "Registered Username or Email *",
    identifierPlaceholder: "Enter your username or work email",
    minPasswordLength: 6,
    helperNote: "OTP is sent to the email configured on your Staff / Store Admin profile.",
    dark: false,
    headerBg: "bg-[#1F4E5B] text-white",
    accentBtn: "bg-[#1F4E5B] hover:bg-[#163a44] text-white",
    focusBorder: "focus:border-[#1F4E5B]",
    badgeClass: "bg-[#EAF2F4] text-[#1F4E5B]",
  },
  super_admin: {
    title: "Super Admin Email OTP Reset",
    identifierLabel: "Platform Username or Email *",
    identifierPlaceholder: "ceo@medicalpos.local",
    minPasswordLength: 8,
    helperNote: "Minimum 8 characters required for Platform Operator password resets.",
    dark: true,
    headerBg: "bg-slate-950 text-white border-b border-slate-800",
    accentBtn: "bg-teal-600 hover:bg-teal-500 text-white",
    focusBorder: "focus:border-teal-500",
    badgeClass: "bg-teal-500/15 text-teal-300",
  },
  customer: {
    title: "Customer Password Reset (Email OTP)",
    identifierLabel: "Registered Mobile Number or Email *",
    identifierPlaceholder: "Enter your registered phone or email",
    minPasswordLength: 6,
    helperNote:
      "Resets your Patient Portal password across all pharmacies linked to your mobile number.",
    dark: false,
    headerBg: "bg-[#0F5A47] text-white",
    accentBtn: "bg-[#0F5A47] hover:bg-[#0b4637] text-white",
    focusBorder: "focus:border-[#0F5A47]",
    badgeClass: "bg-[#EAF5F0] text-[#0F5A47]",
  },
  supplier: {
    title: "Supplier Portal Password Reset",
    identifierLabel: "Supplier Username or Email *",
    identifierPlaceholder: "Enter your supplier username or email",
    minPasswordLength: 6,
    helperNote: "OTP will be sent to your registered distributor portal email address.",
    dark: false,
    headerBg: "bg-[#283566] text-white",
    accentBtn: "bg-[#283566] hover:bg-[#1e284f] text-white",
    focusBorder: "focus:border-[#283566]",
    badgeClass: "bg-[#EEF0F8] text-[#283566]",
  },
};

export function ForgotPasswordModal({
  open,
  panel,
  defaultIdentifier = "",
  onClose,
  onSuccess,
}: ForgotPasswordModalProps) {
  const cfg = THEME_CONFIG[panel];

  const [step, setStep] = useState<"request" | "reset">("request");
  const [identifier, setIdentifier] = useState(defaultIdentifier);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("request");
      setIdentifier(defaultIdentifier || "");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setErrorMsg(null);
      setInfoMsg(null);
      setCooldown(0);
    }
  }, [open, defaultIdentifier]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  if (!open) return null;

  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!identifier.trim() || submitting) return;

    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          panel,
          action: "request_otp",
          identifier: identifier.trim(),
        }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setStep("reset");
        setCooldown(Number(json.cooldownSeconds || 45));
        setInfoMsg(
          json.message ||
            "6-digit OTP dispatched. Please check your inbox (and spam folder)."
        );
      } else {
        if (json.retryAfterSeconds) setCooldown(Number(json.retryAfterSeconds));
        setErrorMsg(json.message || "Could not send password reset OTP.");
      }
    } catch {
      setErrorMsg("Network error while sending password reset OTP.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setErrorMsg(null);
    setInfoMsg(null);

    if (!/^\d{6}$/.test(otp.trim())) {
      setErrorMsg("Please enter the exact 6-digit numeric OTP from your email.");
      return;
    }

    if (newPassword.length < cfg.minPasswordLength) {
      setErrorMsg(`New password must be at least ${cfg.minPasswordLength} characters.`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("New Password and Confirm Password do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          panel,
          action: "reset_password",
          identifier: identifier.trim(),
          otp: otp.trim(),
          newPassword,
          confirmPassword,
        }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        const okMsg =
          json.message || "Password reset successfully! Sign in with your new password.";
        onSuccess?.(okMsg, identifier.trim());
        onClose();
      } else {
        setErrorMsg(json.message || "Invalid OTP or expired verification code.");
      }
    } catch {
      setErrorMsg("Network error while resetting password.");
    } finally {
      setSubmitting(false);
    }
  };

  const surfaceCls = cfg.dark
    ? "bg-slate-900 border border-slate-700 text-slate-100"
    : "bg-white border border-slate-200 text-slate-900";
  const inputCls = cfg.dark
    ? `w-full bg-slate-950/90 border border-slate-700 ${cfg.focusBorder} rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none`
    : `w-full bg-slate-50 border border-slate-300 ${cfg.focusBorder} rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none`;
  const labelCls = cfg.dark
    ? "block text-xs font-bold text-slate-300"
    : "block text-xs font-bold text-slate-700";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="forgot-password-title"
    >
      <div className={`w-full max-w-md rounded-3xl shadow-2xl overflow-hidden ${surfaceCls}`}>
        <div className={`px-6 py-4 flex items-center justify-between ${cfg.headerBg}`}>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <div>
              <h2 id="forgot-password-title" className="text-sm font-extrabold">
                {cfg.title}
              </h2>
              <p className="text-[11px] opacity-80">
                {step === "request" ? "Step 1 of 2: Email Verification" : "Step 2 of 2: Verify OTP & Set Password"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {errorMsg && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 ${
                cfg.dark
                  ? "bg-rose-500/15 border border-rose-500/30 text-rose-300"
                  : "bg-rose-50 border border-rose-200 text-rose-700"
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 ${
                cfg.dark
                  ? "bg-teal-500/15 border border-teal-500/30 text-teal-200"
                  : "bg-emerald-50 border border-emerald-200 text-emerald-800"
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{infoMsg}</span>
            </div>
          )}

          {step === "request" ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div className="space-y-1.5">
                <label className={labelCls}>{cfg.identifierLabel}</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={cfg.identifierPlaceholder}
                    className={`${inputCls} pl-10 pr-4 py-2.5`}
                  />
                </div>
                <p className={`text-[11px] ${cfg.dark ? "text-slate-400" : "text-slate-500"}`}>
                  {cfg.helperNote}
                </p>
              </div>

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold border cursor-pointer ${
                    cfg.dark
                      ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !identifier.trim()}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${cfg.accentBtn}`}
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{submitting ? "Sending OTP..." : "Send 6-Digit Email OTP"}</span>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-3.5">
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setStep("request");
                    setErrorMsg(null);
                  }}
                  className={`inline-flex items-center gap-1 font-bold hover:underline cursor-pointer ${
                    cfg.dark ? "text-teal-400" : "text-slate-700"
                  }`}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Change Account ({identifier})</span>
                </button>
                <button
                  type="button"
                  disabled={cooldown > 0 || submitting}
                  onClick={() => handleRequestOtp()}
                  className={`inline-flex items-center gap-1 font-bold cursor-pointer disabled:opacity-50 ${
                    cfg.dark ? "text-teal-300 hover:text-teal-200" : "text-[#0F5A47] hover:underline"
                  }`}
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>{cooldown > 0 ? `Resend (${cooldown}s)` : "Resend OTP"}</span>
                </button>
              </div>

              <div className="space-y-1">
                <label className={labelCls}>6-Digit Email OTP *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  autoFocus
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Enter 6-digit OTP"
                  className={`${inputCls} px-4 py-2.5 font-mono text-center tracking-[0.3em] text-base font-extrabold`}
                />
              </div>

              <div className="space-y-1">
                <label className={labelCls}>
                  New Password (min {cfg.minPasswordLength} chars) *
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPass ? "text" : "password"}
                    required
                    minLength={cfg.minPasswordLength}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className={`${inputCls} pl-10 pr-10 py-2.5`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className={labelCls}>Confirm New Password *</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPass ? "text" : "password"}
                    required
                    minLength={cfg.minPasswordLength}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className={`${inputCls} pl-10 pr-4 py-2.5`}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || otp.length !== 6}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${cfg.accentBtn}`}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{submitting ? "Resetting Password..." : "Verify OTP & Reset Password"}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
