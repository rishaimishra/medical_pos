"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Truck,
  Search,
  Plus,
  RefreshCw,
  Loader2,
  Edit2,
  Trash2,
  KeyRound,
  Download,
  AlertTriangle,
  CheckCircle2,
  Phone,
  Mail,
  Building2,
  CreditCard,
  History,
  Send,
  X,
  Copy,
  Check,
} from "lucide-react";
import { useBranchStore } from "@/stores/useBranchStore";

interface SupplierRecord {
  id: number;
  name: string;
  contact?: string | null;
  phone: string;
  email?: string | null;
  address?: string | null;
  gstNo?: string | null;
  dlNo?: string | null;
  paymentTerms: number;
  batchesCount: number;
  purchaseOrdersCount: number;
  paymentsCount: number;
  portalUsersCount: number;
  totalPurchased: number;
  totalPaid: number;
  outstandingBalance: number;
  portalUser?: {
    id: number;
    username: string;
    email: string;
    active: boolean;
    verified: boolean;
  } | null;
  createdAt: string;
}

export default function SuppliersPage() {
  const { activeBranch } = useBranchStore();

  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({
    totalSuppliers: 0,
    totalAccountsPayable: 0,
    totalPurchasesThisMonth: 0,
    activePortalUsers: 0,
  });

  // Modal States
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null);
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    contact: "",
    phone: "",
    email: "",
    address: "",
    gstNo: "",
    dlNo: "",
    paymentTerms: 30,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [savingSupplier, setSavingSupplier] = useState(false);

  // Payable Ledger Modal
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [ledgerSupplier, setLedgerSupplier] = useState<SupplierRecord | null>(null);
  const [ledgerData, setLedgerData] = useState<{
    summary: { totalPurchased: number; totalPaid: number; outstandingBalance: number };
    ledger: any[];
  } | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    paymentMethod: "bank_transfer",
    referenceNo: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Portal User Modal
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [portalSupplier, setPortalSupplier] = useState<SupplierRecord | null>(null);
  const [portalForm, setPortalForm] = useState({
    username: "",
    email: "",
    password: "",
    sendEmail: true,
  });
  const [savingPortal, setSavingPortal] = useState(false);
  const [portalResult, setPortalResult] = useState<{
    username: string;
    password?: string;
    emailSent: boolean;
  } | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);

  // Delete Guard Dialog
  const [deletingSupplier, setDeletingSupplier] = useState<SupplierRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Fetch Suppliers
  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: "25",
        search: search.trim(),
      });
      const res = await fetch(`/api/admin/suppliers?${q.toString()}`);
      const json = await res.json();
      if (json.success) {
        setSuppliers(json.suppliers || []);
        setTotalPages(json.pagination?.totalPages || 1);
        if (json.summary) setSummary(json.summary);
      }
    } catch (err) {
      console.error("Failed to fetch suppliers:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // Open Add/Edit Modal
  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setSupplierForm({
      name: "",
      contact: "",
      phone: "",
      email: "",
      address: "",
      gstNo: "",
      dlNo: "",
      paymentTerms: 30,
    });
    setFormError(null);
    setShowSupplierModal(true);
  };

  const handleOpenEdit = (sup: SupplierRecord) => {
    setEditingSupplier(sup);
    setSupplierForm({
      name: sup.name,
      contact: sup.contact || "",
      phone: sup.phone,
      email: sup.email || "",
      address: sup.address || "",
      gstNo: sup.gstNo || "",
      dlNo: sup.dlNo || "",
      paymentTerms: sup.paymentTerms || 30,
    });
    setFormError(null);
    setShowSupplierModal(true);
  };

  // Save Supplier
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSavingSupplier(true);

    try {
      const payload: any = { ...supplierForm };
      const url = "/api/admin/suppliers";
      const method = editingSupplier ? "PUT" : "POST";
      if (editingSupplier) payload.id = editingSupplier.id;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!json.success) {
        setFormError(json.message || "Failed to save supplier profile");
        setSavingSupplier(false);
        return;
      }

      setShowSupplierModal(false);
      fetchSuppliers();
    } catch (err: any) {
      setFormError(err.message || "An unexpected error occurred");
    } finally {
      setSavingSupplier(false);
    }
  };

  // Open Ledger & Payments Modal
  const handleOpenLedger = async (sup: SupplierRecord) => {
    setLedgerSupplier(sup);
    setShowLedgerModal(true);
    setLoadingLedger(true);
    setPaymentError(null);
    setPaymentForm({
      amount: "",
      paymentMethod: "bank_transfer",
      referenceNo: "",
      paymentDate: new Date().toISOString().slice(0, 10),
      notes: "",
    });

    try {
      const res = await fetch(`/api/admin/suppliers/${sup.id}/payments`);
      const json = await res.json();
      if (json.success) {
        setLedgerData(json);
      }
    } catch (err) {
      console.error("Failed to load ledger:", err);
    } finally {
      setLoadingLedger(false);
    }
  };

  // Submit Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ledgerSupplier) return;
    setPaymentError(null);
    setSavingPayment(true);

    try {
      const res = await fetch(`/api/admin/suppliers/${ledgerSupplier.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...paymentForm,
          branchId: activeBranch?.id,
        }),
      });
      const json = await res.json();

      if (!json.success) {
        setPaymentError(json.message || "Failed to record payment");
        setSavingPayment(false);
        return;
      }

      // Refresh ledger data
      const refreshRes = await fetch(`/api/admin/suppliers/${ledgerSupplier.id}/payments`);
      const refreshJson = await refreshRes.json();
      if (refreshJson.success) setLedgerData(refreshJson);

      setPaymentForm({
        amount: "",
        paymentMethod: "bank_transfer",
        referenceNo: "",
        paymentDate: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      fetchSuppliers();
    } catch (err: any) {
      setPaymentError(err.message || "Payment submission failed");
    } finally {
      setSavingPayment(false);
    }
  };

  // Open Portal User Modal
  const handleOpenPortal = (sup: SupplierRecord) => {
    setPortalSupplier(sup);
    setPortalResult(null);
    setPortalError(null);
    setCopiedPass(false);
    const sanitized = sup.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    setPortalForm({
      username: sup.portalUser?.username || `sup_${sanitized.slice(0, 10)}_${sup.id}`,
      email: sup.email || "",
      password: "",
      sendEmail: true,
    });
    setShowPortalModal(true);
  };

  // Save Portal User
  const handleSavePortalUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalSupplier) return;
    setPortalError(null);
    setSavingPortal(true);

    try {
      const res = await fetch(`/api/admin/suppliers/${portalSupplier.id}/portal-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(portalForm),
      });
      const json = await res.json();

      if (!json.success) {
        setPortalError(json.message || "Failed to create portal user");
        setSavingPortal(false);
        return;
      }

      setPortalResult({
        username: json.credentials.username,
        password: json.credentials.password,
        emailSent: json.emailSent,
      });
      fetchSuppliers();
    } catch (err: any) {
      setPortalError(err.message || "Portal generation failed");
    } finally {
      setSavingPortal(false);
    }
  };

  const [downloadingCSV, setDownloadingCSV] = useState(false);
  const handleDownloadCSV = async () => {
    setDownloadingCSV(true);
    try {
      const res = await fetch("/api/admin/suppliers/export");
      if (!res.ok) {
        alert("Failed to export suppliers. Please ensure you have sufficient permissions.");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `suppliers-directory-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Error exporting CSV: " + (err?.message || "Network error"));
    } finally {
      setDownloadingCSV(false);
    }
  };

  const handleTogglePortalStatus = async () => {
    if (!portalSupplier?.portalUser) return;
    setSavingPortal(true);
    setPortalError(null);
    try {
      const res = await fetch(`/api/admin/suppliers/${portalSupplier.id}/portal-user`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !portalSupplier.portalUser.active }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchSuppliers();
        setShowPortalModal(false);
      } else {
        setPortalError(json.message || "Failed to update portal status");
      }
    } catch (err: any) {
      setPortalError(err.message || "Failed to update portal status");
    } finally {
      setSavingPortal(false);
    }
  };

  // Delete Supplier
  const handleDelete = async () => {
    if (!deletingSupplier) return;
    setDeleteError(null);
    setDeleting(true);

    try {
      const res = await fetch(`/api/admin/suppliers?id=${deletingSupplier.id}`, {
        method: "DELETE",
      });
      const json = await res.json();

      if (!json.success) {
        setDeleteError(json.message || "Cannot delete supplier");
        setDeleting(false);
        return;
      }

      setDeletingSupplier(null);
      fetchSuppliers();
    } catch (err: any) {
      setDeleteError(err.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* 1. Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#EAF5F0] text-[#0F6E56] flex items-center justify-center shadow-xs">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Suppliers & Wholesale Distributors
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Manage medicine vendors, payment terms, accounts payable ledger, and supplier logins
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleDownloadCSV}
            disabled={downloadingCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors disabled:opacity-50"
          >
            {downloadingCSV ? <Loader2 className="w-4 h-4 animate-spin text-slate-500" /> : <Download className="w-4 h-4 text-slate-500" />}
            <span>Download CSV</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F6E56] hover:bg-[#0b5643] text-white text-xs font-extrabold transition-all shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Supplier</span>
          </button>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Total Suppliers
            </span>
            <span className="text-2xl font-extrabold text-slate-900 mt-1 block">
              {summary.totalSuppliers}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">Registered distributors</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[#EAF5F0] text-[#0F6E56] flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-amber-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider block">
              Accounts Payable (Due)
            </span>
            <span className="text-2xl font-extrabold text-amber-950 mt-1 block">
              ₹{summary.totalAccountsPayable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-amber-700 font-medium">Total unsettled vendor credit</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Purchases This Month
            </span>
            <span className="text-2xl font-extrabold text-slate-900 mt-1 block">
              ₹{summary.totalPurchasesThisMonth.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-emerald-600 font-medium">Inwarded & Confirmed POs</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Active Portal Accounts
            </span>
            <span className="text-2xl font-extrabold text-slate-900 mt-1 block">
              {summary.activePortalUsers}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">Distributors with login access</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by vendor name, contact person, phone, or GSTIN..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 focus:border-[#0F6E56]"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchSuppliers()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 4. Suppliers Data Table */}
      <div className="bg-white border border-slate-200/90 rounded-3xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-3.5 px-4">Vendor & Contact</th>
                <th className="py-3.5 px-4">Phone & Email</th>
                <th className="py-3.5 px-4">Tax & Licensing</th>
                <th className="py-3.5 px-4 text-center">Credit Terms</th>
                <th className="py-3.5 px-4 text-right">Total Purchases</th>
                <th className="py-3.5 px-4 text-right">Outstanding Due</th>
                <th className="py-3.5 px-4 text-center">Portal Login</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#0F6E56]" />
                    <span>Loading suppliers directory...</span>
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Truck className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                    <span>No suppliers found matching your search.</span>
                  </td>
                </tr>
              ) : (
                suppliers.map((sup) => (
                  <tr key={sup.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* Name & Contact */}
                    <td className="py-3.5 px-4">
                      <div className="font-extrabold text-slate-900 text-sm">{sup.name}</div>
                      {sup.contact && (
                        <div className="text-[11px] text-slate-500 font-medium">
                          Contact: {sup.contact}
                        </div>
                      )}
                    </td>

                    {/* Phone & Email */}
                    <td className="py-3.5 px-4 space-y-0.5">
                      <div className="flex items-center gap-1.5 text-slate-800 font-bold">
                        <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>{sup.phone}</span>
                      </div>
                      {sup.email && (
                        <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[170px]">{sup.email}</span>
                        </div>
                      )}
                    </td>

                    {/* GSTIN & DL */}
                    <td className="py-3.5 px-4 space-y-0.5 text-[11px]">
                      {sup.gstNo ? (
                        <div className="font-mono text-slate-800">
                          <span className="text-slate-400 font-sans">GST:</span> {sup.gstNo}
                        </div>
                      ) : (
                        <div className="text-slate-400">No GSTIN</div>
                      )}
                      {sup.dlNo && (
                        <div className="font-mono text-slate-600">
                          <span className="text-slate-400 font-sans">DL:</span> {sup.dlNo}
                        </div>
                      )}
                    </td>

                    {/* Credit Terms */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-block px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                        {sup.paymentTerms} Days
                      </span>
                    </td>

                    {/* Total Purchases */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold text-slate-800">
                        ₹{sup.totalPurchased.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {sup.purchaseOrdersCount} PO(s) • {sup.batchesCount} Batches
                      </div>
                    </td>

                    {/* Outstanding Due */}
                    <td className="py-3.5 px-4 text-right">
                      {sup.outstandingBalance > 0 ? (
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-extrabold">
                          ₹{sup.outstandingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-[11px]">
                          All Cleared
                        </span>
                      )}
                    </td>

                    {/* Portal Login */}
                    <td className="py-3.5 px-4 text-center">
                      {sup.portalUser ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-bold">
                          <CheckCircle2 className="w-3 h-3 text-indigo-600" />
                          <span>{sup.portalUser.username}</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleOpenPortal(sup)}
                          className="text-[11px] font-bold text-slate-400 hover:text-indigo-600 transition-colors"
                        >
                          + Create Login
                        </button>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenLedger(sup)}
                          title="View Accounts Payable Ledger & Record Payment"
                          className="p-1.5 rounded-lg border border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-amber-900 transition-colors"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleOpenPortal(sup)}
                          title="Generate or Reset Portal Login"
                          className="p-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-800 transition-colors"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleOpenEdit(sup)}
                          title="Edit Supplier Profile"
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => {
                            setDeleteError(null);
                            setDeletingSupplier(sup);
                          }}
                          title="Delete Supplier"
                          className="p-1.5 rounded-lg border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 transition-colors"
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

      {/* MODAL 1: Add / Edit Supplier */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#EAF5F0] text-[#0F6E56] flex items-center justify-center">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {editingSupplier ? "Edit Supplier Profile" : "Register New Supplier"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Fill in distributor contact, drug license, and payment details
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSupplierModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveSupplier} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Vendor / Company Name *</label>
                  <input
                    type="text"
                    required
                    value={supplierForm.name}
                    onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                    placeholder="e.g. Apex Pharma Distributors"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 focus:border-[#0F6E56]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Contact Person Name</label>
                  <input
                    type="text"
                    value={supplierForm.contact}
                    onChange={(e) => setSupplierForm({ ...supplierForm, contact: e.target.value })}
                    placeholder="e.g. Rajesh Kumar"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 focus:border-[#0F6E56]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 focus:border-[#0F6E56]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Email Address</label>
                  <input
                    type="email"
                    value={supplierForm.email}
                    onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                    placeholder="orders@apexpharma.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 focus:border-[#0F6E56]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">GSTIN / Tax ID</label>
                  <input
                    type="text"
                    value={supplierForm.gstNo}
                    onChange={(e) => setSupplierForm({ ...supplierForm, gstNo: e.target.value.toUpperCase() })}
                    placeholder="e.g. 19AAAAA0000A1Z5"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 uppercase font-mono focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 focus:border-[#0F6E56]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Drug License (DL No)</label>
                  <input
                    type="text"
                    value={supplierForm.dlNo}
                    onChange={(e) => setSupplierForm({ ...supplierForm, dlNo: e.target.value.toUpperCase() })}
                    placeholder="e.g. DL-20B/21B-4592"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 uppercase font-mono focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 focus:border-[#0F6E56]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Payment Terms (Credit Days)</label>
                <div className="flex items-center gap-2">
                  {[15, 30, 45, 60].map((days) => (
                    <button
                      type="button"
                      key={days}
                      onClick={() => setSupplierForm({ ...supplierForm, paymentTerms: days })}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                        supplierForm.paymentTerms === days
                          ? "bg-[#0F6E56] text-white border-[#0F6E56]"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {days} Days
                    </button>
                  ))}
                  <input
                    type="number"
                    min="0"
                    value={supplierForm.paymentTerms}
                    onChange={(e) => setSupplierForm({ ...supplierForm, paymentTerms: parseInt(e.target.value, 10) || 0 })}
                    className="w-24 px-3 py-1.5 rounded-xl border border-slate-200 text-center font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Physical Warehouse / Billing Address</label>
                <textarea
                  rows={2}
                  value={supplierForm.address}
                  onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                  placeholder="Plot 42, Pharma Industrial Estate, Kolkata - 700001"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/20 focus:border-[#0F6E56]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSupplier}
                  className="px-6 py-2.5 rounded-xl bg-[#0F6E56] hover:bg-[#0b5643] text-white font-extrabold flex items-center gap-2 disabled:opacity-50"
                >
                  {savingSupplier && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingSupplier ? "Update Supplier" : "Create Supplier"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Accounts Payable Ledger & Record Payment */}
      {showLedgerModal && ledgerSupplier && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-md">
                  Accounts Payable Ledger
                </span>
                <h3 className="text-lg font-extrabold text-slate-900 mt-1">
                  {ledgerSupplier.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Phone: {ledgerSupplier.phone} • Terms: {ledgerSupplier.paymentTerms} Days
                </p>
              </div>
              <button
                onClick={() => setShowLedgerModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Financial Totals HUD */}
            <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 block">Total Invoiced</span>
                <span className="text-base font-extrabold text-slate-800">
                  ₹{(ledgerData?.summary?.totalPurchased ?? ledgerSupplier.totalPurchased).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Total Payments</span>
                <span className="text-base font-extrabold text-emerald-700">
                  ₹{(ledgerData?.summary?.totalPaid ?? ledgerSupplier.totalPaid).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Net Outstanding Due</span>
                <span className="text-base font-extrabold text-amber-900">
                  ₹{(ledgerData?.summary?.outstandingBalance ?? ledgerSupplier.outstandingBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Record Payment Form */}
            <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/90 space-y-3">
              <h4 className="text-xs font-extrabold text-amber-950 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-amber-800" />
                <span>Record New Vendor Payment</span>
              </h4>

              {paymentError && (
                <div className="p-2.5 rounded-xl bg-rose-100 text-rose-800 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              <form onSubmit={handleRecordPayment} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    placeholder="e.g. 5000"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-amber-300 font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Payment Method</label>
                  <select
                    value={paymentForm.paymentMethod}
                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-amber-300 font-bold focus:outline-none"
                  >
                    <option value="bank_transfer">NEFT / RTGS</option>
                    <option value="cheque">Cheque</option>
                    <option value="upi">UPI / QR</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Ref / Cheque No</label>
                  <input
                    type="text"
                    value={paymentForm.referenceNo}
                    onChange={(e) => setPaymentForm({ ...paymentForm, referenceNo: e.target.value })}
                    placeholder="e.g. UTR123456"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-amber-300 focus:outline-none"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={savingPayment}
                    className="w-full py-2 px-4 rounded-xl bg-amber-800 hover:bg-amber-900 text-white font-extrabold flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    {savingPayment && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Post Payment</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Ledger Timeline / Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <History className="w-4 h-4 text-slate-500" />
                <span>Transaction & Ledger History</span>
              </h4>

              {loadingLedger ? (
                <div className="py-8 text-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[#0F6E56]" />
                  <span>Loading ledger...</span>
                </div>
              ) : !ledgerData?.ledger || ledgerData.ledger.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">
                  No purchases or payments recorded for this supplier yet.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 font-bold text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Document / Ref</th>
                        <th className="py-2.5 px-3 text-right">Debit (Owed)</th>
                        <th className="py-2.5 px-3 text-right">Credit (Paid)</th>
                        <th className="py-2.5 px-3 text-right">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {ledgerData.ledger.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3 font-mono text-slate-500">
                            {new Date(item.date).toISOString().slice(0, 10)}
                          </td>
                          <td className="py-2.5 px-3">
                            {item.type === "purchase" ? (
                              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[10px]">
                                PO Inward
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                                Payment
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            <span className="font-bold">{item.docNumber}</span>
                            {item.invoiceNo && (
                              <span className="text-[11px] text-slate-400 block font-normal">
                                Inv: {item.invoiceNo}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-800">
                            {item.debit > 0 ? `₹${item.debit.toFixed(2)}` : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                            {item.credit > 0 ? `₹${item.credit.toFixed(2)}` : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-extrabold text-amber-900 font-mono">
                            {item.runningBalance !== undefined ? `₹${Number(item.runningBalance).toFixed(2)}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Portal User Login Generator */}
      {showPortalModal && portalSupplier && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Supplier Portal Login
                  </h3>
                  <p className="text-xs text-slate-500">
                    {portalSupplier.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPortalModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {portalResult ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-2">
                  <div className="flex items-center gap-2 font-extrabold text-sm text-emerald-800">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Credentials Ready!</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Provide these credentials to the supplier to log in at <strong>/supplier/login</strong>:
                  </p>
                  <div className="p-3 bg-white rounded-xl border border-emerald-200 font-mono text-xs space-y-1.5">
                    <div>
                      <span className="text-slate-400">Username: </span>
                      <strong className="text-slate-900">{portalResult.username}</strong>
                    </div>
                    {portalResult.password && (
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-slate-400">Password: </span>
                          <strong className="text-emerald-700">{portalResult.password}</strong>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(portalResult.password || "");
                            setCopiedPass(true);
                            setTimeout(() => setCopiedPass(false), 2000);
                          }}
                          className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1 hover:bg-emerald-200"
                        >
                          {copiedPass ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedPass ? "Copied" : "Copy"}</span>
                        </button>
                      </div>
                    )}
                  </div>
                  {portalResult.emailSent && (
                    <div className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                      <Send className="w-3 h-3" />
                      <span>Onboarding email dispatched to supplier!</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setShowPortalModal(false)}
                  className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSavePortalUser} className="space-y-4 text-xs">
                {portalError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
                    {portalError}
                  </div>
                )}

                {portalSupplier.portalUser && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-slate-500 block text-[10px] font-bold uppercase">Account Status</span>
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${portalSupplier.portalUser.active ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                        {portalSupplier.portalUser.active ? "Active" : "Suspended"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleTogglePortalStatus}
                      disabled={savingPortal}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${portalSupplier.portalUser.active ? "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"}`}
                    >
                      {portalSupplier.portalUser.active ? "Suspend Portal Access" : "Reactivate Access"}
                    </button>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Portal Username *</label>
                  <input
                    type="text"
                    required
                    value={portalForm.username}
                    onChange={(e) => setPortalForm({ ...portalForm, username: e.target.value.toLowerCase().trim() })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Notification Email *</label>
                  <input
                    type="email"
                    required
                    value={portalForm.email}
                    onChange={(e) => setPortalForm({ ...portalForm, email: e.target.value.trim() })}
                    placeholder="orders@supplier.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">
                    Password <span className="font-normal text-slate-400">(leave blank to auto-generate)</span>
                  </label>
                  <input
                    type="text"
                    value={portalForm.password}
                    onChange={(e) => setPortalForm({ ...portalForm, password: e.target.value })}
                    placeholder="Auto-generated secure password"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={portalForm.sendEmail}
                    onChange={(e) => setPortalForm({ ...portalForm, sendEmail: e.target.checked })}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-slate-700 font-medium">Send login credentials email to supplier</span>
                </label>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowPortalModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingPortal}
                    className="px-5 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {savingPortal && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{portalSupplier.portalUser ? "Reset Credentials" : "Generate Login"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 4: Delete Supplier Confirmation Guard */}
      {deletingSupplier && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-extrabold text-slate-900">
                Delete Supplier Profile?
              </h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to remove <strong>{deletingSupplier.name}</strong>?
              </p>
            </div>

            {deleteError && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold leading-relaxed">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingSupplier(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 font-bold text-xs text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-2 disabled:opacity-50"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete Supplier</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

