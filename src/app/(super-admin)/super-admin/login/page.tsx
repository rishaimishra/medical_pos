"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { toast } from "@/stores/useToastStore";
import { ForgotPasswordModal } from "@/components/auth/ForgotPasswordModal";

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [bootstrapNeeded, setBootstrapNeeded] = useState(false);
  const [mode, setMode] = useState<"login" | "bootstrap">("login");

  // Login fields
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  // Bootstrap fields
  const [ceoName, setCeoName] = useState("");
  const [ceoUsername, setCeoUsername] = useState("");
  const [ceoEmail, setCeoEmail] = useState("");
  const [ceoPassword, setCeoPassword] = useState("");
  const [bootstrapKey, setBootstrapKey] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lockedSeconds, setLockedSeconds] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/super-admin", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (json.authenticated) {
          router.replace("/super-admin/dashboard");
          return;
        }
        setBootstrapNeeded(Boolean(json.bootstrapNeeded));
        if (json.bootstrapNeeded) {
          setMode("bootstrap");
        }
      } catch {
        // Ignore network transient
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (lockedSeconds <= 0) return;
    const t = setInterval(() => {
      setLockedSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [lockedSeconds]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || lockedSeconds > 0) return;
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/super-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", identifier, password }),
      });
      const json = await res.json();

      if (res.ok && json.authenticated) {
        toast.success("Welcome to the CEO Command Tower!");
        router.replace("/super-admin/dashboard");
        return;
      }

      if (json.lockedOut && json.remainingSeconds) {
        setLockedSeconds(Number(json.remainingSeconds));
      }
      setErrorMsg(json.message || "Authentication failed.");
    } catch {
      setErrorMsg("Network error while signing in.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/super-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bootstrap",
          name: ceoName,
          username: ceoUsername,
          email: ceoEmail,
          password: ceoPassword,
          bootstrapKey,
        }),
      });
      const json = await res.json();
      if (res.ok && json.authenticated) {
        toast.success("Initial Platform CEO account created!");
        router.replace("/super-admin/dashboard");
        return;
      }
      setErrorMsg(json.message || "Bootstrap initialization failed.");
    } catch {
      setErrorMsg("Network error during CEO bootstrap.");
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center text-slate-200">
        <div className="flex items-center gap-3 text-sm font-semibold">
          <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
          <span>Verifying Platform Control Tower Session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col justify-between relative overflow-hidden">
      {/* Ambient Radial Executive Glow */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-teal-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-6">
          {/* Header Identity */}
          <div className="text-center space-y-2.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-400/25 text-teal-300 text-[11px] font-bold uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Platform Governance & SaaS Control</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              CEO / Super Admin Tower
            </h1>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Restricted to platform operators. Pharmacy store admins and staff sign in at{" "}
              <Link href="/admin/login" className="text-teal-400 hover:underline font-semibold">
                /admin/login
              </Link>
              .
            </p>
          </div>

          {/* Auth Card */}
          <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5">
            {bootstrapNeeded && (
              <div className="grid grid-cols-2 gap-1.5 bg-slate-950/70 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setErrorMsg(null);
                  }}
                  className={`py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    mode === "login"
                      ? "bg-teal-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Operator Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("bootstrap");
                    setErrorMsg(null);
                  }}
                  className={`py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                    mode === "bootstrap"
                      ? "bg-teal-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>First CEO Setup</span>
                </button>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <div>
                  <p className="font-semibold">{errorMsg}</p>
                  {lockedSeconds > 0 && (
                    <p className="text-[11px] text-rose-200/80 mt-0.5">
                      Locked for {lockedSeconds}s due to brute-force protection.
                    </p>
                  )}
                </div>
              </div>
            )}

            {mode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">
                    Username or Platform Email
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      autoFocus
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="ceo@medicalpos.local"
                      className="w-full bg-slate-950/80 border border-slate-700 focus:border-teal-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-300">Password</label>
                    <button
                      type="button"
                      onClick={() => setForgotOpen(true)}
                      className="text-xs font-bold text-teal-400 hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPass ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-slate-950/80 border border-slate-700 focus:border-teal-500 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                      aria-label="Toggle password visibility"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || lockedSeconds > 0}
                  className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  <span>{submitting ? "Authenticating..." : "Enter Control Tower"}</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleBootstrap} className="space-y-3.5">
                <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/25 text-[11px] text-teal-200 leading-relaxed">
                  No CEO user found yet. Enter <code className="font-mono text-teal-300">PLATFORM_BOOTSTRAP_KEY</code> or run{" "}
                  <code className="font-mono text-teal-300">scripts/seed-super-admin.ts</code> via CLI.
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={ceoName}
                      onChange={(e) => setCeoName(e.target.value)}
                      placeholder="Platform CEO"
                      className="w-full bg-slate-950/80 border border-slate-700 focus:border-teal-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">Username</label>
                    <input
                      type="text"
                      required
                      value={ceoUsername}
                      onChange={(e) => setCeoUsername(e.target.value)}
                      placeholder="ceo"
                      className="w-full bg-slate-950/80 border border-slate-700 focus:border-teal-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">CEO Email</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={ceoEmail}
                      onChange={(e) => setCeoEmail(e.target.value)}
                      placeholder="ceo@company.com"
                      className="w-full bg-slate-950/80 border border-slate-700 focus:border-teal-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Password (min 8 chars)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={ceoPassword}
                    onChange={(e) => setCeoPassword(e.target.value)}
                    placeholder="Strong passphrase..."
                    className="w-full bg-slate-950/80 border border-slate-700 focus:border-teal-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    PLATFORM_BOOTSTRAP_KEY
                  </label>
                  <div className="relative">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      value={bootstrapKey}
                      onChange={(e) => setBootstrapKey(e.target.value)}
                      placeholder="Secret key from .env"
                      className="w-full bg-slate-950/80 border border-slate-700 focus:border-teal-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Initialize CEO Account & Sign In</span>
                </button>
              </form>
            )}
          </div>

          <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500">
            <Link href="/" className="hover:text-slate-300 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" />
              <span>Public Portal</span>
            </Link>
            <span>•</span>
            <Link href="/admin/login" className="hover:text-slate-300">
              Store Admin Login
            </Link>
          </div>
        </div>
      </div>
      <ForgotPasswordModal
        open={forgotOpen}
        panel="super_admin"
        defaultIdentifier={identifier}
        onClose={() => setForgotOpen(false)}
        onSuccess={(msg, usedId) => {
          toast.success(msg);
          setErrorMsg(null);
          setLockedSeconds(0);
          if (usedId) setIdentifier(usedId);
          setPassword("");
        }}
      />
    </div>
  );
}
