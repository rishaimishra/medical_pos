"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Receipt,
  Search,
  Filter,
  Download,
  Printer,
  Share2,
  RotateCcw,
  Calendar,
  Building2,
  CreditCard,
  User,
  ArrowUpRight,
  ExternalLink,
  Loader2,
  CheckCircle2,
  MessageSquare,
  Mail,
  Send,
  X,
} from "lucide-react";
import { ReceiptPrintModal } from "@/components/pos/ReceiptPrintModal";

interface SaleRecord {
  id: number;
  invoiceNo: string;
  saleDate: string;
  createdAt: string;
  totalAmount: number;
  discountAmount: number;
  gstAmount: number;
  grandTotal: number;
  paymentMethod: string;
  splitDetails?: any;
  doctorName?: string | null;
  customer?: { id: number; name: string; phone: string; email?: string } | null;
  branch?: { id: number; name: string; code: string; phone?: string } | null;
  cashier?: { id: number; name: string; username: string } | null;
  itemsCount: number;
  items: Array<{
    id: number;
    medicineName: string;
    genericName?: string;
    batchNo: string;
    expiryDate: string;
    quantity: number;
    mrp: number;
    price: number;
  }>;
  returnsCount: number;
  hasReturns: boolean;
}

export default function SalesHistoryPage() {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [datePreset, setDatePreset] = useState("today");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({
    totalInvoices: 0,
    totalGross: 0,
    totalDiscount: 0,
    totalGst: 0,
    netSales: 0,
  });

  const [branches, setBranches] = useState<Array<{ id: number; name: string; code: string }>>([]);

  // Modal states
  const [reprintSale, setReprintSale] = useState<any | null>(null);
  const [shareTargetSale, setShareTargetSale] = useState<SaleRecord | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [sharePayload, setSharePayload] = useState<any | null>(null);
  const [shareSuccessMsg, setShareSuccessMsg] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Load branches list
  useEffect(() => {
    fetch("/api/admin/branches")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.branches)) {
          setBranches(json.branches);
        }
      })
      .catch(() => {});
  }, []);

  // Handle Date Preset Changes
  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    setPage(1);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (preset === "today") {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "yesterday") {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().slice(0, 10);
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === "last7") {
      const d7 = new Date();
      d7.setDate(d7.getDate() - 7);
      setStartDate(d7.toISOString().slice(0, 10));
      setEndDate(todayStr);
    } else if (preset === "this_month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
      setStartDate(startOfMonth);
      setEndDate(todayStr);
    } else if (preset === "all") {
      setStartDate("");
      setEndDate("");
    }
  };

  // Fetch Sales Records
  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (branchFilter !== "all") params.set("branchId", branchFilter);
      if (paymentFilter !== "all") params.set("paymentMethod", paymentFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/admin/sales?${params.toString()}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setSales(json.data || []);
        setTotalPages(json.pagination?.totalPages || 1);
        if (json.summary) {
          setSummary(json.summary);
        }
      }
    } catch (err) {
      console.error("Failed to load sales:", err);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, branchFilter, paymentFilter, startDate, endDate]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  // Open Digital Share Modal
  const handleOpenShare = async (sale: SaleRecord) => {
    setShareTargetSale(sale);
    setSharePayload(null);
    setShareSuccessMsg(null);
    setShareLoading(true);
    try {
      const res = await fetch(`/api/admin/sales/${sale.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "whatsapp" }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setSharePayload(json.delivery);
      }
    } catch (err) {
      console.error("Failed to prepare share:", err);
    } finally {
      setShareLoading(false);
    }
  };

  // Trigger Email Re-send
  const handleReSendEmail = async () => {
    if (!shareTargetSale) return;
    setShareLoading(true);
    try {
      const res = await fetch(`/api/admin/sales/${shareTargetSale.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "email",
          recipientEmail: shareTargetSale.customer?.email,
        }),
      });
      const json = await res.json();
      if (json.success && json.delivery?.email?.sent) {
        setShareSuccessMsg("Invoice receipt dispatched successfully via email!");
      } else {
        setShareSuccessMsg(
          json.delivery?.email?.error || "Could not deliver email. Verify SMTP settings."
        );
      }
    } catch {
      setShareSuccessMsg("Failed to dispatch email.");
    } finally {
      setShareLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Header & Export */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-7 h-7 text-[#1F4E5B]" />
            <span>Sales History & Digital Invoices</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Module 2.9: Complete sales archive, payment breakdowns, reprint & instant WhatsApp delivery
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <a
            href={`/api/admin/sales/export?${new URLSearchParams({
              branchId: branchFilter,
              paymentMethod: paymentFilter,
              startDate: startDate || "",
              endDate: endDate || "",
              search: debouncedSearch,
            }).toString()}`}
            className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export CSV</span>
          </a>

          <Link
            href="/admin/pos"
            className="px-4 py-2.5 bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-extrabold rounded-xl shadow-xs flex items-center gap-2 transition-colors"
          >
            <span>Open POS Terminal</span>
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Total Invoices
          </span>
          <div className="text-2xl font-black text-slate-900">
            {summary.totalInvoices.toLocaleString("en-IN")}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Billed sales count</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Gross Sales
          </span>
          <div className="text-2xl font-black text-slate-900">
            ₹{summary.totalGross.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Pre-discount items value</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Total Discounts
          </span>
          <div className="text-2xl font-black text-rose-600">
            -₹{summary.totalDiscount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Promos & customer discounts</span>
        </div>

        <div className="p-4 bg-white border border-emerald-200 bg-emerald-50/30 rounded-2xl shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
            Net Revenue Collected
          </span>
          <div className="text-2xl font-black text-emerald-700">
            ₹{summary.netSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-emerald-600 font-medium">
            Includes ₹{summary.totalGst.toFixed(2)} GST
          </span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by invoice #, customer name/phone, doctor..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1F4E5B]/20"
            />
          </div>

          {/* Branch Filter */}
          <div className="flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-slate-400 hidden sm:block" />
            <select
              value={branchFilter}
              onChange={(e) => {
                setBranchFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white focus:outline-none"
            >
              <option value="all">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} - {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method Filter */}
          <div className="flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-slate-400 hidden sm:block" />
            <select
              value={paymentFilter}
              onChange={(e) => {
                setPaymentFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white focus:outline-none"
            >
              <option value="all">All Payment Modes</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI / QR</option>
              <option value="card">Debit/Credit Card</option>
              <option value="split">Multi-Tender Split</option>
              <option value="credit">Store Credit</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
        </div>

        {/* Date Filter Presets */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="font-bold text-slate-600 mr-1">Period:</span>
            {[
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "last7", label: "Last 7 Days" },
              { id: "this_month", label: "This Month" },
              { id: "all", label: "All Time" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleDatePresetChange(p.id)}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  datePreset === p.id
                    ? "bg-[#1F4E5B] text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset("custom");
                setPage(1);
              }}
              className="px-2.5 py-1 border border-slate-200 rounded-lg font-medium text-slate-700"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDatePreset("custom");
                setPage(1);
              }}
              className="px-2.5 py-1 border border-slate-200 rounded-lg font-medium text-slate-700"
            />
          </div>
        </div>
      </div>

      {/* Sales Data Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[#1F4E5B]" />
            <p className="text-xs font-bold">Loading sales archive...</p>
          </div>
        ) : sales.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <Receipt className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-extrabold text-slate-700">No Sales Invoices Found</p>
            <p className="text-xs text-slate-400">
              No transactions match the selected filters or date period.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 font-extrabold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Date / Time</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Branch</th>
                  <th className="py-3 px-4">Items</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4 text-right">Net Amount</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {sales.map((sale) => {
                  const d = new Date(sale.createdAt);
                  const isSplit = sale.paymentMethod === "split";
                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <Link
                          href={`/admin/pos/invoice/${sale.invoiceNo}`}
                          target="_blank"
                          className="font-black text-[#1F4E5B] hover:underline flex items-center gap-1"
                        >
                          <span>{sale.invoiceNo}</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </Link>
                        {sale.hasReturns && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-100 text-rose-700 uppercase">
                            Has Returns
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        <div className="font-bold text-slate-900">
                          {d.toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900 block truncate max-w-[140px]">
                          {sale.customer ? sale.customer.name : "Walk-in Customer"}
                        </span>
                        {sale.customer?.phone && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {sale.customer.phone}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-800">
                          {sale.branch?.code || "MAIN"}
                        </span>
                        <span className="block text-[10px] text-slate-400 truncate max-w-[100px]">
                          {sale.branch?.name}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 font-bold text-slate-700">
                          {sale.itemsCount} units
                        </span>
                        <div className="text-[10px] text-slate-400 truncate max-w-[150px] mt-0.5">
                          {sale.items.map((i) => i.medicineName).join(", ")}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            sale.paymentMethod === "cash"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : sale.paymentMethod === "upi"
                              ? "bg-blue-50 text-blue-800 border border-blue-200"
                              : sale.paymentMethod === "card"
                              ? "bg-indigo-50 text-indigo-800 border border-indigo-200"
                              : isSplit
                              ? "bg-purple-50 text-purple-800 border border-purple-200"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                          }`}
                        >
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <strong className="text-slate-900 font-black text-sm block">
                          ₹{sale.grandTotal.toFixed(2)}
                        </strong>
                        {sale.discountAmount > 0 && (
                          <span className="text-[10px] text-rose-600">
                            Disc: -₹{sale.discountAmount.toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1">
                          {/* 1-Click Reprint Button */}
                          <button
                            type="button"
                            onClick={() => setReprintSale(sale)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                            title="Reprint Invoice (Thermal / A4)"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {/* Digital Share Button (WhatsApp/SMS) */}
                          <button
                            type="button"
                            onClick={() => handleOpenShare(sale)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-emerald-50 text-emerald-700 transition-colors"
                            title="Digital Share (WhatsApp & SMS)"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Initiate Return Button */}
                          <Link
                            href={`/admin/returns?invoiceNo=${encodeURIComponent(sale.invoiceNo)}`}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-rose-600 transition-colors"
                            title="Process Sales Return"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">
              Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded-lg border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 rounded-lg border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal 1: Reprint Modal (Uses ReceiptPrintModal) */}
      {reprintSale && (
        <ReceiptPrintModal
          isOpen={Boolean(reprintSale)}
          onClose={() => setReprintSale(null)}
          saleData={reprintSale}
          onNewSale={() => setReprintSale(null)}
        />
      )}

      {/* Modal 2: Digital Invoice Sharing Modal (WhatsApp / SMS / Email) */}
      {shareTargetSale && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Share Digital Invoice {shareTargetSale.invoiceNo}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Deliver invoice directly to customer via WhatsApp, SMS, or Email
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShareTargetSale(null)}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {shareLoading && !sharePayload ? (
              <div className="py-8 text-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#1F4E5B]" />
                <span className="text-xs">Preparing digital delivery payloads...</span>
              </div>
            ) : sharePayload ? (
              <div className="space-y-4">
                {/* WhatsApp Channel */}
                <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-emerald-700" />
                      <span>WhatsApp Direct Delivery</span>
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700">
                      {sharePayload.whatsapp.phone ? `+${sharePayload.whatsapp.phone}` : "No Phone"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 bg-white p-2.5 rounded-xl border border-emerald-100 font-mono whitespace-pre-wrap leading-relaxed">
                    {sharePayload.whatsapp.message}
                  </p>
                  <a
                    href={sharePayload.whatsapp.shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Open in WhatsApp Web / App</span>
                  </a>
                </div>

                {/* SMS Channel */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5 text-xs">
                  <span className="font-bold text-slate-700 block text-[11px]">
                    SMS Text Summary:
                  </span>
                  <div className="p-2 bg-white rounded-xl border border-slate-200 text-slate-600 text-[10px] font-mono">
                    {sharePayload.sms.message}
                  </div>
                </div>

                {/* Email Channel */}
                {shareTargetSale.customer?.email ? (
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div className="flex items-center gap-2 text-xs">
                      <Mail className="w-4 h-4 text-slate-500" />
                      <span className="font-bold text-slate-700">
                        {shareTargetSale.customer.email}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={shareLoading}
                      onClick={handleReSendEmail}
                      className="px-3 py-1.5 bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold rounded-xl disabled:opacity-50"
                    >
                      {shareLoading ? "Dispatching..." : "Re-Send Email Receipt"}
                    </button>
                  </div>
                ) : null}

                {shareSuccessMsg && (
                  <div className="p-3 bg-emerald-100 border border-emerald-200 text-emerald-900 text-xs font-bold rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span>{shareSuccessMsg}</span>
                  </div>
                )}
              </div>
            ) : null}

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShareTargetSale(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
