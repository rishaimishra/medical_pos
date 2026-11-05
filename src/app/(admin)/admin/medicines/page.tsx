"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Pill,
  Search,
  Plus,
  FileSpreadsheet,
  Download,
  Upload,
  Edit2,
  Trash2,
  ShieldAlert,
  Layers,
  MapPin,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  Boxes,
  HelpCircle,
  Clock,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  GitBranch,
  Building2,
  Calendar,
  DollarSign,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useBranchStore } from "@/stores/useBranchStore";

interface MedicineItem {
  id: number;
  name: string;
  genericName: string | null;
  company: string;
  category: string;
  customCategory: string | null;
  hsnCode: string | null;
  gstPercent: number;
  description: string;
  rackLocation: string | null;
  scheduleType: string;
  requiresPrescription: boolean;
  packaging: {
    packUnit: string;
    looseUnit: string;
    unitsPerPack: number;
    minStockLevel: number;
    loosePrice: number | null;
  };
  rackDetails: {
    rackNo: string;
    shelfNo: string;
    boxNo: string;
  };
  stockSummary: {
    totalQuantity: number;
    batchCount: number;
    activeBatchCount: number;
    nearestExpiry: string | null;
    minMrp: number | null;
    maxMrp: number | null;
    isLowStock: boolean;
    isOutOfStock: boolean;
  };
  batches?: Array<{
    id: number;
    batchNo: string;
    quantity: number;
    expiryDate: string;
    mrp: number;
    purchasePrice: number;
    branchId: number | null;
    branch?: { id: number; code: string; name: string } | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface CategoryOption {
  id: number;
  name: string;
  type: string;
}

interface ImportPreviewRow {
  rowIdx: number;
  name: string;
  genericName?: string;
  company: string;
  category: string;
  hsnCode?: string;
  gstPercent: number;
  rackLocation?: string;
  scheduleType: string;
  packUnit: string;
  looseUnit: string;
  unitsPerPack: number;
  status: "ready" | "duplicate" | "invalid";
  reason?: string;
}

export default function MedicinesCatalogPage() {
  const { user } = useAuthStore();
  const { activeBranch, branches } = useBranchStore();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Multi-Branch Scope: 'active' filters to activeBranch; 'all' aggregates across all outlets
  const [scopeFilter, setScopeFilter] = useState<"active" | "all">("active");
  const [selectedMedForBatches, setSelectedMedForBatches] = useState<MedicineItem | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [scheduleFilter, setScheduleFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, totalPages: 1, totalItems: 0 });

  // Data lists
  const [medicines, setMedicines] = useState<MedicineItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [stats, setStats] = useState({ totalMedicines: 0, totalBatches: 0, prescriptionCount: 0 });

  // 300ms Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch medicines with active branch context
  const fetchMedicines = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const branchParam =
        scopeFilter === "all"
          ? "all"
          : activeBranch?.id
          ? activeBranch.id.toString()
          : "all";

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: "25",
        search: debouncedSearch,
        category: categoryFilter,
        scheduleType: scheduleFilter,
        stock: stockFilter,
        branchId: branchParam,
      });

      const res = await fetch(`/api/admin/medicines?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load medicine catalog.");
      }

      setMedicines(json.data || []);
      setPagination(json.pagination || { page: 1, limit: 25, totalPages: 1, totalItems: 0 });
      setStats(json.stats || { totalMedicines: 0, totalBatches: 0, prescriptionCount: 0 });
      setCategories(json.categories || []);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to fetch medicines.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, categoryFilter, scheduleFilter, stockFilter, activeBranch?.id, scopeFilter]);

  useEffect(() => {
    fetchMedicines();
  }, [fetchMedicines]);

  // ── Modal State: Add / Edit Medicine ───────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [editingMed, setEditingMed] = useState<MedicineItem | null>(null);

  // ── Import Modal State ────────────────────────────────────────────────────
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importModalError, setImportModalError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importStep, setImportStep] = useState<"upload" | "preview">("upload");
  const [csvRawText, setCsvRawText] = useState("");
  const [importPreviewRows, setImportPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [importSummary, setImportSummary] = useState({
    totalRows: 0,
    readyToImport: 0,
    duplicatesSkipped: 0,
    invalidSkipped: 0,
  });

  const initialForm = {
    name: "",
    genericName: "",
    company: "",
    category: "Tablet",
    customCategory: "",
    hsnCode: "30049099",
    gstPercent: 12,
    scheduleType: "normal",
    packUnit: "Strip",
    looseUnit: "Tablet",
    unitsPerPack: 10,
    minStockLevel: 10,
    rackNo: "",
    shelfNo: "",
    boxNo: "",
    description: "",
  };
  const [formData, setFormData] = useState(initialForm);

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (modalOpen) setModalOpen(false);
        if (importModalOpen) setImportModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen, importModalOpen]);

  const handleOpenAddModal = () => {
    setEditingMed(null);
    setFormData(initialForm);
    setModalError(null);
    setModalOpen(true);
  };

  const handleOpenEditModal = (m: MedicineItem) => {
    setEditingMed(m);
    setFormData({
      name: m.name,
      genericName: m.genericName || "",
      company: m.company,
      category: m.category,
      customCategory: m.customCategory || "",
      hsnCode: m.hsnCode || "30049099",
      gstPercent: m.gstPercent,
      scheduleType: m.scheduleType || "normal",
      packUnit: m.packaging.packUnit || "Strip",
      looseUnit: m.packaging.looseUnit || "Tablet",
      unitsPerPack: m.packaging.unitsPerPack || 10,
      minStockLevel: m.packaging.minStockLevel !== undefined ? m.packaging.minStockLevel : 10,
      rackNo: m.rackDetails.rackNo || "",
      shelfNo: m.rackDetails.shelfNo || "",
      boxNo: m.rackDetails.boxNo || "",
      description: m.description || "",
    });
    setModalError(null);
    setModalOpen(true);
  };

  const handleSaveMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setErrorMsg(null);
      setModalError(null);

      const url = "/api/admin/medicines";
      const method = editingMed ? "PUT" : "POST";
      const payload = editingMed ? { id: editingMed.id, ...formData } : formData;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to save medicine record.");
      }

      setSuccessMsg(json.message);
      setModalOpen(false);
      fetchMedicines();
    } catch (err: any) {
      setModalError(err.message || "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMedicine = async (m: MedicineItem) => {
    if (m.stockSummary.batchCount > 0) {
      window.alert(
        `Safety Protection: Cannot delete "${m.name}" because ${m.stockSummary.batchCount} active/historical batch(es) exist for it. Please clear the batches first.`
      );
      return;
    }

    if (!window.confirm(`Are you sure you want to permanently delete "${m.name}"? This action is audited.`)) {
      return;
    }

    try {
      setErrorMsg(null);
      const res = await fetch(`/api/admin/medicines?id=${m.id}`, { method: "DELETE" });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to delete medicine.");
      }

      setSuccessMsg(json.message);
      fetchMedicines();
    } catch (err: any) {
      setErrorMsg(err.message || "Delete failed.");
    }
  };

  const handleProcessUploadedFile = (file: File) => {
    if (!file) return;
    setImportModalError(null);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      setCsvRawText(text);
      await handlePreviewImport(text);
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleProcessUploadedFile(file);
  };

  const handlePreviewImport = async (text: string) => {
    try {
      setSubmitting(true);
      setErrorMsg(null);
      setImportModalError(null);

      const res = await fetch("/api/admin/medicines/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", csvContent: text }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to parse CSV preview.");
      }

      setImportPreviewRows(json.rows || []);
      setImportSummary(json.summary || { totalRows: 0, readyToImport: 0, duplicatesSkipped: 0, invalidSkipped: 0 });
      setImportStep("preview");
    } catch (err: any) {
      setImportModalError(err.message || "CSV processing failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmImport = async () => {
    try {
      setSubmitting(true);
      setErrorMsg(null);
      setImportModalError(null);

      const res = await fetch("/api/admin/medicines/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commit", rows: importPreviewRows }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to commit import.");
      }

      setSuccessMsg(json.message);
      setImportModalOpen(false);
      setImportStep("upload");
      fetchMedicines();
    } catch (err: any) {
      setImportModalError(err.message || "Import execution failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-16 font-sans">
      {/* ── 1. Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Medicine Master Catalog
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[#1F4E5B]/10 text-[#1F4E5B] text-[10px] font-black tracking-wider uppercase">
              Screen 9 • Catalog Master
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Administer brand trade names, chemical compositions, rack/shelf locators, packaging ratios, and regulatory schedules.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Sample CSV */}
          <a
            href="/api/admin/medicines/sample-csv"
            download
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-2xs"
            title="Download standard CSV import template"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Sample CSV</span>
          </a>

          {/* Export CSV */}
          <a
            href={
              scopeFilter === "active" && activeBranch?.id
                ? `/api/admin/medicines/export?branchId=${activeBranch.id}`
                : "/api/admin/medicines/export"
            }
            download
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-2xs"
            title="Export full catalog to CSV with UTF-8 BOM"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export</span>
          </a>

          {/* Import CSV */}
          <button
            type="button"
            onClick={() => {
              setImportStep("upload");
              setImportPreviewRows([]);
              setImportModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[#1F4E5B]" />
            <span>Import CSV</span>
          </button>

          {/* Add Medicine Button */}
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Medicine</span>
          </button>
        </div>
      </div>

      {/* ── 2. Branch Context & Multi-Outlet Selector ── */}
      <div className="p-3.5 rounded-2xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#EAF2F4] text-[#1F4E5B] flex items-center justify-center shrink-0">
            <GitBranch className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Active Inventory Outlet:</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-[#1F4E5B] text-white">
                {scopeFilter === "active" && activeBranch
                  ? `${activeBranch.name} (${activeBranch.code})`
                  : "All Outlets Combined (Global HQ View)"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {scopeFilter === "active" && activeBranch
                ? `Showing inventory stock physically present at ${activeBranch.name}. Switching branches in the top navbar updates this stock view immediately.`
                : "Aggregating medicine stock and batch counts across all store locations in your network."}
            </p>
          </div>
        </div>

        {/* Scope Toggle for Admins & Global Managers */}
        {(user?.role === "admin" || (user?.role === "manager" && !user?.branchId)) && (
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setScopeFilter("active")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                scopeFilter === "active"
                  ? "bg-white text-[#1F4E5B] shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Outlet: {activeBranch?.code || "Active"}
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter("all")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                scopeFilter === "all" ? "bg-white text-[#1F4E5B] shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Outlets
            </button>
          </div>
        )}
      </div>

      {/* ── 3. Alert Feedback ── */}
      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── 3. Quick Stats Cards (Screen 9 Overview) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Total Medicines */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#EAF2F4] text-[#1F4E5B] flex items-center justify-center shrink-0">
            <Pill className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-900 tracking-tight">{stats.totalMedicines}</div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Catalog Medicines</div>
          </div>
        </div>

        {/* Total In-Stock Batches */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-100">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-900 tracking-tight">{stats.totalBatches}</div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Active Stock Batches</div>
          </div>
        </div>

        {/* Prescription Required (Schedule H/H1) */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-100">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-900 tracking-tight">{stats.prescriptionCount}</div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Prescription Required (Rx)</div>
          </div>
        </div>
      </div>

      {/* ── 4. Search & Multi-Filter Bar ── */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        {/* Search */}
        <div className="flex-1 min-w-[260px] relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by brand name, generic composition, company, rack..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none bg-slate-50/50"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
            <Pill className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-slate-800 font-medium text-xs focus:outline-none cursor-pointer"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name} {c.type === "custom" ? "(Custom)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Schedule Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
            <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={scheduleFilter}
              onChange={(e) => {
                setScheduleFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-slate-800 font-medium text-xs focus:outline-none cursor-pointer"
            >
              <option value="all">All Schedules</option>
              <option value="normal">Regular OTC</option>
              <option value="schedule_h">Schedule H (Rx)</option>
              <option value="schedule_h1">Schedule H1 (High Alert Rx)</option>
              <option value="narcotic">Narcotic / Controlled</option>
            </select>
          </div>

          {/* Stock Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
            <Boxes className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={stockFilter}
              onChange={(e) => {
                setStockFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-slate-800 font-medium text-xs focus:outline-none cursor-pointer"
            >
              <option value="all">All Stock Status</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock (≤ Threshold)</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
          </div>

          {/* Refresh */}
          <button
            type="button"
            onClick={fetchMedicines}
            disabled={loading}
            className="p-2 rounded-xl text-slate-500 hover:text-[#1F4E5B] hover:bg-slate-100 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── 5. Main Catalog Data Grid ── */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-[#1F4E5B]" />
            <p className="text-xs font-bold text-slate-600">Loading medicine catalog...</p>
          </div>
        ) : medicines.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#EAF2F4] text-[#1F4E5B] flex items-center justify-center">
              <Pill className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No medicines found</h3>
            <p className="text-xs text-slate-400 max-w-sm">
              Your medicine catalog is currently empty or no items match your search filters. Click &quot;Add Medicine&quot; or &quot;Import CSV&quot; to begin.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="px-4 py-2 rounded-xl bg-[#1F4E5B] text-white text-xs font-bold hover:bg-[#163a44] transition-all cursor-pointer"
              >
                + Add First Medicine
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Medicine Name & Form</th>
                  <th className="py-3 px-4">Generic Composition & Company</th>
                  <th className="py-3 px-3">Rack & Shelf Locator</th>
                  <th className="py-3 px-3">Packaging & Loose Ratio</th>
                  <th className="py-3 px-3 text-center">Schedule / Rx</th>
                  <th className="py-3 px-3 text-center">Inventory Stock</th>
                  <th className="py-3 px-4 text-right sticky right-0 bg-slate-50/95 shadow-[-6px_0_12px_-4px_rgba(0,0,0,0.06)] z-10">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {medicines.map((m) => {
                  const isRx = m.requiresPrescription;
                  const scheduleBadge =
                    m.scheduleType === "schedule_h1"
                      ? "bg-rose-100 text-rose-800 border-rose-200 font-black"
                      : m.scheduleType === "schedule_h"
                      ? "bg-amber-100 text-amber-800 border-amber-200 font-black"
                      : m.scheduleType === "narcotic"
                      ? "bg-purple-100 text-purple-900 border-purple-200 font-black"
                      : "bg-slate-100 text-slate-600 border-slate-200 font-medium";

                  const scheduleLabel =
                    m.scheduleType === "schedule_h1"
                      ? "Schedule H1 [Rx]"
                      : m.scheduleType === "schedule_h"
                      ? "Schedule H [Rx]"
                      : m.scheduleType === "narcotic"
                      ? "Narcotic [Strict]"
                      : "Regular (OTC)";

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Name & Dosage Form */}
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="flex flex-col">
                          <span className="text-xs font-extrabold text-slate-900">{m.name}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#EAF2F4] text-[#1F4E5B] font-black uppercase">
                              {m.category}
                            </span>
                            {m.hsnCode && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                HSN: {m.hsnCode}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 font-mono">
                              GST {m.gstPercent}%
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Generic & Manufacturer */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800 text-[11px]">
                            {m.genericName || "—"}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">{m.company}</span>
                        </div>
                      </td>

                      {/* Rack & Shelf Locator (1.6.2) */}
                      <td className="py-3.5 px-3">
                        {m.rackLocation ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-mono text-[10px] font-bold border border-slate-200">
                            <MapPin className="w-3 h-3 text-[#1F4E5B] shrink-0" />
                            <span>{m.rackLocation}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Unassigned</span>
                        )}
                      </td>

                      {/* Packaging & Loose Ratio (1.6.3) */}
                      <td className="py-3.5 px-3">
                        <div className="flex flex-col text-[11px]">
                          <span className="font-bold text-slate-800">
                            1 {m.packaging.packUnit} = {m.packaging.unitsPerPack} {m.packaging.looseUnit}s
                          </span>
                          {m.packaging.loosePrice ? (
                            <span className="text-[10px] text-emerald-700 font-mono">
                              ₹{m.packaging.loosePrice} / {m.packaging.looseUnit}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">MRP on batch entry</span>
                          )}
                        </div>
                      </td>

                      {/* Schedule Type (1.6.4) */}
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] border ${scheduleBadge}`}
                        >
                          {scheduleLabel}
                        </span>
                      </td>

                      {/* Stock Summary */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="flex flex-col items-center">
                          <span
                            className={`font-mono font-black text-xs ${
                              m.stockSummary.isOutOfStock
                                ? "text-rose-600"
                                : m.stockSummary.isLowStock
                                ? "text-amber-600"
                                : "text-emerald-700"
                            }`}
                          >
                            {m.stockSummary.totalQuantity} {m.packaging.looseUnit}s
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedMedForBatches(m)}
                            className="text-[10px] text-slate-500 hover:text-[#1F4E5B] hover:underline cursor-pointer flex items-center gap-1 mt-0.5"
                            title="Click to view batches breakdown across branches"
                          >
                            <Layers className="w-2.5 h-2.5 text-[#1F4E5B]" />
                            <span>{m.stockSummary.activeBatchCount} batch(es)</span>
                          </button>
                        </div>
                      </td>

                      {/* Sticky Right Actions */}
                      <td className="py-3.5 px-4 text-right sticky right-0 bg-white/95 shadow-[-6px_0_12px_-4px_rgba(0,0,0,0.06)] z-10">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(m)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-[#1F4E5B] transition-colors cursor-pointer"
                            title="Edit Medicine Details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMedicine(m)}
                            disabled={m.stockSummary.batchCount > 0 || m.stockSummary.totalQuantity > 0}
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            title={
                              m.stockSummary.batchCount > 0 || m.stockSummary.totalQuantity > 0
                                ? "Cannot delete: Batches or inventory stock exist for this medicine"
                                : "Delete Medicine"
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {pagination.totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>
              Showing {(currentPage - 1) * pagination.limit + 1} to{" "}
              {Math.min(currentPage * pagination.limit, pagination.totalItems)} of {pagination.totalItems} medicines
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold px-2">
                Page {currentPage} of {pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={currentPage >= pagination.totalPages}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          MODAL 1: ADD / EDIT MEDICINE (Screen 9 Modal with Pinned Header & Footer)
      ─────────────────────────────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header: Pinned at top */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#EAF2F4] text-[#1F4E5B] flex items-center justify-center shrink-0">
                  <Pill className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    {editingMed ? "Edit Medicine Master" : "Add Medicine to Catalog"}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Set up clinical composition, physical rack placement, and packaging ratios.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form: Wraps scrollable body and pinned footer */}
            <form onSubmit={handleSaveMedicine} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Scrollable Modal Body */}
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4.5 [scrollbar-width:thin] [scrollbar-color:rgba(31,78,91,0.2)_transparent]">
                {/* In-Modal Error Feedback */}
                {modalError && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="flex-1 font-semibold">{modalError}</div>
                  </div>
                )}
                {/* 1. Basic Information */}
                <div className="space-y-3">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                    1. Brand Trade & Composition
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* Brand Name */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Medicine Brand / Trade Name *</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. Paracetamol 500mg, Augmentin 625"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                      />
                    </div>

                    {/* Generic Name */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Generic Chemical Formula</label>
                      <input
                        type="text"
                        value={formData.genericName}
                        onChange={(e) => setFormData({ ...formData, genericName: e.target.value })}
                        placeholder="e.g. Acetaminophen, Amoxicillin + Clavulanate"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                      />
                    </div>

                    {/* Manufacturer Company */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Manufacturer / Company *</label>
                      <input
                        type="text"
                        required
                        value={formData.company}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        placeholder="e.g. Cipla Ltd, Sun Pharma, Mankind"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                      />
                    </div>

                    {/* Dosage Category */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Dosage Form / Category *</label>
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none bg-white cursor-pointer"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Custom Category Input if "Other" */}
                    {formData.category === "Other" && (
                      <div className="space-y-1 sm:col-span-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                        <label className="block text-xs font-bold text-amber-900">
                          Specify New Custom Category Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.customCategory}
                          onChange={(e) => setFormData({ ...formData, customCategory: e.target.value })}
                          placeholder="e.g. Herbal Powder, Ayurvedic Syrup, Surgical Gauge"
                          className="w-full px-3.5 py-1.5 rounded-lg border border-amber-300 text-xs focus:border-[#1F4E5B] focus:outline-none bg-white"
                        />
                        <p className="text-[10px] text-amber-700 mt-1">
                          This new category will automatically be saved into the categories directory for reuse.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Packaging & Loose Unit Conversion (1.6.3) */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                    2. Packaging & Loose Unit Conversion
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    {/* Primary Pack Unit */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Primary Pack Unit</label>
                      <select
                        value={formData.packUnit}
                        onChange={(e) => setFormData({ ...formData, packUnit: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none bg-white cursor-pointer"
                      >
                        <option value="Strip">Strip</option>
                        <option value="Bottle">Bottle</option>
                        <option value="Box">Box</option>
                        <option value="Vial">Vial / Ampoule</option>
                        <option value="Tube">Tube</option>
                        <option value="Pouch">Pouch / Sachet</option>
                        <option value="Unit">Unit / Piece</option>
                      </select>
                    </div>

                    {/* Loose Sub-unit */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Loose Dispensable Unit</label>
                      <select
                        value={formData.looseUnit}
                        onChange={(e) => setFormData({ ...formData, looseUnit: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none bg-white cursor-pointer"
                      >
                        <option value="Tablet">Tablet</option>
                        <option value="Capsule">Capsule</option>
                        <option value="ml">Milliliter (ml)</option>
                        <option value="gm">Gram (gm)</option>
                        <option value="Dose">Dose</option>
                        <option value="Piece">Piece</option>
                      </select>
                    </div>

                    {/* Ratio */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Units Per Pack *</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={formData.unitsPerPack}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData({
                            ...formData,
                            unitsPerPack: val === "" ? 1 : (isNaN(parseInt(val, 10)) ? 1 : Math.max(1, parseInt(val, 10))),
                          });
                        }}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Example: 1 {formData.packUnit} contains {formData.unitsPerPack} {formData.looseUnit}s. During POS billing, cashiers can sell full {formData.packUnit}s or loose {formData.looseUnit}s with automated fractional stock deduction.
                  </p>
                </div>

                {/* 3. Physical Shelf & Rack Locator (1.6.2) */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                    3. Store Physical Location (Rack Locator)
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Rack / Almirah No</label>
                      <input
                        type="text"
                        value={formData.rackNo}
                        onChange={(e) => setFormData({ ...formData, rackNo: e.target.value })}
                        placeholder="e.g. Rack A-1"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Shelf Number</label>
                      <input
                        type="text"
                        value={formData.shelfNo}
                        onChange={(e) => setFormData({ ...formData, shelfNo: e.target.value })}
                        placeholder="e.g. Shelf 2"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Box / Bin ID</label>
                      <input
                        type="text"
                        value={formData.boxNo}
                        onChange={(e) => setFormData({ ...formData, boxNo: e.target.value })}
                        placeholder="e.g. Bin B-4"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Regulatory Schedule & Taxes (1.6.4) */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                    4. Drug Regulation & GST Tax
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    {/* Schedule */}
                    <div className="space-y-1 sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700">Regulatory Drug Classification *</label>
                      <select
                        value={formData.scheduleType}
                        onChange={(e) => setFormData({ ...formData, scheduleType: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none bg-white cursor-pointer"
                      >
                        <option value="normal">Regular Over-The-Counter (OTC)</option>
                        <option value="schedule_h">Schedule H (Doctor Prescription Mandatory)</option>
                        <option value="schedule_h1">Schedule H1 (Prescription Register & High Alert)</option>
                        <option value="narcotic">Narcotic & Psychotropic Substance (Locked)</option>
                      </select>
                    </div>

                    {/* GST */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Applicable GST % *</label>
                      <select
                        value={formData.gstPercent}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setFormData({ ...formData, gstPercent: isNaN(val) ? 0 : val });
                        }}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none bg-white cursor-pointer font-mono"
                      >
                        <option value="0">0% (Exempt)</option>
                        <option value="5">5% (Life Saving)</option>
                        <option value="12">12% (Standard Medicines)</option>
                        <option value="18">18% (Supplements & Cosmetics)</option>
                      </select>
                    </div>

                    {/* HSN Code */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">HSN Code</label>
                      <input
                        type="text"
                        value={formData.hsnCode}
                        onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                        placeholder="e.g. 30049099"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none font-mono"
                      />
                    </div>

                    {/* Low Stock Alert Threshold */}
                    <div className="space-y-1 sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700">Minimum Stock Alert Threshold</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.minStockLevel}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData({
                            ...formData,
                            minStockLevel: val === "" ? 0 : (isNaN(parseInt(val, 10)) ? 0 : Math.max(0, parseInt(val, 10))),
                          });
                        }}
                        placeholder="e.g. 10"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* 5. Description */}
                <div className="space-y-1 pt-2 border-t border-slate-100">
                  <label className="block text-xs font-bold text-slate-700">Clinical Indication / Description</label>
                  <textarea
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Usage notes, special instructions, storage conditions..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                  />
                </div>
              </div>

              {/* Sticky Modal Footer: Pinned at bottom */}
              <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 bg-slate-50/90 shrink-0">
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  Press <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600 font-mono text-[10px]">Esc</kbd> to cancel
                </span>
                <div className="flex items-center gap-2.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{editingMed ? "Save Changes" : "Add to Catalog"}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────
          MODAL 2: BULK CSV IMPORT & PREVIEW FLOW (Module 1.6.5 & 1.7)
      ─────────────────────────────────────────────────────────────────────── */}
      {importModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setImportModalOpen(false);
          }}
        >
          <div className="w-full max-w-3xl bg-white rounded-3xl border border-slate-200 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Header: Pinned */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#EAF2F4] text-[#1F4E5B] flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    Bulk Medicine Catalog Import
                  </h2>
                  <p className="text-xs text-slate-500">
                    Import medicines from CSV with automated duplicate detection and header mapping.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content: Scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
              {/* In-Modal Error Feedback */}
              {importModalError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1 font-semibold">{importModalError}</div>
                </div>
              )}

              {importStep === "upload" ? (
                <div className="space-y-4">
                  {/* Dropzone with Drag-and-Drop */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const files = e.dataTransfer.files;
                      if (files && files[0]) {
                        handleProcessUploadedFile(files[0]);
                      }
                    }}
                    className={`border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center transition-all ${
                      isDragging
                        ? "border-[#1F4E5B] bg-[#EAF2F4]/40 scale-[1.01]"
                        : "border-slate-200 hover:border-[#1F4E5B] bg-slate-50/50"
                    }`}
                  >
                    <FileSpreadsheet className="w-10 h-10 text-[#1F4E5B] mb-2" />
                    <h4 className="text-sm font-bold text-slate-800">
                      {isDragging ? "Drop your CSV file here..." : "Select or drag & drop your CSV file here"}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-md">
                      File must include column headers: <strong>name, company, category, units_per_pack</strong>. Accepts <strong>.csv, .txt</strong>.
                    </p>
                    <label className="mt-4 px-4 py-2 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold cursor-pointer shadow-xs transition-colors">
                      <span>Choose CSV File</span>
                      <input type="file" accept=".csv,text/csv,.txt,text/plain" onChange={handleFileUpload} className="hidden" />
                    </label>
                  </div>

                  {/* Sample Template Link */}
                  <div className="p-4 rounded-2xl bg-[#EAF2F4]/50 border border-[#1F4E5B]/20 flex items-center justify-between text-xs text-slate-700">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-[#1F4E5B] shrink-0" />
                      <span>Need standard column format? Download our sample CSV file:</span>
                    </div>
                    <a
                      href="/api/admin/medicines/sample-csv"
                      download
                      className="inline-flex items-center gap-1 font-bold text-[#1F4E5B] hover:underline"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Sample</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary Bar */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-center">
                      <div className="text-lg font-black">{importSummary.readyToImport}</div>
                      <div className="text-[10px] font-bold uppercase tracking-wide">New Items to Add</div>
                    </div>
                    <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-center">
                      <div className="text-lg font-black">{importSummary.duplicatesSkipped}</div>
                      <div className="text-[10px] font-bold uppercase tracking-wide">Duplicates (Will Skip)</div>
                    </div>
                    <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-center">
                      <div className="text-lg font-black">{importSummary.invalidSkipped}</div>
                      <div className="text-[10px] font-bold uppercase tracking-wide">Invalid / Blank</div>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                            <th className="py-2.5 px-3">#</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Medicine Name</th>
                            <th className="py-2.5 px-3">Company</th>
                            <th className="py-2.5 px-3">Category</th>
                            <th className="py-2.5 px-3">Units/Pack</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {importPreviewRows.map((r) => (
                            <tr key={r.rowIdx} className="hover:bg-slate-50/50">
                              <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{r.rowIdx}</td>
                              <td className="py-2 px-3">
                                <span
                                  className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase ${
                                    r.status === "ready"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : r.status === "duplicate"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-rose-100 text-rose-800"
                                  }`}
                                >
                                  {r.status}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-bold text-slate-900">{r.name}</td>
                              <td className="py-2 px-3 text-slate-600">{r.company}</td>
                              <td className="py-2 px-3 text-slate-600">{r.category}</td>
                              <td className="py-2 px-3 font-mono text-slate-600">{r.unitsPerPack}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer: Pinned */}
            <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 bg-slate-50/90 shrink-0">
              <span className="text-[11px] text-slate-400">
                Press <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600 font-mono text-[10px]">Esc</kbd> to exit
              </span>
              <div className="flex items-center gap-2.5">
                {importStep === "preview" && (
                  <button
                    type="button"
                    onClick={() => setImportStep("upload")}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Back to File
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                {importStep === "preview" && (
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={submitting || importSummary.readyToImport === 0}
                    className="px-5 py-2 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Confirm & Import ({importSummary.readyToImport})</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────
          MODAL 3: BATCH BREAKDOWN & EXPIRY INSPECTOR (Multi-Branch View)
      ─────────────────────────────────────────────────────────────────────── */}
      {selectedMedForBatches && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedMedForBatches(null);
          }}
        >
          <div className="w-full max-w-xl bg-white rounded-3xl border border-slate-200 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#EAF2F4] text-[#1F4E5B] flex items-center justify-center shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Batches & Expiry: {selectedMedForBatches.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Stock breakdown across store outlets (FEFO Sorted).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMedForBatches(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {(!selectedMedForBatches.batches || selectedMedForBatches.batches.length === 0) ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No batches currently registered for this medicine at the selected branch scope.
                </div>
              ) : (
                selectedMedForBatches.batches.map((b) => {
                  const expDate = new Date(b.expiryDate);
                  const isExpired = expDate.getTime() < Date.now();
                  const daysToExpiry = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                  return (
                    <div
                      key={b.id}
                      className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 text-xs">Batch: {b.batchNo}</span>
                          {b.branch ? (
                            <span className="text-[10px] px-2 py-0.2 rounded-full bg-blue-100 text-blue-800 font-extrabold flex items-center gap-1">
                              <Building2 className="w-2.5 h-2.5" />
                              {b.branch.name} ({b.branch.code})
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.2 rounded-full bg-slate-200 text-slate-700 font-bold">
                              Global Store Outlet
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            Exp: {expDate.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                          </span>
                          <span
                            className={`font-bold ${
                              isExpired ? "text-rose-600" : daysToExpiry <= 90 ? "text-amber-600" : "text-emerald-700"
                            }`}
                          >
                            {isExpired ? "EXPIRED" : `${daysToExpiry} days left`}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-mono font-extrabold text-[#1F4E5B] text-sm">
                          {b.quantity} {selectedMedForBatches.packaging.looseUnit}s
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          MRP: ₹{Number(b.mrp).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedMedForBatches(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
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
