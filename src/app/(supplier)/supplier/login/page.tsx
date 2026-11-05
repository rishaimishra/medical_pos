"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Truck,
  User,
  Phone,
  Mail,
  Building2,
  KeyRound,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

export default function SupplierLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Login Form (empty defaults)
  const [identifier, setIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register Form (empty defaults)
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gstNo, setGstNo] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    fetch("/api/auth/supplier", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json?.authenticated) {
          router.replace("/supplier/dashboard");
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
      const res = await fetch("/api/auth/supplier", {
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
        setSuccessMsg("Signed in! Opening Supplier Dashboard...");
        router.replace("/supplier/dashboard");
      } else {
        setErrorMsg(json.message || "Could not sign in.");
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
    setLoading(true);

    try {
      const res = await fetch("/api/auth/supplier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          companyName: companyName.trim(),
          name: contactName.trim(),
          username: username.trim(),
          email: email.trim(),
          phone: phone.trim(),
          gstNo: gstNo.trim(),
          password,
        }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setSuccessMsg("Supplier account registered! Opening portal...");
        router.replace("/supplier/dashboard");
      } else {
        setErrorMsg(json.message || "Could not register supplier account.");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#EEF0F8] flex flex-col justify-center items-center p-4 font-sans">
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#283566] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
        <span className="text-[11px] font-bold text-[#283566] bg-white px-3 py-1 rounded-full border border-indigo-200 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          Supplier & Distributor Portal
        </span>
      </div>

      <div className="w-full max-w-md bg-white border border-indigo-100 rounded-3xl shadow-xl overflow-hidden">
        <div className="bg-[#283566] text-white px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">
                {mode === "login" ? "Supplier Sign In" : "Register as Distributor"}
              </h1>
              <p className="text-xs text-indigo-100 mt-0.5">
                Manage purchase orders, stock dispatches & wholesale invoices
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 bg-black/20 p-1 rounded-xl mt-5">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setErrorMsg(null);
              }}
              className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === "login"
                  ? "bg-white text-[#283566] shadow-xs"
                  : "text-indigo-100 hover:text-white"
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
                  ? "bg-white text-[#283566] shadow-xs"
                  : "text-indigo-100 hover:text-white"
              }`}
            >
              Register Supplier
            </button>
          </div>
        </div>

        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Username or Email *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Enter your supplier username or email"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#283566] rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
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
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#283566] rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-[#283566] hover:bg-[#1e284f] disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md"
              >
                <span>{loading ? "Signing In..." : "Sign In to Supplier Portal"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  Distributor / Company Name *
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Enter distributor company name"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#283566] rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Contact Person *
                  </label>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Full name"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#283566] rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Login Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Choose username"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#283566] rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Phone Number *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Mobile number"
                      className="w-full bg-slate-50 border border-slate-300 focus:border-[#283566] rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Official email"
                      className="w-full bg-slate-50 border border-slate-300 focus:border-[#283566] rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    GST Number
                  </label>
                  <input
                    type="text"
                    value={gstNo}
                    onChange={(e) => setGstNo(e.target.value.toUpperCase())}
                    placeholder="Optional GSTIN"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#283566] rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Password *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#283566] rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-[#283566] hover:bg-[#1e284f] disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md mt-2"
              >
                <span>{loading ? "Registering..." : "Create Supplier Account"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

