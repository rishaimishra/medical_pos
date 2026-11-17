"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Wallet,
  Receipt,
  RotateCcw,
  Plus,
  Search,
  Filter,
  Download,
  Printer,
  Calendar,
  Building2,
  DollarSign,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Eye,
  Trash2,
  RefreshCw,
  X,
  CreditCard,
  FileText,
  Clock,
  Layers,
  Coins,
} from "lucide-react";
import { numberToIndianWords } from "@/lib/numberToWords";
import { playCashDrawerSound } from "@/lib/audioBeep";
import { toLocalYMD } from "@/lib/csv";

interface BranchOption {
  id: number;
  code: string;
  name: string;
  isMain?: boolean;
}

export default function FinancialsPage() {
  const [activeTab, setActiveTab] = useState<"ledger" | "expenses" | "drawer">("ledger");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");

  // Common Date Filter Presets
  const [datePreset, setDatePreset] = useState<"today" | "yesterday" | "last7" | "thisMonth" | "custom">("thisMonth");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // ==========================================
  // TAB 1: MASTER FINANCIAL LEDGER STATE
  // ==========================================
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerPartyType, setLedgerPartyType] = useState<string>("all");
  const [ledgerEntryType, setLedgerEntryType] = useState<string>("all");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPagination, setLedgerPagination] = useState({ page: 1, limit: 50, totalCount: 0, totalPages: 1 });
  const [ledgerSummary, setLedgerSummary] = useState({
    totalCredit: 0,
    totalDebit: 0,
    netCashFlow: 0,
    totalTransactions: 0,
  });

  // ==========================================
  // TAB 2: OPERATIONAL EXPENSES & INCOMES STATE
  // ==========================================
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expenseType, setExpenseType] = useState<string>("all");
  const [expenseCategory, setExpenseCategory] = useState<string>("all");
  const [expenseSearch, setExpenseSearch] = useState("");
  const [expensePage, setExpensePage] = useState(1);
  const [expensePagination, setExpensePagination] = useState({ page: 1, limit: 20, totalCount: 0, totalPages: 1 });
  const [expenseSummary, setExpenseSummary] = useState({
    totalExpenses: 0,
    totalIncomes: 0,
    netOverhead: 0,
    totalRecords: 0,
    categoryBreakdown: {} as Record<string, { total: number; count: number }>,
    paymentModeBreakdown: {} as Record<string, number>,
  });

  // Modal: New Expense Voucher
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [newExpense, setNewExpense] = useState({
    type: "expense" as "expense" | "income",
    category: "Electricity",
    title: "",
    amount: "",
    paymentMode: "cash",
    referenceNo: "",
    payeeOrPayer: "",
    notes: "",
    expenseDate: toLocalYMD(new Date()),
    branchId: "",
  });
  const [submittingExpense, setSubmittingExpense] = useState(false);
  const [viewingExpense, setViewingExpense] = useState<any | null>(null);

  // ==========================================
  // TAB 3: CASH DRAWER & Z-REPORT STATE
  // ==========================================
  const [drawerSubTab, setDrawerSubTab] = useState<"closingDesk" | "history">("closingDesk");
  const [drawerSummaryLoading, setDrawerSummaryLoading] = useState(false);
  const [drawerSummary, setDrawerSummary] = useState<{
    shift: { branchId: number | null; shiftStart: string; shiftEnd: string };
    lastClosing: any | null;
    figures: {
      suggestedOpeningFloat: number;
      cashSales: number;
      cashReturns: number;
      cashExpenses: number;
      cashIncomes: number;
      cashBakiCollections?: number;
      cashSupplierPayouts?: number;
      expectedCash: number;
      totalSalesCount: number;
      otherChannels: { upiSales: number; cardSales: number; chequeSales?: number; creditSales: number };
    };
  } | null>(null);

  // Denominations Counter State
  const [openingFloat, setOpeningFloat] = useState<number>(0);
  const [denominations, setDenominations] = useState<Record<string, number>>({
    "2000": 0,
    "500": 0,
    "200": 0,
    "100": 0,
    "50": 0,
    "20": 0,
    "10": 0,
    "5": 0,
    "2": 0,
    "1": 0,
    coins: 0,
  });
  const [drawerNotes, setDrawerNotes] = useState("");
  const [closingDrawer, setClosingDrawer] = useState(false);

  // Past Z-Reports History
  const [closings, setClosings] = useState<any[]>([]);
  const [closingsLoading, setClosingsLoading] = useState(false);
  const [closingStatusFilter, setClosingStatusFilter] = useState("all");
  const [closingsSummary, setClosingsSummary] = useState({
    totalClosings: 0,
    totalExpected: 0,
    totalCounted: 0,
    netDifference: 0,
    statusCounts: { exact: 0, excess: 0, shortage: 0 },
  });
  const [activeZReport, setActiveZReport] = useState<any | null>(null);

  // ==========================================
  // DATE PRESET CALCULATOR
  // ==========================================
  const applyDatePreset = useCallback((preset: "today" | "yesterday" | "last7" | "thisMonth" | "custom") => {
    setDatePreset(preset);
    const now = new Date();

    if (preset === "today") {
      setStartDate(toLocalYMD(now));
      setEndDate(toLocalYMD(now));
    } else if (preset === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      setStartDate(toLocalYMD(y));
      setEndDate(toLocalYMD(y));
    } else if (preset === "last7") {
      const past = new Date(now);
      past.setDate(past.getDate() - 6);
      setStartDate(toLocalYMD(past));
      setEndDate(toLocalYMD(now));
    } else if (preset === "thisMonth") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(toLocalYMD(firstDay));
      setEndDate(toLocalYMD(now));
    }
  }, []);

  // Initial load
  useEffect(() => {
    applyDatePreset("thisMonth");
    // Fetch branches
    fetch("/api/admin/branches")
      .then((r) => r.json())
      .then((data) => {
        const list = data.branches || data.data;
        if (data.success && Array.isArray(list)) {
          setBranches(list);
        }
      })
      .catch(() => {});
  }, [applyDatePreset]);

  // ==========================================
  // FETCH DATA HOOKS
  // ==========================================

  // Tab 1: Fetch Ledger
  const fetchLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranchId !== "all") params.set("branchId", selectedBranchId);
      if (ledgerPartyType !== "all") params.set("partyType", ledgerPartyType);
      if (ledgerEntryType !== "all") params.set("entryType", ledgerEntryType);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (ledgerSearch.trim()) params.set("search", ledgerSearch.trim());
      params.set("page", String(ledgerPage));
      params.set("limit", "50");

      const res = await fetch(`/api/admin/ledger?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setLedgerEntries(data.entries || []);
        setLedgerPagination(data.pagination);
        setLedgerSummary(data.summary);
      }
    } catch (err) {
      console.error("fetchLedger error:", err);
    } finally {
      setLedgerLoading(false);
    }
  }, [selectedBranchId, ledgerPartyType, ledgerEntryType, startDate, endDate, ledgerSearch, ledgerPage]);

  // Tab 2: Fetch Expenses
  const fetchExpenses = useCallback(async () => {
    setExpensesLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranchId !== "all") params.set("branchId", selectedBranchId);
      if (expenseType !== "all") params.set("type", expenseType);
      if (expenseCategory !== "all") params.set("category", expenseCategory);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (expenseSearch.trim()) params.set("search", expenseSearch.trim());
      params.set("page", String(expensePage));
      params.set("limit", "20");

      const res = await fetch(`/api/admin/expenses?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setExpenses(data.expenses || []);
        setExpensePagination(data.pagination);
        setExpenseSummary(data.summary);
      }
    } catch (err) {
      console.error("fetchExpenses error:", err);
    } finally {
      setExpensesLoading(false);
    }
  }, [selectedBranchId, expenseType, expenseCategory, startDate, endDate, expenseSearch, expensePage]);

  // Tab 3: Fetch Drawer Live Summary
  const fetchDrawerSummary = useCallback(async () => {
    setDrawerSummaryLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranchId !== "all") params.set("branchId", selectedBranchId);

      const res = await fetch(`/api/admin/cash-drawer/summary?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setDrawerSummary(data);
        setOpeningFloat(data.figures?.suggestedOpeningFloat || 0);
      }
    } catch (err) {
      console.error("fetchDrawerSummary error:", err);
    } finally {
      setDrawerSummaryLoading(false);
    }
  }, [selectedBranchId]);

  // Tab 3: Fetch Z-Reports History
  const fetchClosings = useCallback(async () => {
    setClosingsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranchId !== "all") params.set("branchId", selectedBranchId);
      if (closingStatusFilter !== "all") params.set("status", closingStatusFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/admin/cash-drawer/closings?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setClosings(data.closings || []);
        setClosingsSummary(data.summary);
      }
    } catch (err) {
      console.error("fetchClosings error:", err);
    } finally {
      setClosingsLoading(false);
    }
  }, [selectedBranchId, closingStatusFilter, startDate, endDate]);

  // Trigger data load when tab or core filters change
  useEffect(() => {
    if (activeTab === "ledger") {
      fetchLedger();
    } else if (activeTab === "expenses") {
      fetchExpenses();
    } else if (activeTab === "drawer") {
      if (drawerSubTab === "closingDesk") {
        fetchDrawerSummary();
      } else {
        fetchClosings();
      }
    }
  }, [activeTab, drawerSubTab, fetchLedger, fetchExpenses, fetchDrawerSummary, fetchClosings]);

  // ==========================================
  // PHYSICAL CASH COUNTED CALCULATION
  // ==========================================
  const countedPhysicalCash = useMemo(() => {
    let sum = 0;
    const noteMultipliers: Record<string, number> = {
      "2000": 2000,
      "500": 500,
      "200": 200,
      "100": 100,
      "50": 50,
      "20": 20,
      "10": 10,
      "5": 5,
      "2": 2,
      "1": 1,
    };
    for (const [denom, mult] of Object.entries(noteMultipliers)) {
      sum += (denominations[denom] || 0) * mult;
    }
    sum += denominations.coins || 0;
    return Math.round(sum * 100) / 100;
  }, [denominations]);

  // System Expected Cash based on editable opening float
  const currentExpectedCash = useMemo(() => {
    if (!drawerSummary) return 0;
    const {
      cashSales,
      cashReturns,
      cashExpenses,
      cashIncomes,
      cashBakiCollections = 0,
      cashSupplierPayouts = 0,
    } = drawerSummary.figures;
    return (
      Math.round(
        (openingFloat +
          cashSales -
          cashReturns -
          cashExpenses +
          cashIncomes +
          cashBakiCollections -
          cashSupplierPayouts) *
          100
      ) / 100
    );
  }, [drawerSummary, openingFloat]);

  const cashDifference = useMemo(() => {
    return Math.round((countedPhysicalCash - currentExpectedCash) * 100) / 100;
  }, [countedPhysicalCash, currentExpectedCash]);

  // Handle Denomination Change
  const handleDenominationChange = (key: string, val: string) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setDenominations((prev) => ({
      ...prev,
      [key]: key === "coins" ? num : Math.floor(num),
    }));
  };

  // ==========================================
  // ACTION: SUBMIT CASH DRAWER CLOSING (Z-REPORT)
  // ==========================================
  const handleCloseCashDrawer = async () => {
    if (countedPhysicalCash <= 0 && currentExpectedCash > 0) {
      if (!confirm("Total counted physical cash is ₹0.00. Are you sure you want to close shift with ₹0.00 counted?")) {
        return;
      }
    }

    setClosingDrawer(true);
    try {
      const res = await fetch("/api/admin/cash-drawer/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: selectedBranchId !== "all" ? parseInt(selectedBranchId, 10) : undefined,
          shiftStart: drawerSummary?.shift.shiftStart,
          shiftEnd: new Date().toISOString(),
          openingFloat,
          denominations,
          notes: drawerNotes,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        alert(data.message || "Failed to close cash drawer shift");
        return;
      }

      // Play audio chime
      try {
        playCashDrawerSound();
      } catch {}

      // Reset counting desk
      setDenominations({
        "2000": 0,
        "500": 0,
        "200": 0,
        "100": 0,
        "50": 0,
        "20": 0,
        "10": 0,
        "5": 0,
        "2": 0,
        "1": 0,
        coins: 0,
      });
      setDrawerNotes("");

      // Open printable Z-Report modal
      setActiveZReport({
        ...data.closing,
        denominations,
      });

      // Switch to history tab and refresh
      setDrawerSubTab("history");
      fetchClosings();
    } catch (err: any) {
      alert(err.message || "An error occurred while closing shift");
    } finally {
      setClosingDrawer(false);
    }
  };

  // ==========================================
  // ACTION: SUBMIT NEW EXPENSE VOUCHER
  // ==========================================
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.title.trim() || !newExpense.amount) {
      alert("Please provide title and amount");
      return;
    }

    setSubmittingExpense(true);
    try {
      const res = await fetch("/api/admin/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newExpense,
          branchId: newExpense.branchId ? parseInt(newExpense.branchId, 10) : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.message || "Failed to create voucher");
        return;
      }

      setShowExpenseModal(false);
      setNewExpense({
        type: "expense",
        category: "Electricity",
        title: "",
        amount: "",
        paymentMode: "cash",
        referenceNo: "",
        payeeOrPayer: "",
        notes: "",
        expenseDate: toLocalYMD(new Date()),
        branchId: "",
      });
      fetchExpenses();
    } catch (err: any) {
      alert(err.message || "Failed to record expense");
    } finally {
      setSubmittingExpense(false);
    }
  };

  // Delete Expense Voucher
  const handleDeleteExpense = async (id: number, voucherNo: string) => {
    if (!confirm(`Are you sure you want to delete voucher ${voucherNo}?`)) return;
    try {
      const res = await fetch(`/api/admin/expenses/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchExpenses();
      } else {
        alert(data.message || "Failed to delete voucher");
      }
    } catch (err: any) {
      alert(err.message || "Error deleting voucher");
    }
  };

  // Export Ledger CSV
  const handleExportLedger = () => {
    const params = new URLSearchParams();
    if (selectedBranchId !== "all") params.set("branchId", selectedBranchId);
    if (ledgerPartyType !== "all") params.set("partyType", ledgerPartyType);
    if (ledgerEntryType !== "all") params.set("entryType", ledgerEntryType);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (ledgerSearch.trim()) params.set("search", ledgerSearch.trim());

    window.open(`/api/admin/ledger/export?${params.toString()}`, "_blank");
  };

  return (
    <div className="space-y-6 select-text max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-sm">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Financial Ledger & Cash Drawer Closing
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Unified master ledger, operational overheads, and day-end shift register Z-Reports
              </p>
            </div>
          </div>
        </div>

        {/* Global Branch Selector & Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {branches.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="text-xs font-semibold text-slate-700 bg-transparent border-none focus:outline-hidden"
              >
                <option value="all">All Outlets / Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    [{b.code}] {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeTab === "ledger" && (
            <button
              onClick={handleExportLedger}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition shadow-2xs"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              Export CSV
            </button>
          )}

          {activeTab === "expenses" && (
            <button
              onClick={() => setShowExpenseModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Record Voucher
            </button>
          )}
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex border-b border-slate-200 gap-1 sm:gap-2">
        <button
          onClick={() => setActiveTab("ledger")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === "ledger"
              ? "border-teal-600 text-teal-700 bg-teal-50/50 rounded-t-lg"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Layers className="h-4 w-4" />
          Master Financial Ledger (2.13.1)
        </button>
        <button
          onClick={() => setActiveTab("expenses")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === "expenses"
              ? "border-teal-600 text-teal-700 bg-teal-50/50 rounded-t-lg"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <FileText className="h-4 w-4" />
          General Expenses & Incomes (2.12.1)
        </button>
        <button
          onClick={() => setActiveTab("drawer")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === "drawer"
              ? "border-teal-600 text-teal-700 bg-teal-50/50 rounded-t-lg"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Coins className="h-4 w-4" />
          Day-End Cash Drawer & Z-Report (2.12.2)
        </button>
      </div>

      {/* Date Filter Bar (Common for Tab 1 & Tab 2, and Drawer History) */}
      {(activeTab === "ledger" || activeTab === "expenses" || (activeTab === "drawer" && drawerSubTab === "history")) && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-400 font-semibold flex items-center gap-1 mr-1">
              <Calendar className="h-3.5 w-3.5" /> Date:
            </span>
            {(["today", "yesterday", "last7", "thisMonth"] as const).map((preset) => (
              <button
                key={preset}
                onClick={() => applyDatePreset(preset)}
                className={`px-2.5 py-1 rounded-md font-semibold capitalize transition ${
                  datePreset === preset
                    ? "bg-teal-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {preset === "today"
                  ? "Today"
                  : preset === "yesterday"
                  ? "Yesterday"
                  : preset === "last7"
                  ? "Last 7 Days"
                  : "This Month"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset("custom");
              }}
              className="border border-slate-200 rounded-md px-2 py-1 text-slate-700 font-medium"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDatePreset("custom");
              }}
              className="border border-slate-200 rounded-md px-2 py-1 text-slate-700 font-medium"
            />
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: MASTER FINANCIAL LEDGER                            */}
      {/* ========================================================= */}
      {activeTab === "ledger" && (
        <div className="space-y-5">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Total Inflow (Credits)</span>
                <div className="h-7 w-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <ArrowDownLeft className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-emerald-700">
                ₹{ledgerSummary.totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Sales & Baki Khata Collections</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Total Outflow (Debits)</span>
                <div className="h-7 w-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-rose-700">
                ₹{ledgerSummary.totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">POs, Refunds, Overhead Expenses</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Net Cash / Book Flow</span>
                <div
                  className={`h-7 w-7 rounded-lg flex items-center justify-center ${
                    ledgerSummary.netCashFlow >= 0 ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <p
                className={`text-2xl font-black ${
                  ledgerSummary.netCashFlow >= 0 ? "text-teal-700" : "text-amber-700"
                }`}
              >
                ₹{ledgerSummary.netCashFlow.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Credits - Debits balance</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Transactions</span>
                <div className="h-7 w-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                  <Layers className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-800">{ledgerSummary.totalTransactions}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Chronologically reconciled records</p>
            </div>
          </div>

          {/* Sub Filters for Ledger */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative min-w-[220px]">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search ref #, party, note..."
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-teal-500"
                />
              </div>

              {/* Party Type Filter */}
              <select
                value={ledgerPartyType}
                onChange={(e) => setLedgerPartyType(e.target.value)}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-hidden"
              >
                <option value="all">All Party Types</option>
                <option value="customer">Customers / Patients</option>
                <option value="supplier">Distributors / Suppliers</option>
                <option value="expense_payee">Expense Payees</option>
              </select>

              {/* Entry Type Filter */}
              <select
                value={ledgerEntryType}
                onChange={(e) => setLedgerEntryType(e.target.value)}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-hidden"
              >
                <option value="all">All Entries (Credit + Debit)</option>
                <option value="credit">Credits Only (Inflow)</option>
                <option value="debit">Debits Only (Outflow)</option>
              </select>
            </div>

            <button
              onClick={fetchLedger}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition"
            >
              <RefreshCw className={`h-3 w-3 ${ledgerLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {/* Ledger Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-3">Ref No</th>
                    <th className="py-3 px-3">Type & Source</th>
                    <th className="py-3 px-3">Party Name</th>
                    <th className="py-3 px-3">Branch</th>
                    <th className="py-3 px-3">Payment Mode</th>
                    <th className="py-3 px-3 text-right">Debit (-)</th>
                    <th className="py-3 px-3 text-right">Credit (+)</th>
                    <th className="py-3 px-4 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {ledgerLoading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-teal-600" />
                        Reconciling financial ledger entries...
                      </td>
                    </tr>
                  ) : ledgerEntries.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                        No ledger entries found for selected criteria.
                      </td>
                    </tr>
                  ) : (
                    ledgerEntries.map((entry) => {
                      const isCredit = entry.entryType === "credit";
                      return (
                        <tr key={entry.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                            {new Date(entry.date).toLocaleString("en-IN", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                              {entry.refNo}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                entry.source === "sale"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : entry.source === "purchase"
                                  ? "bg-indigo-100 text-indigo-800"
                                  : entry.source === "return"
                                  ? "bg-rose-100 text-rose-800"
                                  : entry.source === "expense"
                                  ? "bg-amber-100 text-amber-800"
                                  : entry.source === "income"
                                  ? "bg-teal-100 text-teal-800"
                                  : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {entry.category}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-800 font-semibold max-w-[180px] truncate">
                            {entry.partyName}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                            {entry.branchCode ? `[${entry.branchCode}]` : entry.branchName || "Main"}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap uppercase text-[10px]">
                            {entry.paymentMode}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-rose-600 whitespace-nowrap">
                            {entry.debit > 0 ? `₹${entry.debit.toFixed(2)}` : "-"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-600 whitespace-nowrap">
                            {entry.credit > 0 ? `₹${entry.credit.toFixed(2)}` : "-"}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                            ₹{entry.runningBalance !== undefined ? entry.runningBalance.toFixed(2) : "-"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {ledgerPagination.totalPages > 1 && (
              <div className="py-3 px-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing page {ledgerPagination.page} of {ledgerPagination.totalPages} ({ledgerPagination.totalCount} total)
                </span>
                <div className="flex gap-1.5">
                  <button
                    disabled={ledgerPage <= 1}
                    onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 border border-slate-200 rounded disabled:opacity-40 font-semibold"
                  >
                    Prev
                  </button>
                  <button
                    disabled={ledgerPage >= ledgerPagination.totalPages}
                    onClick={() => setLedgerPage((p) => p + 1)}
                    className="px-2.5 py-1 border border-slate-200 rounded disabled:opacity-40 font-semibold"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: OPERATIONAL EXPENSES & INCOMES                     */}
      {/* ========================================================= */}
      {activeTab === "expenses" && (
        <div className="space-y-5">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Operational Expenses</span>
                <div className="h-7 w-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-rose-700">
                ₹{expenseSummary.totalExpenses.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Rent, Salaries, Electricity, Tea</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Other Incomes</span>
                <div className="h-7 w-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <ArrowDownLeft className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-emerald-700">
                ₹{expenseSummary.totalIncomes.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Consulting, Scrap, Misc revenue</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Net Overhead</span>
                <div className="h-7 w-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900">
                ₹{expenseSummary.netOverhead.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Expenses minus other incomes</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Total Vouchers</span>
                <div className="h-7 w-7 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                  <FileText className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-800">{expenseSummary.totalRecords}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Audit-tracked vouchers</p>
            </div>
          </div>

          {/* Category Quick Chips */}
          {Object.keys(expenseSummary.categoryBreakdown).length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              <span className="text-slate-400 font-semibold whitespace-nowrap">Categories:</span>
              {Object.entries(expenseSummary.categoryBreakdown).map(([cat, stat]) => (
                <button
                  key={cat}
                  onClick={() => setExpenseCategory(expenseCategory === cat ? "all" : cat)}
                  className={`px-2.5 py-1 rounded-lg border font-medium whitespace-nowrap transition ${
                    expenseCategory === cat
                      ? "bg-teal-600 text-white border-teal-600"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {cat}: ₹{stat.total.toFixed(0)} ({stat.count})
                </button>
              ))}
            </div>
          )}

          {/* Sub Filters for Expenses */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative min-w-[220px]">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search voucher, title, payee..."
                  value={expenseSearch}
                  onChange={(e) => setExpenseSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-teal-500"
                />
              </div>

              <select
                value={expenseType}
                onChange={(e) => setExpenseType(e.target.value)}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-hidden"
              >
                <option value="all">All Types (Expenses & Incomes)</option>
                <option value="expense">Expenses Only</option>
                <option value="income">Incomes Only</option>
              </select>

              <select
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value)}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-hidden"
              >
                <option value="all">All Categories</option>
                <option value="Electricity">Electricity</option>
                <option value="Shop Rent">Shop Rent</option>
                <option value="Staff Salary">Staff Salary</option>
                <option value="Tea & Refreshments">Tea & Refreshments</option>
                <option value="Cleaning & Maintenance">Cleaning & Maintenance</option>
                <option value="Packaging & Bags">Packaging & Bags</option>
                <option value="Logistics & Delivery">Logistics & Delivery</option>
                <option value="Consulting / Service Income">Consulting / Service Income</option>
                <option value="Miscellaneous">Miscellaneous</option>
              </select>
            </div>

            <button
              onClick={fetchExpenses}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition"
            >
              <RefreshCw className={`h-3 w-3 ${expensesLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {/* Expenses Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-3">Voucher #</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Title / Description</th>
                    <th className="py-3 px-3">Payee / Payer</th>
                    <th className="py-3 px-3">Payment Mode</th>
                    <th className="py-3 px-4 text-right">Amount (₹)</th>
                    <th className="py-3 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {expensesLoading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-teal-600" />
                        Loading expense vouchers...
                      </td>
                    </tr>
                  ) : expenses.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                        No expense records found. Click &quot;Record Voucher&quot; to add one.
                      </td>
                    </tr>
                  ) : (
                    expenses.map((exp) => {
                      const isIncome = exp.type === "income";
                      return (
                        <tr key={exp.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                            {new Date(exp.expenseDate).toLocaleDateString("en-IN")}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                              {exp.voucherNo}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                isIncome ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {exp.type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-700 whitespace-nowrap">
                            {exp.category}
                          </td>
                          <td className="py-2.5 px-3 text-slate-900 max-w-[220px] truncate">
                            {exp.title}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                            {exp.payeeOrPayer || "-"}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 uppercase text-[10px] whitespace-nowrap">
                            {exp.paymentMode}
                          </td>
                          <td
                            className={`py-2.5 px-4 text-right font-bold font-mono whitespace-nowrap ${
                              isIncome ? "text-emerald-700" : "text-slate-900"
                            }`}
                          >
                            ₹{Number(exp.amount).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setViewingExpense(exp)}
                                title="Print / View Voucher"
                                className="p-1 rounded text-slate-500 hover:text-teal-700 hover:bg-slate-100 transition"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteExpense(exp.id, exp.voucherNo)}
                                title="Delete Voucher"
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: DAY-END CASH DRAWER & Z-REPORT                      */}
      {/* ========================================================= */}
      {activeTab === "drawer" && (
        <div className="space-y-6">
          {/* Sub Navigation */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <button
              onClick={() => setDrawerSubTab("closingDesk")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                drawerSubTab === "closingDesk"
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Close Register & Generate Z-Report
            </button>
            <button
              onClick={() => setDrawerSubTab("history")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                drawerSubTab === "history"
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Past Z-Reports Archive
            </button>
          </div>

          {/* VIEW A: REGISTER CLOSING DESK */}
          {drawerSubTab === "closingDesk" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Live System Numbers (5 Cols) */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">Live Shift Expected Cash</h3>
                      <p className="text-[11px] text-slate-500">
                        Shift started:{" "}
                        {drawerSummary
                          ? new Date(drawerSummary.shift.shiftStart).toLocaleString("en-IN", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "-"}
                      </p>
                    </div>
                    <button
                      onClick={fetchDrawerSummary}
                      title="Refresh Live Figures"
                      className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${drawerSummaryLoading ? "animate-spin" : ""}`} />
                    </button>
                  </div>

                  {/* Opening Float Input */}
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                      <span>1. Opening Drawer Float (₹)</span>
                      <span className="text-[10px] text-slate-400 font-normal">Starting Cash</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={openingFloat}
                      onChange={(e) => setOpeningFloat(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-hidden focus:border-teal-500 font-mono"
                    />
                  </div>

                  {/* Cash Flow Breakdown Table */}
                  <div className="space-y-2 text-xs divide-y divide-slate-100">
                    <div className="flex justify-between py-1 text-slate-700">
                      <span>2. Cash Sales Collected (+)</span>
                      <span className="font-bold font-mono text-emerald-700">
                        +₹{drawerSummary?.figures.cashSales.toFixed(2) || "0.00"}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 text-slate-700">
                      <span>3. Cash Returns Refunded (-)</span>
                      <span className="font-bold font-mono text-rose-700">
                        -₹{drawerSummary?.figures.cashReturns.toFixed(2) || "0.00"}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 text-slate-700">
                      <span>4. Cash Operational Expenses (-)</span>
                      <span className="font-bold font-mono text-rose-700">
                        -₹{drawerSummary?.figures.cashExpenses.toFixed(2) || "0.00"}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 text-slate-700">
                      <span>5. Cash Extra Incomes (+)</span>
                      <span className="font-bold font-mono text-emerald-700">
                        +₹{drawerSummary?.figures.cashIncomes.toFixed(2) || "0.00"}
                      </span>
                    </div>

                    {(drawerSummary?.figures.cashBakiCollections ?? 0) > 0 && (
                      <div className="flex justify-between py-1 text-slate-700">
                        <span>6. Cash Baki Khata Collections (+)</span>
                        <span className="font-bold font-mono text-emerald-700">
                          +₹{(drawerSummary?.figures.cashBakiCollections || 0).toFixed(2)}
                        </span>
                      </div>
                    )}

                    {(drawerSummary?.figures.cashSupplierPayouts ?? 0) > 0 && (
                      <div className="flex justify-between py-1 text-slate-700">
                        <span>7. Cash Supplier Payouts (-)</span>
                        <span className="font-bold font-mono text-rose-700">
                          -₹{(drawerSummary?.figures.cashSupplierPayouts || 0).toFixed(2)}
                        </span>
                      </div>
                    )}

                    {/* Total Expected Cash in Drawer */}
                    <div className="flex justify-between pt-2 text-sm font-black text-slate-900">
                      <span>EXPECTED CASH IN DRAWER:</span>
                      <span className="font-mono text-base text-teal-800">₹{currentExpectedCash.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Non-Cash Channels Info Card */}
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                    <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                      Other Electronic Channels (Bank/Digital):
                    </span>
                    <div className="flex justify-between">
                      <span>• UPI / QR Payments:</span>
                      <span className="font-mono font-bold">
                        ₹{drawerSummary?.figures.otherChannels.upiSales.toFixed(2) || "0.00"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>• Card (Credit / Debit):</span>
                      <span className="font-mono font-bold">
                        ₹{drawerSummary?.figures.otherChannels.cardSales.toFixed(2) || "0.00"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>• Baki Khata / Patient Credit:</span>
                      <span className="font-mono font-bold">
                        ₹{drawerSummary?.figures.otherChannels.creditSales.toFixed(2) || "0.00"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Physical Currency Denominations & Reconciliation (7 Cols) */}
              <div className="lg:col-span-7 space-y-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">Physical Currency Denominations</h3>
                      <p className="text-[11px] text-slate-500">
                        Count physical notes and coins currently inside the cash drawer
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-teal-100 text-teal-800">
                      Currency: INR (₹)
                    </span>
                  </div>

                  {/* Denominations Input Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { key: "500", label: "₹500 Notes", mult: 500 },
                      { key: "200", label: "₹200 Notes", mult: 200 },
                      { key: "100", label: "₹100 Notes", mult: 100 },
                      { key: "50", label: "₹50 Notes", mult: 50 },
                      { key: "20", label: "₹20 Notes", mult: 20 },
                      { key: "10", label: "₹10 Notes", mult: 10 },
                      { key: "5", label: "₹5 Notes", mult: 5 },
                      { key: "2", label: "₹2 Notes", mult: 2 },
                      { key: "1", label: "₹1 Notes", mult: 1 },
                      { key: "2000", label: "₹2000 Notes", mult: 2000 },
                    ].map(({ key, label, mult }) => (
                      <div key={key} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1">
                        <div className="flex justify-between text-[11px] font-bold text-slate-700">
                          <span>{label}</span>
                          <span className="font-mono text-teal-800">
                            = ₹{((denominations[key] || 0) * mult).toLocaleString("en-IN")}
                          </span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          placeholder="Count"
                          value={denominations[key] || ""}
                          onChange={(e) => handleDenominationChange(key, e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-bold text-slate-900 focus:outline-hidden focus:border-teal-500 font-mono"
                        />
                      </div>
                    ))}

                    {/* Loose Coins Box */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1 sm:col-span-3">
                      <div className="flex justify-between text-[11px] font-bold text-slate-700">
                        <span>Loose Coins &amp; Change (₹)</span>
                        <span className="font-mono text-teal-800">
                          = ₹{(denominations.coins || 0).toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder="Total coins value in ₹"
                        value={denominations.coins || ""}
                        onChange={(e) => handleDenominationChange("coins", e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-bold text-slate-900 focus:outline-hidden focus:border-teal-500 font-mono"
                      />
                    </div>
                  </div>

                  {/* Cashier Notes */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 mb-1 block">
                      Cashier Handover Notes / Remarks (Optional):
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Counter handover to Evening Staff Rohit, ₹100 kept as loose change"
                      value={drawerNotes}
                      onChange={(e) => setDrawerNotes(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:border-teal-500"
                    />
                  </div>

                  {/* Reconciliation Banner */}
                  <div
                    className={`rounded-xl p-4 border flex items-center justify-between ${
                      cashDifference === 0
                        ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                        : cashDifference > 0
                        ? "bg-blue-50 border-blue-300 text-blue-900"
                        : "bg-rose-50 border-rose-300 text-rose-900"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        {cashDifference === 0 ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        ) : cashDifference > 0 ? (
                          <AlertCircle className="h-5 w-5 text-blue-600" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-rose-600" />
                        )}
                        <span className="font-black text-sm uppercase tracking-wide">
                          {cashDifference === 0
                            ? "Exact Match (Zero Discrepancy)"
                            : cashDifference > 0
                            ? `Cash Excess: +₹${cashDifference.toFixed(2)}`
                            : `Cash Shortage: -₹${Math.abs(cashDifference).toFixed(2)}`}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5 opacity-80">
                        Physical Counted: ₹{countedPhysicalCash.toFixed(2)} vs Expected: ₹
                        {currentExpectedCash.toFixed(2)}
                      </p>
                    </div>

                    <button
                      onClick={handleCloseCashDrawer}
                      disabled={closingDrawer}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-black tracking-wide uppercase transition shadow-sm disabled:opacity-50"
                    >
                      <Printer className="h-4 w-4" />
                      {closingDrawer ? "Closing..." : "Submit & Close Shift (Z-Report)"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW B: PAST Z-REPORTS ARCHIVE */}
          {drawerSubTab === "history" && (
            <div className="space-y-4">
              {/* Closings Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Shift Closings</span>
                  <p className="text-2xl font-black text-slate-900 mt-1">{closingsSummary.totalClosings}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Z-Reports recorded</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Exact Matches</span>
                  <p className="text-2xl font-black text-emerald-700 mt-1">{closingsSummary.statusCounts.exact}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">100% balanced shifts</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cash Excess Incidents</span>
                  <p className="text-2xl font-black text-blue-700 mt-1">{closingsSummary.statusCounts.excess}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Cashier drawer surpluses</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cash Shortage Incidents</span>
                  <p className="text-2xl font-black text-rose-700 mt-1">{closingsSummary.statusCounts.shortage}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Cashier drawer deficits</p>
                </div>
              </div>

              {/* Status Filter */}
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-semibold">Status:</span>
                  {(["all", "exact", "excess", "shortage"] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setClosingStatusFilter(st)}
                      className={`px-2.5 py-1 rounded-md font-semibold capitalize transition ${
                        closingStatusFilter === st
                          ? "bg-teal-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <button
                  onClick={fetchClosings}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-bold transition"
                >
                  <RefreshCw className={`h-3 w-3 ${closingsLoading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {/* Closings Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-3 px-4">Z-Report #</th>
                        <th className="py-3 px-3">Closed Date &amp; Time</th>
                        <th className="py-3 px-3">Branch</th>
                        <th className="py-3 px-3">Cashier</th>
                        <th className="py-3 px-3 text-right">Expected (₹)</th>
                        <th className="py-3 px-3 text-right">Counted (₹)</th>
                        <th className="py-3 px-3 text-right">Difference (₹)</th>
                        <th className="py-3 px-3 text-center">Status</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {closingsLoading ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-slate-400">
                            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-teal-600" />
                            Loading Z-Reports...
                          </td>
                        </tr>
                      ) : closings.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-slate-400">
                            <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                            No Z-Reports found for selected criteria.
                          </td>
                        </tr>
                      ) : (
                        closings.map((c) => {
                          const diff = Number(c.difference);
                          return (
                            <tr key={c.id} className="hover:bg-slate-50/70 transition">
                              <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                                {c.closingNumber}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                                {new Date(c.shiftEnd).toLocaleString("en-IN", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </td>
                              <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                                {c.branch ? `[${c.branch.code}] ${c.branch.name}` : "Main Outlet"}
                              </td>
                              <td className="py-2.5 px-3 text-slate-800 font-semibold whitespace-nowrap">
                                {c.user?.name || "Staff"}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                                ₹{Number(c.expectedCash).toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                                ₹{Number(c.countedCash).toFixed(2)}
                              </td>
                              <td
                                className={`py-2.5 px-3 text-right font-mono font-bold ${
                                  diff === 0
                                    ? "text-slate-500"
                                    : diff > 0
                                    ? "text-blue-700"
                                    : "text-rose-700"
                                }`}
                              >
                                {diff === 0 ? "₹0.00" : diff > 0 ? `+₹${diff.toFixed(2)}` : `-₹${Math.abs(diff).toFixed(2)}`}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    c.status === "exact"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : c.status === "excess"
                                      ? "bg-blue-100 text-blue-800"
                                      : "bg-rose-100 text-rose-800"
                                  }`}
                                >
                                  {c.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <button
                                  onClick={async () => {
                                    try {
                                      const res = await fetch(`/api/admin/cash-drawer/closings/${c.id}`);
                                      const data = await res.json();
                                      if (data.success) {
                                        setActiveZReport(data.closing);
                                      }
                                    } catch {
                                      alert("Failed to load Z-Report");
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold text-[11px] transition"
                                >
                                  <Eye className="h-3 w-3" />
                                  View / Print
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: RECORD NEW EXPENSE / INCOME VOUCHER                 */}
      {/* ========================================================= */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                  <FileText className="h-4 w-4" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Record Operational Voucher</h3>
              </div>
              <button
                onClick={() => setShowExpenseModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-3.5 text-xs">
              {/* Type Toggle */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setNewExpense((p) => ({ ...p, type: "expense" }))}
                  className={`py-1.5 rounded-md font-bold transition ${
                    newExpense.type === "expense" ? "bg-white text-rose-700 shadow-xs" : "text-slate-600"
                  }`}
                >
                  Operational Expense (-)
                </button>
                <button
                  type="button"
                  onClick={() => setNewExpense((p) => ({ ...p, type: "income" }))}
                  className={`py-1.5 rounded-md font-bold transition ${
                    newExpense.type === "income" ? "bg-white text-emerald-700 shadow-xs" : "text-slate-600"
                  }`}
                >
                  Extra Income / Revenue (+)
                </button>
              </div>

              {/* Category & Title */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 mb-1 block">Category *</label>
                  <select
                    value={newExpense.category}
                    onChange={(e) => setNewExpense((p) => ({ ...p, category: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-hidden focus:border-teal-500 font-medium text-slate-800"
                  >
                    <option value="Electricity">Electricity</option>
                    <option value="Shop Rent">Shop Rent</option>
                    <option value="Staff Salary">Staff Salary</option>
                    <option value="Tea & Refreshments">Tea & Refreshments</option>
                    <option value="Cleaning & Maintenance">Cleaning & Maintenance</option>
                    <option value="Packaging & Bags">Packaging & Bags</option>
                    <option value="Logistics & Delivery">Logistics & Delivery</option>
                    <option value="Consulting / Service Income">Consulting / Service Income</option>
                    <option value="Miscellaneous">Miscellaneous</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 mb-1 block">Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense((p) => ({ ...p, amount: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-hidden focus:border-teal-500 font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 mb-1 block">Title / Description *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. October shop electricity bill or Monthly water dispenser jar"
                  value={newExpense.title}
                  onChange={(e) => setNewExpense((p) => ({ ...p, title: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-hidden focus:border-teal-500 text-slate-800"
                />
              </div>

              {/* Payee & Payment Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 mb-1 block">Payee / Payer Name</label>
                  <input
                    type="text"
                    placeholder="Vendor, person or employee name"
                    value={newExpense.payeeOrPayer}
                    onChange={(e) => setNewExpense((p) => ({ ...p, payeeOrPayer: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-hidden focus:border-teal-500 text-slate-800"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 mb-1 block">Payment Mode</label>
                  <select
                    value={newExpense.paymentMode}
                    onChange={(e) => setNewExpense((p) => ({ ...p, paymentMode: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-hidden focus:border-teal-500 font-medium text-slate-800"
                  >
                    <option value="cash">Cash (Petty Cash Drawer)</option>
                    <option value="upi">UPI / QR Code</option>
                    <option value="bank_transfer">Bank Transfer / NEFT</option>
                    <option value="card">Card (Debit / Credit)</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
              </div>

              {/* Date & Ref No */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 mb-1 block">Expense Date</label>
                  <input
                    type="date"
                    value={newExpense.expenseDate}
                    onChange={(e) => setNewExpense((p) => ({ ...p, expenseDate: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-hidden focus:border-teal-500 text-slate-800"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 mb-1 block">External Bill / Ref No</label>
                  <input
                    type="text"
                    placeholder="e.g. EB-847291 / UTR"
                    value={newExpense.referenceNo}
                    onChange={(e) => setNewExpense((p) => ({ ...p, referenceNo: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-hidden focus:border-teal-500 text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 mb-1 block">Internal Notes</label>
                <textarea
                  rows={2}
                  placeholder="Additional remarks or handover detail"
                  value={newExpense.notes}
                  onChange={(e) => setNewExpense((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-hidden focus:border-teal-500 text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-lg font-bold text-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingExpense}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold transition shadow-xs disabled:opacity-50"
                >
                  {submittingExpense ? "Recording..." : "Save Voucher"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: PRINTABLE EXPENSE VOUCHER SLIP                     */}
      {/* ========================================================= */}
      {viewingExpense && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <span className="font-bold text-xs uppercase tracking-wider text-slate-500">
                Payment Voucher
              </span>
              <button
                onClick={() => setViewingExpense(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div id="printable-voucher" className="space-y-3 font-mono text-xs text-slate-800 leading-tight">
              <div className="text-center pb-2 border-b border-dashed border-slate-400">
                <h3 className="font-black text-sm uppercase">
                  {viewingExpense.branch?.name || "DRxStore Pharmacy"}
                </h3>
                <p className="text-[10px] text-slate-500">PAYMENT / RECEIPT VOUCHER</p>
                <p className="font-bold mt-1 text-[11px]">{viewingExpense.voucherNo}</p>
              </div>

              <div className="space-y-1 py-1 border-b border-dashed border-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">Date:</span>
                  <span>{new Date(viewingExpense.expenseDate).toLocaleDateString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Type:</span>
                  <span className="font-bold uppercase">{viewingExpense.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Category:</span>
                  <span className="font-semibold">{viewingExpense.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payee / Payer:</span>
                  <span className="font-semibold">{viewingExpense.payeeOrPayer || "Self"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payment Mode:</span>
                  <span className="uppercase">{viewingExpense.paymentMode}</span>
                </div>
                {viewingExpense.referenceNo && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Bill/Ref No:</span>
                    <span>{viewingExpense.referenceNo}</span>
                  </div>
                )}
              </div>

              <div className="py-1">
                <span className="text-slate-500 text-[10px]">Description:</span>
                <p className="font-bold text-slate-900 mt-0.5">{viewingExpense.title}</p>
                {viewingExpense.notes && <p className="text-[10px] text-slate-500 mt-0.5">{viewingExpense.notes}</p>}
              </div>

              <div className="pt-2 border-t border-slate-400 flex justify-between items-center text-sm font-black">
                <span>TOTAL AMOUNT:</span>
                <span>₹{Number(viewingExpense.amount).toFixed(2)}</span>
              </div>
              <div className="text-[9px] text-slate-500 italic">
                Amount in words: {numberToIndianWords(Number(viewingExpense.amount))}
              </div>

              <div className="pt-6 flex justify-between text-[9px] text-slate-400 border-t border-dashed border-slate-300">
                <div className="text-center">
                  <div className="border-t border-slate-400 w-20 pt-0.5">Prepared By</div>
                </div>
                <div className="text-center">
                  <div className="border-t border-slate-400 w-20 pt-0.5">Authorized Sign</div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => window.print()}
                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Voucher
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: PRINTABLE Z-REPORT SLIP                            */}
      {/* ========================================================= */}
      {activeZReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <span className="font-bold text-xs uppercase tracking-wider text-slate-500">
                Register Shift Z-Report
              </span>
              <button
                onClick={() => setActiveZReport(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div id="printable-z-report" className="space-y-2.5 font-mono text-[11px] text-slate-900 leading-tight">
              {/* Header */}
              <div className="text-center pb-2 border-b border-dashed border-slate-400 space-y-0.5">
                <h2 className="font-black text-sm uppercase">
                  {activeZReport.branch?.name || activeZReport.store?.storeName || "DRxStore Pharmacy"}
                </h2>
                <p className="text-[9px] text-slate-600">
                  {activeZReport.branch?.address || activeZReport.store?.storeAddress || ""}
                </p>
                <p className="font-extrabold uppercase pt-1 tracking-wide">
                  --- DAY-END CASH DRAWER Z-REPORT ---
                </p>
                <p className="font-bold text-xs pt-0.5">{activeZReport.closingNumber}</p>
              </div>

              {/* Meta */}
              <div className="py-1 border-b border-dashed border-slate-300 space-y-0.5 text-[10px]">
                <div className="flex justify-between">
                  <span>Shift Close:</span>
                  <span>{new Date(activeZReport.shiftEnd).toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span>Shift Start:</span>
                  <span>{new Date(activeZReport.shiftStart).toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cashier / Staff:</span>
                  <span className="font-bold">{activeZReport.user?.name || "Counter Cashier"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sales Count:</span>
                  <span>{activeZReport.totalSalesCount || 0} Invoices</span>
                </div>
              </div>

              {/* Financial Tally */}
              <div className="py-1 border-b border-dashed border-slate-300 space-y-1">
                <div className="flex justify-between">
                  <span>Opening Float:</span>
                  <span>₹{Number(activeZReport.openingFloat).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-800">
                  <span>+ Cash Sales:</span>
                  <span>₹{Number(activeZReport.cashSales).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-rose-800">
                  <span>- Cash Returns:</span>
                  <span>₹{Number(activeZReport.cashReturns).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-rose-800">
                  <span>- Cash Expenses:</span>
                  <span>₹{Number(activeZReport.cashExpenses).toFixed(2)}</span>
                </div>
                {Number(activeZReport.cashIncomes) > 0 && (
                  <div className="flex justify-between text-emerald-800">
                    <span>+ Cash Incomes:</span>
                    <span>₹{Number(activeZReport.cashIncomes).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold pt-1 border-t border-slate-300">
                  <span>SYSTEM EXPECTED:</span>
                  <span>₹{Number(activeZReport.expectedCash).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-black text-xs text-slate-900">
                  <span>COUNTED PHYSICAL:</span>
                  <span>₹{Number(activeZReport.countedCash).toFixed(2)}</span>
                </div>
                <div
                  className={`flex justify-between font-black pt-1 border-t border-slate-400 ${
                    activeZReport.status === "exact"
                      ? "text-emerald-800"
                      : activeZReport.status === "excess"
                      ? "text-blue-800"
                      : "text-rose-800"
                  }`}
                >
                  <span>RECONCILIATION:</span>
                  <span>
                    {activeZReport.status.toUpperCase()} (
                    {Number(activeZReport.difference) >= 0 ? "+" : ""}
                    ₹{Number(activeZReport.difference).toFixed(2)})
                  </span>
                </div>
              </div>

              {/* Denomination Breakdown */}
              {activeZReport.denominations && (
                <div className="py-1 border-b border-dashed border-slate-300 space-y-0.5 text-[9px]">
                  <p className="font-bold text-[10px] uppercase text-slate-600">Physical Breakdown:</p>
                  {["2000", "500", "200", "100", "50", "20", "10", "5", "2", "1"].map((k) => {
                    const cnt = activeZReport.denominations[k] || 0;
                    if (cnt <= 0) return null;
                    const mult = parseInt(k, 10);
                    return (
                      <div key={k} className="flex justify-between">
                        <span>₹{k} x {cnt}</span>
                        <span>₹{(cnt * mult).toFixed(2)}</span>
                      </div>
                    );
                  })}
                  {activeZReport.denominations.coins > 0 && (
                    <div className="flex justify-between">
                      <span>Coins / Change:</span>
                      <span>₹{Number(activeZReport.denominations.coins).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              {activeZReport.notes && (
                <div className="py-1 text-[9px] text-slate-600 italic">
                  <span>Note: {activeZReport.notes}</span>
                </div>
              )}

              <div className="text-center pt-3 text-[8.5px] text-slate-400 uppercase">
                <p>Register Shift Verified &amp; Signed</p>
                <div className="pt-6 flex justify-between text-slate-500">
                  <span>Cashier Sign</span>
                  <span>Manager Sign</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 print:hidden">
              <button
                onClick={() => window.print()}
                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Z-Report
              </button>
            </div>
          </div>
        </div>
      )}

      {(viewingExpense || activeZReport) && (
        <style jsx global>{`
          @media print {
            body * {
              visibility: hidden !important;
            }
            #${viewingExpense ? "printable-voucher" : "printable-z-report"},
            #${viewingExpense ? "printable-voucher" : "printable-z-report"} * {
              visibility: visible !important;
            }
            #${viewingExpense ? "printable-voucher" : "printable-z-report"} {
              position: fixed !important;
              left: 8mm !important;
              top: 8mm !important;
              width: ${viewingExpense ? "180mm" : "80mm"} !important;
              background: #fff !important;
            }
          }
        `}</style>
      )}
    </div>
  );
}
