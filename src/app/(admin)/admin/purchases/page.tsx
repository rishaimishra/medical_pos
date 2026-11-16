"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  Search,
  Plus,
  RefreshCw,
  Loader2,
  Printer,
  Sparkles,
  CheckCircle2,
  Clock,
  Truck,
  RotateCcw,
  X,
  AlertTriangle,
  Building2,
  Phone,
  FileText,
  Copy,
  ChevronRight,
  Send,
  Pill,
  Mail,
  Bell,
} from "lucide-react";
import { useBranchStore } from "@/stores/useBranchStore";

interface POItemRecord {
  id: number;
  medicineId: number;
  quantity: number;
  price: number;
  mrp: number;
  receivedQty: number;
  bonusQty: number;
  batchNo?: string | null;
  expiryDate?: string | null;
  medicine: {
    id: number;
    name: string;
    genericName?: string | null;
    company: string;
    category: string;
  };
}

interface PurchaseOrderRecord {
  id: number;
  poNumber: string;
  supplierId: number;
  branchId?: number | null;
  poDate: string;
  status: "draft" | "pending" | "price_updated" | "confirmed" | "shipped" | "received" | "cancelled";
  total: number;
  notes?: string | null;
  invoiceNo?: string | null;
  createdAt: string;
  supplier: {
    id: number;
    name: string;
    contact?: string | null;
    phone: string;
    email?: string | null;
    gstNo?: string | null;
    dlNo?: string | null;
  };
  branch?: {
    id: number;
    code: string;
    name: string;
  } | null;
  creator?: {
    id: number;
    name: string;
    username: string;
  } | null;
  items: POItemRecord[];
}

export default function PurchaseOrdersPage() {
  const { activeBranch } = useBranchStore();

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({
    totalPOs: 0,
    pendingCount: 0,
    confirmedCount: 0,
    shippedCount: 0,
    receivedCount: 0,
    cancelledCount: 0,
    totalSpend: 0,
  });

  // Modal 1: New PO Builder
  const [showNewPOModal, setShowNewPOModal] = useState(false);
  const [suppliersList, setSuppliersList] = useState<any[]>([]);
  const [medicinesList, setMedicinesList] = useState<any[]>([]);
  const [medicineSearch, setMedicineSearch] = useState("");
  const [isSearchingMeds, setIsSearchingMeds] = useState(false);
  const [filteredMedicines, setFilteredMedicines] = useState<any[]>([]);
  const [poForm, setPoForm] = useState<{
    supplierId: string;
    branchId: string;
    poDate: string;
    notes: string;
    items: Array<{
      medicineId: number;
      medicineName: string;
      company: string;
      category: string;
      quantity: number;
      price: number;
      mrp: number;
    }>;
  }>({
    supplierId: "",
    branchId: activeBranch ? String(activeBranch.id) : "",
    poDate: new Date().toISOString().slice(0, 10),
    notes: "",
    items: [],
  });
  const [savingPO, setSavingPO] = useState(false);
  const [poError, setPoError] = useState<string | null>(null);

  // Modal 2: Smart Auto-PO Suggestions
  const [showAutoPOModal, setShowAutoPOModal] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [autoSuggestions, setAutoSuggestions] = useState<any[]>([]);
  const [groupedSuggestions, setGroupedSuggestions] = useState<any[]>([]);

  // Modal 3: Official PO Document / Print View
  const [selectedPO, setSelectedPO] = useState<PurchaseOrderRecord | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Status Action Loader
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);
  const [sendingAlert, setSendingAlert] = useState(false);
  const [toastNotification, setToastNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastNotification({ type, text });
    setTimeout(() => setToastNotification(null), 4000);
  };

  const handleTriggerStockAlert = async () => {
    setSendingAlert(true);
    try {
      const res = await fetch("/api/admin/notifications/daily-stock-alert?force=true", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        showToast(json.message || "Daily stock alert email sent successfully!", "success");
      } else {
        showToast(json.message || "Failed to dispatch stock alert.", "error");
      }
    } catch (err: any) {
      showToast("Error triggering stock alert: " + err.message, "error");
    } finally {
      setSendingAlert(false);
    }
  };

  // Fetch Purchase Orders
  const fetchPurchaseOrders = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: "25",
        search: search.trim(),
        status: statusFilter,
        branchId: activeBranch?.id ? String(activeBranch.id) : "all",
      });
      const res = await fetch(`/api/admin/purchases?${q.toString()}`);
      const json = await res.json();
      if (json.success) {
        setPurchaseOrders(json.purchaseOrders || []);
        setTotalPages(json.pagination?.totalPages || 1);
        if (json.summary) setSummary(json.summary);
      }
    } catch (err) {
      console.error("Failed to fetch POs:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, activeBranch?.id]);

  useEffect(() => {
    fetchPurchaseOrders();
  }, [fetchPurchaseOrders]);

  // Load suppliers and medicines for manual builder
  const loadSuppliersAndMedicines = async () => {
    try {
      const [supRes, medRes] = await Promise.all([
        fetch("/api/admin/suppliers?all=true"),
        fetch("/api/admin/medicines?limit=100"),
      ]);
      const supJson = await supRes.json();
      const medJson = await medRes.json();
      if (supJson.success) setSuppliersList(supJson.suppliers || supJson.data || []);
      if (medJson.success) setMedicinesList(medJson.medicines || medJson.data || []);
    } catch (err) {
      console.error("Error loading suppliers/medicines:", err);
    }
  };

  // Open New PO Modal
  const handleOpenNewPO = () => {
    loadSuppliersAndMedicines();
    setPoForm({
      supplierId: suppliersList[0]?.id ? String(suppliersList[0].id) : "",
      branchId: activeBranch ? String(activeBranch.id) : "",
      poDate: new Date().toISOString().slice(0, 10),
      notes: "",
      items: [],
    });
    setPoError(null);
    setShowNewPOModal(true);
  };

  // Add Item to PO
  const handleAddItemToPO = (med: any) => {
    const existing = poForm.items.find((i) => i.medicineId === med.id);
    if (existing) {
      setPoForm({
        ...poForm,
        items: poForm.items.map((i) =>
          i.medicineId === med.id ? { ...i, quantity: i.quantity + 10 } : i
        ),
      });
    } else {
      // Fetch latest batch price if available
      const lastBatch = med.batches?.[0];
      const mrp = lastBatch ? Number(lastBatch.mrp) : (med.stockSummary?.minMrp ? Number(med.stockSummary.minMrp) : 15);
      const price = lastBatch ? Number(lastBatch.purchasePrice) : Number((mrp * 0.7).toFixed(2)) || 10;

      setPoForm({
        ...poForm,
        items: [
          ...poForm.items,
          {
            medicineId: med.id,
            medicineName: med.name,
            company: med.company || "Generic",
            category: med.category || "General",
            quantity: 50,
            price: price,
            mrp: mrp,
          },
        ],
      });
    }
    setMedicineSearch("");
    setFilteredMedicines([]);
  };

  // Save New PO
  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    setPoError(null);

    if (!poForm.supplierId) {
      setPoError("Please select a vendor / supplier");
      return;
    }
    if (poForm.items.length === 0) {
      setPoError("Please add at least one medicine item to the purchase order");
      return;
    }

    setSavingPO(true);
    try {
      const res = await fetch("/api/admin/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: parseInt(poForm.supplierId, 10),
          branchId: poForm.branchId ? parseInt(poForm.branchId, 10) : undefined,
          poDate: poForm.poDate,
          notes: poForm.notes,
          items: poForm.items.map((i) => ({
            medicineId: i.medicineId,
            quantity: i.quantity,
            price: i.price,
            mrp: i.mrp,
          })),
        }),
      });
      const json = await res.json();

      if (!json.success) {
        setPoError(json.message || "Failed to create Purchase Order");
        setSavingPO(false);
        return;
      }

      setShowNewPOModal(false);
      fetchPurchaseOrders();
    } catch (err: any) {
      setPoError(err.message || "An error occurred");
    } finally {
      setSavingPO(false);
    }
  };

  // Open Smart Auto-PO Suggestions
  const handleOpenAutoSuggestions = async () => {
    setShowAutoPOModal(true);
    setLoadingSuggestions(true);
    try {
      const branchQuery = activeBranch?.id ? `?branchId=${activeBranch.id}` : "";
      const res = await fetch(`/api/admin/purchases/suggestions${branchQuery}`);
      const json = await res.json();
      if (json.success) {
        setAutoSuggestions(json.suggestions || []);
        setGroupedSuggestions(json.groupedBySupplier || []);
      }
    } catch (err) {
      console.error("Failed to load auto suggestions:", err);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Convert Grouped Suggestion to PO
  const handleCreatePOFromSuggestion = async (group: any) => {
    try {
      const res = await fetch("/api/admin/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: group.supplier.id,
          branchId: activeBranch?.id,
          notes: "Generated automatically via Smart Low-Stock Auto-PO Engine",
          items: group.items.map((it: any) => ({
            medicineId: it.medicineId,
            quantity: it.suggestedQuantity,
            price: it.purchasePrice || 10,
            mrp: it.mrp || 15,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowAutoPOModal(false);
        fetchPurchaseOrders();
      }
    } catch (err) {
      console.error("Failed to create PO from suggestion:", err);
    }
  };

  // 1-Click Reorder PO
  const handleReorder = (po: PurchaseOrderRecord) => {
    setConfirmModal({
      title: "Reorder Purchase Order",
      message: `Reorder all items from ${po.poNumber} into a new Purchase Order?`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/purchases/${po.id}/clone`, { method: "POST" });
          const json = await res.json();
          if (json.success) {
            showToast(`New PO cloned from ${po.poNumber}`, "success");
            fetchPurchaseOrders();
          } else {
            showToast(json.message || "Failed to clone PO", "error");
          }
        } catch (err: any) {
          showToast("Clone error: " + err.message, "error");
        }
      },
    });
  };

  // Update Status
  const handleUpdateStatus = async (poId: number, status: string) => {
    setUpdatingStatusId(poId);
    try {
      const res = await fetch(`/api/admin/purchases/${poId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_status", status }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`PO status updated to ${status}`, "success");
        fetchPurchaseOrders();
      } else {
        showToast(json.message || "Status change failed", "error");
      }
    } catch (err: any) {
      showToast("Status update error: " + err.message, "error");
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // Filter Medicines for search box with debounced server search
  useEffect(() => {
    if (!medicineSearch.trim()) {
      setFilteredMedicines([]);
      setIsSearchingMeds(false);
      return;
    }
    setIsSearchingMeds(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/medicines?search=${encodeURIComponent(medicineSearch.trim())}&limit=20`);
        const json = await res.json();
        const list = json.medicines || json.data;
        if (json.success && Array.isArray(list) && list.length > 0) {
          setFilteredMedicines(list);
        } else {
          const q = medicineSearch.toLowerCase();
          setFilteredMedicines(
            (medicinesList || [])
              .filter((m) => m.name.toLowerCase().includes(q) || (m.genericName || "").toLowerCase().includes(q))
              .slice(0, 8)
          );
        }
      } catch {
        const q = medicineSearch.toLowerCase();
        setFilteredMedicines(
          (medicinesList || [])
            .filter((m) => m.name.toLowerCase().includes(q) || (m.genericName || "").toLowerCase().includes(q))
            .slice(0, 8)
        );
      } finally {
        setIsSearchingMeds(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [medicineSearch, medicinesList]);

  const grandTotal = poForm.items.reduce((sum, it) => sum + it.price * it.quantity, 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
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

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">{confirmModal.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{confirmModal.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs"
              >
                No, Keep
              </button>
              <button
                type="button"
                onClick={() => {
                  const cb = confirmModal.onConfirm;
                  setConfirmModal(null);
                  cb();
                }}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs"
              >
                Yes, Proceed
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 1. Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#EAF5F0] text-[#0F6E56] flex items-center justify-center shadow-xs">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Purchase Orders & Procurement
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Vendor purchase orders lifecycle, smart low-stock auto-order suggestions, and stock inwarding
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleOpenAutoSuggestions}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50/80 hover:bg-amber-100 text-amber-900 text-xs font-bold transition-all shadow-xs"
          >
            <Sparkles className="w-4 h-4 text-amber-700" />
            <span>Smart Auto-PO Suggestions</span>
          </button>

          <button
            onClick={handleTriggerStockAlert}
            disabled={sendingAlert}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-rose-200 bg-rose-50/80 hover:bg-rose-100 text-rose-900 text-xs font-bold transition-all shadow-xs disabled:opacity-50"
            title="Dispatch daily low-stock & expiry digest email to admin"
          >
            <Bell className={`w-4 h-4 text-rose-600 ${sendingAlert ? "animate-spin" : ""}`} />
            <span>{sendingAlert ? "Sending..." : "Daily Stock Alert"}</span>
          </button>

          <Link
            href="/admin/grn"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-900 text-xs font-bold transition-all shadow-xs"
          >
            <Truck className="w-4 h-4 text-indigo-700" />
            <span>GRN Inwarding Desk</span>
          </Link>

          <button
            onClick={handleOpenNewPO}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F6E56] hover:bg-[#0b5643] text-white text-xs font-extrabold transition-all shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Create Purchase Order</span>
          </button>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Total Purchase Orders
            </span>
            <span className="text-2xl font-extrabold text-slate-900 mt-1 block">
              {summary.totalPOs}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">All lifecycle stages</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-amber-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider block">
              Pending & Confirmed
            </span>
            <span className="text-2xl font-extrabold text-amber-950 mt-1 block">
              {summary.pendingCount + summary.confirmedCount}
            </span>
            <span className="text-[11px] text-amber-700 font-medium">Awaiting vendor shipment</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-indigo-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider block">
              In-Transit (Shipped)
            </span>
            <span className="text-2xl font-extrabold text-indigo-950 mt-1 block">
              {summary.shippedCount}
            </span>
            <span className="text-[11px] text-indigo-600 font-medium">Ready for GRN inwarding</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-800 flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-emerald-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">
              Completed Receipts
            </span>
            <span className="text-2xl font-extrabold text-emerald-950 mt-1 block">
              {summary.receivedCount}
            </span>
            <span className="text-[11px] text-emerald-700 font-medium">
              ₹{summary.totalSpend.toLocaleString("en-IN", { minimumFractionDigits: 2 })} inwarded
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. Filter Bar & Search */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
          {[
            { id: "all", label: "All POs" },
            { id: "pending", label: "Pending" },
            { id: "price_updated", label: "Price Updated" },
            { id: "confirmed", label: "Confirmed" },
            { id: "shipped", label: "Shipped" },
            { id: "received", label: "Received" },
            { id: "cancelled", label: "Cancelled" },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => {
                setStatusFilter(pill.id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl border transition-all ${
                statusFilter === pill.id
                  ? "bg-[#0F6E56] text-white border-[#0F6E56]"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              {pill.label}
            </button>
          ))}
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
              placeholder="Search by PO#, invoice#, or supplier..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 focus:border-[#0F6E56]"
            />
          </div>

          <button
            onClick={() => fetchPurchaseOrders()}
            className="p-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* 4. Purchase Orders Data Table */}
      <div className="bg-white border border-slate-200/90 rounded-3xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-3.5 px-4">PO Number & Date</th>
                <th className="py-3.5 px-4">Supplier / Vendor</th>
                <th className="py-3.5 px-4">Target Branch</th>
                <th className="py-3.5 px-4 text-center">Items & Inward</th>
                <th className="py-3.5 px-4 text-right">Order Amount</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#0F6E56]" />
                    <span>Loading purchase orders...</span>
                  </td>
                </tr>
              ) : purchaseOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                    <span>No purchase orders found matching your filters.</span>
                  </td>
                </tr>
              ) : (
                purchaseOrders.map((po) => {
                  const totalOrderedQty = po.items.reduce((sum, i) => sum + i.quantity, 0);
                  const totalReceivedQty = po.items.reduce((sum, i) => sum + i.receivedQty, 0);

                  const statusBadges: Record<string, { label: string; bg: string; text: string }> = {
                    draft: { label: "Draft", bg: "bg-slate-100", text: "text-slate-700" },
                    pending: { label: "Sent (Pending)", bg: "bg-amber-100", text: "text-amber-900" },
                    price_updated: { label: "Price Updated", bg: "bg-blue-100", text: "text-blue-900" },
                    confirmed: { label: "Confirmed", bg: "bg-blue-100", text: "text-blue-900" },
                    shipped: { label: "In-Transit (Shipped)", bg: "bg-purple-100", text: "text-purple-900" },
                    received: { label: "Inwarded (Received)", bg: "bg-emerald-100", text: "text-emerald-900" },
                    cancelled: { label: "Cancelled", bg: "bg-rose-100", text: "text-rose-800" },
                  };

                  const badge = statusBadges[po.status] || statusBadges.pending;

                  return (
                    <tr key={po.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* PO Number & Date */}
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold font-mono text-slate-900 text-sm">
                          {po.poNumber}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {new Date(po.poDate).toISOString().slice(0, 10)}
                        </div>
                        {po.invoiceNo && (
                          <div className="text-[11px] text-emerald-700 font-bold">
                            Challan: {po.invoiceNo}
                          </div>
                        )}
                      </td>

                      {/* Supplier */}
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-slate-800">{po.supplier.name}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{po.supplier.phone}</span>
                        </div>
                      </td>

                      {/* Branch */}
                      <td className="py-3.5 px-4">
                        {po.branch ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold text-[11px]">
                            <Building2 className="w-3 h-3 text-slate-500" />
                            <span>{po.branch.code} - {po.branch.name}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">All Branches</span>
                        )}
                      </td>

                      {/* Items & Inward */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="font-bold text-slate-800">
                          {po.items.length} Drug Item(s)
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {totalReceivedQty} / {totalOrderedQty} Units Inwarded
                        </div>
                      </td>

                      {/* Order Amount */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-extrabold text-slate-900 text-sm">
                          ₹{Number(po.total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-extrabold ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Official Print View */}
                          <button
                            onClick={() => {
                              setSelectedPO(po);
                              setShowPrintModal(true);
                            }}
                            title="View & Print Official Purchase Order"
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {/* Confirm PO (if pending) */}
                          {(po.status === "pending" || po.status === "price_updated" || po.status === "draft") && (
                            <button
                              disabled={updatingStatusId === po.id}
                              onClick={() => handleUpdateStatus(po.id, "confirmed")}
                              title="Confirm Purchase Order"
                              className="px-2 py-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 text-[10px] font-bold"
                            >
                              Confirm
                            </button>
                          )}

                          {/* Mark Shipped (if confirmed) */}
                          {po.status === "confirmed" && (
                            <button
                              disabled={updatingStatusId === po.id}
                              onClick={() => handleUpdateStatus(po.id, "shipped")}
                              title="Mark as Shipped / In-Transit"
                              className="px-2 py-1 rounded-lg border border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100 text-[10px] font-bold"
                            >
                              Shipped
                            </button>
                          )}

                          {/* Receive Stock GRN */}
                          {po.status !== "received" && po.status !== "cancelled" && (
                            <Link
                              href={`/admin/grn?poId=${po.id}`}
                              title="Inward Goods against this PO"
                              className="px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-[10px] font-bold flex items-center gap-1"
                            >
                              <Truck className="w-3 h-3" />
                              <span>GRN</span>
                            </Link>
                          )}

                          {/* Reorder Clone */}
                          <button
                            onClick={() => handleReorder(po)}
                            title="Reorder: 1-Click Clone to New PO"
                            className="p-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          {/* Cancel (if unreceived and unshipped) */}
                          {po.status !== "received" && po.status !== "shipped" && po.status !== "cancelled" && (
                            <button
                              onClick={() => {
                                setConfirmModal({
                                  title: "Cancel Purchase Order",
                                  message: `Cancel Purchase Order ${po.poNumber}?`,
                                  onConfirm: () => handleUpdateStatus(po.id, "cancelled"),
                                });
                              }}
                              title="Cancel Purchase Order"
                              className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: New Purchase Order Builder */}
      {showNewPOModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#EAF5F0] text-[#0F6E56] flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Create New Purchase Order
                  </h3>
                  <p className="text-xs text-slate-500">
                    Add distributor, target outlet, and medicines to issue an official PO
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowNewPOModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {poError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{poError}</span>
              </div>
            )}

            <form onSubmit={handleCreatePO} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Select Supplier / Vendor *</label>
                  <select
                    required
                    value={poForm.supplierId}
                    onChange={(e) => setPoForm({ ...poForm, supplierId: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 font-bold"
                  >
                    <option value="">Choose a distributor...</option>
                    {suppliersList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.phone}) - {s.paymentTerms}d terms
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Target Store Branch</label>
                  <input
                    type="text"
                    readOnly
                    value={activeBranch ? `${activeBranch.code} - ${activeBranch.name}` : "Main Pharmacy"}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Order Date</label>
                  <input
                    type="date"
                    value={poForm.poDate}
                    onChange={(e) => setPoForm({ ...poForm, poDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-bold"
                  />
                </div>
              </div>

              {/* Medicine Picker Bar */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="font-bold text-slate-700 block">
                  Search & Add Medicines to Order
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={medicineSearch}
                    onChange={(e) => setMedicineSearch(e.target.value)}
                    placeholder="Type medicine name or generic composition..."
                    className="w-full pl-9 pr-10 py-2.5 bg-white text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 font-medium"
                  />
                  {isSearchingMeds && (
                    <Loader2 className="w-4 h-4 text-[#0F6E56] animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
                  )}

                  {/* Dropdown: No Results */}
                  {medicineSearch.trim().length > 0 && !isSearchingMeds && filteredMedicines.length === 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-4 text-center text-xs text-slate-400">
                      No medicines found matching &ldquo;{medicineSearch}&rdquo;
                    </div>
                  )}

                  {/* Dropdown: List of matched medicines */}
                  {filteredMedicines.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 max-h-60 overflow-y-auto divide-y divide-slate-100">
                      {filteredMedicines.map((m) => {
                        const batch = m.batches?.[0];
                        const estCost = batch?.purchasePrice || (m.stockSummary?.minMrp ? (m.stockSummary.minMrp * 0.7).toFixed(2) : "—");
                        const estMrp = batch?.mrp || m.stockSummary?.minMrp || "—";
                        return (
                          <div
                            key={m.id}
                            onClick={() => handleAddItemToPO(m)}
                            className="p-3 hover:bg-[#EAF5F0] cursor-pointer flex items-center justify-between text-xs transition-colors"
                          >
                            <div className="pr-2">
                              <div className="flex items-center gap-2">
                                <strong className="text-slate-900">{m.name}</strong>
                                {m.category && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">
                                    {m.category}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                                {m.company || "Generic"} {m.genericName ? `• ${m.genericName}` : ""}
                              </span>
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                Est. Cost: ₹{estCost} | MRP: ₹{estMrp} | In Stock: {m.stockSummary?.totalQuantity ?? 0}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="shrink-0 px-3 py-1.5 rounded-lg bg-[#0F6E56] hover:bg-[#0b5643] text-white text-[11px] font-bold transition-colors"
                            >
                              + Add to PO
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Added Line Items Table */}
              <div className="space-y-2">
                <label className="font-bold text-slate-700 block">
                  Ordered Line Items ({poForm.items.length})
                </label>
                {poForm.items.length === 0 ? (
                  <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 text-center text-slate-400">
                    No medicines added yet. Use the search box above to add items to this PO.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                        <tr>
                          <th className="py-2.5 px-3">Medicine</th>
                          <th className="py-2.5 px-3 w-28 text-center">Order Qty</th>
                          <th className="py-2.5 px-3 w-28 text-right">Cost Price (₹)</th>
                          <th className="py-2.5 px-3 w-28 text-right">Selling MRP (₹)</th>
                          <th className="py-2.5 px-3 text-right">Line Total</th>
                          <th className="py-2.5 px-3 w-10 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {poForm.items.map((it, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-slate-900 block">{it.medicineName}</span>
                              <span className="text-[11px] text-slate-500 font-normal">
                                {it.company} ({it.category})
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <input
                                type="number"
                                min="1"
                                value={it.quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10) || 1;
                                  setPoForm({
                                    ...poForm,
                                    items: poForm.items.map((item, i) =>
                                      i === idx ? { ...item, quantity: val } : item
                                    ),
                                  });
                                }}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-center font-bold focus:outline-none"
                              />
                            </td>
                            <td className="py-2.5 px-3">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={it.price}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setPoForm({
                                    ...poForm,
                                    items: poForm.items.map((item, i) =>
                                      i === idx ? { ...item, price: val } : item
                                    ),
                                  });
                                }}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-right font-bold focus:outline-none"
                              />
                            </td>
                            <td className="py-2.5 px-3">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={it.mrp}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setPoForm({
                                    ...poForm,
                                    items: poForm.items.map((item, i) =>
                                      i === idx ? { ...item, mrp: val } : item
                                    ),
                                  });
                                }}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-right font-bold focus:outline-none"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right font-extrabold text-slate-800">
                              ₹{(it.price * it.quantity).toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setPoForm({
                                    ...poForm,
                                    items: poForm.items.filter((_, i) => i !== idx),
                                  })
                                }
                                className="p-1 rounded-md text-slate-400 hover:text-rose-600"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Order Notes & Summary Footer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Special Order Instructions / Delivery Notes</label>
                  <textarea
                    rows={2}
                    value={poForm.notes}
                    onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })}
                    placeholder="e.g. Urgent delivery required within 48 hours to Main Counter"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20"
                  />
                </div>

                <div className="p-4 rounded-2xl bg-[#EAF5F0] border border-emerald-200 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-[#0F6E56] font-bold">
                    <span>Estimated Total PO Value:</span>
                    <span className="text-lg font-extrabold text-slate-900">
                      ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Tax inclusive based on unit cost rates
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewPOModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPO}
                  className="px-6 py-2.5 rounded-xl bg-[#0F6E56] hover:bg-[#0b5643] text-white font-extrabold flex items-center gap-2 disabled:opacity-50"
                >
                  {savingPO && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Issue Purchase Order</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Smart Auto-PO Suggestions Engine */}
      {showAutoPOModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Smart Low-Stock Auto-PO Suggestions
                  </h3>
                  <p className="text-xs text-slate-500">
                    Automated analysis of low-stock items grouped by preferred wholesale distributor
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAutoPOModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingSuggestions ? (
              <div className="py-12 text-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#0F6E56]" />
                <span>Analyzing inventory levels and reorder thresholds...</span>
              </div>
            ) : groupedSuggestions.length === 0 ? (
              <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h4 className="text-sm font-extrabold text-slate-900">All Stock Levels Healthy!</h4>
                <p className="text-xs text-slate-500">
                  No medicines are currently below their low-stock thresholds in this branch.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="text-xs text-slate-600">
                  Found <strong>{autoSuggestions.length} low-stock medicines</strong> requiring replenishment. Review grouped suggestions below and click to generate orders directly:
                </div>

                <div className="space-y-4">
                  {groupedSuggestions.map((group, idx) => (
                    <div
                      key={idx}
                      className="p-5 rounded-2xl border border-amber-200 bg-amber-50/40 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 pb-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-amber-800" />
                          <span className="font-extrabold text-slate-900 text-sm">
                            {group.supplier?.name || "General Distributor"}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            ({group.items.length} items suggested)
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-xs">
                            <span className="text-slate-500">Estimated: </span>
                            <strong className="text-slate-900">₹{group.estimatedTotal.toFixed(2)}</strong>
                          </div>
                          <button
                            onClick={() => handleCreatePOFromSuggestion(group)}
                            className="px-4 py-1.5 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-extrabold shadow-xs transition-colors"
                          >
                            1-Click Generate PO
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {group.items.map((it: any, i: number) => (
                          <div
                            key={i}
                            className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between"
                          >
                            <div>
                              <strong className="text-slate-900 block">{it.medicineName}</strong>
                              <span className="text-[11px] text-slate-500 font-medium">
                                Current Stock:{" "}
                                <strong className={it.currentStock === 0 ? "text-rose-600" : "text-amber-700"}>
                                  {it.currentStock} units
                                </strong>
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-extrabold text-emerald-800 block">
                                +{it.suggestedQuantity} units
                              </span>
                              <span className="text-[10px] text-slate-400">
                                @ ₹{it.purchasePrice.toFixed(2)}/u
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: Official PO Document / Print View */}
      {showPrintModal && selectedPO && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <style>{`
            @media print {
              body * {
                visibility: hidden !important;
              }
              #printable-po-document, #printable-po-document * {
                visibility: visible !important;
              }
              #printable-po-document {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
                padding: 24px !important;
                margin: 0 !important;
                border: none !important;
                box-shadow: none !important;
                background: white !important;
              }
              .no-print {
                display: none !important;
              }
            }
          `}</style>
          <div
            id="printable-po-document"
            className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 no-print">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-md">
                  Official Purchase Order
                </span>
                <h3 className="text-xl font-extrabold font-mono text-slate-900 mt-1">
                  {selectedPO.poNumber}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {/* WhatsApp Dispatch */}
                {(() => {
                  const shareText = encodeURIComponent(
                    `*Purchase Order ${selectedPO.poNumber}*\n` +
                    `Vendor: ${selectedPO.supplier.name}\n` +
                    `Date: ${new Date(selectedPO.poDate).toISOString().slice(0, 10)}\n` +
                    `Items: ${selectedPO.items.length}\n` +
                    `Total: ₹${Number(selectedPO.total).toFixed(2)}\n\n` +
                    selectedPO.items.map((it, idx) => `${idx + 1}. ${it.medicine.name} (Qty: ${it.quantity} @ ₹${Number(it.price).toFixed(2)})`).join("\n")
                  );
                  const cleanPhone = selectedPO.supplier.phone.replace(/\D/g, "");
                  const waUrl = cleanPhone.length === 10
                    ? `https://wa.me/91${cleanPhone}?text=${shareText}`
                    : `https://wa.me/${cleanPhone}?text=${shareText}`;
                  return (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-xs hover:bg-emerald-700 transition-colors"
                      title="Share PO via WhatsApp"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">WhatsApp</span>
                    </a>
                  );
                })()}

                {/* Email Dispatch */}
                <a
                  href={`mailto:${selectedPO.supplier.email || ""}?subject=${encodeURIComponent(`Purchase Order ${selectedPO.poNumber} - Medical POS`)}&body=${encodeURIComponent(
                    `Dear ${selectedPO.supplier.contact || selectedPO.supplier.name},\n\nPlease find Purchase Order ${selectedPO.poNumber} for ₹${Number(selectedPO.total).toFixed(2)}.\n\nItems:\n` +
                    selectedPO.items.map((it, idx) => `${idx + 1}. ${it.medicine.name} (Qty: ${it.quantity} @ ₹${Number(it.price).toFixed(2)})`).join("\n") +
                    `\n\nTotal Order Value: ₹${Number(selectedPO.total).toFixed(2)}\n\nThank you.`
                  )}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors"
                  title="Send PO by Email"
                >
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden sm:inline">Email</span>
                </a>

                {/* Print Button */}
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-xs hover:bg-slate-800"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print</span>
                </button>

                <button
                  onClick={() => setShowPrintModal(false)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Document Header */}
            <div className="grid grid-cols-2 gap-6 p-5 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
              <div className="space-y-1">
                <span className="text-slate-400 font-bold block uppercase tracking-wider text-[10px]">
                  Issued To (Vendor):
                </span>
                <strong className="text-sm text-slate-900 block">{selectedPO.supplier.name}</strong>
                {selectedPO.supplier.contact && (
                  <div className="text-slate-600">Attn: {selectedPO.supplier.contact}</div>
                )}
                <div className="text-slate-600">Phone: {selectedPO.supplier.phone}</div>
                {selectedPO.supplier.gstNo && (
                  <div className="text-slate-600 font-mono">GSTIN: {selectedPO.supplier.gstNo}</div>
                )}
                {selectedPO.supplier.dlNo && (
                  <div className="text-slate-600 font-mono">DL No: {selectedPO.supplier.dlNo}</div>
                )}
              </div>

              <div className="space-y-1 text-right">
                <span className="text-slate-400 font-bold block uppercase tracking-wider text-[10px]">
                  Order Metadata:
                </span>
                <div className="text-slate-900 font-bold">
                  Date: {new Date(selectedPO.poDate).toISOString().slice(0, 10)}
                </div>
                <div className="text-slate-600">
                  Target Outlet: <strong>{selectedPO.branch?.name || "Main Counter"}</strong>
                </div>
                <div className="text-slate-600">
                  Status: <strong className="uppercase">{selectedPO.status}</strong>
                </div>
                {selectedPO.creator && (
                  <div className="text-slate-500 text-[11px]">
                    Authorized by: {selectedPO.creator.name}
                  </div>
                )}
              </div>
            </div>

            {/* Items Table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                  <tr>
                    <th className="py-2.5 px-3 w-10">#</th>
                    <th className="py-2.5 px-3">Medicine Name & Formulation</th>
                    <th className="py-2.5 px-3 text-center">Ordered Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Rate (₹)</th>
                    <th className="py-2.5 px-3 text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {selectedPO.items.map((it, idx) => (
                    <tr key={it.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-2.5 px-3">
                        <strong className="text-slate-900 block">{it.medicine.name}</strong>
                        <span className="text-[11px] text-slate-500">
                          {it.medicine.company} ({it.medicine.category})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                        {it.quantity}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700">
                        ₹{Number(it.price).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-slate-900">
                        ₹{(Number(it.price) * it.quantity).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200 font-extrabold">
                  <tr>
                    <td colSpan={4} className="py-3 px-3 text-right text-slate-700">
                      Grand Total Amount (Tax Incl.):
                    </td>
                    <td className="py-3 px-3 text-right text-sm text-[#0F6E56]">
                      ₹{Number(selectedPO.total).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {selectedPO.notes && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                <span className="font-bold text-slate-800 block mb-0.5">Order Terms & Notes:</span>
                {selectedPO.notes}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

