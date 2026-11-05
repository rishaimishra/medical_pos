"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  Phone,
  Mail,
  MapPin,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Plus,
} from "lucide-react";

export default function CustomerLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Login Form (empty defaults - zero prefilled data)
  const [identifier, setIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register Form (empty defaults - zero prefilled data)
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regAddress, setRegAddress] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");

  useEffect(() => {
    fetch("/api/auth/customer", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json?.authenticated) {
          router.replace("/customer/dashboard");
        }
      })
      .catch(() => {});
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          identifier: identifier.trim(),
          password: loginPassword,
        }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setSuccessMsg("Signed in! Opening your account...");
        router.replace("/customer/dashboard");
      } else {
        setErrorMsg(json.message || "Could not sign in. Please check your details.");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (regPassword !== regConfirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          name: regName.trim(),
          phone: regPhone.trim(),
          email: regEmail.trim(),
          address: regAddress.trim(),
          password: regPassword,
        }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setSuccessMsg("Account created! Opening your dashboard...");
        router.replace("/customer/dashboard");
      } else {
        setErrorMsg(json.message || "Could not create account.");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#EAF5F0] flex flex-col justify-center items-center p-4 font-sans">
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0F5A47] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Medicine Shop
        </Link>
        <span className="text-[11px] font-bold text-[#0F5A47] bg-white px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          Customer Portal
        </span>
      </div>

      <div className="w-full max-w-md bg-white border border-emerald-100 rounded-3xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#0F5A47] text-white px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center">
              <Plus className="w-6 h-6 stroke-[3]" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">
                {mode === "login" ? "Customer Sign In" : "Create Customer Account"}
              </h1>
              <p className="text-xs text-emerald-100 mt-0.5">
                {mode === "login"
                  ? "Sign in to view your medicine orders, bills & prescriptions"
                  : "Register once to order medicines & track your bills online"}
              </p>
            </div>
          </div>

          {/* Toggle Pill */}
          <div className="grid grid-cols-2 gap-1.5 bg-black/20 p-1 rounded-xl mt-5">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setErrorMsg(null);
              }}
              className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === "login"
                  ? "bg-white text-[#0F5A47] shadow-xs"
                  : "text-emerald-100 hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setErrorMsg(null);
              }}
              className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === "register"
                  ? "bg-white text-[#0F5A47] shadow-xs"
                  : "text-emerald-100 hover:text-white"
              }`}
            >
              Create Account (Register)
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3.5 rounded-2xl bg-[#EAF5F0] border border-emerald-200 text-[#0F5A47] text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Mobile Number or Email *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Enter your mobile number or email"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F5A47] rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Password *
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F5A47] rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-[#0F5A47] hover:bg-[#0b4637] disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md"
              >
                <span>{loading ? "Signing In..." : "Sign In to My Account"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  Your Full Name *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F5A47] rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Mobile Number *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      required
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="10-digit mobile"
                      className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F5A47] rounded-xl pl-10 pr-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="Optional email"
                      className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F5A47] rounded-xl pl-10 pr-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  Home / Delivery Address
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={regAddress}
                    onChange={(e) => setRegAddress(e.target.value)}
                    placeholder="House no, street, area, pin code"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F5A47] rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Create Password *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F5A47] rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Confirm Password *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F5A47] rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-[#0F5A47] hover:bg-[#0b4637] disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md mt-2"
              >
                <span>{loading ? "Creating Account..." : "Create My Customer Account"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

