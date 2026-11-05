"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Lock,
  User,
  Eye,
  EyeOff,
  AlertTriangle,
  Clock,
  Store,
  ArrowRight,
  KeyRound,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";

export default function AdminLoginPage() {
  const router = useRouter();
  const { isAuthenticated, isLocked, setupDone, loading, login, checkSession } =
    useAuthStore();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!loading && isAuthenticated && !isLocked) {
      router.replace("/admin/dashboard");
    }
  }, [loading, isAuthenticated, isLocked, router]);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          setErrorMsg(null);
          setRemainingAttempts(5);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  const formatCountdown = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remSec = sec % 60;
    return `${String(mins).padStart(2, "0")}:${String(remSec).padStart(2, "0")}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0 || submitting) return;

    setErrorMsg(null);
    setSubmitting(true);

    const result = await login(identifier.trim(), password);
    setSubmitting(false);

    if (result.success) {
      router.replace("/admin/dashboard");
      return;
    }

    setErrorMsg(result.message || "Wrong username or password.");
    if (typeof result.remainingAttempts === "number") {
      setRemainingAttempts(result.remainingAttempts);
    }
    if (result.lockedOut && result.remainingSeconds) {
      setLockoutSeconds(result.remainingSeconds);
    }
  };

  return (
    <div className="min-h-screen bg-[#EAF2F4] flex flex-col items-center justify-center px-4 py-8 font-sans">
      <div className="w-full max-w-md mb-4 flex items-center justify-end">
        <span className="text-[11px] font-bold text-[#1F4E5B] bg-white px-3 py-1 rounded-full border border-slate-200 flex items-center gap-1 shadow-xs">
          <ShieldCheck className="w-3.5 h-3.5" />
          Staff & Admin Portal
        </span>
      </div>

      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden">
        {/* Top Slate-Teal Header */}
        <div className="bg-[#1F4E5B] text-white px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center text-white shadow-xs">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">
                Staff & Store Sign In
              </h1>
              <p className="text-xs text-slate-200 mt-0.5">
                Sign in to open the billing counter or store dashboard
              </p>
            </div>
          </div>
        </div>

        {/* New Store Owner Registration Callout */}
        <div className="mx-6 mt-6 p-4 rounded-2xl bg-[#EAF2F4]/70 border border-slate-200 text-slate-800 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 font-extrabold text-xs text-[#1F4E5B]">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Opening a New Pharmacy Store?</span>
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Register your own isolated store & admin account in 4 steps.
            </p>
          </div>
          <Link
            href="/setup/wizard"
            className="shrink-0 inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-[#0F6E56] hover:bg-[#0b5643] text-white text-xs font-bold transition-colors"
          >
            <span>Register Store</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Temporary 15-Minute Wait Banner after 5 wrong tries */}
          {lockoutSeconds > 0 && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-rose-700">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Too Many Wrong Attempts</span>
                </div>
                <span className="font-mono text-xs font-bold bg-white px-2.5 py-1 rounded-lg border border-rose-200 flex items-center gap-1 text-rose-700">
                  <Clock className="w-3.5 h-3.5" />
                  {formatCountdown(lockoutSeconds)}
                </span>
              </div>
              <p className="text-xs text-rose-700 leading-relaxed">
                You entered the wrong password 5 times in a row. For store safety, please wait 15 minutes before trying again.
              </p>
            </div>
          )}

          {/* Friendly Error Message */}
          {errorMsg && lockoutSeconds === 0 && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <p className="font-bold">{errorMsg}</p>
                {remainingAttempts !== null && remainingAttempts > 0 && (
                  <p className="text-[11px] text-amber-700">
                    You have <strong>{remainingAttempts}</strong> try(s) left before a 15-minute wait.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Username or Email
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                disabled={lockoutSeconds > 0 || submitting}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter your username or email"
                className="w-full bg-slate-50 border border-slate-300 focus:border-[#1F4E5B] rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? "text" : "password"}
                required
                disabled={lockoutSeconds > 0 || submitting}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full bg-slate-50 border border-slate-300 focus:border-[#1F4E5B] rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={lockoutSeconds > 0 || submitting}
            className="w-full py-3 px-4 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] disabled:bg-slate-200 disabled:text-slate-500 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
          >
            {submitting ? (
              <span>Signing In...</span>
            ) : lockoutSeconds > 0 ? (
              <>
                <Lock className="w-4 h-4" />
                <span>Please Wait ({formatCountdown(lockoutSeconds)})</span>
              </>
            ) : (
              <>
                <span>Sign In to Store</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <Link href="/setup/wizard" className="text-[#1F4E5B] font-bold hover:underline">
              New Store? Register Store Here
            </Link>
            <span>Auto-locks after 2h idle</span>
          </div>
        </form>
      </div>
    </div>
  );
}
