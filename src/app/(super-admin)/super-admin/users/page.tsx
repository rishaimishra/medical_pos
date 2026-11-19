"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  Loader2,
  Power,
  Search,
  Shield,
  Truck,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "@/stores/useToastStore";

type UserTab = "store_admins" | "staff" | "suppliers" | "patients" | "platform";

const PLATFORM_ROLES = [
  { value: "ceo", label: "CEO (Full Owner)" },
  { value: "platform_admin", label: "Platform Admin" },
  { value: "finance_ops", label: "Finance Ops" },
  { value: "support_viewer", label: "Support Viewer" },
];

function formatDateTime(iso?: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Never";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SuperAdminUsersPage() {
  const [tab, setTab] = useState<UserTab>("store_admins");
  const [search, setSearch] = useState("");
  const [storeId, setStoreId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [mutatingKey, setMutatingKey] = useState<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [stores, setStores] = useState<{ id: number; storeName: string }[]>([]);
  const [counts, setCounts] = useState({
    storeAdmins: 0,
    staff: 0,
    suppliers: 0,
    patients: 0,
    platform: 0,
  });
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });

  const [me, setMe] = useState<{ platformUserId: number; role: string } | null>(null);

  // CEO Add Platform Operator modal
  const [showAddOperator, setShowAddOperator] = useState(false);
  const [creatingOperator, setCreatingOperator] = useState(false);
  const [opForm, setOpForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    role: "platform_admin",
  });

  useEffect(() => {
    fetch("/api/auth/super-admin", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json?.authenticated && json.platformUser) {
          setMe({
            platformUserId: json.platformUser.platformUserId,
            role: json.platformUser.role,
          });
        }
      })
      .catch(() => {});
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        tab,
        storeId,
        status: statusFilter,
        page: String(page),
        limit: "25",
        ...(search.trim() ? { search: search.trim() } : {}),
      });
      const res = await fetch(`/api/super-admin/users?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Failed to load users");
      } else {
        setUsers(json.users || []);
        setStores(json.stores || []);
        if (json.counts) setCounts(json.counts);
        if (json.pagination) setPagination(json.pagination);
      }
    } catch {
      toast.error("Failed to fetch global users directory");
    } finally {
      setLoading(false);
    }
  }, [tab, storeId, statusFilter, page, search]);

  useEffect(() => {
    const t = setTimeout(() => loadUsers(), 150);
    return () => clearTimeout(t);
  }, [loadUsers]);

  const handleTabSwitch = (next: UserTab) => {
    setTab(next);
    setPage(1);
  };

  const userTypeForTab = (t: UserTab): "store_user" | "supplier_user" | "customer" | "platform_user" => {
    if (t === "suppliers") return "supplier_user";
    if (t === "patients") return "customer";
    if (t === "platform") return "platform_user";
    return "store_user";
  };

  const handleToggleActive = async (row: any) => {
    const userType = userTypeForTab(tab);
    const key = `${userType}:${row.id}`;
    setMutatingKey(key);
    try {
      const res = await fetch("/api/super-admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userType, id: row.id, active: !row.active }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Action blocked or failed");
      } else {
        toast.success(json.active ? "Account activated" : "Account deactivated");
        await loadUsers();
      }
    } catch {
      toast.error("Failed to update user status");
    } finally {
      setMutatingKey(null);
    }
  };

  const handlePlatformRoleChange = async (id: number, nextRole: string) => {
    const key = `role:${id}`;
    setMutatingKey(key);
    try {
      const res = await fetch("/api/super-admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userType: "platform_user", id, role: nextRole }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Failed to update role");
      } else {
        toast.success(`Role updated to ${json.role}`);
        await loadUsers();
      }
    } catch {
      toast.error("Failed to change platform role");
    } finally {
      setMutatingKey(null);
    }
  };

  const handleCreateOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingOperator(true);
    try {
      const res = await fetch("/api/auth/super-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_team_user", ...opForm }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Failed to create platform operator");
      } else {
        toast.success("Platform operator created");
        setShowAddOperator(false);
        setOpForm({ name: "", username: "", email: "", password: "", role: "platform_admin" });
        setTab("platform");
        setPage(1);
        await loadUsers();
      }
    } catch {
      toast.error("Network error creating operator");
    } finally {
      setCreatingOperator(false);
    }
  };

  const tabItems: { id: UserTab; label: string; count: number; icon: React.ReactNode }[] = [
    { id: "store_admins", label: "Store Admins", count: counts.storeAdmins, icon: <Building2 className="w-3.5 h-3.5" /> },
    { id: "staff", label: "Branch Staff", count: counts.staff, icon: <UserCheck className="w-3.5 h-3.5" /> },
    { id: "suppliers", label: "Supplier Portal", count: counts.suppliers, icon: <Truck className="w-3.5 h-3.5" /> },
    { id: "patients", label: "Patient Portal", count: counts.patients, icon: <HeartPulse className="w-3.5 h-3.5" /> },
    { id: "platform", label: "Platform Team", count: counts.platform, icon: <Shield className="w-3.5 h-3.5" /> },
  ];

  const isCeo = me?.role === "ceo";
  const canMutateTenants = me?.role === "ceo" || me?.role === "platform_admin";

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-700" />
            <span>Global Cross-Tenant Users Directory</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Inspect and govern store owners, pharmacy staff, vendor portal logins, registered patients, and SaaS platform operators.
          </p>
        </div>

        {isCeo && (
          <button
            onClick={() => setShowAddOperator(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            Add Platform Operator
          </button>
        )}
      </div>

      {/* 5-Tab Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-1.5 shadow-xs flex flex-wrap gap-1">
        {tabItems.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabSwitch(item.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                active
                  ? "bg-teal-700 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  active ? "bg-teal-800 text-teal-100" : "bg-slate-100 text-slate-600"
                }`}
              >
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={
              tab === "patients"
                ? "Search patient name, phone, or email..."
                : "Search name, username, email..."
            }
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />
        </div>

        {tab !== "platform" && (
          <select
            value={storeId}
            onChange={(e) => {
              setStoreId(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 font-medium"
          >
            <option value="all">All Stores ({stores.length})</option>
            {stores.map((s) => (
              <option key={s.id} value={String(s.id)}>
                #{s.id} — {s.storeName}
              </option>
            ))}
          </select>
        )}

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 font-medium"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="inactive">Disabled / Inactive</option>
        </select>
      </div>

      {/* Directory Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
              {(tab === "store_admins" || tab === "staff") && (
                <tr>
                  <th className="py-3 px-4">User Account</th>
                  <th className="py-3 px-4">Store Tenant</th>
                  <th className="py-3 px-4">Branch Outlet</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Last Login</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              )}
              {tab === "suppliers" && (
                <tr>
                  <th className="py-3 px-4">Supplier Contact</th>
                  <th className="py-3 px-4">Vendor Company</th>
                  <th className="py-3 px-4">Store Tenant</th>
                  <th className="py-3 px-4">Verified</th>
                  <th className="py-3 px-4">Last Login</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              )}
              {tab === "patients" && (
                <tr>
                  <th className="py-3 px-4">Patient</th>
                  <th className="py-3 px-4">Primary Store</th>
                  <th className="py-3 px-4">Tags / Verified</th>
                  <th className="py-3 px-4 text-right">Bills</th>
                  <th className="py-3 px-4">Last Login</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              )}
              {tab === "platform" && (
                <tr>
                  <th className="py-3 px-4">Operator</th>
                  <th className="py-3 px-4">Platform Role</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4">Last Login</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1 text-teal-700" />
                    Loading users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No matching accounts found in this category.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const key = `${userTypeForTab(tab)}:${u.id}`;
                  const busy = mutatingKey === key || mutatingKey === `role:${u.id}`;

                  if (tab === "store_admins" || tab === "staff") {
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{u.name}</div>
                          <div className="text-[11px] text-slate-500">
                            <span className="font-mono">{u.username}</span>
                            {u.email ? ` • ${u.email}` : ""}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {u.store ? (
                            <Link
                              href={`/super-admin/stores/${u.storeId}`}
                              className="text-teal-700 font-semibold hover:underline"
                            >
                              {u.store.storeName}
                            </Link>
                          ) : (
                            <span className="text-slate-400">#{u.storeId}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {u.branch ? (
                            <span>
                              {u.branch.name}{" "}
                              <span className="font-mono text-[10px] text-slate-400">({u.branch.code})</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">Store-wide</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold uppercase text-[10px]">
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">{formatDateTime(u.lastLogin)}</td>
                        <td className="py-3 px-4">
                          {u.active ? (
                            <span className="text-emerald-700 font-semibold">Active</span>
                          ) : (
                            <span className="text-rose-600 font-semibold">Disabled</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {canMutateTenants && (
                            <button
                              onClick={() => handleToggleActive(u)}
                              disabled={busy}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border ${
                                u.active
                                  ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                                  : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              }`}
                            >
                              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                              {u.active ? "Disable" : "Enable"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  }

                  if (tab === "suppliers") {
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{u.name}</div>
                          <div className="text-[11px] text-slate-500">
                            <span className="font-mono">{u.username}</span> • {u.phone || u.email || "No contact"}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800">
                          {u.supplier?.name || "—"}
                        </td>
                        <td className="py-3 px-4">
                          {u.supplier?.store ? (
                            <Link
                              href={`/super-admin/stores/${u.supplier.storeId}`}
                              className="text-teal-700 font-semibold hover:underline"
                            >
                              {u.supplier.store.storeName}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {u.verified ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                            </span>
                          ) : (
                            <span className="text-amber-700">Pending</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500">{formatDateTime(u.lastLogin)}</td>
                        <td className="py-3 px-4">
                          {u.active ? (
                            <span className="text-emerald-700 font-semibold">Active</span>
                          ) : (
                            <span className="text-rose-600 font-semibold">Disabled</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {canMutateTenants && (
                            <button
                              onClick={() => handleToggleActive(u)}
                              disabled={busy}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border ${
                                u.active
                                  ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                                  : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              }`}
                            >
                              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                              {u.active ? "Disable" : "Enable"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  }

                  if (tab === "patients") {
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{u.name}</div>
                          <div className="text-[11px] text-slate-500">
                            <span className="font-mono">{u.phone}</span>
                            {u.email ? ` • ${u.email}` : ""}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {u.store ? (
                            <Link
                              href={`/super-admin/stores/${u.storeId}`}
                              className="text-teal-700 font-semibold hover:underline"
                            >
                              {u.store.storeName}
                            </Link>
                          ) : (
                            `#${u.storeId}`
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {u.verified && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold text-[10px]">
                                Portal Registered
                              </span>
                            )}
                            {u.isChronic && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold text-[10px]">
                                Chronic
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-800">
                          {u._count?.sales ?? 0}
                        </td>
                        <td className="py-3 px-4 text-slate-500">{formatDateTime(u.lastLogin)}</td>
                        <td className="py-3 px-4">
                          {u.active ? (
                            <span className="text-emerald-700 font-semibold">Active</span>
                          ) : (
                            <span className="text-rose-600 font-semibold">Disabled</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {canMutateTenants && (
                            <button
                              onClick={() => handleToggleActive(u)}
                              disabled={busy}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border ${
                                u.active
                                  ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                                  : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              }`}
                            >
                              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                              {u.active ? "Disable" : "Enable"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  }

                  const isSelf = me?.platformUserId === u.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <span>{u.name}</span>
                          {isSelf && (
                            <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 text-[10px] font-bold">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          <span className="font-mono">{u.username}</span> • {u.email}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {isCeo && !isSelf ? (
                          <select
                            value={u.role}
                            disabled={busy}
                            onChange={(e) => handlePlatformRoleChange(u.id, e.target.value)}
                            className="px-2 py-1 rounded border border-slate-200 bg-white text-xs font-semibold text-slate-800"
                          >
                            {PLATFORM_ROLES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold uppercase text-[10px]">
                            {u.role}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500">{formatDateTime(u.createdAt)}</td>
                      <td className="py-3 px-4 text-slate-500">{formatDateTime(u.lastLogin)}</td>
                      <td className="py-3 px-4">
                        {u.active ? (
                          <span className="text-emerald-700 font-semibold">Active</span>
                        ) : (
                          <span className="text-rose-600 font-semibold">Disabled</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isCeo && !isSelf && (
                          <button
                            onClick={() => handleToggleActive(u)}
                            disabled={busy}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border ${
                              u.active
                                ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                                : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            }`}
                          >
                            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                            {u.active ? "Disable" : "Enable"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
          <span>
            Showing <strong>{users.length}</strong> of <strong>{pagination.total}</strong> account(s) • Page{" "}
            <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page >= pagination.totalPages}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* CEO-Only Add Platform Operator Modal */}
      {showAddOperator && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-teal-700" />
                <h2 className="text-sm font-extrabold text-slate-900">Add Platform Operator (CEO Only)</h2>
              </div>
              <button
                onClick={() => setShowAddOperator(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateOperator} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={opForm.name}
                  onChange={(e) => setOpForm((s) => ({ ...s, name: e.target.value }))}
                  placeholder="e.g. Priya Sharma"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={opForm.username}
                    onChange={(e) => setOpForm((s) => ({ ...s, username: e.target.value }))}
                    placeholder="priya.ops"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Platform Role</label>
                  <select
                    value={opForm.role}
                    onChange={(e) => setOpForm((s) => ({ ...s, role: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  >
                    {PLATFORM_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Work Email</label>
                <input
                  type="email"
                  required
                  value={opForm.email}
                  onChange={(e) => setOpForm((s) => ({ ...s, email: e.target.value }))}
                  placeholder="priya@medipos.saas"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Initial Password (min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={opForm.password}
                  onChange={(e) => setOpForm((s) => ({ ...s, password: e.target.value }))}
                  placeholder="Strong password..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddOperator(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingOperator}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 text-white font-semibold hover:bg-teal-800 disabled:opacity-50"
                >
                  {creatingOperator && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create Operator
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
