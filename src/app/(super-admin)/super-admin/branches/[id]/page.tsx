"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  CreditCard,
  GitBranch,
  Loader2,
  Package,
  Power,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "@/stores/useToastStore";

type BranchTab = "staff" | "batches" | "sales" | "returns" | "expenses" | "closings";

function formatInr(amount: number): string {
  return `₹${Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SuperAdminBranchDetailContent() {
  const params = useParams();
  const branchId = String(params?.id || "");

  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [activeTab, setActiveTab] = useState<BranchTab>("staff");
  const [data, setData] = useState<{
    branch: any;
    staff: any[];
    batches: any[];
    recentSales: any[];
    recentReturns: any[];
    recentExpenses: any[];
    cashClosings: any[];
  } | null>(null);

  const loadDetail = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/super-admin/branches/${branchId}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Failed to load branch details");
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      toast.error("Failed to fetch branch deep-dive");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleToggleActive = async () => {
    if (!data?.branch || toggling) return;
    const nextActive = !data.branch.active;
    setToggling(true);
    try {
      const res = await fetch(`/api/super-admin/branches/${data.branch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Failed to update branch status");
      } else {
        toast.success(nextActive ? "Branch activated" : "Branch deactivated");
        await loadDetail();
      }
    } catch {
      toast.error("Network error while updating branch");
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-16 flex flex-col items-center justify-center text-slate-500">
        <Loader2 className="w-7 h-7 animate-spin text-teal-700 mb-2" />
        <p className="text-sm font-medium">Loading branch operational deep-dive...</p>
      </div>
    );
  }

  if (!data?.branch) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-amber-600 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Branch Not Found</h2>
        <p className="text-sm text-slate-500">
          This outlet record may have been removed or you do not have access.
        </p>
        <Link
          href="/super-admin/branches"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Branches Explorer
        </Link>
      </div>
    );
  }

  const { branch, staff, batches, recentSales, recentReturns, recentExpenses, cashClosings } = data;
  const todayMidnight = new Date();
  todayMidnight.setUTCHours(0, 0, 0, 0);
  const thirtyAhead = new Date(todayMidnight.getTime() + 30 * 24 * 60 * 60 * 1000);

  const tabs: { id: BranchTab; label: string; count: number; icon: React.ReactNode }[] = [
    { id: "staff", label: "Assigned Staff", count: staff.length, icon: <Users className="w-3.5 h-3.5" /> },
    { id: "batches", label: "Batches & Expiry", count: batches.length, icon: <Package className="w-3.5 h-3.5" /> },
    { id: "sales", label: "Recent Sales", count: recentSales.length, icon: <Receipt className="w-3.5 h-3.5" /> },
    { id: "returns", label: "Returns", count: recentReturns.length, icon: <RotateCcw className="w-3.5 h-3.5" /> },
    { id: "expenses", label: "Expenses", count: recentExpenses.length, icon: <Wallet className="w-3.5 h-3.5" /> },
    { id: "closings", label: "Cash Z-Reports", count: cashClosings.length, icon: <CreditCard className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Link
                href="/super-admin/branches"
                className="inline-flex items-center gap-1 hover:text-teal-700 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Branches Explorer
              </Link>
              <span>/</span>
              {branch.store && (
                <>
                  <Link
                    href={`/super-admin/stores/${branch.store.id}`}
                    className="inline-flex items-center gap-1 text-teal-700 hover:underline font-semibold"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    {branch.store.storeName}
                  </Link>
                  <span>/</span>
                </>
              )}
              <span className="font-mono text-slate-700">{branch.code}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <GitBranch className="w-5 h-5 text-teal-700" />
              <h1 className="text-xl font-extrabold text-slate-900">{branch.name}</h1>
              {branch.isMain && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  PRIMARY MAIN
                </span>
              )}
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                  branch.active
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-rose-50 text-rose-700 border-rose-200"
                }`}
              >
                {branch.active ? "Active" : "Inactive"}
              </span>
            </div>

            <p className="text-xs text-slate-500">
              {branch.address || "No street address recorded"}
              {branch.phone ? ` • Tel: ${branch.phone}` : ""}
              {branch.email ? ` • ${branch.email}` : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleActive}
              disabled={toggling || (branch.isMain && branch.active)}
              title={
                branch.isMain && branch.active
                  ? "Primary MAIN branch cannot be deactivated"
                  : branch.active
                  ? "Deactivate this outlet"
                  : "Activate this outlet"
              }
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                branch.active
                  ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                  : "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {toggling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Power className="w-3.5 h-3.5" />
              )}
              {branch.active ? "Deactivate Branch" : "Activate Branch"}
            </button>
          </div>
        </div>

        {/* Compliance & Licensing Strip */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500 font-medium">Drug License (DL):</span>
            {branch.dlNo ? (
              <span className="font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                {branch.dlNo}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                <AlertTriangle className="w-3 h-3" /> Missing DL No
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">GSTIN:</span>
            {branch.gstNo ? (
              <span className="font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                {branch.gstNo}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                <AlertTriangle className="w-3 h-3" /> Missing GSTIN
              </span>
            )}
          </div>
          {branch.store?.storeStatus && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-slate-500">Tenant Status:</span>
              <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold text-slate-700 uppercase text-[10px]">
                {branch.store.storeStatus}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">30-Day Sales Volume</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{formatInr(branch.sales30d)}</div>
          <div className="text-[11px] text-slate-500 mt-1">{branch.invoices30d} invoice(s) billed</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Inventory Valuation (Cost)</div>
          <div className="text-2xl font-extrabold text-teal-700 mt-1">{formatInr(branch.stockValue)}</div>
          <div className="text-[11px] text-slate-500 mt-1">Across {batches.length} tracked batch(es)</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Expired Batches (In Stock)</div>
          <div
            className={`text-2xl font-extrabold mt-1 ${
              branch.expiredCount > 0 ? "text-rose-600" : "text-emerald-700"
            }`}
          >
            {branch.expiredCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {branch.expiredCount > 0 ? "Immediate write-off audit needed" : "Zero expired shelf stock"}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Expiring Within 30 Days</div>
          <div
            className={`text-2xl font-extrabold mt-1 ${
              branch.expiring30Count > 0 ? "text-amber-600" : "text-slate-900"
            }`}
          >
            {branch.expiring30Count}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Near-expiry FEFO monitor</div>
        </div>
      </div>

      {/* Tabs Navigation + Content */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="border-b border-slate-200 px-3 pt-2 flex flex-wrap gap-1 bg-slate-50/70">
          {tabs.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  active
                    ? "border-teal-700 text-teal-800 bg-white rounded-t-lg"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    active ? "bg-teal-50 text-teal-700" : "bg-slate-200/70 text-slate-600"
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="p-0 overflow-x-auto">
          {activeTab === "staff" && (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Last Login</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      No staff accounts assigned directly to this branch.
                    </td>
                  </tr>
                ) : (
                  staff.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-semibold text-slate-900">{u.name}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{u.username}</td>
                      <td className="py-3 px-4 text-slate-600">{u.email || "—"}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold uppercase text-[10px]">
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500">{formatDateTime(u.lastLogin)}</td>
                      <td className="py-3 px-4">
                        {u.active ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Active
                          </span>
                        ) : (
                          <span className="text-rose-600 font-semibold">Disabled</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === "batches" && (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Medicine</th>
                  <th className="py-3 px-4">Batch No</th>
                  <th className="py-3 px-4">Expiry Date</th>
                  <th className="py-3 px-4 text-right">Stock Qty</th>
                  <th className="py-3 px-4 text-right">Purchase Cost</th>
                  <th className="py-3 px-4 text-right">MRP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      No inventory batches found in this branch.
                    </td>
                  </tr>
                ) : (
                  batches.map((b) => {
                    const exp = new Date(b.expiryDate);
                    const isExpired = b.quantity > 0 && exp <= todayMidnight;
                    const isNear = b.quantity > 0 && !isExpired && exp <= thirtyAhead;
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{b.medicineName}</div>
                          <div className="text-[11px] text-slate-500">{b.category}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700">{b.batchNo}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded font-semibold ${
                              isExpired
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : isNear
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "text-slate-700"
                            }`}
                          >
                            {formatDate(b.expiryDate)}
                            {isExpired ? " (EXPIRED)" : isNear ? " (<30d)" : ""}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">{b.quantity}</td>
                        <td className="py-3 px-4 text-right text-slate-600">{formatInr(b.purchasePrice)}</td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-800">{formatInr(b.mrp)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {activeTab === "sales" && (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Invoice No</th>
                  <th className="py-3 px-4">Sale Date</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4 text-right">Grand Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentSales.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400">
                      No POS sales recorded at this branch yet.
                    </td>
                  </tr>
                ) : (
                  recentSales.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{s.invoiceNo}</td>
                      <td className="py-3 px-4 text-slate-600">{formatDateTime(s.saleDate)}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{s.customerName}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold uppercase text-[10px]">
                          {s.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-teal-700">
                        {formatInr(s.grandTotal)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === "returns" && (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Return No</th>
                  <th className="py-3 px-4">Original Invoice</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Refund Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentReturns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400">
                      No sales returns processed in this branch.
                    </td>
                  </tr>
                ) : (
                  recentReturns.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{r.returnNumber}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{r.invoiceNo}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold uppercase text-[10px]">
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{formatDateTime(r.createdAt)}</td>
                      <td className="py-3 px-4 text-right font-bold text-rose-700">
                        {formatInr(r.refundAmount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === "expenses" && (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Voucher No</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Title</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      No expense vouchers logged in this branch.
                    </td>
                  </tr>
                ) : (
                  recentExpenses.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{e.voucherNo}</td>
                      <td className="py-3 px-4 uppercase text-[10px] font-semibold text-slate-600">{e.type}</td>
                      <td className="py-3 px-4 text-slate-700">{e.category}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{e.title}</td>
                      <td className="py-3 px-4 text-slate-500">{formatDate(e.expenseDate)}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">{formatInr(e.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === "closings" && (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Closing No</th>
                  <th className="py-3 px-4">Cashier</th>
                  <th className="py-3 px-4">Shift End</th>
                  <th className="py-3 px-4 text-right">Expected Cash</th>
                  <th className="py-3 px-4 text-right">Counted Cash</th>
                  <th className="py-3 px-4 text-right">Variance</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cashClosings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      No day-end Z-Report closings recorded in this branch.
                    </td>
                  </tr>
                ) : (
                  cashClosings.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{c.closingNumber}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{c.cashierName}</td>
                      <td className="py-3 px-4 text-slate-600">{formatDateTime(c.shiftEnd)}</td>
                      <td className="py-3 px-4 text-right text-slate-700">{formatInr(c.expectedCash)}</td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-900">
                        {formatInr(c.countedCash)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold ${
                          c.difference < 0
                            ? "text-rose-600"
                            : c.difference > 0
                            ? "text-emerald-700"
                            : "text-slate-600"
                        }`}
                      >
                        {c.difference > 0 ? `+${formatInr(c.difference)}` : formatInr(c.difference)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold uppercase text-[10px]">
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminBranchDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 flex flex-col items-center justify-center text-slate-500">
          <Loader2 className="w-7 h-7 animate-spin text-teal-700 mb-2" />
          <p className="text-xs font-semibold">Loading Branch Explorer...</p>
        </div>
      }
    >
      <SuperAdminBranchDetailContent />
    </Suspense>
  );
}
