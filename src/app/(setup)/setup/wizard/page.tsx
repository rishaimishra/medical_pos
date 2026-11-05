"use client";

import React, { useState, useEffect } from "react";
import {
  Building2,
  UserCheck,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  KeyRound,
  Mail,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  ShieldCheck,
  Check,
  Lock,
  Eye,
  EyeOff,
  Search,
} from "lucide-react";

interface SetupDraft {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
  storeGst: string;
  storeDl: string;
  currency: string;
  lowQty: number;
  expiryDays: number;
  adminName: string;
  adminUsername: string;
  adminEmail: string;
}

export default function SetupWizardPage() {
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Draft state (empty by default — zero prefilled store names)
  const [formData, setFormData] = useState<SetupDraft>({
    storeName: "",
    storeAddress: "",
    storePhone: "",
    storeEmail: "",
    storeGst: "",
    storeDl: "",
    currency: "₹",
    lowQty: 10,
    expiryDays: 90,
    adminName: "",
    adminUsername: "",
    adminEmail: "",
  });

  // Admin password fields (never stored in draft state)
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Resume / Unlock Modal state
  const [requiresUnlock, setRequiresUnlock] = useState(false);
  const [adminEmailHint, setAdminEmailHint] = useState<string | null>(null);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);
  const [unlockOtp, setUnlockOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [resumeQuery, setResumeQuery] = useState("");
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeSearching, setResumeSearching] = useState(false);

  // DB Test state (Step 3 & Module 1.2.3 Error Handling)
  const [dbTestResult, setDbTestResult] = useState<{
    tested: boolean;
    healthy: boolean;
    latencyMs?: number;
    engine?: string;
    error?: string;
    recoveryHint?: string;
  }>({ tested: false, healthy: false });

  // Reset confirmation modal
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const showToast = (text: string, type: "success" | "error" | "info" = "info") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  // 1. Initial State Fetch & Browser Session Restoration (Handles cut browser at Any Step 1-4)
  useEffect(() => {
    async function loadSetupState() {
      try {
        setLoading(true);

        // Load local draft if user closed browser while typing
        const savedLocal = localStorage.getItem("medical_pos_setup_draft");
        if (savedLocal) {
          try {
            const parsed = JSON.parse(savedLocal);
            if (parsed.storeName === "Medical POS Pharmacy") {
              parsed.storeName = "";
            }
            setFormData(parsed);
          } catch (e) {
            // ignore JSON error
          }
        }

        const res = await fetch("/api/setup");
        const data = await res.json();

        if (data.setupDone) {
          localStorage.removeItem("medical_pos_setup_draft");
          window.location.href = "/admin/dashboard";
          return;
        }

        if (data.requiresUnlock) {
          setRequiresUnlock(true);
          setAdminEmailHint(data.adminEmailHint);
          setStep(data.currentStep);
        } else {
          setStep(data.currentStep || 1);
        }

        if (data.draft) {
          setFormData((prev) => ({
            ...prev,
            ...data.draft,
          }));
        }
      } catch (err: any) {
        showToast("Failed to connect to setup service. Please check your network.", "error");
      } finally {
        setLoading(false);
      }
    }

    loadSetupState();
  }, []);

  // Sync formData to localStorage on each keystroke
  useEffect(() => {
    if (!loading) {
      localStorage.setItem("medical_pos_setup_draft", JSON.stringify(formData));
    }
  }, [formData, loading]);

  // Handler: Step 1 Submit
  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.storeName.trim()) {
      showToast("Store Name is required.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_step_1",
          ...formData,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save store profile");

      showToast("Store profile saved! Proceeding to Admin Setup.", "success");
      setStep(2);
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Handler: Step 2 Submit
  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.adminName || !formData.adminUsername || !formData.adminEmail || !adminPassword) {
      showToast("All fields are required.", "error");
      return;
    }

    if (adminPassword.length < 6) {
      showToast("Password must be at least 6 characters.", "error");
      return;
    }

    if (adminPassword !== confirmPassword) {
      showToast("Passwords do not match.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_step_2",
          name: formData.adminName,
          username: formData.adminUsername,
          email: formData.adminEmail,
          password: adminPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create administrator");

      showToast("Administrator account verified and created!", "success");
      setStep(3);
      // Auto-run DB test for convenience
      runDbTest();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Handler: Step 3 DB Test
  const runDbTest = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_db" }),
      });
      const data = await res.json();

      if (data.success && data.health?.status === "healthy") {
        setDbTestResult({
          tested: true,
          healthy: true,
          latencyMs: data.health.latencyMs,
          engine: data.health.engine,
        });
        showToast("System setup check verified successfully!", "success");
      } else {
        setDbTestResult({
          tested: true,
          healthy: false,
          error: data.health?.error || "Setup check failed",
          recoveryHint: data.health?.recoveryHint || "Please check system services and try again.",
        });
        showToast("System setup check failed.", "error");
      }
    } catch (err: any) {
      setDbTestResult({
        tested: true,
        healthy: false,
        error: err.message,
        recoveryHint: "Check your network connection and server status.",
      });
      showToast("Error checking system readiness.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Handler: Step 3 -> Step 4 Advance (Persists Step 4 so browser closure remembers Step 4)
  const handleProceedToStep4 = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance_to_step_4" }),
      });
      setStep(4);
    } catch (err) {
      setStep(4);
    } finally {
      setSubmitting(false);
    }
  };

  // Handler: Step 4 Finalize Setup
  const handleFinalize = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_finalize" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup finalization failed");

      // Clear local storage draft
      localStorage.removeItem("medical_pos_setup_draft");

      showToast("Setup complete! Redirecting to dashboard...", "success");
      setTimeout(() => {
        window.location.href = data.redirectUrl || "/admin/dashboard";
      }, 1500);
    } catch (err: any) {
      showToast(err.message, "error");
      setSubmitting(false);
    }
  };

  // Handler: Unlock / Resume Session
  const handleUnlockSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockPassword && !unlockOtp) {
      setUnlockError("Please enter either your Admin Password or 6-digit Email OTP.");
      showToast("Please enter either your Admin Password or 6-digit Email OTP.", "error");
      return;
    }

    setSubmitting(true);
    setUnlockError(null);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_resume",
          password: unlockPassword,
          otp: unlockOtp,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unlock failed");

      showToast("Session unlocked! Resuming setup.", "success");
      setRequiresUnlock(false);
      setUnlockError(null);
      setStep(data.currentStep);
    } catch (err: any) {
      setUnlockError(err.message);
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Handler: Find & Resume Existing Setup from Another Device
  const handleSearchResume = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resumeQuery.trim()) {
      setResumeError("Please enter your Store Name or Admin Email/Username.");
      return;
    }

    setResumeSearching(true);
    setResumeError(null);
    try {
      const res = await fetch(`/api/setup?resume=${encodeURIComponent(resumeQuery.trim())}`);
      const data = await res.json();

      if (!res.ok || data.currentStep === 1 && !data.requiresUnlock) {
        throw new Error("No unfinished store setup found matching your details.");
      }

      setShowResumeModal(false);
      setResumeQuery("");
      setRequiresUnlock(true);
      setAdminEmailHint(data.adminEmailHint);
      setStep(data.currentStep);
      if (data.draft) {
        setFormData((prev) => ({ ...prev, ...data.draft }));
      }
      showToast("Setup draft located! Please verify your password or email code to unlock.", "info");
    } catch (err: any) {
      setResumeError(err.message || "Failed to locate store setup.");
    } finally {
      setResumeSearching(false);
    }
  };

  // Handler: Request Email OTP
  const handleSendOtp = async () => {
    setSubmitting(true);
    setUnlockError(null);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_otp" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send OTP");

      setOtpSent(true);
      showToast(data.message || "OTP sent to admin email.", "success");
      if (data.devOtpPreview) {
        showToast(`[Dev OTP Preview]: ${data.devOtpPreview}`, "info");
      }
    } catch (err: any) {
      setUnlockError(err.message);
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Handler: Reset Setup
  const handleResetSetup = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restart_setup" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset setup");

      localStorage.removeItem("medical_pos_setup_draft");
      localStorage.removeItem("med_pos_setup_wizard_draft_v1");

      showToast("Setup reset successfully! Starting from Step 1.", "info");
      setShowResetConfirm(false);
      setRequiresUnlock(false);
      setUnlockError(null);
      setStep(1);
      setFormData({
        storeName: "",
        storeAddress: "",
        storePhone: "",
        storeEmail: "",
        storeGst: "",
        storeDl: "",
        currency: "₹",
        lowQty: 10,
        expiryDays: 90,
        adminName: "",
        adminUsername: "",
        adminEmail: "",
      });
      setAdminPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setUnlockError(err.message);
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-10 h-10 text-[#0F6E56] animate-spin mb-4" />
        <p className="text-slate-600 font-semibold text-sm">Loading Store Setup...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl animate-in fade-in slide-in-from-top-4 duration-200 ${
            toastMessage.type === "success"
              ? "bg-[#EAF5F0] border-emerald-200 text-[#0F6E56]"
              : toastMessage.type === "error"
              ? "bg-rose-50 border-rose-200 text-rose-700"
              : "bg-white border-slate-200 text-slate-800"
          }`}
        >
          {toastMessage.type === "success" && <CheckCircle2 className="w-5 h-5 text-[#0F6E56]" />}
          {toastMessage.type === "error" && <AlertCircle className="w-5 h-5 text-rose-600" />}
          {toastMessage.type === "info" && <RefreshCw className="w-5 h-5 text-[#0F6E56]" />}
          <span className="text-sm font-bold">{toastMessage.text}</span>
        </div>
      )}

      {/* Main White Container */}
      <div className="max-w-3xl w-full bg-white border border-slate-200 rounded-3xl p-6 md:p-10 shadow-xl relative z-10">
        {/* Header & Reset Button */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-100 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#0F6E56] bg-[#EAF5F0] px-2.5 py-0.5 rounded-full">
                First-Time Store Setup
              </span>
              <span className="text-xs font-semibold text-slate-400">Step {step} of 4</span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Set Up Your Pharmacy Store
            </h1>
          </div>
          {step > 1 && !requiresUnlock && (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="text-xs font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-rose-200 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Start Over
            </button>
          )}
        </div>

        {/* 4-Step Progress Bar */}
        <div className="grid grid-cols-4 gap-2 mb-8 relative">
          {[
            { id: 1, label: "Store Details", icon: Building2 },
            { id: 2, label: "Owner Account", icon: UserCheck },
            { id: 3, label: "Setup Check", icon: ShieldCheck },
            { id: 4, label: "Finish Setup", icon: Sparkles },
          ].map((item) => {
            const isCompleted = step > item.id;
            const isActive = step === item.id;
            const Icon = item.icon;

            return (
              <div
                key={item.id}
                className={`p-3 rounded-2xl border transition-all text-center flex flex-col items-center gap-1.5 ${
                  isActive
                    ? "bg-[#EAF5F0] border-[#0F6E56] shadow-xs"
                    : isCompleted
                    ? "bg-emerald-50/60 border-emerald-200 text-[#0F6E56]"
                    : "bg-slate-50 border-slate-200 text-slate-400"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                    isActive
                      ? "bg-[#0F6E56] text-white"
                      : isCompleted
                      ? "bg-[#0F6E56] text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4 stroke-[3]" /> : <Icon className="w-4 h-4" />}
                </div>
                <span
                  className={`text-xs font-bold tracking-tight ${
                    isActive ? "text-[#0F6E56]" : isCompleted ? "text-[#0F6E56]" : "text-slate-400"
                  }`}
                >
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* ================================================================== */}
        {/* STEP 1: STORE DETAILS                                              */}
        {/* ================================================================== */}
        {step === 1 && !requiresUnlock && (
          <form onSubmit={handleStep1Submit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Pharmacy / Store Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.storeName}
                  onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
                  placeholder="e.g. HealthPharma Medical Store"
                  className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F6E56] rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  GST Number (GSTIN)
                </label>
                <input
                  type="text"
                  value={formData.storeGst}
                  onChange={(e) => setFormData({ ...formData, storeGst: e.target.value })}
                  placeholder="e.g. 19AAAAA0000A1Z5"
                  className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F6E56] rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Drug License Number (DL 20B / 21B)
                </label>
                <input
                  type="text"
                  value={formData.storeDl}
                  onChange={(e) => setFormData({ ...formData, storeDl: e.target.value })}
                  placeholder="e.g. WB-CAL-12345"
                  className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F6E56] rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Store Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.storePhone}
                  onChange={(e) => setFormData({ ...formData, storePhone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F6E56] rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Store Email Address
                </label>
                <input
                  type="email"
                  value={formData.storeEmail}
                  onChange={(e) => setFormData({ ...formData, storeEmail: e.target.value })}
                  placeholder="store@healthpharma.com"
                  className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F6E56] rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Full Shop Address
                </label>
                <textarea
                  rows={2}
                  value={formData.storeAddress}
                  onChange={(e) => setFormData({ ...formData, storeAddress: e.target.value })}
                  placeholder="Shop No, Street, City, PIN"
                  className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F6E56] rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Currency Symbol
                </label>
                <input
                  type="text"
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F6E56] rounded-xl px-4 py-2.5 text-sm text-slate-900 outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Low Stock Alert
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.lowQty}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        lowQty: e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F6E56] rounded-xl px-4 py-2.5 text-sm text-slate-900 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Expiry Alert (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.expiryDays}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        expiryDays: e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F6E56] rounded-xl px-4 py-2.5 text-sm text-slate-900 outline-none transition"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setResumeError(null);
                  setShowResumeModal(true);
                }}
                className="text-xs font-bold text-[#0F6E56] hover:underline flex items-center gap-1.5 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                Resume an unfinished setup from another device?
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="bg-[#0F6E56] hover:bg-[#0b5643] text-white font-bold px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                {submitting ? "Saving..." : "Save & Next Step"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* ================================================================== */}
        {/* STEP 2: OWNER ACCOUNT                                              */}
        {/* ================================================================== */}
        {step === 2 && !requiresUnlock && (
          <form onSubmit={handleStep2Submit} className="space-y-6">
            <div className="p-4 rounded-xl bg-[#EAF5F0] border border-emerald-200 text-xs text-slate-700 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-[#0F6E56] shrink-0 mt-0.5" />
              <p>
                Create your <strong>Store Owner / Admin Account</strong>. You will use this username and password to sign in and manage your store.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Your Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.adminName}
                  onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                  placeholder="e.g. Rajesh Kumar"
                  className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F6E56] rounded-xl px-4 py-2.5 text-sm text-slate-900 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Choose a Username <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.adminUsername}
                  onChange={(e) => setFormData({ ...formData, adminUsername: e.target.value })}
                  placeholder="e.g. admin"
                  className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F6E56] rounded-xl px-4 py-2.5 text-sm text-slate-900 outline-none transition"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Your Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.adminEmail}
                  onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                  placeholder="owner@healthpharma.com"
                  className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F6E56] rounded-xl px-4 py-2.5 text-sm text-slate-900 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showAdminPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F6E56] rounded-xl px-4 py-2.5 pr-11 text-sm text-slate-900 outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword((prev) => !prev)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                    tabIndex={-1}
                    aria-label={showAdminPassword ? "Hide password" : "Show password"}
                  >
                    {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Confirm Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Type password again"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F6E56] rounded-xl px-4 py-2.5 pr-11 text-sm text-slate-900 outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-slate-600 hover:text-slate-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="bg-[#0F6E56] hover:bg-[#0b5643] text-white font-bold px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                {submitting ? "Saving..." : "Save & Next Step"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* ================================================================== */}
        {/* STEP 3: SYSTEM SETUP CHECK                                         */}
        {/* ================================================================== */}
        {step === 3 && !requiresUnlock && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6 text-[#0F6E56]" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">System Setup & Store Readiness</h3>
                    <p className="text-xs text-slate-500">Verify your store configuration and operational readiness</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={runDbTest}
                  disabled={submitting}
                  className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:border-[#0F6E56] text-xs font-bold text-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${submitting ? "animate-spin" : ""}`} />
                  Run Setup Check
                </button>
              </div>

              {dbTestResult.tested ? (
                dbTestResult.healthy ? (
                  <div className="p-3.5 rounded-xl bg-[#EAF5F0] border border-emerald-200 text-[#0F6E56] text-xs flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <div>
                      <p className="font-bold">System is Ready & Verified!</p>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        All store services and storage configurations are operational.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold">
                      <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                      <span>Setup Verification Incomplete</span>
                    </div>
                    <p className="text-xs pl-7">{dbTestResult.error}</p>
                  </div>
                )
              ) : (
                <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-500 text-center">
                  Click &ldquo;Run Setup Check&rdquo; to verify system readiness.
                </div>
              )}
            </div>

            <div className="pt-4 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-slate-600 hover:text-slate-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>

              <button
                type="button"
                onClick={handleProceedToStep4}
                disabled={submitting || (dbTestResult.tested && !dbTestResult.healthy)}
                className="bg-[#0F6E56] hover:bg-[#0b5643] text-white font-bold px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                {submitting ? "Saving..." : "Next Step"} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* STEP 4: FINISH SETUP                                               */}
        {/* ================================================================== */}
        {step === 4 && !requiresUnlock && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <h3 className="text-xs font-bold text-[#0F6E56] uppercase tracking-wider">
                Review Your Store Details
              </h3>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">Store Name:</span>
                  <span className="font-bold text-slate-900 text-sm">{formData.storeName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Store Owner:</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {formData.adminName} ({formData.adminUsername})
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Email:</span>
                  <span className="font-bold text-slate-900">{formData.adminEmail}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Stock Alerts:</span>
                  <span className="font-bold text-slate-900">
                    Low Stock: {formData.lowQty} | Expiry: {formData.expiryDays} days
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="text-slate-600 hover:text-slate-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>

              <button
                type="button"
                onClick={handleFinalize}
                disabled={submitting}
                className="bg-[#0F6E56] hover:bg-[#0b5643] text-white font-bold px-7 py-3 rounded-xl flex items-center gap-2 shadow-lg transition disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="w-5 h-5" />
                {submitting ? "Finishing..." : "Finish & Open Store"}
              </button>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* RESUME / UNLOCK MODAL                                              */}
        {/* ================================================================== */}
        {requiresUnlock && (
          <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#EAF5F0] flex items-center justify-center text-[#0F6E56]">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Continue Your Store Setup</h2>
                <p className="text-xs text-slate-500">
                  You were on <strong>Step {step}</strong>. Enter your password or email code to continue.
                </p>
              </div>
            </div>

            {/* In-Modal Error Feedback */}
            {unlockError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{unlockError}</span>
              </div>
            )}

            <form onSubmit={handleUnlockSession} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Owner Password
                </label>
                <div className="relative">
                  <input
                    type={showUnlockPassword ? "text" : "password"}
                    value={unlockPassword}
                    onChange={(e) => setUnlockPassword(e.target.value)}
                    placeholder="Enter password from Step 2"
                    className="w-full bg-white border border-slate-300 focus:border-[#0F6E56] rounded-xl px-4 py-2.5 pr-11 text-sm text-slate-900 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUnlockPassword((prev) => !prev)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                    tabIndex={-1}
                    aria-label={showUnlockPassword ? "Hide password" : "Show password"}
                  >
                    {showUnlockPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 my-2 text-xs text-slate-400">
                <div className="h-px bg-slate-200 flex-1" />
                <span>OR USE EMAIL CODE</span>
                <div className="h-px bg-slate-200 flex-1" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    6-Digit Email Code
                  </label>
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={submitting}
                    className="text-xs font-bold text-[#0F6E56] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {otpSent ? "Send Code Again" : `Send Code to ${adminEmailHint || "Email"}`}
                  </button>
                </div>
                <input
                  type="text"
                  maxLength={6}
                  value={unlockOtp}
                  onChange={(e) => setUnlockOtp(e.target.value)}
                  placeholder="Enter 6-digit code"
                  className="w-full bg-white border border-slate-300 focus:border-[#0F6E56] rounded-xl px-4 py-2.5 text-sm text-slate-900 font-mono tracking-widest text-center outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                >
                  Start Over from Step 1
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-[#0F6E56] hover:bg-[#0b5643] text-white font-bold px-6 py-2.5 rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Checking..." : "Continue Setup"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Modal: Locate & Resume Existing Setup */}
        {showResumeModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <Search className="w-4 h-4 text-[#0F6E56]" />
                  <span>Resume Store Setup</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowResumeModal(false)}
                  className="text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {resumeError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{resumeError}</span>
                </div>
              )}

              <form onSubmit={handleSearchResume} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Store Name or Admin Email / Username
                  </label>
                  <input
                    type="text"
                    required
                    value={resumeQuery}
                    onChange={(e) => setResumeQuery(e.target.value)}
                    placeholder="e.g. HealthPharma or admin@store.com"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0F6E56] rounded-xl px-3.5 py-2 text-sm text-slate-900 outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Enter the store name or email you used when starting setup on your other device.
                  </p>
                </div>

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowResumeModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resumeSearching}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0F6E56] hover:bg-[#0b5643] text-white cursor-pointer disabled:opacity-50"
                  >
                    {resumeSearching ? "Searching..." : "Locate & Resume"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Restart Confirmation Popup */}
        {showResetConfirm && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                <AlertCircle className="w-5 h-5" />
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900">Start Setup Over?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  This will clear your current setup steps and start fresh from Step 1.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleResetSetup}
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                >
                  Yes, Start Over
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
