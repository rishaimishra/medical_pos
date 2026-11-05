"use client";

import React, { useState, useEffect, useTransition, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  SlidersHorizontal,
  Search,
  Plus,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Calendar,
  Layers,
  Pill,
  History,
  FileSpreadsheet,
} from "lucide-react";
import { useBranchStore } from "@/stores/useBranchStore";

interface MedicineOption {
  id: number;
  name: string;
  genericName?: string | null;
  company: string;
  category: string;
  rackLocation?: string | null;
}

interface BatchOption {
  id: number;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  mrp: number;
  branchId?: number | null;
}

interface AdjustmentRecord {
  id: number;
  type: "add" | "remove" | "transfer" | "sale" | "return";
  quantity: number;
  absoluteQuantity: number;
  oldQty: number;
  newQty: number;
  difference: number;
  reason: string;
  createdAt: string;
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
  user?: {
    id: number;
    username: string;
    name: string;
    role: string;
  } | null;
  batch: {
    id: number;
    batchNo: string;
    expiryDate: string;
    mfgDate?: string | null;
    currentStock: number;
    mrp: number;
    purchasePrice?: number | null;
  };
}

const STANDARDIZED_REASONS = [
  "Damaged in Transit",
  "Breakage/Spillage",
  "Expired Discard",
  "Supplier Return",
  "Physical Audit Variance",
  "Inter-Branch Stock Transfer",
  "Correction / Mistake",
  "Customer Return to Stock",
  "Other Reason",
];

function AdjustmentsContent() {
  const searchParams = useSearchParams();
  const preselectBatchId = searchParams.get("batchId");
  const preselectMedicineId = searchParams.get("medicineId");

  const { branches, activeBranch, fetchBranches } = useBranchStore();

  // Fallback: If branches store is empty on direct refresh, fetch branches (Bug 1.9-E)
  useEffect(() => {
    if (branches.length === 0) {
      fetchBranches();
    }
  }, [branches.length, fetchBranches]);

  // List State
  const [adjustments, setAdjustments] = useState<AdjustmentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Summary KPIs State
  const [summary, setSummary] = useState({
    totalAdjustments: 0,
    netUnitsAdded: 0,
    netUnitsRemoved: 0,
    transfersCount: 0,
    writeOffUnits: 0,
  });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Modal Form Fields
  const [medicinesList, setMedicinesList] = useState<MedicineOption[]>([]);
  const [selectedMedicineId, setSelectedMedicineId] = useState<number | "">("");
  const [batchesList, setBatchesList] = useState<BatchOption[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | "">("");
  const [adjType, setAdjType] = useState<"add" | "remove" | "transfer">("remove");
  const [adjQty, setAdjQty] = useState<string>("1");
  const [adjReason, setAdjReason] = useState<string>(STANDARDIZED_REASONS[0]);
  const [adjNotes, setAdjNotes] = useState<string>("");
  const [toBranchId, setToBranchId] = useState<number | "">("");

  // Sync branch selector with activeBranch if defined
  useEffect(() => {
    if (activeBranch?.id) {
      setSelectedBranch(activeBranch.id.toString());
    }
  }, [activeBranch]);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Fetch adjustments
  const fetchAdjustments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (debouncedSearch) params.set("search", debouncedSearch);
      if (selectedBranch && selectedBranch !== "all") params.set("branchId", selectedBranch);
      if (typeFilter && typeFilter !== "all") params.set("type", typeFilter);
      if (reasonFilter && reasonFilter !== "all") params.set("reason", reasonFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/admin/adjustments?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to load stock adjustments.");
      }

      setAdjustments(data.data || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.total || 0);
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (err: any) {
      console.error("Fetch adjustments error:", err);
      setError(err.message || "Failed to load stock adjustments.");
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, debouncedSearch, selectedBranch, typeFilter, reasonFilter, startDate, endDate]);

  useEffect(() => {
    fetchAdjustments();
  }, [fetchAdjustments]);

  // Load medicines for modal dropdown
  const loadMedicines = async () => {
    try {
      const res = await fetch("/api/admin/medicines?limit=500");
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setMedicinesList(data.data);
      }
    } catch (err) {
      console.error("Failed to load medicines:", err);
    }
  };

  // Load batches for selected medicine
  const loadBatchesForMedicine = async (medId: number, branchIdFilter?: string) => {
    try {
      const params = new URLSearchParams({
        medicineId: medId.toString(),
        limit: "100",
      });
      if (branchIdFilter && branchIdFilter !== "all") {
        params.set("branchId", branchIdFilter);
      }
      const res = await fetch(`/api/admin/batches?${params.toString()}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setBatchesList(data.data);
      } else {
        setBatchesList([]);
      }
    } catch (err) {
      console.error("Failed to load batches:", err);
      setBatchesList([]);
    }
  };

  // Reset modal form state
  const resetForm = () => {
    setSelectedMedicineId("");
    setSelectedBatchId("");
    setAdjType("remove");
    setAdjQty("1");
    setAdjReason(STANDARDIZED_REASONS[0]);
    setAdjNotes("");
    setToBranchId("");
    setFormError(null);
    setFormSuccess(null);
  };

  // Handle open modal
  const openAdjustmentModal = async () => {
    setFormError(null);
    setFormSuccess(null);
    setIsModalOpen(true);
    await loadMedicines();

    if (preselectMedicineId) {
      const mId = parseInt(preselectMedicineId, 10);
      setSelectedMedicineId(mId);
      await loadBatchesForMedicine(mId, selectedBranch);
    }
    if (preselectBatchId) {
      setSelectedBatchId(parseInt(preselectBatchId, 10));
    }
  };

  // Auto-open modal on deep-link with query parameters (Bug 1.9-D)
  useEffect(() => {
    if (preselectBatchId || preselectMedicineId) {
      openAdjustmentModal();
    }
  }, [preselectBatchId, preselectMedicineId]);

  // When medicine selection changes in modal
  const handleMedicineChange = async (medId: number | "") => {
    setSelectedMedicineId(medId);
    setSelectedBatchId("");
    if (typeof medId === "number" && medId > 0) {
      await loadBatchesForMedicine(medId, selectedBranch);
    } else {
      setBatchesList([]);
    }
  };

  // Handle Submit Adjustment Form
  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!selectedBatchId) {
      setFormError("Please select a valid medicine batch to adjust.");
      return;
    }

    const qtyNumber = parseInt(adjQty, 10);
    if (isNaN(qtyNumber) || qtyNumber <= 0) {
      setFormError("Adjustment quantity must be a positive integer greater than 0.");
      return;
    }

    if (adjType !== "add" && selectedBatchInfo && qtyNumber > selectedBatchInfo.quantity) {
      setFormError(
        `Cannot reduce stock below 0. Current stock for batch "${selectedBatchInfo.batchNo}" is ${selectedBatchInfo.quantity} units, attempted to adjust ${qtyNumber} units.`
      );
      return;
    }

    if (!adjReason || adjReason.trim().length < 3) {
      setFormError("Please select a standardized reason code.");
      return;
    }

    if (adjType === "transfer" && (typeof toBranchId !== "number" || toBranchId <= 0)) {
      setFormError("Please select a destination branch for stock transfer.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: selectedBatchId,
          type: adjType,
          quantity: qtyNumber,
          reason: adjReason,
          notes: adjNotes,
          ...(adjType === "transfer" ? { toBranchId } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to submit stock adjustment.");
      }

      setFormSuccess(data.message || "Stock adjusted successfully.");
      setTimeout(() => {
        setIsModalOpen(false);
        resetForm();
        fetchAdjustments();
      }, 1200);
    } catch (err: any) {
      console.error("Adjustment submission error:", err);
      setFormError(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Selected batch info helper
  const selectedBatchInfo = batchesList.find((b) => b.id === Number(selectedBatchId));
  const currentStock = selectedBatchInfo ? selectedBatchInfo.quantity : 0;
  const parsedQty = parseInt(adjQty, 10) || 0;
  const computedNewStock =
    adjType === "add"
      ? currentStock + parsedQty
      : currentStock - parsedQty;

  // Handle Export CSV
  const handleExportCSV = () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (selectedBranch && selectedBranch !== "all") params.set("branchId", selectedBranch);
    if (typeFilter && typeFilter !== "all") params.set("type", typeFilter);
    if (reasonFilter && reasonFilter !== "all") params.set("reason", reasonFilter);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    window.open(`/api/admin/adjustments/export?${params.toString()}`, "_blank");
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
              <SlidersHorizontal className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Stock Adjustments & Physical Audit
              </h1>
              <p className="text-sm text-muted-foreground">
                Reconcile physical counts, record damage write-offs, and manage inter-branch stock transfers
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border/80 bg-background text-sm font-medium hover:bg-muted/60 transition-colors shadow-sm"
          >
            <Download className="h-4 w-4 text-muted-foreground" />
            Export CSV
          </button>

          <button
            onClick={openAdjustmentModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
          >
            <Plus className="h-4 w-4" />
            New Stock Adjustment
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Adjustments */}
        <div className="p-4 rounded-xl border border-border/80 bg-card shadow-sm hover:border-primary/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Operations
            </span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
              <History className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {summary.totalAdjustments}
            </span>
            <span className="text-xs text-muted-foreground">reconciliation records</span>
          </div>
        </div>

        {/* Units Added */}
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Net Stock Inward (+)
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              +{summary.netUnitsAdded}
            </span>
            <span className="text-xs text-emerald-600/80 dark:text-emerald-400/80">units added to inventory</span>
          </div>
        </div>

        {/* Units Removed */}
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Net Stock Outward (-)
            </span>
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500">
              <ArrowDownLeft className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
              -{summary.netUnitsRemoved}
            </span>
            <span className="text-xs text-rose-600/80 dark:text-rose-400/80">units written off / adjusted</span>
          </div>
        </div>

        {/* Discards / Damage */}
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Damage / Expired Discards
            </span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {summary.writeOffUnits}
            </span>
            <span className="text-xs text-amber-600/80 dark:text-amber-400/80">units lost to damage or expiry</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-3.5 rounded-xl border border-border/80 bg-card shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by medicine, generic chemical, batch number, reason, or staff username..."
              className="w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border border-border/80 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          {/* Branch Selector */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
            <select
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value);
                setPage(1);
              }}
              className="w-full md:w-48 py-2 px-3 text-sm rounded-lg border border-border/80 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            >
              <option value="all">All Store Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} [{b.code}]
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="w-full md:w-44 py-2 px-3 text-sm rounded-lg border border-border/80 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          >
            <option value="all">All Operation Types</option>
            <option value="add">+ Stock Inward (Add)</option>
            <option value="remove">- Stock Outward (Remove)</option>
            <option value="transfer">⇄ Inter-Branch Transfer</option>
            <option value="sale">POS Sale Reduction</option>
            <option value="return">Customer Return Restock</option>
          </select>

          {/* Reason Filter */}
          <select
            value={reasonFilter}
            onChange={(e) => {
              setReasonFilter(e.target.value);
              setPage(1);
            }}
            className="w-full md:w-48 py-2 px-3 text-sm rounded-lg border border-border/80 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          >
            <option value="all">All Reason Codes</option>
            {STANDARDIZED_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {/* Date Range Filter Row (Bug 1.9-F) */}
        <div className="flex flex-wrap items-center gap-3 pt-2.5 border-t border-border/60">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
            <Calendar className="h-3.5 w-3.5" />
            <span>Audit Date Range:</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="py-1 px-2.5 text-xs rounded-lg border border-border/80 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="py-1 px-2.5 text-xs rounded-lg border border-border/80 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => {
                setStartDate("");
                setEndDate("");
                setPage(1);
              }}
              className="py-1 px-2.5 text-xs font-semibold rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Clear Dates
            </button>
          )}
        </div>
      </div>

      {/* Adjustments Data Table */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 border-b border-border/80 text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              <tr>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Branch</th>
                <th className="py-3 px-4">Medicine & Formula</th>
                <th className="py-3 px-4">Batch Number</th>
                <th className="py-3 px-4 text-center">Type</th>
                <th className="py-3 px-4 text-right">Adjustment</th>
                <th className="py-3 px-4 text-center">Stock Trajectory</th>
                <th className="py-3 px-4">Reason & Notes</th>
                <th className="py-3 px-4">Authorized By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span>Loading stock adjustments audit trail...</span>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-rose-500">
                    <div className="flex items-center justify-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      <span>{error}</span>
                    </div>
                  </td>
                </tr>
              ) : adjustments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <SlidersHorizontal className="h-8 w-8 text-muted-foreground/40" />
                      <p className="font-medium text-foreground">No stock adjustment records found</p>
                      <p className="text-xs text-muted-foreground">
                        {debouncedSearch
                          ? "Try modifying your search or clearing active filters."
                          : "Perform a new stock adjustment or physical audit reconciliation."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                adjustments.map((adj) => {
                  const isPositive = adj.quantity > 0;
                  const isNegative = adj.quantity < 0;

                  return (
                    <tr key={adj.id} className="hover:bg-muted/30 transition-colors">
                      {/* Date */}
                      <td className="py-3 px-4 whitespace-nowrap text-xs text-muted-foreground font-mono">
                        {new Date(adj.createdAt).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </td>

                      {/* Branch */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-muted border border-border text-foreground">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          {adj.branch?.code || "MAIN"}
                        </span>
                      </td>

                      {/* Medicine */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground text-sm">
                          {adj.medicine?.name || "Unknown Medicine"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-xs">
                          {adj.medicine?.genericName || adj.medicine?.company}
                        </div>
                      </td>

                      {/* Batch */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono text-xs font-semibold text-foreground">
                          {adj.batch?.batchNo || "—"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Exp: {adj.batch?.expiryDate || "—"}
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="py-3 px-4 whitespace-nowrap text-center">
                        {adj.type === "add" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <ArrowUpRight className="h-3 w-3" />
                            ADDED
                          </span>
                        )}
                        {adj.type === "remove" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            <ArrowDownLeft className="h-3 w-3" />
                            REMOVED
                          </span>
                        )}
                        {adj.type === "transfer" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                            <ArrowLeftRight className="h-3 w-3" />
                            TRANSFER
                          </span>
                        )}
                        {adj.type === "sale" && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            SALE
                          </span>
                        )}
                        {adj.type === "return" && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                            RETURN
                          </span>
                        )}
                      </td>

                      {/* Units */}
                      <td className="py-3 px-4 whitespace-nowrap text-right font-mono font-bold">
                        <span
                          className={
                            isPositive
                              ? "text-emerald-600 dark:text-emerald-400"
                              : isNegative
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-foreground"
                          }
                        >
                          {isPositive ? `+${adj.quantity}` : `${adj.quantity}`}
                        </span>
                      </td>

                      {/* Trajectory */}
                      <td className="py-3 px-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-muted/50 border border-border text-foreground">
                          <span className="text-muted-foreground">{adj.oldQty}</span>
                          <span className="text-muted-foreground/60">→</span>
                          <span className="font-bold">{adj.newQty}</span>
                        </span>
                      </td>

                      {/* Reason */}
                      <td className="py-3 px-4 text-xs">
                        <span className="text-foreground font-medium block">
                          {adj.reason}
                        </span>
                      </td>

                      {/* User */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-xs font-medium text-foreground">
                          {adj.user?.name || adj.user?.username || "System"}
                        </div>
                        <div className="text-[11px] text-muted-foreground capitalize">
                          {adj.user?.role || "Automated"}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        {!isLoading && totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-muted/20 border-t border-border/80 text-xs text-muted-foreground">
            <div>
              Showing {adjustments.length > 0 ? (page - 1) * limit + 1 : 0} to{" "}
              {Math.min(page * limit, totalCount)} of {totalCount} total adjustments
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-md border border-border/80 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 text-foreground font-medium">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-md border border-border/80 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* IN-MODAL: NEW STOCK ADJUSTMENT DIALOG (1.9.1)                  */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl rounded-2xl border border-border/90 bg-card p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">Record Stock Adjustment</h2>
                  <p className="text-xs text-muted-foreground">
                    Adjust inventory levels, write-off expired/damaged items, or transfer across branches
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold p-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* In-Modal Error Feedback Alert (Directly above form fields!) */}
            {formError && (
              <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2.5 animate-in fade-in">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{formError}</div>
              </div>
            )}

            {/* In-Modal Success Alert */}
            {formSuccess && (
              <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs flex items-start gap-2.5 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{formSuccess}</div>
              </div>
            )}

            <form onSubmit={handleSubmitAdjustment} className="space-y-4">
              {/* Medicine Selection */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  1. Select Medicine Item <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedMedicineId}
                  onChange={(e) =>
                    handleMedicineChange(e.target.value ? parseInt(e.target.value, 10) : "")
                  }
                  required
                  className="w-full py-2 px-3 text-sm rounded-lg border border-border/80 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                >
                  <option value="">-- Choose Medicine from Catalog --</option>
                  {medicinesList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.genericName || m.company}) • [{m.category}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Batch Selection */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  2. Select Batch Record <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedBatchId}
                  onChange={(e) =>
                    setSelectedBatchId(e.target.value ? parseInt(e.target.value, 10) : "")
                  }
                  required
                  disabled={!selectedMedicineId}
                  className="w-full py-2 px-3 text-sm rounded-lg border border-border/80 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50"
                >
                  <option value="">
                    {!selectedMedicineId
                      ? "-- Select medicine first --"
                      : batchesList.length === 0
                      ? "-- No active batches found for this medicine --"
                      : "-- Choose Batch --"}
                  </option>
                  {batchesList.map((b) => (
                    <option key={b.id} value={b.id}>
                      Batch: {b.batchNo} • Stock: {b.quantity} units • Exp: {b.expiryDate} • MRP: ₹{b.mrp}
                    </option>
                  ))}
                </select>
              </div>

              {/* Operation Action Type */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  3. Adjustment Action Type <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjType("remove")}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      adjType === "remove"
                        ? "border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400 shadow-sm"
                        : "border-border/80 bg-background text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <ArrowDownLeft className="h-3.5 w-3.5" />
                    - Remove / Write-off
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdjType("add")}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      adjType === "add"
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm"
                        : "border-border/80 bg-background text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    + Add Stock
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdjType("transfer")}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      adjType === "transfer"
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-sm"
                        : "border-border/80 bg-background text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    ⇄ Transfer Branch
                  </button>
                </div>
              </div>

              {/* Destination Branch (Only if Transfer) */}
              {adjType === "transfer" && (
                <div className="p-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 space-y-2">
                  <label className="block text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                    Destination Store Branch <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={toBranchId}
                    onChange={(e) =>
                      setToBranchId(e.target.value ? parseInt(e.target.value, 10) : "")
                    }
                    required
                    className="w-full py-2 px-3 text-sm rounded-lg border border-border/80 bg-background focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  >
                    <option value="">-- Choose Destination Branch --</option>
                    {branches
                      .filter((b) => b.id !== selectedBatchInfo?.branchId)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} [{b.code}]
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Standardized Reason Code */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  4. Reason Code <span className="text-rose-500">*</span>
                </label>
                <select
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  required
                  className="w-full py-2 px-3 text-sm rounded-lg border border-border/80 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                >
                  {STANDARDIZED_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity Input & Real-time Live Calculation */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    5. Adjustment Quantity (Units) <span className="text-rose-500">*</span>
                  </label>
                  {selectedBatchInfo && (
                    <span className="text-xs text-muted-foreground font-mono">
                      Current Stock:{" "}
                      <strong className="text-foreground">{selectedBatchInfo.quantity} units</strong>
                    </span>
                  )}
                </div>

                <input
                  type="number"
                  min="1"
                  step="1"
                  value={adjQty}
                  onChange={(e) => setAdjQty(e.target.value)}
                  required
                  placeholder="e.g. 5"
                  className="w-full py-2 px-3 text-sm rounded-lg border border-border/80 bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />

                {/* Live Stock Calculation Banner */}
                {selectedBatchInfo && (
                  <div
                    className={`p-2.5 rounded-lg border text-xs flex items-center justify-between font-mono ${
                      computedNewStock < 0
                        ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        : "border-border/80 bg-muted/40 text-foreground"
                    }`}
                  >
                    <span>
                      {currentStock} {adjType === "add" ? "+" : "-"} {parsedQty} =
                    </span>
                    <span className="font-bold">
                      Resulting Stock: {computedNewStock} units
                    </span>
                  </div>
                )}
              </div>

              {/* Explanatory Notes */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  6. Explanatory Notes / Incident Details
                </label>
                <textarea
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g., Shattered 2 bottles during shelf restocking; or routine monthly inventory audit reconciliation."
                  className="w-full py-2 px-3 text-sm rounded-lg border border-border/80 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-border/80 hover:bg-muted transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving Adjustment...
                    </>
                  ) : (
                    "Apply Stock Adjustment"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StockAdjustmentsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <AdjustmentsContent />
    </Suspense>
  );
}
