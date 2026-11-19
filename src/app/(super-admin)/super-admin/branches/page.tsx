"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { toast } from "@/stores/useToastStore";

export default function SuperAdminBranchesPage() {
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [summary, setSummary] = useState({ total: 0, activeCount: 0, missingComplianceCount: 0 });

  const [storeId, setStoreId] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [compliance, setCompliance] = useState("all");
  const [search, setSearch] = useState("");
  const [drawerBranch, setDrawerBranch] = useState<any>(null);

  const loadBranches = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        storeId,
        type: typeFilter,
        compliance,
        ...(search.trim() ? { search: search.trim() } : {}),
      });
      const res = await fetch(`/api/super-admin/branches?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setBranches(json.branches || []);
        setStores(json.stores || []);
        if (json.summary) setSummary(json.summary);
      }
    } catch {
      toast.error("Failed to load branches explorer");
    } finally {
      setLoading(false);
    }
  }, [storeId, typeFilter, compliance, search]);

  useEffect(() => {
    const t = setTimeout(() => loadBranches(), 150);
    return () => clearTimeout(t);
  }, [loadBranches]);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-teal-700" />
            <span>Global Cross-Store Branches Explorer</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Total: <strong>{summary.total}</strong> outlets • Active:{" "}
            <strong>{summary.activeCount}</strong> • Missing DL/GSTIN:{" "}
            <strong className="text-amber-700">{summary.missingComplianceCount}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="bg-white border border-slate-300 rounded-xl px-3 py-2 font-semibold"
          >
            <option value="all">All Stores</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.storeName || `Store #${s.id}`}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-white border border-slate-300 rounded-xl px-3 py-2 font-semibold"
          >
            <option value="all">All Types</option>
            <option value="main">MAIN Only</option>
            <option value="sub">Sub-Branches</option>
          </select>
          <select
            value={compliance}
            onChange={(e) => setCompliance(e.target.value)}
            className="bg-white border border-slate-300 rounded-xl px-3 py-2 font-semibold"
          >
            <option value="all">Compliance: All</option>
            <option value="complete">DL &amp; GSTIN Present</option>
            <option value="missing">Missing DL / GSTIN</option>
          </select>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Code, branch, DL..."
              className="bg-white border border-slate-300 rounded-xl pl-8 pr-3 py-2 w-48 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
            <span>Loading branches across stores...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                  <th className="py-3 px-4">Branch &amp; Parent Store</th>
                  <th className="py-3 px-3">DL / GSTIN Compliance</th>
                  <th className="py-3 px-3">Staff / SKUs</th>
                  <th className="py-3 px-3 text-right">Stock Cost</th>
                  <th className="py-3 px-3 text-right">30d Sales</th>
                  <th className="py-3 px-3">Last Z-Report</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => setDrawerBranch(b)}
                        className="font-extrabold text-slate-900 hover:text-teal-700 text-left cursor-pointer"
                      >
                        {b.name} ({b.code})
                      </button>
                      {b.isMain && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 text-[10px] font-bold">
                          MAIN
                        </span>
                      )}
                      <p className="text-[11px] text-slate-500">
                        Store:{" "}
                        <Link
                          href={`/super-admin/stores/${b.storeId}`}
                          className="text-teal-700 hover:underline font-semibold"
                        >
                          {b.storeName}
                        </Link>
                      </p>
                    </td>
                    <td className="py-3 px-3">
                      {b.complianceComplete ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3" /> Complete
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold">
                          <AlertTriangle className="w-3 h-3" /> Missing ID
                        </span>
                      )}
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        GST: {b.effectiveGst || "—"} • DL: {b.effectiveDl || "—"}
                      </p>
                    </td>
                    <td className="py-3 px-3">
                      {b.staffCount} staff • {b.batchSkuCount} SKUs
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      ₹{b.stockValue.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                      ₹{b.sales30d.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3 px-3 text-[11px] text-slate-500">
                      {b.lastClosing ? new Date(b.lastClosing.shiftEnd).toLocaleDateString("en-IN") : "Never"}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <Link
                        href={`/super-admin/branches/${b.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold"
                      >
                        <span>Inspect</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Inline Inspection Drawer */}
      {drawerBranch && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex justify-end" onClick={() => setDrawerBranch(null)}>
          <div className="w-full max-w-md bg-white h-full p-6 overflow-y-auto shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900">
                  {drawerBranch.name} ({drawerBranch.code})
                </h3>
                <p className="text-xs text-slate-500">{drawerBranch.storeName}</p>
              </div>
              <button type="button" onClick={() => setDrawerBranch(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <p><strong>Address:</strong> {drawerBranch.address || "—"}</p>
              <p><strong>Phone / Email:</strong> {drawerBranch.phone || "—"} / {drawerBranch.email || "—"}</p>
              <p><strong>Effective GSTIN:</strong> {drawerBranch.effectiveGst || "Missing"}</p>
              <p><strong>Effective Drug License:</strong> {drawerBranch.effectiveDl || "Missing"}</p>
              <p><strong>30-Day Revenue:</strong> ₹{drawerBranch.sales30d.toLocaleString("en-IN")} ({drawerBranch.invoices30d} bills)</p>
              <p><strong>Stock Cost Value:</strong> ₹{drawerBranch.stockValue.toLocaleString("en-IN")}</p>
            </div>
            <div className="pt-3 flex gap-2">
              <Link
                href={`/super-admin/branches/${drawerBranch.id}`}
                className="flex-1 py-2.5 rounded-xl bg-teal-700 text-white text-center text-xs font-bold"
              >
                Open Branch Deep-Dive
              </Link>
              <Link
                href={`/super-admin/stores/${drawerBranch.storeId}`}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-center text-xs font-bold"
              >
                Parent Store 360°
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
