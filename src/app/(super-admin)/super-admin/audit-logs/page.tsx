"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Building2,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "@/stores/useToastStore";

export default function SuperAdminAuditLogsPage() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, totalCount: 0 });
  const [filterOptions, setFilterOptions] = useState<{
    stores: any[];
    branches: any[];
    actions: string[];
  }>({ stores: [], branches: [], actions: [] });

  const [source, setSource] = useState<"all" | "platform" | "store">("all");
  const [storeId, setStoreId] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [action, setAction] = useState("all");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        source,
        storeId,
        branchId,
        action,
        page: String(page),
        limit: "50",
      });
      if (search.trim()) qs.set("search", search.trim());
      if (startDate) qs.set("startDate", startDate);
      if (endDate) qs.set("endDate", endDate);

      const res = await fetch(`/api/super-admin/audit-logs?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setLogs(json.logs || []);
        setSummary(json.summary || null);
        setPagination(json.pagination || { page: 1, totalPages: 1, totalCount: 0 });
        setFilterOptions(json.filterOptions || { stores: [], branches: [], actions: [] });
      } else {
        toast.error(json.message || "Failed to load audit trail");
      }
    } catch {
      toast.error("Network error loading unified audit logs");
    } finally {
      setLoading(false);
    }
  }, [source, storeId, branchId, action, search, startDate, endDate, page]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const exportAudit = (format: "csv" | "xlsx") => {
    const qs = new URLSearchParams({ source, storeId, branchId, action, format });
    if (search.trim()) qs.set("search", search.trim());
    if (startDate) qs.set("startDate", startDate);
    if (endDate) qs.set("endDate", endDate);
    window.open(`/api/super-admin/audit-logs?${qs.toString()}`, "_blank");
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-teal-700" />
            <span>Global Platform &amp; Cross-Store Forensic Audit Trail</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Search immutable Platform CEO governance actions (plans, impersonation, manual grants) &amp; Store security events across all branches.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportAudit("xlsx")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Forensic Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => exportAudit("csv")}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            type="button"
            onClick={loadLogs}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Summary Cards + Source Switcher */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => {
            setSource("all");
            setPage(1);
          }}
          className={`text-left p-4 rounded-2xl border cursor-pointer transition-colors ${
            source === "all" ? "bg-teal-50/70 border-teal-500" : "bg-white border-slate-200"
          }`}
        >
          <div className="text-[11px] font-bold text-slate-500">Unified Timeline Events</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{summary?.totalEvents ?? 0}</div>
        </button>
        <button
          type="button"
          onClick={() => {
            setSource("platform");
            setBranchId("all");
            setPage(1);
          }}
          className={`text-left p-4 rounded-2xl border cursor-pointer transition-colors ${
            source === "platform" ? "bg-indigo-50/70 border-indigo-500" : "bg-white border-slate-200"
          }`}
        >
          <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-700" />
            Platform CEO Governance Logs
          </div>
          <div className="text-2xl font-extrabold text-indigo-700 mt-1">{summary?.platformEvents ?? 0}</div>
        </button>
        <button
          type="button"
          onClick={() => {
            setSource("store");
            setPage(1);
          }}
          className={`text-left p-4 rounded-2xl border cursor-pointer transition-colors ${
            source === "store" ? "bg-emerald-50/70 border-emerald-500" : "bg-white border-slate-200"
          }`}
        >
          <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5 text-emerald-700" />
            Store &amp; Branch Security Logs
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1">{summary?.storeEvents ?? 0}</div>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
        <div className="lg:col-span-2 relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search action, actor, IP, details..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200"
          />
        </div>
        <select
          value={storeId}
          onChange={(e) => {
            setStoreId(e.target.value);
            setBranchId("all");
            setPage(1);
          }}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold"
        >
          <option value="all">All Stores</option>
          {filterOptions.stores.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.storeName || `Store #${s.id}`}
            </option>
          ))}
        </select>
        <select
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
            setPage(1);
          }}
          disabled={source === "platform"}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold disabled:opacity-50"
        >
          <option value="all">All Branches</option>
          {filterOptions.branches.map((b) => (
            <option key={b.id} value={String(b.id)}>
              [{b.code}] {b.name}
            </option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold"
        >
          <option value="all">All Actions</option>
          {filterOptions.actions.map((act) => (
            <option key={act} value={act}>
              {act}
            </option>
          ))}
        </select>
        <div className="flex gap-1.5">
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="w-1/2 px-2 py-1.5 rounded-lg border border-slate-200 text-[11px]"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className="w-1/2 px-2 py-1.5 rounded-lg border border-slate-200 text-[11px]"
          />
        </div>
      </div>

      {/* Audit Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-teal-700 mb-2" />
            <p className="text-xs font-semibold">Querying unified audit ledger...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-3">Source</th>
                  <th className="py-3 px-3">Store / Branch</th>
                  <th className="py-3 px-3">Actor &amp; IP</th>
                  <th className="py-3 px-3">Action / Entity</th>
                  <th className="py-3 px-4">Forensic Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      No matching audit events found.
                    </td>
                  </tr>
                ) : (
                  logs.map((row) => (
                    <tr key={row.uid} className="hover:bg-slate-50/70 align-top">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString("en-IN")}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            row.source === "platform"
                              ? "bg-indigo-50 text-indigo-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {row.source}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{row.storeName}</div>
                        {row.branchName && <div className="text-[10px] text-slate-500">{row.branchName}</div>}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800">{row.actorName}</div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {row.actorRole} • {row.ipAddress}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-mono font-bold text-teal-800">{row.action}</div>
                        <div className="text-[10px] text-slate-500">
                          {row.entity}
                          {row.entityId ? ` #${row.entityId}` : ""}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600 max-w-md break-words">
                        {row.details || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>
            Showing page {pagination.page} of {pagination.totalPages} ({pagination.totalCount} events)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
