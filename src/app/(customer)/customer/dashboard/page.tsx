"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  IndianRupee,
  LayoutDashboard,
  Loader2,
  Power,
  Printer,
  RefreshCw,
  RotateCcw,
  KeyRound,
  MessageSquare,
  Search,
  ShoppingBag,
  Store,
  Upload,
  User,
  X,
} from "lucide-react";

interface CustomerSessionProfile {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  ordersCount: number;
  returnsCount: number;
}

interface OrderItemRow {
  id: number;
  medicineId: number;
  medicineName: string;
  genericName: string;
  scheduleType: string;
  hsnCode: string;
  batchNo: string;
  expiryDate: string | null;
  quantity: number;
  alreadyReturnedQty?: number;
  remainingReturnableQty?: number;
  mrp: number;
  gstPercent: number;
  gstAmount: number;
  price: number;
}

interface OrderRow {
  id: number;
  invoiceNo: string;
  saleDate: string;
  createdAt: string;
  totalAmount: number;
  gstAmount: number;
  discountAmount: number;
  grandTotal: number;
  paymentMethod: string;
  doctorName: string | null;
  doctorRegNo: string | null;
  storeId?: number | null;
  storeName?: string | null;
  branch?: { id: number; code: string; name: string; phone: string | null; address: string | null } | null;
  items: OrderItemRow[];
  returns: Array<{ id: number; returnNumber: string; refundAmount: number; status: string }>;
}

interface PrescriptionRecord {
  id: number;
  storeId?: number | null;
  storeName?: string | null;
  direction: string;
  message: string | null;
  hasFile: boolean;
  fileName: string | null;
  fileType: string | null;
  fileUrl: string | null;
  isRead: boolean;
  statusLabel: string;
  createdAt: string;
}

function formatINR(val: number): string {
  return `₹${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function CustomerDashboardPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerSessionProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeNav, setActiveNav] = useState<
    "Dashboard" | "My Orders" | "Prescriptions" | "Return Requests" | "Messages" | "Monthly Refills" | "Profile"
  >("Dashboard");

  // Module 2.20.1: Customer Support Messages
  const [supportMessages, setSupportMessages] = useState<any[]>([]);
  const [unreadFromStore, setUnreadFromStore] = useState(0);
  const [supportText, setSupportText] = useState("");
  const [sendingSupport, setSendingSupport] = useState(false);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [availableStores, setAvailableStores] = useState<
    Array<{ id: number; name: string; branches?: Array<{ id: number; code: string; name: string }> }>
  >([]);
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [ordersSummary, setOrdersSummary] = useState<any>(null);
  const [customerDetails, setCustomerDetails] = useState<any>(null);
  const [orderFilter, setOrderFilter] = useState<"all" | "rx">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [targetStoreId, setTargetStoreId] = useState<string>("");
  const [targetBranchId, setTargetBranchId] = useState<string>("");

  // Module 2.19.2: Customer Return Requests
  const [returnsList, setReturnsList] = useState<any[]>([]);
  const [returnTargetOrder, setReturnTargetOrder] = useState<OrderRow | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [returnReason, setReturnReason] = useState("");
  const [returnMethod, setReturnMethod] = useState<"store_credit" | "cash" | "upi">("store_credit");
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [returnFeedback, setReturnFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Module 2.19.3: Profile & Password Management
  const [profileForm, setProfileForm] = useState({ name: "", email: "", address: "", gender: "", dob: "" });
  const [storeContact, setStoreContact] = useState<{ name: string; email: string | null; phone: string | null } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [pwFeedback, setPwFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [rxFile, setRxFile] = useState<File | null>(null);
  const [rxDoctor, setRxDoctor] = useState("");
  const [rxMode, setRxMode] = useState<"pickup" | "delivery">("pickup");
  const [rxNotes, setRxNotes] = useState("");
  const [uploadingRx, setUploadingRx] = useState(false);
  const [rxFeedback, setRxFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Printable invoice modal
  const [invoiceDetail, setInvoiceDetail] = useState<any | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/customer", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!json?.authenticated || !json?.customer) {
          router.replace("/customer/login");
          return;
        }
        setCustomer(json.customer);
        setAuthLoading(false);
      })
      .catch(() => {
        router.replace("/customer/login");
      });
  }, [router]);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const p = new URLSearchParams();
      if (orderFilter !== "all") p.set("filter", orderFilter);
      if (storeFilter !== "all") p.set("storeId", storeFilter);
      if (searchQuery.trim()) p.set("search", searchQuery.trim());

      const res = await fetch(`/api/customer/orders?${p.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) {
        setOrders(data.orders || []);
        setAvailableStores(Array.isArray(data.availableStores) ? data.availableStores : []);
        setOrdersSummary(data.summary || null);
        setCustomerDetails(data.customer || null);
      }
    } finally {
      setOrdersLoading(false);
    }
  }, [orderFilter, storeFilter, searchQuery]);

  const loadPrescriptions = useCallback(async () => {
    const res = await fetch("/api/customer/prescriptions", { cache: "no-store" });
    const data = await res.json();
    if (res.ok && data.success) {
      setPrescriptions(data.prescriptions || []);
    }
  }, []);

  const loadReturns = useCallback(async () => {
    const res = await fetch("/api/customer/returns", { cache: "no-store" });
    const data = await res.json();
    if (res.ok && data.success) {
      setReturnsList(data.returns || []);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    const res = await fetch("/api/customer/profile", { cache: "no-store" });
    const data = await res.json();
    if (res.ok && data.success && data.profile) {
      setProfileForm({
        name: data.profile.name || "",
        email: data.profile.email || "",
        address: data.profile.address || "",
        gender: data.profile.gender || "",
        dob: data.profile.dob ? String(data.profile.dob).slice(0, 10) : "",
      });
      if (data.storeContact) setStoreContact(data.storeContact);
    }
  }, []);

  const loadMessages = useCallback(async () => {
    const res = await fetch("/api/customer/messages", { cache: "no-store" });
    const data = await res.json();
    if (res.ok && data.success) {
      setSupportMessages(data.messages || []);
      setUnreadFromStore(Number(data.unreadFromPharmacyCount || 0));
    }
  }, []);

  useEffect(() => {
    if (!authLoading && customer) {
      loadOrders();
      loadPrescriptions();
      loadReturns();
      loadProfile();
      loadMessages();
    }
  }, [authLoading, customer, loadOrders, loadPrescriptions, loadReturns, loadProfile, loadMessages]);

  useEffect(() => {
    if (activeNav === "Messages" && unreadFromStore > 0) {
      fetch("/api/customer/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      })
        .then(() => setUnreadFromStore(0))
        .catch(() => {});
    }
  }, [activeNav, unreadFromStore]);

  const handleSendSupportMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportText.trim()) return;
    setSendingSupport(true);
    try {
      const res = await fetch("/api/customer/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: supportText.trim(),
          ...(targetStoreId ? { storeId: Number(targetStoreId) } : {}),
          ...(targetBranchId ? { branchId: Number(targetBranchId) } : {}),
        }),
      });
      if (res.ok) {
        setSupportText("");
        loadMessages();
      }
    } finally {
      setSendingSupport(false);
    }
  };

  const openReturnModal = (order: OrderRow) => {
    setReturnTargetOrder(order);
    const initial: Record<number, number> = {};
    for (const it of order.items) initial[it.id] = 0;
    setReturnQtys(initial);
    setReturnReason("");
    setReturnMethod("store_credit");
    setReturnFeedback(null);
  };

  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnTargetOrder) return;
    setReturnFeedback(null);

    const itemsPayload = Object.entries(returnQtys)
      .filter(([, q]) => Number(q) > 0)
      .map(([saleItemId, quantity]) => ({ saleItemId: Number(saleItemId), quantity: Number(quantity) }));

    if (itemsPayload.length === 0) {
      setReturnFeedback({ type: "err", text: "Select quantity (>= 1) for at least one medicine." });
      return;
    }

    setSubmittingReturn(true);
    try {
      const res = await fetch("/api/customer/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: returnTargetOrder.id,
          reason: returnReason.trim(),
          refundMethod: returnMethod,
          items: itemsPayload,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReturnFeedback({ type: "ok", text: data.message });
        loadReturns();
        loadOrders();
        setTimeout(() => setReturnTargetOrder(null), 900);
      } else {
        setReturnFeedback({ type: "err", text: data.message || "Could not submit return request." });
      }
    } catch {
      setReturnFeedback({ type: "err", text: "Network error submitting return request." });
    } finally {
      setSubmittingReturn(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileFeedback(null);
    try {
      const res = await fetch("/api/customer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setProfileFeedback({ type: "ok", text: data.message || "Profile updated!" });
        if (data.profile) {
          setCustomer((prev) => (prev ? { ...prev, ...data.profile } : prev));
        }
      } else {
        setProfileFeedback({ type: "err", text: data.message || "Failed to update profile." });
      }
    } catch {
      setProfileFeedback({ type: "err", text: "Network error saving profile." });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwFeedback(null);
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwFeedback({ type: "err", text: "New passwords do not match." });
      return;
    }
    setSavingPw(true);
    try {
      const res = await fetch("/api/customer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_password",
          currentPassword: pwForm.currentPassword,
          newPassword: pwForm.newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPwFeedback({ type: "ok", text: data.message || "Password updated!" });
        setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      } else {
        setPwFeedback({ type: "err", text: data.message || "Failed to change password." });
      }
    } catch {
      setPwFeedback({ type: "err", text: "Network error updating password." });
    } finally {
      setSavingPw(false);
    }
  };

  const openInvoice = async (saleId: number) => {
    setInvoiceLoading(true);
    try {
      const res = await fetch(`/api/customer/orders/${saleId}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) {
        setInvoiceDetail(data.invoice);
      }
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleUploadPrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    setRxFeedback(null);
    if (!rxFile && !rxNotes.trim()) {
      setRxFeedback({ type: "err", text: "Please attach a prescription file or enter medicine notes." });
      return;
    }

    setUploadingRx(true);
    try {
      const form = new FormData();
      if (rxFile) form.append("file", rxFile);
      form.append("doctorName", rxDoctor.trim());
      form.append("fulfillmentMode", rxMode);
      form.append("message", rxNotes.trim());
      if (targetStoreId) form.append("storeId", targetStoreId);
      if (targetBranchId) form.append("branchId", targetBranchId);

      const res = await fetch("/api/customer/prescriptions", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRxFeedback({ type: "ok", text: data.message || "Prescription uploaded successfully!" });
        setRxFile(null);
        setRxDoctor("");
        setRxNotes("");
        loadPrescriptions();
      } else {
        setRxFeedback({ type: "err", text: data.message || "Failed to upload prescription" });
      }
    } catch {
      setRxFeedback({ type: "err", text: "Network error uploading prescription" });
    } finally {
      setUploadingRx(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/customer", { method: "DELETE" });
    router.replace("/customer/login");
  };

  if (authLoading || !customer) {
    return (
      <div className="min-h-screen bg-[#EAF5F0] flex flex-col items-center justify-center gap-3 font-sans">
        <Loader2 className="w-8 h-8 animate-spin text-[#0F5A47]" />
        <p className="text-xs font-bold text-[#0F5A47]">Checking your customer account...</p>
      </div>
    );
  }

  const initials = customer.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const navItems: Array<{
    label: "Dashboard" | "My Orders" | "Prescriptions" | "Return Requests" | "Messages" | "Monthly Refills" | "Profile";
    icon: any;
    badge?: number;
  }> = [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "My Orders", icon: ShoppingBag },
    { label: "Prescriptions", icon: Upload },
    { label: "Return Requests", icon: RotateCcw },
    { label: "Messages", icon: MessageSquare, badge: unreadFromStore },
    { label: "Monthly Refills", icon: RefreshCw },
    { label: "Profile", icon: User },
  ];

  const topMeds: Array<{ medicineId: number; name: string; totalQty: number; totalSpent: number }> =
    ordersSummary?.topMedicines || [];
  const maxMedSpend = Math.max(1, ...topMeds.map((m) => m.totalSpent));

  return (
    <div className="min-h-screen bg-[#EAF5F0] text-slate-900 flex flex-col md:flex-row font-sans">
      {/* Left Vertical Curved Sidebar (Deep Pharmacy Emerald #0F5A47) */}
      <aside className="w-full md:w-64 bg-[#0F5A47] text-white flex flex-col shrink-0 md:h-screen md:sticky md:top-0 select-none z-30 print:hidden">
        <div className="pt-6 pb-4 px-4 flex flex-col items-center text-center shrink-0">
          <div className="w-16 h-16 rounded-full p-1 border-2 border-emerald-200/70 shadow-md flex items-center justify-center">
            <div className="w-full h-full rounded-full bg-[#EAF5F0] text-[#0F5A47] flex items-center justify-center text-lg font-extrabold">
              {initials}
            </div>
          </div>
          <h2 className="mt-2.5 text-sm font-extrabold text-white tracking-tight truncate max-w-[200px]">
            {customer.name}
          </h2>
          <p className="text-[11px] text-emerald-100/80 truncate max-w-[200px] mt-0.5">
            {customer.email || customer.phone}
          </p>
          <span className="mt-1 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-white/15 text-emerald-200">
            Patient Portal
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto space-y-1 px-3 md:pl-4 md:pr-1 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.label;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => setActiveNav(item.label)}
                className={`w-full flex items-center justify-between gap-2 pl-4 pr-4 py-2.5 rounded-xl md:rounded-l-full md:rounded-r-none text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#EAF5F0] text-[#0F5A47] shadow-xs"
                    : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-3.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 text-[10px] font-extrabold">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          <Link
            href="/"
            className="flex items-center gap-3.5 pl-4 pr-4 py-2.5 rounded-xl md:rounded-l-full text-xs font-bold text-emerald-200 hover:bg-white/10 hover:text-white transition-all"
          >
            <Store className="w-4 h-4 shrink-0" />
            <span>Portal Home</span>
          </Link>
        </nav>

        <div className="p-4 border-t border-white/10 shrink-0 bg-[#0F5A47]">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Power className="w-4 h-4 text-rose-300" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0 print:hidden">
        <header className="px-6 pt-5 pb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight">
              {activeNav === "Dashboard" ? `Welcome, ${customer.name.split(" ")[0]}` : activeNav}
            </h1>
            <p className="text-xs text-slate-500">
              View previous tax invoices, prescription history & upload new doctor prescriptions
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Invoice#, Doctor, Medicine..."
                className="pl-8 pr-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs w-56 focus:outline-none focus:border-[#0F5A47]"
              />
            </div>

            <button
              type="button"
              onClick={() => setActiveNav("Prescriptions")}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0F5A47] text-white text-xs font-bold hover:bg-[#0b4435] cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Rx
            </button>
          </div>
        </header>

        <main className="flex-1 px-6 pb-10 space-y-5">
          {/* ========================================================== */}
          {/* VIEW 1: DASHBOARD                                          */}
          {/* ========================================================== */}
          {activeNav === "Dashboard" && (
            <>
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-emerald-200/80 p-4 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#DDF3E8] text-[#0F5A47] flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-slate-900">{ordersSummary?.totalOrders ?? 0}</p>
                    <span className="text-xs font-semibold text-slate-500">Total Bills / Invoices</span>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-emerald-200/80 p-4 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#DDF3E8] text-[#0F5A47] flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-slate-900">
                      {(ordersSummary?.rxOrdersCount ?? 0) + prescriptions.length}
                    </p>
                    <span className="text-xs font-semibold text-slate-500">Prescription Records</span>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-emerald-200/80 p-4 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#DDF3E8] text-[#0F5A47] flex items-center justify-center shrink-0">
                    <IndianRupee className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xl font-extrabold text-slate-900">
                      {formatINR(ordersSummary?.netSpent ?? 0)}
                    </p>
                    <span className="text-xs font-semibold text-slate-500">Net Pharmacy Spend</span>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-amber-200/80 p-4 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xl font-extrabold text-slate-900">
                      {formatINR(ordersSummary?.currentCreditDue ?? 0)}
                    </p>
                    <span className="text-xs font-semibold text-slate-500">Pending Khata Balance</span>
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Recent Invoices */}
                <div className="lg:col-span-7 bg-white rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-extrabold text-slate-800">Recent Medicine Invoices</h3>
                    <button
                      type="button"
                      onClick={() => setActiveNav("My Orders")}
                      className="text-xs font-bold text-[#0F5A47] hover:underline cursor-pointer"
                    >
                      View All Archive →
                    </button>
                  </div>

                  {ordersLoading && orders.length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">Loading invoices...</p>
                  ) : orders.length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">No invoices recorded yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {orders.slice(0, 6).map((o) => (
                        <div
                          key={o.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-extrabold text-[#0F5A47]">{o.invoiceNo}</span>
                              {o.doctorName && (
                                <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[10px] font-bold">
                                  Rx: {o.doctorName}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                              <span>{new Date(o.saleDate).toLocaleDateString("en-IN")}</span>
                              <span>•</span>
                              <span>{o.items.length} medicine(s)</span>
                              {o.storeName && (
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">
                                  {o.storeName}
                                </span>
                              )}
                              <span>•</span>
                              <span>{o.branch?.name || "Main Pharmacy"}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-extrabold text-slate-900">{formatINR(o.grandTotal)}</span>
                            <button
                              type="button"
                              onClick={() => openInvoice(o.id)}
                              className="px-3 py-1.5 rounded-lg bg-[#0F5A47] text-white text-[11px] font-bold hover:bg-[#0b4435] cursor-pointer"
                            >
                              Invoice
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Top Purchased Medicines */}
                <div className="lg:col-span-5 bg-white rounded-2xl p-5 shadow-xs">
                  <h3 className="text-sm font-extrabold text-slate-800 mb-4">Your Frequent Medicines</h3>
                  {topMeds.length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">No medicine history available yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {topMeds.map((m) => (
                        <div key={m.medicineId} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-700 truncate">
                              {m.name} <span className="text-[10px] text-slate-400">({m.totalQty} u)</span>
                            </span>
                            <span className="font-extrabold text-[#0F5A47]">{formatINR(m.totalSpent)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#0F5A47]"
                              style={{ width: `${Math.max(8, Math.round((m.totalSpent / maxMedSpend) * 100))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {/* ========================================================== */}
          {/* VIEW 2: PURCHASE ARCHIVE & INVOICES (2.18.1)               */}
          {/* ========================================================== */}
          {activeNav === "My Orders" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderFilter("all")}
                    className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                      orderFilter === "all" ? "bg-[#0F5A47] text-white" : "bg-white text-slate-600"
                    }`}
                  >
                    All Invoices
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderFilter("rx")}
                    className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                      orderFilter === "rx" ? "bg-[#0F5A47] text-white" : "bg-white text-slate-600"
                    }`}
                  >
                    Prescription (Rx) Bills Only
                  </button>
                </div>

                {availableStores.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-500">Store:</span>
                    <select
                      value={storeFilter}
                      onChange={(e) => setStoreFilter(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      <option value="all">All Pharmacies ({availableStores.length})</option>
                      {availableStores.map((st) => (
                        <option key={st.id} value={String(st.id)}>
                          {st.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase text-slate-500">
                        <th className="py-3 px-4">Invoice No</th>
                        <th className="py-3 px-4">Store &amp; Branch</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Prescribing Doctor</th>
                        <th className="py-3 px-4">Medicines</th>
                        <th className="py-3 px-4">Payment</th>
                        <th className="py-3 px-4 text-right">Total</th>
                        <th className="py-3 px-4 text-right">Bill</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orders.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-slate-400">
                            No matching invoices found.
                          </td>
                        </tr>
                      ) : (
                        orders.map((o) => (
                          <tr key={o.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-extrabold text-[#0F5A47]">{o.invoiceNo}</td>
                            <td className="py-3 px-4">
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex w-fit px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-bold">
                                  {o.storeName || "Pharmacy"}
                                </span>
                                <span className="text-[11px] text-slate-500 font-semibold">
                                  {o.branch?.name || "Main Branch"}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-600">
                              {new Date(o.saleDate).toLocaleDateString("en-IN")}
                            </td>
                            <td className="py-3 px-4 text-slate-700 font-semibold">
                              {o.doctorName ? `${o.doctorName}${o.doctorRegNo ? ` (${o.doctorRegNo})` : ""}` : "OTC / Counter"}
                            </td>
                            <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                              {o.items.map((i) => `${i.medicineName} x${i.quantity}`).join(", ")}
                            </td>
                            <td className="py-3 px-4 uppercase font-bold text-slate-500">{o.paymentMethod}</td>
                            <td className="py-3 px-4 text-right font-extrabold text-slate-900">
                              {formatINR(o.grandTotal)}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                              <button
                                type="button"
                                onClick={() => openInvoice(o.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0F5A47] text-white text-[11px] font-bold hover:bg-[#0b4435] cursor-pointer"
                              >
                                <Download className="w-3 h-3" />
                                Invoice
                              </button>
                              <button
                                type="button"
                                onClick={() => openReturnModal(o)}
                                disabled={o.items.every((it) => (it.remainingReturnableQty ?? it.quantity) <= 0)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold hover:bg-amber-100 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Return
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* VIEW 3: DIGITAL PRESCRIPTION UPLOAD & REQUESTS (2.18.2)    */}
          {/* ========================================================== */}
          {activeNav === "Prescriptions" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Upload Form */}
              <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs h-fit space-y-4">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[#0F5A47]" />
                  <h3 className="text-sm font-extrabold text-slate-800">Upload Prescription &amp; Order Request</h3>
                </div>

                {rxFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs font-bold border ${
                      rxFeedback.type === "ok"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-rose-50 border-rose-200 text-rose-700"
                    }`}
                  >
                    {rxFeedback.text}
                  </div>
                )}

                <form onSubmit={handleUploadPrescription} className="space-y-3">
                  {availableStores.length > 1 && (
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Target Pharmacy Store</label>
                      <select
                        value={targetStoreId}
                        onChange={(e) => {
                          setTargetStoreId(e.target.value);
                          setTargetBranchId("");
                        }}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold bg-white"
                      >
                        <option value="">Recent Pharmacy (Auto)</option>
                        {availableStores.map((st) => (
                          <option key={st.id} value={String(st.id)}>
                            {st.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {(() => {
                    const activeStore =
                      availableStores.find((s) => String(s.id) === targetStoreId) ||
                      (availableStores.length === 1 ? availableStores[0] : null);
                    const branches = activeStore?.branches || [];
                    if (branches.length <= 1) return null;
                    return (
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Target Branch (Optional)
                        </label>
                        <select
                          value={targetBranchId}
                          onChange={(e) => setTargetBranchId(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold bg-white"
                        >
                          <option value="">Any / Main Branch</option>
                          {branches.map((br) => (
                            <option key={br.id} value={String(br.id)}>
                              {br.name} ({br.code})
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Prescription Photo / PDF (PDF, JPG, PNG, HEIC — Max 10 MB)
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*,application/pdf"
                      onChange={(e) => setRxFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-[#EAF5F0] file:text-[#0F5A47] file:font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Prescribing Doctor (Optional)
                    </label>
                    <input
                      type="text"
                      value={rxDoctor}
                      onChange={(e) => setRxDoctor(e.target.value)}
                      placeholder="e.g. Dr. A. Sen"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Fulfillment Preference</label>
                    <select
                      value={rxMode}
                      onChange={(e) => setRxMode(e.target.value as "pickup" | "delivery")}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold bg-white"
                    >
                      <option value="pickup">Counter Pickup</option>
                      <option value="delivery">Home Delivery (to Registered Address)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Notes / Requested Medicines</label>
                    <textarea
                      rows={3}
                      value={rxNotes}
                      onChange={(e) => setRxNotes(e.target.value)}
                      placeholder="e.g. Please pack 1 month course for all medicines on prescription..."
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={uploadingRx}
                    className="w-full py-2.5 rounded-xl bg-[#0F5A47] hover:bg-[#0b4435] text-white text-xs font-extrabold cursor-pointer disabled:opacity-60"
                  >
                    {uploadingRx ? "Uploading..." : "Submit Prescription to Pharmacy"}
                  </button>
                </form>
              </div>

              {/* Uploaded Prescriptions History */}
              <div className="lg:col-span-7 space-y-3">
                {prescriptions.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-xs text-slate-400">
                    You have not uploaded any prescriptions yet.
                  </div>
                ) : (
                  prescriptions.map((rx) => (
                    <div key={rx.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                              rx.isRead ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {rx.isRead ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {rx.statusLabel}
                          </span>
                          {rx.storeName && (
                            <span className="px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-bold">
                              {rx.storeName}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {new Date(rx.createdAt).toLocaleString("en-IN")}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap">{rx.message}</p>
                      {rx.fileUrl && (
                        <div className="pt-1 flex items-center gap-3">
                          <a
                            href={rx.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#0F5A47] hover:underline"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            View {rx.fileName || "Attachment"}
                          </a>
                          <a
                            href={`${rx.fileUrl}?download=1`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:underline"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </a>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* VIEW 4: RETURN REQUESTS (2.19.2)                           */}
          {/* ========================================================== */}
          {activeNav === "Return Requests" && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between text-xs">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800">My Sales Return &amp; Refund Requests</h3>
                  <p className="text-slate-500 mt-0.5">
                    To request a new return, go to <strong>My Orders</strong> and click <strong>Return</strong> on any invoice.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveNav("My Orders")}
                  className="px-3 py-1.5 rounded-lg bg-[#0F5A47] text-white font-bold cursor-pointer"
                >
                  Select Invoice
                </button>
              </div>

              <div className="space-y-3">
                {returnsList.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-xs text-slate-400">
                    No return requests submitted yet.
                  </div>
                ) : (
                  returnsList.map((ret) => (
                    <div key={ret.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-[#0F5A47]">{ret.returnNumber}</span>
                          <span className="text-slate-400">•</span>
                          <span className="font-semibold text-slate-700">Invoice {ret.invoiceNo}</span>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            ret.status === "processed"
                              ? "bg-emerald-100 text-emerald-700"
                              : ret.status === "rejected"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {ret.status}
                        </span>
                      </div>
                      <p className="text-slate-600">
                        <strong>Reason:</strong> {ret.reason}
                      </p>
                      <div className="text-[11px] text-slate-500">
                        Items: {ret.items.map((i: any) => `${i.medicineName} x${i.quantity}`).join(", ")} • Refund:{" "}
                        <strong className="text-slate-900">{formatINR(ret.refundAmount)}</strong> ({ret.refundMethod})
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* VIEW 4B: PHARMACY SUPPORT MESSAGES (2.20.1)                */}
          {/* ========================================================== */}
          {activeNav === "Messages" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800">Pharmacy Two-Way Support Thread</h3>
                  <p className="text-[11px] text-slate-500">
                    Chat directly with our pharmacist team about prescriptions, refills, or deliveries.
                  </p>
                </div>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto py-2">
                {supportMessages.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">No messages yet. Ask our pharmacy team below!</p>
                ) : (
                  supportMessages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex flex-col ${m.direction === "in" ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs space-y-1 ${
                          m.direction === "in"
                            ? "bg-[#0F5A47] text-white"
                            : "bg-slate-100 text-slate-800 border border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 text-[10px] opacity-75 font-bold">
                          <span>{m.senderLabel}</span>
                          <span>{new Date(m.createdAt).toLocaleString("en-IN")}</span>
                        </div>
                        {m.message && <p className="whitespace-pre-wrap">{m.message}</p>}
                        {m.fileUrl && (
                          <a href={m.fileUrl} target="_blank" rel="noreferrer" className="underline text-[11px] font-bold">
                            Attachment: {m.fileName}
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleSendSupportMessage} className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                {availableStores.length > 1 && (
                  <select
                    value={targetStoreId}
                    onChange={(e) => {
                      setTargetStoreId(e.target.value);
                      setTargetBranchId("");
                    }}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold bg-white"
                  >
                    <option value="">Recent Store</option>
                    {availableStores.map((st) => (
                      <option key={st.id} value={String(st.id)}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                )}
                {(() => {
                  const activeStore =
                    availableStores.find((s) => String(s.id) === targetStoreId) ||
                    (availableStores.length === 1 ? availableStores[0] : null);
                  const branches = activeStore?.branches || [];
                  if (branches.length <= 1) return null;
                  return (
                    <select
                      value={targetBranchId}
                      onChange={(e) => setTargetBranchId(e.target.value)}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold bg-white"
                    >
                      <option value="">Any Branch</option>
                      {branches.map((br) => (
                        <option key={br.id} value={String(br.id)}>
                          {br.name}
                        </option>
                      ))}
                    </select>
                  );
                })()}
                <input
                  type="text"
                  required
                  value={supportText}
                  onChange={(e) => setSupportText(e.target.value)}
                  placeholder="Write a message to pharmacy..."
                  className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-xs"
                />
                <button
                  type="submit"
                  disabled={sendingSupport}
                  className="px-4 py-2 rounded-xl bg-[#0F5A47] hover:bg-[#0b4435] text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
                >
                  {sendingSupport ? "Sending..." : "Send"}
                </button>
              </form>
            </div>
          )}

          {/* ========================================================== */}
          {/* VIEW 5: MONTHLY REFILLS                                    */}
          {/* ========================================================== */}
          {activeNav === "Monthly Refills" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <h3 className="text-sm font-extrabold text-slate-800">Chronic Care &amp; Monthly Refill Schedule</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-[#EAF5F0] border border-emerald-200">
                  <p className="text-slate-500 font-bold uppercase text-[10px]">Care Category</p>
                  <p className="text-sm font-extrabold text-slate-900 mt-1">
                    {customerDetails?.isChronic
                      ? customerDetails.chronicDiseases || "Chronic Care Registered"
                      : "Standard Patient"}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-slate-500 font-bold uppercase text-[10px]">Refill Interval</p>
                  <p className="text-sm font-extrabold text-slate-900 mt-1">
                    {customerDetails?.refillDays ? `Every ${customerDetails.refillDays} Days` : "Not Scheduled"}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-slate-500 font-bold uppercase text-[10px]">Next Refill Due</p>
                  <p className="text-sm font-extrabold text-amber-900 mt-1">
                    {customerDetails?.nextRefillDate
                      ? new Date(customerDetails.nextRefillDate).toLocaleDateString("en-IN")
                      : "None Due"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* VIEW 6: PROFILE & PASSWORD MANAGEMENT (2.19.3)             */}
          {/* ========================================================== */}
          {activeNav === "Profile" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs">
              {/* Edit Profile */}
              <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-slate-800">Edit Patient Profile</h3>
                  <span className="text-[11px] font-bold text-slate-400">Mobile: {customer.phone}</span>
                </div>

                {profileFeedback && (
                  <div
                    className={`p-3 rounded-xl font-bold border ${
                      profileFeedback.type === "ok"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-rose-50 border-rose-200 text-rose-700"
                    }`}
                  >
                    {profileFeedback.text}
                  </div>
                )}

                <form onSubmit={handleSaveProfile} className="space-y-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={profileForm.name}
                      onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Email Address</label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Home / Delivery Address</label>
                    <input
                      type="text"
                      value={profileForm.address}
                      onChange={(e) => setProfileForm((p) => ({ ...p, address: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Gender</label>
                      <select
                        value={profileForm.gender}
                        onChange={(e) => setProfileForm((p) => ({ ...p, gender: e.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                      >
                        <option value="">Select...</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Date of Birth</label>
                      <input
                        type="date"
                        value={profileForm.dob}
                        onChange={(e) => setProfileForm((p) => ({ ...p, dob: e.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="px-4 py-2 rounded-xl bg-[#0F5A47] hover:bg-[#0b4435] text-white font-extrabold cursor-pointer disabled:opacity-50"
                  >
                    {savingProfile ? "Saving..." : "Save Profile Changes"}
                  </button>
                </form>
              </div>

              {/* Change Password */}
              <div className="lg:col-span-6 space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[#0F5A47]" />
                    <h3 className="text-sm font-extrabold text-slate-800">Change Password</h3>
                  </div>

                  {pwFeedback && (
                    <div
                      className={`p-3 rounded-xl font-bold border ${
                        pwFeedback.type === "ok"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : "bg-rose-50 border-rose-200 text-rose-700"
                      }`}
                    >
                      {pwFeedback.text}
                    </div>
                  )}

                  <form onSubmit={handleChangePassword} className="space-y-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Current Password *</label>
                      <input
                        type="password"
                        required
                        value={pwForm.currentPassword}
                        onChange={(e) => setPwForm((p) => ({ ...p, currentPassword: e.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">New Password (Min 6 chars) *</label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={pwForm.newPassword}
                        onChange={(e) => setPwForm((p) => ({ ...p, newPassword: e.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Confirm New Password *</label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={pwForm.confirmPassword}
                        onChange={(e) => setPwForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={savingPw}
                      className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold cursor-pointer disabled:opacity-50"
                    >
                      {savingPw ? "Updating..." : "Update Password"}
                    </button>
                  </form>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs text-slate-600">
                  <p className="font-bold text-slate-800 mb-1">Password Recovery Assistance</p>
                  <p>
                    If you ever lose access to your account, please contact{" "}
                    <strong>{storeContact?.name || "Pharmacy Desk"}</strong> at{" "}
                    {storeContact?.email ? (
                      <a href={`mailto:${storeContact.email}`} className="font-bold text-[#0F5A47] underline">
                        {storeContact.email}
                      </a>
                    ) : (
                      "our registered store email"
                    )}
                    {storeContact?.phone ? ` or ${storeContact.phone}` : ""}.
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Customer Return Request Modal (2.19.2) */}
      {returnTargetOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900">
                  Request Return for Invoice {returnTargetOrder.invoiceNo}
                </h2>
                <p className="text-[11px] text-slate-500">
                  Select medicine quantities to return. Pharmacy staff will review your request.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReturnTargetOrder(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {returnFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-bold border ${
                  returnFeedback.type === "ok"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border-rose-200 text-rose-700"
                }`}
              >
                {returnFeedback.text}
              </div>
            )}

            <form onSubmit={handleSubmitReturn} className="space-y-3 text-xs">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase text-slate-500">
                      <th className="py-2 px-3">Medicine</th>
                      <th className="py-2 px-3 text-right">Returnable</th>
                      <th className="py-2 px-3 text-right">Return Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {returnTargetOrder.items.map((it) => {
                      const remaining = it.remainingReturnableQty ?? it.quantity;
                      return (
                        <tr key={it.id}>
                          <td className="py-2 px-3 font-bold text-slate-800">{it.medicineName}</td>
                          <td className="py-2 px-3 text-right">
                            {remaining} <span className="text-[10px] text-slate-400">/ {it.quantity}</span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min={0}
                              max={remaining}
                              disabled={remaining <= 0}
                              value={returnQtys[it.id] ?? 0}
                              onChange={(e) =>
                                setReturnQtys((prev) => ({
                                  ...prev,
                                  [it.id]: Math.max(0, Math.min(remaining, parseInt(e.target.value || "0", 10))),
                                }))
                              }
                              className="w-16 text-right border border-slate-300 rounded-md px-2 py-1 disabled:bg-slate-100"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Reason for Return *</label>
                <input
                  type="text"
                  required
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="e.g. Changed prescription / Excess strip sealed"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Preferred Refund Method</label>
                <select
                  value={returnMethod}
                  onChange={(e) => setReturnMethod(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                >
                  <option value="store_credit">Store Credit / Baki Khata</option>
                  <option value="upi">UPI Refund</option>
                  <option value="cash">Counter Cash Refund</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReturnTargetOrder(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReturn}
                  className="px-4 py-2 rounded-xl bg-[#0F5A47] hover:bg-[#0b4435] text-white font-extrabold cursor-pointer disabled:opacity-50"
                >
                  {submittingReturn ? "Submitting..." : "Submit Return Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Tax Invoice Modal (2.18.1) */}
      {(invoiceDetail || invoiceLoading) && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 print:static print:bg-white print:p-0">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4 print:shadow-none print:border-0 print:max-h-none">
            {invoiceLoading || !invoiceDetail ? (
              <div className="py-12 text-center text-xs text-slate-500">Loading tax invoice...</div>
            ) : (
              <>
                <div className="flex items-start justify-between border-b border-slate-200 pb-4">
                  <div>
                    <h2 className="text-lg font-extrabold text-[#0F5A47]">{invoiceDetail.store?.name}</h2>
                    <p className="text-xs text-slate-500">
                      {invoiceDetail.store?.branchName} • {invoiceDetail.store?.address}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      GSTIN: {invoiceDetail.store?.gstNo || "-"} • DL: {invoiceDetail.store?.dlNo || "-"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-extrabold text-slate-900">TAX INVOICE</p>
                    <p className="text-sm font-mono font-extrabold text-[#0F5A47]">{invoiceDetail.invoiceNo}</p>
                    <p className="text-[11px] text-slate-500">
                      {new Date(invoiceDetail.saleDate).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 rounded-xl p-3">
                  <div>
                    <span className="text-slate-400 font-bold">Patient: </span>
                    <strong className="text-slate-800">{invoiceDetail.customer?.name}</strong> ({invoiceDetail.customer?.phone})
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 font-bold">Doctor: </span>
                    <strong className="text-slate-800">{invoiceDetail.doctorName || "Counter OTC"}</strong>
                  </div>
                </div>

                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] font-extrabold uppercase text-slate-500">
                      <th className="py-2">Medicine</th>
                      <th className="py-2">Batch</th>
                      <th className="py-2 text-right">Qty</th>
                      <th className="py-2 text-right">MRP</th>
                      <th className="py-2 text-right">GST%</th>
                      <th className="py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoiceDetail.items.map((it: any) => (
                      <tr key={it.id}>
                        <td className="py-2 font-bold text-slate-800">{it.medicineName}</td>
                        <td className="py-2 font-mono text-slate-600">{it.batchNo}</td>
                        <td className="py-2 text-right">{it.quantity}</td>
                        <td className="py-2 text-right">{formatINR(it.mrp)}</td>
                        <td className="py-2 text-right">{it.gstPercent}%</td>
                        <td className="py-2 text-right font-bold">{formatINR(it.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="border-t border-slate-200 pt-3 flex flex-col items-end space-y-1 text-xs">
                  <div>Taxable Amount: <strong>{formatINR(invoiceDetail.totalAmount)}</strong></div>
                  <div>GST Included: <strong>{formatINR(invoiceDetail.gstAmount)}</strong></div>
                  {invoiceDetail.discountAmount > 0 && (
                    <div className="text-emerald-700">Discount: -{formatINR(invoiceDetail.discountAmount)}</div>
                  )}
                  <div className="text-base font-extrabold text-[#0F5A47]">
                    Grand Total: {formatINR(invoiceDetail.grandTotal)}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 print:hidden">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F5A47] text-white text-xs font-bold cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print / Save PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceDetail(null)}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
