"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import {
  Layers,
  Search,
  Plus,
  AlertTriangle,
  Clock,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Edit2,
  Trash2,
  Lock,
  ArrowUpDown,
  Filter,
  Building2,
  ChevronLeft,
  ChevronRight,
  Info,
  DollarSign,
  PackageCheck,
  Calendar,
  SlidersHorizontal,
} from "lucide-react";
import { useBranchStore } from "@/stores/useBranchStore";

interface MedicineOption {
  id: number;
  name: string;
  genericName?: string | null;
  company: string;
  category: string;
}

interface BatchRecord {
  id: number;
  batchNo: string;
  mfgDate?: string | null;
  expiryDate: string;
  quantity: number;
  mrp: number;
  purchasePrice?: number | null;
  supplierId?: number | null;
  branchId?: number | null;
  tier: "expired" | "critical_30" | "warning_90" | "safe";
  daysRemaining: number;
  expiryLabel: string;
  isExpired: boolean;
  locked: boolean;
  medicine: {
    id: number;
    name: string;
    genericName?: string | null;
    company: string;
    category: string;
    rackLocation?: string | null;
    gstPercent: number;
  };
  branch?: {
    id: number;
    code: string;
    name: string;
  } | null;
  supplier?: {
    id: number;
    name: string;
  } | null;
}

interface SummaryData {
  totalBatches: number;
  totalUnits: number;
  expiredCount: number;
  expiredUnits: number;
  criticalCount: number;
  warningCount: number;
  safeCount: number;
  outOfStockCount: number;
  lowStockCount?: number;
  estimatedLossValue: number;
}

export default function BatchesAndExpiryPage() {
  const { activeBranch } = useBranchStore();
  const [isPending, startTransition] = useTransition();

  // Data & State
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [medicinesList, setMedicinesList] = useState<MedicineOption[]>([]);
  const [branchesList, setBranchesList] = useState<{ id: number; code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [canViewCostPrice, setCanViewCostPrice] = useState(false);

  // Pagination & Filtering
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [selectedTier, setSelectedTier] = useState<string>("all");
  const [selectedStock, setSelectedStock] = useState<string>("all");
  const [fefoSort, setFefoSort] = useState(true);

  // Summary Metrics
  const [summary, setSummary] = useState<SummaryData>({
    totalBatches: 0,
    totalUnits: 0,
    expiredCount: 0,
    expiredUnits: 0,
    criticalCount: 0,
    warningCount: 0,
    safeCount: 0,
    outOfStockCount: 0,
    estimatedLossValue: 0,
  });

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<BatchRecord | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [deleteConfirmBatch, setDeleteConfirmBatch] = useState<BatchRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form Fields (Resilient string states so typing '0' or decimals never jumps)
  const [formData, setFormData] = useState({
    medicineId: "",
    batchNo: "",
    mfgDate: "",
    expiryDate: "",
    quantity: "10",
    purchasePrice: "0",
    mrp: "0",
    branchId: "",
  });

  // Load Medicine Catalog for Add/Edit Dropdown
  const fetchAuxiliaryData = useCallback(async () => {
    try {
      const [medRes, branchRes] = await Promise.all([
        fetch("/api/admin/medicines?limit=100"),
        fetch("/api/admin/branches"),
      ]);
      const medJson = await medRes.json();
      const branchJson = await branchRes.json();

      if (medJson.success && medJson.data) {
        setMedicinesList(
          medJson.data.map((m: any) => ({
            id: m.id,
            name: m.name,
            genericName: m.genericName,
            company: m.company,
            category: m.category,
          }))
        );
      }
      if (branchJson.success && branchJson.data) {
        setBranchesList(branchJson.data);
      }
    } catch (e) {
      console.error("Auxiliary fetch failed", e);
    }
  }, []);

  // Main Data Fetcher
  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "25");
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (selectedBranch !== "all") params.set("branchId", selectedBranch);
      if (selectedTier !== "all") params.set("tier", selectedTier);
      if (selectedStock !== "all") params.set("stock", selectedStock);
      if (fefoSort) params.set("fefo", "true");

      const res = await fetch(`/api/admin/batches?${params.toString()}`);
      const json = await res.json();

      if (json.success) {
        setBatches(json.data || []);
        setTotalPages(json.pagination?.totalPages || 1);
        setTotalCount(json.pagination?.total || 0);
        if (json.summary) setSummary(json.summary);
        setCanViewCostPrice(Boolean(json.canViewCostPrice));
        setPageError(null);
      } else {
        setPageError(json.message || "Failed to load batches.");
      }
    } catch (e: any) {
      console.error("Batch fetch error:", e);
      setPageError(e.message || "Network exception fetching batches.");
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, selectedBranch, selectedTier, selectedStock, fefoSort]);

  useEffect(() => {
    fetchAuxiliaryData();
  }, [fetchAuxiliaryData]);

  useEffect(() => {
    // Sync with global header branch store if user changes active branch
    if (activeBranch?.id && selectedBranch === "all") {
      setSelectedBranch(activeBranch.id.toString());
    }
  }, [activeBranch?.id]);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchBatches();
    }, 250);
    return () => clearTimeout(handler);
  }, [fetchBatches]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingBatch(null);
    setFormError(null);
    setFormData({
      medicineId: medicinesList[0]?.id ? medicinesList[0].id.toString() : "",
      batchNo: "",
      mfgDate: "",
      expiryDate: "",
      quantity: "10",
      purchasePrice: "0",
      mrp: "0",
      branchId: selectedBranch !== "all" ? selectedBranch : branchesList[0]?.id ? branchesList[0].id.toString() : "",
    });
    setModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (batch: BatchRecord) => {
    setEditingBatch(batch);
    setFormError(null);
    setFormData({
      medicineId: batch.medicine.id.toString(),
      batchNo: batch.batchNo,
      mfgDate: batch.mfgDate ? batch.mfgDate.split("T")[0] : "",
      expiryDate: batch.expiryDate ? batch.expiryDate.split("T")[0] : "",
      quantity: batch.quantity.toString(),
      purchasePrice:
        batch.purchasePrice !== null && batch.purchasePrice !== undefined
          ? batch.purchasePrice.toString()
          : "",
      mrp: batch.mrp.toString(),
      branchId: batch.branch?.id ? batch.branch.id.toString() : "",
    });
    setModalOpen(true);
  };

  // Submit Add / Edit Form
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const qtyNum = parseInt(formData.quantity, 10);
    if (isNaN(qtyNum) || qtyNum < 0) {
      setFormError("Quantity must be a valid non-negative integer (>= 0).");
      return;
    }

    const mrpNum = parseFloat(formData.mrp);
    if (isNaN(mrpNum) || mrpNum < 0) {
      setFormError("MRP must be a valid non-negative number.");
      return;
    }

    let purchasePriceNum = 0;
    if (canViewCostPrice && formData.purchasePrice !== "") {
      purchasePriceNum = parseFloat(formData.purchasePrice);
      if (isNaN(purchasePriceNum) || purchasePriceNum < 0) {
        setFormError("Cost price must be a valid non-negative number.");
        return;
      }
    }

    setFormSubmitting(true);

    try {
      const endpoint = "/api/admin/batches";
      const method = editingBatch ? "PUT" : "POST";
      const payload: any = {
        medicineId: parseInt(formData.medicineId, 10),
        batchNo: formData.batchNo.trim(),
        mfgDate: formData.mfgDate || null,
        expiryDate: formData.expiryDate,
        quantity: qtyNum,
        mrp: mrpNum,
        branchId: formData.branchId ? parseInt(formData.branchId, 10) : null,
      };

      if (canViewCostPrice && (!editingBatch || formData.purchasePrice !== "")) {
        payload.purchasePrice = purchasePriceNum;
      }

      if (editingBatch) {
        payload.id = editingBatch.id;
      }

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setFormError(json.message || "Failed to save batch record.");
        return;
      }

      setModalOpen(false);
      setToastMessage(editingBatch ? "Batch updated successfully!" : "New batch added successfully!");
      setTimeout(() => setToastMessage(null), 4000);
      fetchBatches();
    } catch (err: any) {
      setFormError(err.message || "Network exception saving batch.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Trigger in-page delete confirmation dialog
  const handleDeleteBatch = (batch: BatchRecord) => {
    setDeleteConfirmBatch(batch);
  };

  // Safe Delete Batch (In-page confirmation)
  const confirmDeleteBatch = async () => {
    if (!deleteConfirmBatch) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/admin/batches?id=${deleteConfirmBatch.id}`, { method: "DELETE" });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setPageError(json.message || "Failed to delete batch.");
        setDeleteConfirmBatch(null);
        return;
      }

      setToastMessage(`Batch "${deleteConfirmBatch.batchNo}" deleted successfully.`);
      setTimeout(() => setToastMessage(null), 3000);
      setDeleteConfirmBatch(null);
      fetchBatches();
    } catch (err: any) {
      setPageError("Error deleting batch: " + err.message);
      setDeleteConfirmBatch(null);
    } finally {
      setIsDeleting(false);
    }
  };

  // Expiry Tier Badge Component
  const renderTierBadge = (tier: string, daysRemaining: number, isExpired: boolean) => {
    if (isExpired || tier === "expired") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
          <Lock className="w-3 h-3 text-rose-600" />
          EXPIRED ({Math.abs(daysRemaining)}d ago)
        </span>
      );
    }
    if (tier === "critical_30") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
          <AlertTriangle className="w-3 h-3 text-amber-600" />
          CRITICAL ({daysRemaining}d left)
        </span>
      );
    }
    if (tier === "warning_90") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-300">
          <Clock className="w-3 h-3 text-yellow-600" />
          WARNING ({daysRemaining}d left)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
        SAFE ({daysRemaining}d)
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-sans">
      {/* Top Banner / Toast Notification */}
      {toastMessage && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-sm transition-all">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Error Alert Banner */}
      {pageError && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold shadow-sm transition-all">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{pageError}</span>
          </div>
          <button
            type="button"
            onClick={() => setPageError(null)}
            className="text-rose-600 hover:text-rose-900 font-extrabold cursor-pointer ml-3 text-sm"
          >
            &times;
          </button>
        </div>
      )}

      {/* Screen Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-[#0F6E56]" />
            Multi-Batch Inventory & FEFO Expiry Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Track manufacturer batches, FEFO first-expiry dispensing algorithms, multi-branch stock levels, and expiry alerts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchBatches}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-[#0F6E56] hover:bg-[#0b5643] text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Batch</span>
          </button>
        </div>
      </div>

      {/* 4-Tier Expiry & Inventory Metric Summary Cards (1.8.3) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Active Batches */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <PackageCheck className="w-5 h-5 text-[#0F6E56]" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">
              {summary.totalBatches.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Total Batches ({summary.totalUnits.toLocaleString()} units in stock)
            </div>
          </div>
        </div>

        {/* Expired Batches (Red) */}
        <div className="bg-white border border-rose-200 rounded-2xl p-4.5 shadow-2xs flex items-center gap-3.5 bg-gradient-to-br from-white to-rose-50/30">
          <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-rose-700">{summary.expiredCount}</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                Locked
              </span>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Expired ({summary.expiredUnits} units • Est. Loss ₹{summary.estimatedLossValue.toLocaleString()})
            </div>
          </div>
        </div>

        {/* Critical < 30 Days (Orange) */}
        <div className="bg-white border border-amber-200 rounded-2xl p-4.5 shadow-2xs flex items-center gap-3.5 bg-gradient-to-br from-white to-amber-50/30">
          <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-amber-700">{summary.criticalCount}</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                &le; 30 Days
              </span>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Critical (Return to Supplier Prompt)
            </div>
          </div>
        </div>

        {/* Warning < 90 Days (Yellow) */}
        <div className="bg-white border border-yellow-200 rounded-2xl p-4.5 shadow-2xs flex items-center gap-3.5 bg-gradient-to-br from-white to-yellow-50/30">
          <div className="w-11 h-11 rounded-xl bg-yellow-100 text-yellow-700 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-yellow-700">{summary.warningCount}</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                &le; 90 Days
              </span>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Warning Expiry (Prioritize Dispensing)
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5 shadow-xs">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by Batch No, Medicine Name, Generic, Manufacturer..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0F6E56]"
            />
          </div>

          {/* Branch Filter */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value);
                setPage(1);
              }}
              className="w-full md:w-48 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0F6E56]"
            >
              <option value="all">All Store Branches</option>
              {branchesList.map((b) => (
                <option key={b.id} value={b.id.toString()}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          {/* FEFO Toggle Switch */}
          <button
            type="button"
            onClick={() => setFefoSort(!fefoSort)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition ${
              fefoSort
                ? "bg-[#EAF5F0] text-[#0F6E56] border border-emerald-300"
                : "bg-slate-100 text-slate-600 border border-slate-200"
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>FEFO Sorting: {fefoSort ? "Active (Earliest Expiry)" : "Standard (Recent)"}</span>
          </button>
        </div>

        {/* Quick Filter Pills (Tier & Stock) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Expiry Tier:
            </span>
            {[
              { id: "all", label: "All Tiers" },
              { id: "expired", label: "Expired Only" },
              { id: "critical_30", label: "Critical (< 30d)" },
              { id: "warning_90", label: "Warning (< 90d)" },
              { id: "safe", label: "Safe Stock" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelectedTier(p.id);
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  selectedTier === p.id
                    ? "bg-slate-900 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 mr-1">Stock Status:</span>
            {[
              { id: "all", label: "All" },
              { id: "in_stock", label: "In Stock (> 0)" },
              { id: "low_stock", label: "Low Stock (≤ 10)" },
              { id: "out_of_stock", label: "Out of Stock (0)" },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSelectedStock(s.id);
                  setPage(1);
                }}
                className={`px-2 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  selectedStock === s.id
                    ? "bg-[#0F6E56] text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Batches Data Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Medicine Catalog Item</th>
                <th className="py-3 px-4">Batch Number</th>
                <th className="py-3 px-4">Store Branch</th>
                <th className="py-3 px-4 text-center">Available Quantity</th>
                <th className="py-3 px-4">Expiry Date & Countdown</th>
                <th className="py-3 px-4">Alert Tier</th>
                <th className="py-3 px-4 text-right">Pricing (MRP)</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin text-[#0F6E56] mx-auto mb-2" />
                    <span>Loading multi-batch inventory...</span>
                  </td>
                </tr>
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold">No batches found matching filter criteria.</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Try resetting your search query, branch selector, or expiry tier filter.
                    </p>
                  </td>
                </tr>
              ) : (
                batches.map((batch) => (
                  <tr
                    key={batch.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      batch.isExpired ? "bg-rose-50/30" : ""
                    }`}
                  >
                    {/* Medicine Info */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{batch.medicine.name}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span>{batch.medicine.company}</span>
                        {batch.medicine.genericName && (
                          <>
                            <span>•</span>
                            <span className="italic">{batch.medicine.genericName}</span>
                          </>
                        )}
                      </div>
                      {batch.medicine.rackLocation && (
                        <span className="inline-block text-[10px] font-mono text-[#0F6E56] bg-emerald-50 px-1.5 py-0.5 rounded mt-1 border border-emerald-100">
                          {batch.medicine.rackLocation}
                        </span>
                      )}
                    </td>

                    {/* Batch No */}
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-xs">
                        {batch.batchNo}
                      </span>
                    </td>

                    {/* Branch */}
                    <td className="py-3.5 px-4">
                      {batch.branch ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          {batch.branch.name} ({batch.branch.code})
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Global</span>
                      )}
                    </td>

                    {/* Quantity */}
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-xl font-extrabold text-xs ${
                          batch.quantity === 0
                            ? "bg-slate-100 text-slate-500 line-through"
                            : batch.quantity <= 10
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        }`}
                      >
                        {batch.quantity} units
                      </span>
                    </td>

                    {/* Expiry Date */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {batch.expiryDate}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {batch.mfgDate ? `Mfg: ${batch.mfgDate}` : "Mfg: N/A"}
                      </div>
                    </td>

                    {/* Alert Tier */}
                    <td className="py-3.5 px-4">
                      {renderTierBadge(batch.tier, batch.daysRemaining, batch.isExpired)}
                    </td>

                    {/* Pricing */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold text-slate-900">₹{batch.mrp.toFixed(2)}</div>
                      {canViewCostPrice && batch.purchasePrice !== null && (
                        <div className="text-[11px] text-slate-500 font-medium">
                          Cost: ₹{Number(batch.purchasePrice).toFixed(2)}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <a
                        href={`/admin/adjustments?batchId=${batch.id}&medicineId=${batch.medicine.id}`}
                        className="inline-flex p-1.5 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition cursor-pointer"
                        title="Adjust Stock / Physical Reconciliation"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                      </a>

                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(batch)}
                        className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer"
                        title="Edit Batch Details"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteBatch(batch)}
                        className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title="Delete Batch"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-200 bg-slate-50/50">
          <div className="text-xs text-slate-500 font-medium">
            Showing <span className="font-bold text-slate-800">{batches.length}</span> of{" "}
            <span className="font-bold text-slate-800">{totalCount}</span> total batches across outlets.
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <span className="text-xs font-bold text-slate-700 px-2">
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Batch Modal Dialog with In-Modal Error Feedback */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 mb-4">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#0F6E56]" />
                {editingBatch ? `Edit Batch: ${editingBatch.batchNo}` : "Create New Medicine Batch"}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* In-Modal Error Alert (Rule 3: Always render inside open modal above fields!) */}
            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-4">
              {/* Medicine Catalog Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Medicine Catalog Item <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  disabled={Boolean(editingBatch)}
                  value={formData.medicineId}
                  onChange={(e) => setFormData({ ...formData, medicineId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0F6E56] disabled:bg-slate-100"
                >
                  <option value="">Select Medicine...</option>
                  {medicinesList.map((m) => (
                    <option key={m.id} value={m.id.toString()}>
                      {m.name} ({m.company}) - {m.category}
                    </option>
                  ))}
                </select>
              </div>

              {/* Batch No & Branch */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Batch Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.batchNo}
                    onChange={(e) => setFormData({ ...formData, batchNo: e.target.value })}
                    placeholder="e.g. BATCH-2024A"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono uppercase text-slate-900 focus:outline-none focus:border-[#0F6E56]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Store Branch <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.branchId}
                    onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0F6E56]"
                  >
                    <option value="">Select Store Branch...</option>
                    {branchesList.map((b) => (
                      <option key={b.id} value={b.id.toString()}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mfg Date & Expiry Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Manufacturing Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={formData.mfgDate}
                    onChange={(e) => setFormData({ ...formData, mfgDate: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0F6E56]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Expiry Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0F6E56]"
                  />
                </div>
              </div>

              {/* Quantity, Purchase Cost & MRP (Accepts 0 cleanly and avoids fallback jumps) */}
              <div className={`grid ${canViewCostPrice ? "grid-cols-3" : "grid-cols-2"} gap-3`}>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Quantity <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        quantity: e.target.value,
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0F6E56]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    MRP (₹) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    required
                    value={formData.mrp}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        mrp: e.target.value,
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0F6E56]"
                  />
                </div>

                {canViewCostPrice && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Cost Price (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={formData.purchasePrice}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          purchasePrice: e.target.value,
                        })
                      }
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0F6E56]"
                    />
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#0F6E56] hover:bg-[#0b5643] text-white text-xs font-bold shadow-xs transition disabled:opacity-50 cursor-pointer"
                >
                  {formSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingBatch ? "Save Changes" : "Create Batch"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Safe Delete In-Page Confirmation Modal (Rule 3) */}
      {deleteConfirmBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Delete Batch Record</h3>
                <p className="text-xs text-slate-500">Physical removal from inventory</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Are you sure you want to delete batch{" "}
              <strong className="text-slate-900 font-mono font-bold">"{deleteConfirmBatch.batchNo}"</strong> for{" "}
              <strong className="text-slate-900">{deleteConfirmBatch.medicine.name}</strong>?
              This action cannot be undone. Batches with historical sales or returns are protected and cannot be deleted.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirmBatch(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteBatch}
                className="flex items-center gap-1.5 px-4.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
