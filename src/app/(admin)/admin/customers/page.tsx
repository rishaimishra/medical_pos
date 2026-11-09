"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  Search,
  Plus,
  RefreshCw,
  Loader2,
  Edit2,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
  Phone,
  Mail,
  HeartPulse,
  Clock,
  CreditCard,
  History,
  Send,
  X,
  Calendar,
  FileText,
  MapPin,
  Pill,
  DollarSign,
  ChevronRight,
  ShieldCheck,
  Check,
} from "lucide-react";

interface CustomerRecord {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  dob?: string | null;
  gender?: string | null;
  medicalNotes?: string | null;
  isChronic: boolean;
  chronicDiseases?: string | null;
  refillDays?: number | null;
  nextRefillDate?: string | null;
  lastRefillDate?: string | null;
  daysToRefill?: number | null;
  creditLimit: number;
  outstandingDue: number;
  active: boolean;
  verified: boolean;
  salesCount: number;
  prescriptionsCount: number;
  lastVisit?: string | null;
  createdAt: string;
}

interface RefillRecord {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  chronicDiseases?: string | null;
  refillDays: number;
  nextRefillDate?: string | null;
  lastRefillDate?: string | null;
  diffDays: number;
  isOverdue: boolean;
  statusText: string;
  recentMedicines: string[];
  lastPurchaseDate?: string | null;
  lastInvoiceNo?: string | null;
}

interface LedgerEntry {
  id: string;
  date: string;
  type: "sale" | "payment";
  description: string;
  referenceNo?: string | null;
  paymentMethod?: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
}

export default function CustomersPage() {
  const [activeTab, setActiveTab] = useState<"all" | "chronic" | "credit">("all");
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [chronicFilter, setChronicFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [hasDueFilter, setHasDueFilter] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({
    totalCustomers: 0,
    chronicCount: 0,
    refillsDueWeek: 0,
    totalOutstandingDue: 0,
  });

  // Modal 1: Add / Edit Customer
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    phone: string;
    email: string;
    address: string;
    dob: string;
    age: string;
    gender: string;
    medicalNotes: string;
    isChronic: boolean;
    chronicDiseases: string;
    refillDays: string;
    creditLimit: string;
    active: boolean;
  }>({
    name: "",
    phone: "",
    email: "",
    address: "",
    dob: "",
    age: "",
    gender: "",
    medicalNotes: "",
    isChronic: false,
    chronicDiseases: "",
    refillDays: "30",
    creditLimit: "0.00",
    active: true,
  });

  // Modal 2: Customer Profile / Health Details
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Modal 3: Baki Khata Ledger & Settlement
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [ledgerCustomerId, setLedgerCustomerId] = useState<number | null>(null);
  const [ledgerData, setLedgerData] = useState<{
    customer: any;
    summary: any;
    ledger: LedgerEntry[];
  } | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementMethod, setSettlementMethod] = useState("cash");
  const [settlementRef, setSettlementRef] = useState("");
  const [settlementNotes, setSettlementNotes] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState<string | null>(null);

  // Refill Tracker Tab State
  const [refills, setRefills] = useState<RefillRecord[]>([]);
  const [loadingRefills, setLoadingRefills] = useState(false);
  const [sendingReminderId, setSendingReminderId] = useState<number | null>(null);
  const [reminderToast, setReminderToast] = useState<string | null>(null);
  const [toastNotification, setToastNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastNotification({ type, text });
    setTimeout(() => setToastNotification(null), 4000);
  };

  // Fetch Customers
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const isCreditTab = activeTab === "credit";
      const q = new URLSearchParams({
        page: String(page),
        limit: "25",
        search,
        chronic: isCreditTab ? "all" : chronicFilter,
        gender: isCreditTab ? "all" : genderFilter,
        hasDue: isCreditTab ? "true" : (hasDueFilter ? "true" : "false"),
        sort: isCreditTab ? "due_desc" : "recent",
      });
      const res = await fetch(`/api/admin/customers?${q.toString()}`);
      const json = await res.json();
      if (json.success) {
        setCustomers(json.customers);
        setSummary(json.summary);
        setTotalPages(json.pagination.totalPages);
      }
    } catch (err) {
      console.error("Fetch customers error:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, chronicFilter, genderFilter, hasDueFilter, activeTab]);

  // Fetch Refills for Chronic Tab
  const fetchRefills = useCallback(async () => {
    setLoadingRefills(true);
    try {
      const res = await fetch(`/api/admin/customers/refills?days=14`);
      const json = await res.json();
      if (json.success) {
        setRefills(json.refills);
      }
    } catch (err) {
      console.error("Fetch refills error:", err);
    } finally {
      setLoadingRefills(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    if (activeTab === "chronic") {
      fetchRefills();
    }
  }, [activeTab, fetchRefills]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setModalMode("create");
    setEditingCustomer(null);
    setFormError(null);
    setFormData({
      name: "",
      phone: "",
      email: "",
      address: "",
      dob: "",
      age: "",
      gender: "male",
      medicalNotes: "",
      isChronic: false,
      chronicDiseases: "",
      refillDays: "30",
      creditLimit: "0.00",
      active: true,
    });
    setShowModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (customer: CustomerRecord) => {
    setModalMode("edit");
    setEditingCustomer(customer);
    setFormError(null);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || "",
      address: customer.address || "",
      dob: customer.dob ? new Date(customer.dob).toISOString().slice(0, 10) : "",
      age: "",
      gender: customer.gender || "",
      medicalNotes: customer.medicalNotes || "",
      isChronic: customer.isChronic,
      chronicDiseases: customer.chronicDiseases || "",
      refillDays: customer.refillDays ? String(customer.refillDays) : "30",
      creditLimit: String(customer.creditLimit || "0.00"),
      active: customer.active,
    });
    setShowModal(true);
  };

  // Save Customer (Create / Update)
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    try {
      const url =
        modalMode === "create"
          ? "/api/admin/customers"
          : `/api/admin/customers/${editingCustomer?.id}`;
      const method = modalMode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone,
          email: formData.email || undefined,
          address: formData.address || undefined,
          dob: formData.dob || undefined,
          age: formData.age || undefined,
          gender: formData.gender || undefined,
          medicalNotes: formData.medicalNotes || undefined,
          isChronic: formData.isChronic,
          chronicDiseases: formData.isChronic ? formData.chronicDiseases : undefined,
          refillDays: formData.isChronic ? parseInt(formData.refillDays, 10) : undefined,
          creditLimit: parseFloat(formData.creditLimit) || 0,
          active: formData.active,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to save customer");
      }

      setShowModal(false);
      fetchCustomers();
      if (activeTab === "chronic") fetchRefills();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete Customer
  const handleDeleteCustomer = async (c: CustomerRecord) => {
    if (
      !confirm(
        `Are you sure you want to delete patient "${c.name}"? This action cannot be undone if they have no active sales or unpaid balance.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/customers/${c.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast(json.message || "Failed to delete customer", "error");
        return;
      }
      showToast(`Patient "${c.name}" removed successfully`, "success");
      fetchCustomers();
    } catch (err: any) {
      showToast("Error: " + err.message, "error");
    }
  };

  // Open Full Profile Modal
  const handleOpenProfile = async (c: CustomerRecord) => {
    setShowProfileModal(true);
    setLoadingProfile(true);
    try {
      const res = await fetch(`/api/admin/customers/${c.id}`);
      const json = await res.json();
      if (json.success) {
        setSelectedProfile(json.customer);
      }
    } catch (err) {
      console.error("Fetch profile error:", err);
    } finally {
      setLoadingProfile(false);
    }
  };

  // Open Ledger Modal
  const handleOpenLedger = async (customerId: number) => {
    setLedgerCustomerId(customerId);
    setShowLedgerModal(true);
    setLoadingLedger(true);
    setPaymentSuccessMsg(null);
    setSettlementAmount("");
    setSettlementRef("");
    setSettlementNotes("");

    try {
      const res = await fetch(`/api/admin/customers/${customerId}/ledger`);
      const json = await res.json();
      if (json.success) {
        setLedgerData(json);
        if (json.summary?.currentDue > 0) {
          setSettlementAmount(String(json.summary.currentDue));
        }
      }
    } catch (err) {
      console.error("Fetch ledger error:", err);
    } finally {
      setLoadingLedger(false);
    }
  };

  // Record Settlement Payment
  const handleRecordSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ledgerCustomerId) return;

    setSubmittingPayment(true);
    setPaymentSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/customers/${ledgerCustomerId}/ledger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(settlementAmount),
          paymentMethod: settlementMethod,
          referenceNo: settlementRef || undefined,
          notes: settlementNotes || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast(json.message || "Failed to record payment", "error");
        return;
      }

      setPaymentSuccessMsg(`Payment of ₹${parseFloat(settlementAmount).toFixed(2)} recorded successfully.`);
      setSettlementAmount("");
      setSettlementRef("");
      setSettlementNotes("");

      // Refresh Ledger & Customers
      const updatedLedgerRes = await fetch(`/api/admin/customers/${ledgerCustomerId}/ledger`);
      const updatedLedgerJson = await updatedLedgerRes.json();
      if (updatedLedgerJson.success) {
        setLedgerData(updatedLedgerJson);
      }
      fetchCustomers();
    } catch (err: any) {
      showToast("Payment error: " + err.message, "error");
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Send Refill Reminder Alert
  const handleSendReminder = async (patientId: number, advanceCycle: boolean = false) => {
    setSendingReminderId(patientId);
    setReminderToast(null);

    try {
      const res = await fetch("/api/admin/customers/refills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: patientId,
          channel: "email",
          advanceCycle,
        }),
      });

      const json = await res.json();
      if (json.success) {
        showToast(json.message || "Refill reminder sent successfully!", "success");
        fetchRefills();
      } else {
        showToast(json.message || "Failed to send reminder", "error");
      }
    } catch (err: any) {
      showToast("Error sending reminder: " + err.message, "error");
    } finally {
      setSendingReminderId(null);
    }
  };

  // Toggle Chronic Condition Tag helper
  const handleToggleDisease = (tag: string) => {
    const current = formData.chronicDiseases
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (current.includes(tag)) {
      setFormData({
        ...formData,
        chronicDiseases: current.filter((t) => t !== tag).join(", "),
      });
    } else {
      setFormData({
        ...formData,
        chronicDiseases: [...current, tag].join(", "),
      });
    }
  };

  const diseaseChips = [
    "Diabetes (Type 2)",
    "Hypertension (Blood Pressure)",
    "Cardiac / Heart Condition",
    "Thyroid Disorder",
    "Asthma / COPD",
    "Arthritis / Joint Pain",
    "Cholesterol / Lipids",
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification Banner */}
      {toastNotification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-lg border flex items-center gap-2.5 text-xs font-bold transition-all animate-in fade-in slide-in-from-top-2 ${
            toastNotification.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {toastNotification.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{toastNotification.text}</span>
          <button
            onClick={() => setToastNotification(null)}
            className="ml-2 p-1 rounded-lg hover:bg-black/5 text-slate-500"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* 1. Header with Title & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#0F6E56]/10 text-[#0F6E56] flex items-center justify-center font-bold">
            <HeartPulse className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Patients & Customers Directory
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Customer master profiles, chronic refill reminders, and trusted Baki Khata credit tracking
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href="/api/admin/customers/export"
            download
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export Excel CSV</span>
          </a>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F6E56] hover:bg-[#0b5643] text-white text-xs font-extrabold transition-all shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Register New Patient</span>
          </button>
        </div>
      </div>

      {/* Reminder Toast */}
      {reminderToast && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{reminderToast}</span>
          </div>
          <button onClick={() => setReminderToast(null)}>
            <X className="w-4 h-4 text-emerald-600" />
          </button>
        </div>
      )}

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Registered Patients
            </span>
            <span className="text-2xl font-extrabold text-slate-900 mt-1 block">
              {summary.totalCustomers}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">Master customer base</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-teal-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-teal-800 uppercase tracking-wider block">
              Chronic Care Patients
            </span>
            <span className="text-2xl font-extrabold text-teal-950 mt-1 block">
              {summary.chronicCount}
            </span>
            <span className="text-[11px] text-teal-700 font-medium">Auto refill cycle tagged</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center">
            <HeartPulse className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-amber-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider block">
              Refills Due This Week
            </span>
            <span className="text-2xl font-extrabold text-amber-950 mt-1 block">
              {summary.refillsDueWeek}
            </span>
            <span className="text-[11px] text-amber-700 font-medium">Due in next 7 days</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-rose-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider block">
              Total Baki / Credit Dues
            </span>
            <span className="text-2xl font-extrabold text-rose-950 mt-1 block">
              ₹{summary.totalOutstandingDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-rose-700 font-medium">Active trusted customer dues</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-800 flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. Main Navigation Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6 text-xs font-extrabold">
          <button
            onClick={() => setActiveTab("all")}
            className={`pb-3 border-b-2 flex items-center gap-2 transition-all ${
              activeTab === "all"
                ? "border-[#0F6E56] text-[#0F6E56]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>All Patients / Customers</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700">
              {summary.totalCustomers}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("chronic")}
            className={`pb-3 border-b-2 flex items-center gap-2 transition-all ${
              activeTab === "chronic"
                ? "border-[#0F6E56] text-[#0F6E56]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <HeartPulse className="w-4 h-4" />
            <span>Chronic Refill Tracker</span>
            {summary.refillsDueWeek > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-900 font-bold">
                {summary.refillsDueWeek} Due
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("credit")}
            className={`pb-3 border-b-2 flex items-center gap-2 transition-all ${
              activeTab === "credit"
                ? "border-[#0F6E56] text-[#0F6E56]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Customer Credit Ledger (Baki Khata)</span>
            {summary.totalOutstandingDue > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-100 text-rose-900 font-bold">
                ₹{Math.round(summary.totalOutstandingDue)} Due
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* 4. Tab 1: All Patients / Customers View */}
      {activeTab === "all" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              {/* Chronic Filter */}
              <select
                value={chronicFilter}
                onChange={(e) => {
                  setChronicFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none"
              >
                <option value="all">All Care Types</option>
                <option value="chronic">Chronic Patients Only</option>
                <option value="non_chronic">Standard Retail Customers</option>
              </select>

              {/* Gender Filter */}
              <select
                value={genderFilter}
                onChange={(e) => {
                  setGenderFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none"
              >
                <option value="all">All Genders</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>

              {/* Has Due Filter Button */}
              <button
                type="button"
                onClick={() => {
                  setHasDueFilter(!hasDueFilter);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl border transition-all ${
                  hasDueFilter
                    ? "bg-rose-50 border-rose-300 text-rose-800 font-extrabold"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {hasDueFilter ? "✔ Filter: Has Outstanding Due" : "Show Only With Dues"}
              </button>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by name, phone, email, or disease..."
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 focus:border-[#0F6E56]"
                />
              </div>

              <button
                onClick={() => fetchCustomers()}
                className="p-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 font-extrabold text-slate-600 tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Patient / Customer</th>
                    <th className="py-3.5 px-4">Contact Info</th>
                    <th className="py-3.5 px-4">Care Profile & Chronic Tags</th>
                    <th className="py-3.5 px-4 text-center">Refill Status</th>
                    <th className="py-3.5 px-4 text-right">Credit / Baki Due</th>
                    <th className="py-3.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#0F6E56]" />
                        <span>Loading patient directory...</span>
                      </td>
                    </tr>
                  ) : customers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                        <span>No patient or customer records found matching your filters.</span>
                      </td>
                    </tr>
                  ) : (
                    customers.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Name & Basic info */}
                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => handleOpenProfile(c)}
                            className="font-extrabold text-slate-900 text-sm hover:text-[#0F6E56] text-left block"
                          >
                            {c.name}
                          </button>
                          <div className="text-[11px] text-slate-500 font-medium flex items-center gap-2 mt-0.5">
                            {c.gender && (
                              <span className="capitalize px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                                {c.gender}
                              </span>
                            )}
                            {c.dob && (
                              <span>DOB: {new Date(c.dob).toISOString().slice(0, 10)}</span>
                            )}
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-800 flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{c.phone}</span>
                          </div>
                          {c.email && (
                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <span className="truncate max-w-[180px]">{c.email}</span>
                            </div>
                          )}
                        </td>

                        {/* Care Profile */}
                        <td className="py-3.5 px-4">
                          {c.isChronic ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-50 text-teal-800 border border-teal-200">
                                <HeartPulse className="w-3 h-3 text-teal-600" />
                                <span>Chronic Patient</span>
                              </span>
                              {c.chronicDiseases && (
                                <p className="text-[11px] text-slate-600 font-medium truncate max-w-xs">
                                  {c.chronicDiseases}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-medium">Standard Customer</span>
                          )}
                        </td>

                        {/* Refill status */}
                        <td className="py-3.5 px-4 text-center">
                          {c.isChronic && c.nextRefillDate ? (
                            <div>
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                                  c.daysToRefill! < 0
                                    ? "bg-rose-100 text-rose-800"
                                    : c.daysToRefill! <= 3
                                    ? "bg-amber-100 text-amber-900"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {c.daysToRefill! < 0
                                  ? `${Math.abs(c.daysToRefill!)}d Overdue`
                                  : c.daysToRefill === 0
                                  ? "Due Today"
                                  : `In ${c.daysToRefill}d`}
                              </span>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Every {c.refillDays || 30} days
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        {/* Credit / Due */}
                        <td className="py-3.5 px-4 text-right">
                          <div
                            className={`font-extrabold text-sm ${
                              c.outstandingDue > 0 ? "text-rose-600" : "text-slate-700"
                            }`}
                          >
                            ₹{c.outstandingDue.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Limit: ₹{c.creditLimit.toFixed(2)}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenLedger(c.id)}
                              title="Baki Khata Credit Ledger"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenProfile(c)}
                              title="View Patient Profile"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-[#0F6E56] hover:bg-[#EAF5F0] transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenEdit(c)}
                              title="Edit Patient Info"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteCustomer(c)}
                              title="Delete Patient"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Tab 2: Chronic Patient Refill Tracker View */}
      {activeTab === "chronic" && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div>
              <h2 className="font-extrabold text-slate-900 text-sm">
                Routine Prescription Refill Schedule (Next 14 Days & Overdue)
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Prevent treatment discontinuation by proactively reminding chronic patients when medicine supplies finish
              </p>
            </div>
            <button
              onClick={() => fetchRefills()}
              className="p-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loadingRefills ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 font-extrabold text-slate-600 tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Patient Name</th>
                  <th className="py-3.5 px-4">Contact</th>
                  <th className="py-3.5 px-4">Chronic Condition</th>
                  <th className="py-3.5 px-4">Recent Prescribed Drugs</th>
                  <th className="py-3.5 px-4 text-center">Refill Target Date</th>
                  <th className="py-3.5 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingRefills ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#0F6E56]" />
                      <span>Loading chronic refill schedule...</span>
                    </td>
                  </tr>
                ) : refills.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40 text-emerald-600" />
                      <span>All chronic patients are currently up to date on their refills!</span>
                    </td>
                  </tr>
                ) : (
                  refills.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {r.name}
                        <div className="text-[11px] text-slate-400 font-normal">
                          Cycle: Every {r.refillDays} days
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-700 flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{r.phone}</span>
                        </div>
                        {r.email && (
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <Mail className="w-3 h-3 text-slate-400" />
                            <span>{r.email}</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 font-bold text-[11px]">
                          {r.chronicDiseases || "Chronic Patient"}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 font-medium">
                        {r.recentMedicines.length > 0 ? (
                          <div className="truncate max-w-xs">
                            {r.recentMedicines.join(", ")}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No recent sales</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-extrabold ${
                            r.isOverdue
                              ? "bg-rose-100 text-rose-800"
                              : r.diffDays <= 3
                              ? "bg-amber-100 text-amber-900"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {r.statusText}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {r.nextRefillDate}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            disabled={sendingReminderId === r.id}
                            onClick={() => handleSendReminder(r.id, false)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0F6E56] hover:bg-[#0b5643] text-white font-bold text-[11px] transition-colors disabled:opacity-50"
                          >
                            <Send className="w-3 h-3" />
                            <span>{sendingReminderId === r.id ? "Sending..." : "Notify"}</span>
                          </button>

                          <button
                            title="Renew / Advance cycle by 30 days"
                            onClick={() => handleSendReminder(r.id, true)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-[11px] transition-colors"
                          >
                            <span>+Cycle</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Tab 3: Baki Khata / Customer Credit Ledger View */}
      {activeTab === "credit" && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div>
              <h2 className="font-extrabold text-slate-900 text-sm">
                Baki Khata / Customer Credit Accounts
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Monitor approved credit limits, outstanding balances, and record payment settlements
              </p>
            </div>
            <button
              onClick={() => fetchCustomers()}
              className="p-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 font-extrabold text-slate-600 tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Customer Name</th>
                  <th className="py-3.5 px-4">Phone</th>
                  <th className="py-3.5 px-4 text-right">Credit Limit (₹)</th>
                  <th className="py-3.5 px-4 text-right">Current Due / Baki (₹)</th>
                  <th className="py-3.5 px-4 text-center">Credit Utilization</th>
                  <th className="py-3.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers
                  .filter((c) => c.creditLimit > 0 || c.outstandingDue > 0)
                  .map((c) => {
                    const percentUsed =
                      c.creditLimit > 0
                        ? Math.min(100, Math.round((c.outstandingDue / c.creditLimit) * 100))
                        : 0;

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          {c.name}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-600">
                          {c.phone}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                          ₹{c.creditLimit.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-extrabold text-sm text-rose-600">
                          ₹{c.outstandingDue.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="w-36 mx-auto">
                            <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                              <span>{percentUsed}%</span>
                              <span>{c.outstandingDue > c.creditLimit ? "Over Limit" : "Approved"}</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                style={{ width: `${percentUsed}%` }}
                                className={`h-full rounded-full ${
                                  percentUsed > 80 ? "bg-rose-500" : percentUsed > 50 ? "bg-amber-500" : "bg-emerald-500"
                                }`}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => handleOpenLedger(c.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-bold text-xs border border-indigo-200 transition-colors"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>View Ledger / Settle</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: Add / Edit Patient Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 my-8 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#0F6E56]/10 text-[#0F6E56] flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    {modalMode === "create" ? "Register New Patient / Customer" : `Edit Patient: ${editingCustomer?.name}`}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Master customer fields, health care profile, and Baki credit limit
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveCustomer} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Full Name */}
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 focus:border-[#0F6E56]"
                  />
                </div>

                {/* Mobile Phone */}
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Mobile Phone <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="e.g. 9876543210"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 focus:border-[#0F6E56]"
                  />
                </div>

                {/* Email Address */}
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Email Address (For Invoices & Refill Alerts)
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="e.g. ramesh@example.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 focus:border-[#0F6E56]"
                  />
                </div>

                {/* Gender */}
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Gender</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 focus:border-[#0F6E56]"
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Date of Birth or Age */}
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={formData.dob}
                    onChange={(e) => setFormData({ ...formData, dob: e.target.value, age: "" })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 focus:border-[#0F6E56]"
                  />
                </div>

                {/* Approximate Age */}
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Or Age (Years)</label>
                  <input
                    type="number"
                    min="1"
                    max="125"
                    value={formData.age}
                    onChange={(e) => setFormData({ ...formData, age: e.target.value, dob: "" })}
                    placeholder="e.g. 52"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 focus:border-[#0F6E56]"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">Residential Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="e.g. 14B Park Street, Sector 3, Kolkata"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium focus:outline-none"
                />
              </div>

              {/* Medical Notes */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Medical Notes & Drug Allergies (e.g. Penicillin allergy, diabetic diet)
                </label>
                <textarea
                  rows={2}
                  value={formData.medicalNotes}
                  onChange={(e) => setFormData({ ...formData, medicalNotes: e.target.value })}
                  placeholder="Record known allergies, chronic complaints, or dietary restrictions..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium focus:outline-none"
                />
              </div>

              {/* Section: Chronic Refill Program */}
              <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 font-extrabold text-teal-950 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isChronic}
                      onChange={(e) => setFormData({ ...formData, isChronic: e.target.checked })}
                      className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>Enroll Patient in Chronic Medicine Refill Tracker</span>
                  </label>
                  <span className="text-[11px] text-teal-700 font-bold">Auto Refill Alerts</span>
                </div>

                {formData.isChronic && (
                  <div className="space-y-3 pt-2">
                    <div>
                      <span className="font-bold text-teal-900 block mb-1.5">
                        Common Chronic Condition Tags:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {diseaseChips.map((chip) => {
                          const active = formData.chronicDiseases.includes(chip);
                          return (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => handleToggleDisease(chip)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                                active
                                  ? "bg-teal-700 text-white border-teal-700"
                                  : "bg-white text-teal-900 border-teal-200 hover:bg-teal-100"
                              }`}
                            >
                              {active ? "✔ " : "+ "}
                              {chip}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="font-bold text-teal-900 block mb-1">
                          Custom Chronic Conditions:
                        </label>
                        <input
                          type="text"
                          value={formData.chronicDiseases}
                          onChange={(e) =>
                            setFormData({ ...formData, chronicDiseases: e.target.value })
                          }
                          placeholder="e.g. Cardiac, Diabetes"
                          className="w-full px-3 py-2 rounded-xl border border-teal-200 bg-white font-medium focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-teal-900 block mb-1">
                          Routine Refill Cycle (Days):
                        </label>
                        <input
                          type="number"
                          min="7"
                          max="365"
                          value={formData.refillDays}
                          onChange={(e) =>
                            setFormData({ ...formData, refillDays: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-teal-200 bg-white font-medium text-center font-bold focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Section: Baki Khata / Credit Limit */}
              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-extrabold text-amber-950 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-amber-700" />
                    <span>Customer Credit Limit (Baki Khata)</span>
                  </label>
                  <span className="text-[11px] text-amber-700 font-bold">₹ INR</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  Maximum allowable credit balance at POS counter before cashier manager override is required.
                </p>
                <input
                  type="number"
                  step="50"
                  min="0"
                  value={formData.creditLimit}
                  onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                  className="w-full max-w-xs px-3.5 py-2 rounded-xl border border-amber-300 bg-white font-extrabold text-amber-950 text-sm focus:outline-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-[#0F6E56] hover:bg-[#0b5643] text-white font-extrabold flex items-center gap-2 transition-all shadow-xs disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{saving ? "Saving..." : modalMode === "create" ? "Register Patient" : "Update Profile"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Full Patient Profile & Health Records */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full border border-slate-200 shadow-2xl p-6 my-8 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#0F6E56]/10 text-[#0F6E56] flex items-center justify-center font-bold">
                  <HeartPulse className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-lg">
                    {selectedProfile ? selectedProfile.name : "Loading Patient..."}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Comprehensive patient health summary, prescription records, and ledger
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowProfileModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingProfile || !selectedProfile ? (
              <div className="py-16 text-center text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[#0F6E56]" />
                <span>Loading health profile...</span>
              </div>
            ) : (
              <div className="space-y-5 text-xs">
                {/* 1. Header Overview Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Contact & Demographics</span>
                    <div className="font-bold text-slate-900 mt-1">{selectedProfile.phone}</div>
                    <div className="text-[11px] text-slate-500">{selectedProfile.email || "No email"}</div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {selectedProfile.gender || "Gender unspecified"} •{" "}
                      {selectedProfile.dob ? `Born ${new Date(selectedProfile.dob).toISOString().slice(0, 10)}` : "Age not recorded"}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200">
                    <span className="text-[10px] font-bold text-teal-800 uppercase">Chronic Care Plan</span>
                    <div className="font-bold text-teal-950 mt-1">
                      {selectedProfile.isChronic ? "Enrolled in Auto Refill" : "Standard Retail Customer"}
                    </div>
                    {selectedProfile.chronicDiseases && (
                      <div className="text-[11px] text-teal-800 font-medium mt-0.5">
                        {selectedProfile.chronicDiseases}
                      </div>
                    )}
                    <div className="text-[11px] text-teal-700 mt-1">
                      Cycle: Every {selectedProfile.refillDays || 30} days
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200">
                    <span className="text-[10px] font-bold text-rose-800 uppercase">Financial Balance</span>
                    <div className="font-extrabold text-base text-rose-900 mt-1">
                      ₹{selectedProfile.financials?.outstandingDue?.toFixed(2) || "0.00"} Due
                    </div>
                    <div className="text-[11px] text-rose-700">
                      Credit Limit: ₹{selectedProfile.creditLimit?.toFixed(2) || "0.00"}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Lifetime Spend: ₹{selectedProfile.financials?.totalPurchased?.toFixed(2) || "0.00"}
                    </div>
                  </div>
                </div>

                {/* Medical Notes */}
                {selectedProfile.medicalNotes && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950">
                    <strong className="block font-bold mb-0.5">Medical Notes & Drug Allergies:</strong>
                    <p className="text-slate-700 whitespace-pre-wrap">{selectedProfile.medicalNotes}</p>
                  </div>
                )}

                {/* Recent Invoices */}
                <div>
                  <h4 className="font-extrabold text-slate-900 mb-2">Recent POS Sales / Prescriptions</h4>
                  {selectedProfile.sales?.length === 0 ? (
                    <p className="text-slate-400 italic">No sales recorded yet.</p>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                          <tr>
                            <th className="py-2 px-3">Invoice #</th>
                            <th className="py-2 px-3">Date</th>
                            <th className="py-2 px-3">Medicines</th>
                            <th className="py-2 px-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedProfile.sales?.map((s: any) => (
                            <tr key={s.id}>
                              <td className="py-2 px-3 font-mono font-bold text-slate-900">{s.invoiceNo}</td>
                              <td className="py-2 px-3 text-slate-500">
                                {new Date(s.saleDate).toISOString().slice(0, 10)}
                              </td>
                              <td className="py-2 px-3 text-slate-700">
                                {s.items?.map((it: any) => it.medicine.name).join(", ") || "Retail Items"}
                              </td>
                              <td className="py-2 px-3 text-right font-extrabold text-slate-900">
                                ₹{Number(s.grandTotal).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: Baki Khata / Customer Credit Ledger & Settlement */}
      {showLedgerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full border border-slate-200 shadow-2xl p-6 my-8 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-lg">
                    Baki Khata Credit Statement: {ledgerData?.customer?.name || "Customer"}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Chronological credit sales, settlements, and live balance
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLedgerModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingLedger || !ledgerData ? (
              <div className="py-16 text-center text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-600" />
                <span>Loading ledger statement...</span>
              </div>
            ) : (
              <div className="space-y-5 text-xs">
                {/* Financial Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Credit Limit</span>
                    <div className="font-extrabold text-sm text-slate-900 mt-0.5">
                      ₹{(ledgerData.summary?.creditLimit ?? ledgerData.customer?.creditLimit ?? 0).toFixed(2)}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                    <span className="text-[10px] font-bold text-rose-700 uppercase">Total Credit Sales</span>
                    <div className="font-extrabold text-sm text-rose-900 mt-0.5">
                      ₹{(ledgerData.summary?.totalCreditSales ?? 0).toFixed(2)}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase">Total Settled</span>
                    <div className="font-extrabold text-sm text-emerald-900 mt-0.5">
                      ₹{(ledgerData.summary?.totalSettled ?? 0).toFixed(2)}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                    <span className="text-[10px] font-bold text-amber-800 uppercase">Current Due Balance</span>
                    <div className="font-extrabold text-base text-amber-950 mt-0.5">
                      ₹{(ledgerData.summary?.currentDue ?? 0).toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Ledger Table */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 font-extrabold text-slate-600 sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3 text-right">Debit / Sale (₹)</th>
                        <th className="py-2.5 px-3 text-right">Credit / Paid (₹)</th>
                        <th className="py-2.5 px-3 text-right">Balance (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ledgerData.ledger.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            No credit transactions or payments recorded yet.
                          </td>
                        </tr>
                      ) : (
                        ledgerData.ledger.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-mono text-slate-500">{row.date}</td>
                            <td className="py-2 px-3 font-medium text-slate-800">
                              {row.description}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-rose-600">
                              {row.debit > 0 ? `₹${row.debit.toFixed(2)}` : "—"}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-emerald-600">
                              {row.credit > 0 ? `₹${row.credit.toFixed(2)}` : "—"}
                            </td>
                            <td className="py-2 px-3 text-right font-extrabold text-slate-900">
                              ₹{row.runningBalance.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Settlement Payment Form */}
                <form
                  onSubmit={handleRecordSettlement}
                  className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-indigo-950 flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-indigo-700" />
                      <span>Record Due Settlement Payment</span>
                    </h4>
                    {paymentSuccessMsg && (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                        {paymentSuccessMsg}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="font-bold text-indigo-900 block mb-1">
                        Amount (₹) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        required
                        value={settlementAmount}
                        onChange={(e) => setSettlementAmount(e.target.value)}
                        placeholder="Amount"
                        className="w-full px-3 py-2 rounded-xl border border-indigo-200 bg-white font-extrabold text-slate-900 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-indigo-900 block mb-1">Payment Method</label>
                      <select
                        value={settlementMethod}
                        onChange={(e) => setSettlementMethod(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-indigo-200 bg-white font-medium focus:outline-none"
                      >
                        <option value="cash">Cash Counter</option>
                        <option value="upi">UPI / QR</option>
                        <option value="card">Card</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="cheque">Cheque</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-indigo-900 block mb-1">Reference / Txn ID</label>
                      <input
                        type="text"
                        value={settlementRef}
                        onChange={(e) => setSettlementRef(e.target.value)}
                        placeholder="Optional Ref No"
                        className="w-full px-3 py-2 rounded-xl border border-indigo-200 bg-white font-medium focus:outline-none"
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        type="submit"
                        disabled={submittingPayment}
                        className="w-full py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        {submittingPayment && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>{submittingPayment ? "Recording..." : "Record Payment"}</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

