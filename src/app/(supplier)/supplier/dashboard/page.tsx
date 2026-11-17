"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  IndianRupee,
  Layers,
  LayoutDashboard,
  Loader2,
  Mail,
  MessageSquare,
  Package,
  Power,
  RefreshCw,
  Search,
  Send,
  Truck,
  X,
} from "lucide-react";

interface SupplierProfile {
  id: number;
  supplierId: number;
  name: string;
  companyName: string;
  username: string;
  email: string;
  phone: string | null;
  ordersCount: number;
  batchesCount: number;
}

interface PurchaseOrderItemRow {
  id: number;
  medicineId: number;
  quantity: number;
  price: string | number;
  mrp: string | number;
  receivedQty: number;
  medicine: {
    id: number;
    name: string;
    genericName: string | null;
    company: string;
    hsnCode: string | null;
  };
}

interface PurchaseOrderRow {
  id: number;
  poNumber: string;
  poDate: string;
  status: string;
  total: string | number;
  notes: string | null;
  invoiceNo: string | null;
  shippedAt: string | null;
  confirmedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  branch?: { id: number; code: string; name: string; phone: string | null } | null;
  items: PurchaseOrderItemRow[];
}

interface BatchRow {
  id: number;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  mrp: number;
  medicine: { id: number; name: string; genericName: string | null; company: string } | null;
  branch: { id: number; code: string; name: string } | null;
}

interface MessageRow {
  id: number;
  subject: string;
  message: string;
  direction: "in" | "out";
  reply: string | null;
  repliedAt: string | null;
  status: "unread" | "read" | "replied";
  createdAt: string;
}

function formatINR(val: number | string): string {
  return `₹${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function SupplierDashboardPage() {
  const router = useRouter();
  const [supplier, setSupplier] = useState<SupplierProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeNav, setActiveNav] = useState<
    "Dashboard" | "Purchase Orders" | "Dispatches" | "Supplied Batches" | "Messages"
  >("Dashboard");

  const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [totalActiveValue, setTotalActiveValue] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [topSupplied, setTopSupplied] = useState<
    Array<{ medicineId: number; name: string; company: string; totalUnits: number; stockValue: number }>
  >([]);
  const [batchesTotalUnits, setBatchesTotalUnits] = useState(0);

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [unreadFromAdmin, setUnreadFromAdmin] = useState(0);
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);

  // PO Action Modal state (Price Quote + Dispatch Shipment)
  const [selectedPo, setSelectedPo] = useState<PurchaseOrderRow | null>(null);
  const [priceEdits, setPriceEdits] = useState<Record<number, { price: string; mrp: string }>>({});
  const [dispatchInvoiceNo, setDispatchInvoiceNo] = useState("");
  const [dispatchNotes, setDispatchNotes] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/supplier", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!json?.authenticated || !json?.supplier) {
          router.replace("/supplier/login");
          return;
        }
        setSupplier(json.supplier);
        setAuthLoading(false);
      })
      .catch(() => {
        router.replace("/supplier/login");
      });
  }, [router]);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const p = new URLSearchParams();
      if (statusFilter !== "all") p.set("status", statusFilter);
      if (searchQuery.trim()) p.set("search", searchQuery.trim());
      p.set("limit", "50");

      const res = await fetch(`/api/supplier/orders?${p.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) {
        setOrders(data.orders || []);
        setStatusCounts(data.summary?.statusCounts || {});
        setTotalActiveValue(Number(data.summary?.totalActiveValue || 0));
      }
    } finally {
      setOrdersLoading(false);
    }
  }, [statusFilter, searchQuery]);

  const loadBatches = useCallback(async () => {
    const res = await fetch("/api/supplier/batches", { cache: "no-store" });
    const data = await res.json();
    if (res.ok && data.success) {
      setBatches(data.batches || []);
      setTopSupplied(data.summary?.topSuppliedMedicines || []);
      setBatchesTotalUnits(Number(data.summary?.totalStockUnits || 0));
    }
  }, []);

  const loadMessages = useCallback(async () => {
    const res = await fetch("/api/supplier/messages", { cache: "no-store" });
    const data = await res.json();
    if (res.ok && data.success) {
      setMessages(data.messages || []);
      setUnreadFromAdmin(Number(data.unreadFromAdminCount || 0));
    }
  }, []);

  const refreshAll = useCallback(() => {
    loadOrders();
    loadBatches();
    loadMessages();
  }, [loadOrders, loadBatches, loadMessages]);

  useEffect(() => {
    if (!authLoading && supplier) {
      refreshAll();
    }
  }, [authLoading, supplier, refreshAll]);

  useEffect(() => {
    if (activeNav === "Dispatches") {
      setStatusFilter((prev) => (prev === "all" ? "confirmed" : prev));
    } else if (activeNav === "Messages" && unreadFromAdmin > 0) {
      fetch("/api/supplier/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      })
        .then(() => setUnreadFromAdmin(0))
        .catch(() => {});
    }
  }, [activeNav, unreadFromAdmin]);

  const openPoModal = (po: PurchaseOrderRow) => {
    setSelectedPo(po);
    const map: Record<number, { price: string; mrp: string }> = {};
    for (const item of po.items) {
      map[item.id] = {
        price: String(Number(item.price || 0)),
        mrp: String(Number(item.mrp || 0)),
      };
    }
    setPriceEdits(map);
    setDispatchInvoiceNo(po.invoiceNo || "");
    setDispatchNotes("");
    setFeedback(null);
  };

  const handleSubmitPrices = async () => {
    if (!selectedPo) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      const items = selectedPo.items.map((it) => ({
        itemId: it.id,
        price: parseFloat(priceEdits[it.id]?.price || String(it.price)),
        mrp: parseFloat(priceEdits[it.id]?.mrp || String(it.mrp)),
      }));
      const res = await fetch(`/api/supplier/orders/${selectedPo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: "ok", text: data.message || "Price quote updated!" });
        setSelectedPo(data.purchaseOrder);
        loadOrders();
      } else {
        setFeedback({ type: "err", text: data.message || "Failed to update quote" });
      }
    } catch {
      setFeedback({ type: "err", text: "Network error updating quote" });
    } finally {
      setActionBusy(false);
    }
  };

  const handleDispatchOrder = async () => {
    if (!selectedPo) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/supplier/orders/${selectedPo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "shipped",
          invoiceNo: dispatchInvoiceNo.trim(),
          notes: dispatchNotes.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: "ok", text: data.message || "Shipment status updated to shipped!" });
        setSelectedPo(data.purchaseOrder);
        loadOrders();
      } else {
        setFeedback({ type: "err", text: data.message || "Failed to dispatch order" });
      }
    } catch {
      setFeedback({ type: "err", text: "Network error updating shipment" });
    } finally {
      setActionBusy(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgSubject.trim() || !msgBody.trim()) return;
    setSendingMsg(true);
    try {
      const res = await fetch("/api/supplier/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: msgSubject.trim(),
          message: msgBody.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsgSubject("");
        setMsgBody("");
        loadMessages();
      }
    } finally {
      setSendingMsg(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/supplier", { method: "DELETE" });
    router.replace("/supplier/login");
  };

  if (authLoading || !supplier) {
    return (
      <div className="min-h-screen bg-[#EEF0F8] flex flex-col items-center justify-center gap-3 font-sans">
        <Loader2 className="w-8 h-8 animate-spin text-[#283566]" />
        <p className="text-xs font-bold text-[#283566]">Verifying supplier portal access...</p>
      </div>
    );
  }

  const initials = supplier.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const navItems: Array<{
    label: "Dashboard" | "Purchase Orders" | "Dispatches" | "Supplied Batches" | "Messages";
    icon: any;
    badge?: number;
  }> = [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "Purchase Orders", icon: ClipboardList, badge: statusCounts.pending || 0 },
    { label: "Dispatches", icon: Truck, badge: statusCounts.confirmed || 0 },
    { label: "Supplied Batches", icon: Package },
    { label: "Messages", icon: MessageSquare, badge: unreadFromAdmin },
  ];

  const statusBadge = (st: string) => {
    const map: Record<string, string> = {
      pending: "bg-amber-100 text-amber-800",
      price_updated: "bg-purple-100 text-purple-800",
      confirmed: "bg-blue-100 text-blue-800",
      shipped: "bg-indigo-100 text-indigo-800",
      received: "bg-emerald-100 text-emerald-800",
      cancelled: "bg-rose-100 text-rose-700",
    };
    return map[st] || "bg-slate-100 text-slate-700";
  };

  const maxSuppliedUnits = Math.max(1, ...topSupplied.map((m) => m.totalUnits));

  return (
    <div className="min-h-screen bg-[#EEF0F8] text-slate-900 flex flex-col md:flex-row font-sans">
      {/* Left Indigo-Navy Sidebar (#283566) */}
      <aside className="w-full md:w-64 bg-[#283566] text-white flex flex-col shrink-0 md:h-screen md:sticky md:top-0 select-none z-30">
        <div className="pt-6 pb-4 px-4 flex flex-col items-center text-center shrink-0">
          <div className="w-16 h-16 rounded-full p-1 border-2 border-indigo-200/70 shadow-md flex items-center justify-center">
            <div className="w-full h-full rounded-full bg-[#EEF0F8] text-[#283566] flex items-center justify-center text-lg font-extrabold">
              {initials}
            </div>
          </div>
          <h2 className="mt-2.5 text-sm font-extrabold text-white tracking-tight truncate max-w-[200px]">
            {supplier.name}
          </h2>
          <p className="text-[11px] text-indigo-100/80 truncate max-w-[200px] mt-0.5">{supplier.email}</p>
          <span className="mt-1 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-white/15 text-indigo-200">
            {supplier.companyName}
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
                className={`w-full flex items-center justify-between gap-2 pl-4 pr-3 py-2.5 rounded-xl md:rounded-l-full md:rounded-r-none text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#EEF0F8] text-[#283566] shadow-xs"
                    : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      isActive ? "bg-[#283566] text-white" : "bg-amber-400 text-slate-900"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 shrink-0 bg-[#283566]">
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
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="px-6 pt-5 pb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight">
              {activeNav === "Dashboard" ? `Welcome, ${supplier.companyName}` : activeNav}
            </h1>
            <p className="text-xs text-slate-500">
              Distributor Self-Service Portal • Order Tracking, Shipment Challans & Direct Store Messaging
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search PO# or Challan..."
                className="pl-8 pr-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium w-48 focus:outline-none focus:border-[#283566]"
              />
            </div>

            <button
              type="button"
              onClick={refreshAll}
              className="p-2 rounded-full bg-white border border-slate-200 text-slate-700 hover:text-[#283566] cursor-pointer"
              title="Refresh Portal Data"
            >
              <RefreshCw className={`w-4 h-4 ${ordersLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </header>

        <main className="flex-1 px-6 pb-10 space-y-5">
          {/* ========================================================== */}
          {/* VIEW 1: OVERVIEW DASHBOARD (2.17.1)                        */}
          {/* ========================================================== */}
          {activeNav === "Dashboard" && (
            <>
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-indigo-200/80 p-4 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 text-[#283566] flex items-center justify-center shrink-0">
                    <ClipboardList className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-slate-900">{statusCounts.all ?? 0}</p>
                    <span className="text-xs font-semibold text-slate-500">Total Purchase Orders</span>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-amber-200/80 p-4 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-slate-900">
                      {(statusCounts.pending ?? 0) + (statusCounts.confirmed ?? 0)}
                    </p>
                    <span className="text-xs font-semibold text-slate-500">
                      Quote / Dispatch Action Needed
                    </span>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-emerald-200/80 p-4 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-slate-900">{statusCounts.shipped ?? 0}</p>
                    <span className="text-xs font-semibold text-slate-500">In Transit (Shipped)</span>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#E1E7F5] text-[#283566] flex items-center justify-center shrink-0">
                    <IndianRupee className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xl font-extrabold text-slate-900">{formatINR(totalActiveValue)}</p>
                    <span className="text-xs font-semibold text-slate-500">
                      Active PO Value ({batchesTotalUnits} units stocked)
                    </span>
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Recent POs Quick Action List */}
                <div className="lg:col-span-7 bg-white rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-extrabold text-slate-800">Recent Purchase Orders</h3>
                    <button
                      type="button"
                      onClick={() => setActiveNav("Purchase Orders")}
                      className="text-xs font-bold text-[#283566] hover:underline cursor-pointer"
                    >
                      View All POs →
                    </button>
                  </div>

                  {orders.length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">No purchase orders issued yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {orders.slice(0, 6).map((po) => (
                        <div
                          key={po.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-extrabold text-[#283566]">{po.poNumber}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusBadge(po.status)}`}>
                                {po.status.replace("_", " ")}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {po.branch?.name || "Main Store"} • {po.items.length} item(s) •{" "}
                              {new Date(po.poDate).toLocaleDateString("en-IN")}
                            </p>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-xs font-extrabold text-slate-900">{formatINR(po.total)}</span>
                            <button
                              type="button"
                              onClick={() => openPoModal(po)}
                              className="px-3 py-1.5 rounded-lg bg-[#283566] text-white text-[11px] font-bold hover:bg-[#1d274d] cursor-pointer"
                            >
                              {po.status === "confirmed"
                                ? "Dispatch"
                                : po.status === "pending" || po.status === "price_updated"
                                ? "Quote"
                                : "View"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Top Supplied Products (Live from Batches) */}
                <div className="lg:col-span-5 bg-white rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-extrabold text-slate-800">Top Supplied Medicines</h3>
                    <button
                      type="button"
                      onClick={() => setActiveNav("Supplied Batches")}
                      className="text-xs font-bold text-[#283566] hover:underline cursor-pointer"
                    >
                      All Batches →
                    </button>
                  </div>

                  {topSupplied.length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">No supplied batches recorded yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {topSupplied.map((m) => (
                        <div key={m.medicineId} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-700 truncate">{m.name}</span>
                            <span className="font-extrabold text-[#283566]">{m.totalUnits} u</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#283566]"
                              style={{ width: `${Math.max(8, Math.round((m.totalUnits / maxSuppliedUnits) * 100))}%` }}
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
          {/* VIEW 2 & 3: PURCHASE ORDERS & DISPATCH TRACKING (2.17.1)   */}
          {/* ========================================================== */}
          {(activeNav === "Purchase Orders" || activeNav === "Dispatches") && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-3 border border-slate-200 flex flex-wrap items-center gap-1.5 text-xs">
                {["all", "pending", "price_updated", "confirmed", "shipped", "received", "cancelled"].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-lg font-bold capitalize transition cursor-pointer ${
                      statusFilter === st
                        ? "bg-[#283566] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {st.replace("_", " ")} ({statusCounts[st] ?? 0})
                  </button>
                ))}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase text-slate-500">
                        <th className="py-3 px-4">PO Number</th>
                        <th className="py-3 px-4">Branch</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Challan / Invoice</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orders.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-slate-400">
                            No purchase orders match the selected filter.
                          </td>
                        </tr>
                      ) : (
                        orders.map((po) => (
                          <tr key={po.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-extrabold text-[#283566]">{po.poNumber}</td>
                            <td className="py-3 px-4 font-semibold text-slate-700">
                              {po.branch ? `[${po.branch.code}] ${po.branch.name}` : "Main Store"}
                            </td>
                            <td className="py-3 px-4 text-slate-500">
                              {new Date(po.poDate).toLocaleDateString("en-IN")}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-700">{po.invoiceNo || "-"}</td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusBadge(po.status)}`}>
                                {po.status.replace("_", " ")}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-extrabold text-slate-900">
                              {formatINR(po.total)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => openPoModal(po)}
                                className="px-3 py-1.5 rounded-lg bg-[#283566] text-white text-[11px] font-bold hover:bg-[#1b2449] cursor-pointer"
                              >
                                {po.status === "confirmed"
                                  ? "Mark Shipped"
                                  : po.status === "shipped"
                                  ? "Update Challan"
                                  : po.status === "pending" || po.status === "price_updated"
                                  ? "Edit Quote"
                                  : "Inspect"}
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
          {/* VIEW 4: SUPPLIED BATCHES                                   */}
          {/* ========================================================== */}
          {activeNav === "Supplied Batches" && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#283566]" /> Supplied Inventory Batches ({batches.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase text-slate-500">
                      <th className="py-2.5 px-4">Medicine</th>
                      <th className="py-2.5 px-4">Batch No</th>
                      <th className="py-2.5 px-4">Branch</th>
                      <th className="py-2.5 px-4">Expiry</th>
                      <th className="py-2.5 px-4 text-right">Stock Qty</th>
                      <th className="py-2.5 px-4 text-right">Supply Rate</th>
                      <th className="py-2.5 px-4 text-right">MRP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batches.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-400">
                          No batches supplied yet.
                        </td>
                      </tr>
                    ) : (
                      batches.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-bold text-slate-800">{b.medicine?.name || "-"}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-700">{b.batchNo}</td>
                          <td className="py-2.5 px-4 text-slate-600">{b.branch?.name || "Main"}</td>
                          <td className="py-2.5 px-4 text-slate-600">
                            {new Date(b.expiryDate).toLocaleDateString("en-IN")}
                          </td>
                          <td className="py-2.5 px-4 text-right font-extrabold">{b.quantity}</td>
                          <td className="py-2.5 px-4 text-right">{formatINR(b.purchasePrice)}</td>
                          <td className="py-2.5 px-4 text-right font-bold">{formatINR(b.mrp)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* VIEW 5: TWO-WAY MESSAGING CHANNEL (2.17.2)                 */}
          {/* ========================================================== */}
          {activeNav === "Messages" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Compose Inquiry to Pharmacy */}
              <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs h-fit">
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="w-4 h-4 text-[#283566]" />
                  <h3 className="text-sm font-extrabold text-slate-800">Message Pharmacy Store</h3>
                </div>
                <form onSubmit={handleSendMessage} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Subject</label>
                    <input
                      type="text"
                      required
                      value={msgSubject}
                      onChange={(e) => setMsgSubject(e.target.value)}
                      placeholder="e.g. Stock availability / Dispatch schedule"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:border-[#283566]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Message</label>
                    <textarea
                      rows={4}
                      required
                      value={msgBody}
                      onChange={(e) => setMsgBody(e.target.value)}
                      placeholder="Write directly to pharmacy purchasing team..."
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:border-[#283566]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={sendingMsg}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#283566] hover:bg-[#1c264a] text-white text-xs font-extrabold cursor-pointer disabled:opacity-60"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {sendingMsg ? "Sending..." : "Send Message"}
                  </button>
                </form>
              </div>

              {/* Conversation History */}
              <div className="lg:col-span-7 space-y-3">
                {messages.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-xs text-slate-400">
                    No messages exchanged with pharmacy yet.
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            m.direction === "out"
                              ? "bg-teal-100 text-teal-800"
                              : "bg-indigo-100 text-indigo-800"
                          }`}
                        >
                          {m.direction === "out" ? "From Pharmacy Admin" : "Sent to Pharmacy"}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(m.createdAt).toLocaleString("en-IN")}
                        </span>
                      </div>
                      <h4 className="text-sm font-extrabold text-slate-900">{m.subject}</h4>
                      <p className="text-xs text-slate-600 whitespace-pre-wrap">{m.message}</p>
                      {m.reply && (
                        <div className="mt-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                          <p className="text-[11px] font-bold text-emerald-800 mb-0.5">Pharmacy Reply:</p>
                          <p className="text-xs text-emerald-950 whitespace-pre-wrap">{m.reply}</p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* PO Detail / Price Quote / Dispatch Modal (2.17.1) */}
      {selectedPo && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">
                  Purchase Order {selectedPo.poNumber}
                </h2>
                <p className="text-xs text-slate-500">
                  Status: <strong className="uppercase">{selectedPo.status.replace("_", " ")}</strong> • Total:{" "}
                  <strong>{formatINR(selectedPo.total)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPo(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {feedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold border ${
                    feedback.type === "ok"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : "bg-rose-50 border-rose-200 text-rose-700"
                  }`}
                >
                  {feedback.text}
                </div>
              )}

              {/* Line Items Table (Editable only in pending/price_updated) */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase text-slate-500">
                      <th className="py-2 px-3">Medicine</th>
                      <th className="py-2 px-3 text-right">Qty</th>
                      <th className="py-2 px-3 text-right">Unit Rate (₹)</th>
                      <th className="py-2 px-3 text-right">MRP (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPo.items.map((item) => {
                      const canEditQuote =
                        selectedPo.status === "pending" || selectedPo.status === "price_updated";
                      return (
                        <tr key={item.id}>
                          <td className="py-2 px-3 font-bold text-slate-800">
                            {item.medicine?.name || `Medicine #${item.medicineId}`}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold">{item.quantity}</td>
                          <td className="py-2 px-3 text-right">
                            {canEditQuote ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={priceEdits[item.id]?.price ?? ""}
                                onChange={(e) =>
                                  setPriceEdits((prev) => ({
                                    ...prev,
                                    [item.id]: { ...prev[item.id], price: e.target.value },
                                  }))
                                }
                                className="w-24 text-right border border-slate-300 rounded-md px-2 py-1 text-xs"
                              />
                            ) : (
                              formatINR(item.price)
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {canEditQuote ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={priceEdits[item.id]?.mrp ?? ""}
                                onChange={(e) =>
                                  setPriceEdits((prev) => ({
                                    ...prev,
                                    [item.id]: { ...prev[item.id], mrp: e.target.value },
                                  }))
                                }
                                className="w-24 text-right border border-slate-300 rounded-md px-2 py-1 text-xs"
                              />
                            ) : (
                              formatINR(item.mrp)
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {(selectedPo.status === "pending" || selectedPo.status === "price_updated") && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={handleSubmitPrices}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold cursor-pointer disabled:opacity-60"
                  >
                    {actionBusy ? "Saving..." : "Submit Price Quote"}
                  </button>
                </div>
              )}

              {/* Dispatch Shipment Form (Allowed on confirmed or shipped) */}
              {(selectedPo.status === "confirmed" || selectedPo.status === "shipped") && (
                <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-[#283566]">
                    <Truck className="w-4 h-4" />
                    <span>
                      {selectedPo.status === "confirmed"
                        ? "Mark Order as Shipped & Attach Challan"
                        : "Update Shipment Challan / Dispatch Notes"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Challan / Invoice Number
                      </label>
                      <input
                        type="text"
                        value={dispatchInvoiceNo}
                        onChange={(e) => setDispatchInvoiceNo(e.target.value)}
                        placeholder="e.g. CHL-2026-0891"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Dispatch / Courier Notes
                      </label>
                      <input
                        type="text"
                        value={dispatchNotes}
                        onChange={(e) => setDispatchNotes(e.target.value)}
                        placeholder="e.g. Dispatched via BlueDart AWB..."
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={handleDispatchOrder}
                      className="px-4 py-2 rounded-xl bg-[#283566] hover:bg-[#1a2347] text-white text-xs font-extrabold cursor-pointer disabled:opacity-60"
                    >
                      {actionBusy
                        ? "Updating..."
                        : selectedPo.status === "confirmed"
                        ? "Confirm Shipment (Mark Shipped)"
                        : "Save Challan Details"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
