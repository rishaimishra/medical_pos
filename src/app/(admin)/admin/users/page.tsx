"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  ShieldCheck,
  Building2,
  HeartPulse,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  KeyRound,
  Mail,
  Phone,
  GitBranch,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  Loader2,
  Check,
  X,
  Shield,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useBranchStore } from "@/stores/useBranchStore";

interface BranchOption {
  id: number;
  code: string;
  name: string;
  isMain: boolean;
  active: boolean;
}

interface SupplierOption {
  id: number;
  name: string;
  phone: string;
  email: string | null;
}

interface StaffUser {
  id: number;
  name: string;
  username: string;
  email: string;
  role: string;
  branchId: number | null;
  active: boolean;
  permissions: any;
  lastLogin: string | null;
  createdAt: string;
  isOnlyAdmin?: boolean;
  branch?: { id: number; code: string; name: string; isMain: boolean } | null;
}

interface SupplierUser {
  id: number;
  supplierId: number;
  name: string;
  username: string;
  email: string;
  phone: string | null;
  active: boolean;
  verified: boolean;
  lastLogin: string | null;
  createdAt: string;
  supplier: { id: number; name: string; phone: string; email: string | null; gstNo: string | null };
}

interface PatientCustomer {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  dob: string | null;
  active: boolean;
  verified: boolean;
  createdAt: string;
  _count?: { sales: number; purchaseLogs: number; returns: number };
}

export default function UnifiedUserManagementPage() {
  const { user: currentUser } = useAuthStore();
  const { branches: storeBranches } = useBranchStore();

  const [activeTab, setActiveTab] = useState<"staff" | "suppliers" | "patients">("staff");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // 300ms Search Debounce to prevent server hammering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Data lists
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [supplierUsers, setSupplierUsers] = useState<SupplierUser[]>([]);
  const [patientUsers, setPatientUsers] = useState<PatientCustomer[]>([]);
  const [tabCounts, setTabCounts] = useState({ staffCount: 0, supplierCount: 0, patientCount: 0 });
  const [activeAdminCount, setActiveAdminCount] = useState<number>(1);
  const [branchOptions, setBranchOptions] = useState<BranchOption[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);
  const [roleDefinitions, setRoleDefinitions] = useState<Record<string, any>>({});

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showCustomPermissions, setShowCustomPermissions] = useState(false);

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modalOpen) {
        setModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen]);

  // Staff Form State
  const [staffForm, setStaffForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    role: "staff",
    branchId: "all",
    active: true,
    sendEmail: true,
    selectedPermissions: [] as string[],
    maxDiscountPercent: 10,
  });

  // Supplier Form State
  const [supplierForm, setSupplierForm] = useState({
    supplierId: "",
    name: "",
    username: "",
    email: "",
    phone: "",
    password: "",
    active: true,
    sendEmail: true,
  });

  // Patient Form State
  const [patientForm, setPatientForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    dob: "",
    password: "",
    active: true,
    verified: true,
  });

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const params = new URLSearchParams({
        tab: activeTab,
        search: debouncedSearch,
      });

      if (activeTab === "staff") {
        if (branchFilter !== "all") params.append("branchId", branchFilter);
        if (roleFilter !== "all") params.append("role", roleFilter);
      }

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load user accounts.");
      }

      if (json.counts) setTabCounts(json.counts);
      if (json.branches) setBranchOptions(json.branches);
      if (json.suppliersList) setSupplierOptions(json.suppliersList);
      if (json.roles) setRoleDefinitions(json.roles);
      if (json.activeAdminCount !== undefined) setActiveAdminCount(json.activeAdminCount);

      if (activeTab === "staff") setStaffUsers(json.data || []);
      else if (activeTab === "suppliers") setSupplierUsers(json.data || []);
      else if (activeTab === "patients") setPatientUsers(json.data || []);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to retrieve user accounts.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedSearch, branchFilter, roleFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Open Add Modal
  const handleOpenAddModal = () => {
    setEditingItem(null);
    setShowPassword(false);
    setShowCustomPermissions(false);
    setErrorMsg(null);
    setSuccessMsg(null);
    setModalError(null);

    if (activeTab === "staff") {
      const defaultRole = "staff";
      const defaultPerms = roleDefinitions[defaultRole]?.defaultPermissions || [
        "manage_medicines",
        "manage_purchases",
        "manage_customers",
      ];
      setStaffForm({
        name: "",
        username: "",
        email: "",
        password: "",
        role: defaultRole,
        branchId: branchFilter !== "all" ? branchFilter : "all",
        active: true,
        sendEmail: true,
        selectedPermissions: defaultPerms,
        maxDiscountPercent: roleDefinitions[defaultRole]?.maxDiscountPercent ?? 10,
      });
    } else if (activeTab === "suppliers") {
      setSupplierForm({
        supplierId: supplierOptions[0] ? String(supplierOptions[0].id) : "",
        name: "",
        username: "",
        email: "",
        phone: "",
        password: "",
        active: true,
        sendEmail: true,
      });
    } else if (activeTab === "patients") {
      setPatientForm({
        name: "",
        phone: "",
        email: "",
        address: "",
        dob: "",
        password: "",
        active: true,
        verified: true,
      });
    }
    setModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (item: any) => {
    setEditingItem(item);
    setShowPassword(false);
    setShowCustomPermissions(false);
    setErrorMsg(null);
    setSuccessMsg(null);
    setModalError(null);

    if (activeTab === "staff") {
      const defaultPerms = roleDefinitions[item.role]?.defaultPermissions || [];
      let activePerms = [...defaultPerms];
      let customDiscount = roleDefinitions[item.role]?.maxDiscountPercent ?? 10;
      if (item.permissions) {
        try {
          const parsed = typeof item.permissions === "string" ? JSON.parse(item.permissions) : item.permissions;
          if (Array.isArray(parsed)) {
            activePerms = parsed;
          } else if (parsed && typeof parsed === "object") {
            if (Array.isArray(parsed.grantedPermissions)) {
              activePerms = Array.from(new Set([...activePerms, ...parsed.grantedPermissions]));
            }
            if (Array.isArray(parsed.revokedPermissions)) {
              activePerms = activePerms.filter((p: string) => !parsed.revokedPermissions.includes(p));
            }
            if (typeof parsed.maxDiscountPercent === "number") {
              customDiscount = parsed.maxDiscountPercent;
            }
          }
        } catch {
          // ignore parsing error
        }
      }

      setStaffForm({
        name: item.name || "",
        username: item.username || "",
        email: item.email || "",
        password: "",
        role: item.role || "staff",
        branchId: item.branchId ? String(item.branchId) : "all",
        active: Boolean(item.active),
        sendEmail: false,
        selectedPermissions: activePerms,
        maxDiscountPercent: customDiscount,
      });
    } else if (activeTab === "suppliers") {
      setSupplierForm({
        supplierId: String(item.supplierId),
        name: item.name || "",
        username: item.username || "",
        email: item.email || "",
        phone: item.phone || "",
        password: "",
        active: Boolean(item.active),
        sendEmail: false,
      });
    } else if (activeTab === "patients") {
      setPatientForm({
        name: item.name || "",
        phone: item.phone || "",
        email: item.email || "",
        address: item.address || "",
        dob: item.dob ? item.dob.split("T")[0] : "",
        password: "",
        active: Boolean(item.active),
        verified: Boolean(item.verified),
      });
    }
    setModalOpen(true);
  };

  // Save Modal
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setModalError(null);

    try {
      let payload: any = { type: activeTab };
      const isEdit = Boolean(editingItem);

      if (activeTab === "staff") {
        const defaultPerms: string[] = roleDefinitions[staffForm.role]?.defaultPermissions || [];
        const grantedPermissions = staffForm.selectedPermissions.filter((p: string) => !defaultPerms.includes(p));
        const revokedPermissions = defaultPerms.filter((p: string) => !staffForm.selectedPermissions.includes(p));

        payload = {
          ...payload,
          id: editingItem?.id,
          name: staffForm.name,
          username: staffForm.username,
          email: staffForm.email,
          role: staffForm.role,
          branchId: staffForm.branchId === "all" ? null : parseInt(staffForm.branchId, 10),
          active: staffForm.active,
          sendEmail: staffForm.sendEmail,
          permissions: {
            grantedPermissions,
            revokedPermissions,
            maxDiscountPercent: staffForm.maxDiscountPercent,
          },
        };
        if (staffForm.password) payload.password = staffForm.password;
      } else if (activeTab === "suppliers") {
        payload = {
          ...payload,
          id: editingItem?.id,
          supplierId: parseInt(supplierForm.supplierId, 10),
          name: supplierForm.name,
          username: supplierForm.username,
          email: supplierForm.email,
          phone: supplierForm.phone,
          active: supplierForm.active,
          sendEmail: supplierForm.sendEmail,
        };
        if (supplierForm.password) payload.password = supplierForm.password;
      } else if (activeTab === "patients") {
        payload = {
          ...payload,
          id: editingItem?.id,
          name: patientForm.name,
          phone: patientForm.phone,
          email: patientForm.email || null,
          address: patientForm.address || null,
          dob: patientForm.dob || null,
          active: patientForm.active,
          verified: patientForm.verified,
        };
        if (patientForm.password) payload.password = patientForm.password;
      }

      const method = isEdit ? "PUT" : "POST";
      const res = await fetch("/api/admin/users", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Operation failed.");
      }

      setSuccessMsg(json.message || `Account successfully ${isEdit ? "updated" : "created"}.`);
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      setModalError(err.message || "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  // Quick Status Toggle
  const handleToggleStatus = async (item: any) => {
    // Last Admin check
    if (activeTab === "staff" && item.role === "admin" && item.active && activeAdminCount <= 1) {
      setErrorMsg("Security Protection: Cannot deactivate the only active Super Admin account.");
      return;
    }

    try {
      setErrorMsg(null);
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activeTab,
          id: item.id,
          action: "toggle_status",
          active: !item.active,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to update account status.");
      }
      setSuccessMsg(json.message);
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to toggle status.");
    }
  };

  // Delete Action
  const handleDelete = async (item: any) => {
    if (activeTab === "staff") {
      if (item.id === currentUser?.userId) {
        setErrorMsg("Security Protection: You cannot delete your own logged-in account.");
        return;
      }
      if (item.role === "admin" && activeAdminCount <= 1) {
        setErrorMsg("Security Protection: Cannot delete the only Super Admin account.");
        return;
      }
    }

    const confirmMsg = `Are you sure you want to delete ${item.name} (${item.username || item.phone})? This action will be audited.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setErrorMsg(null);
      const res = await fetch(`/api/admin/users?type=${activeTab}&id=${item.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Delete operation failed.");
      }
      setSuccessMsg(json.message);
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to delete account.");
    }
  };

  // Handle Role Change in Staff Form (auto-populate defaults)
  const handleRoleChange = (newRole: string) => {
    const roleDef = roleDefinitions[newRole];
    setStaffForm((prev) => ({
      ...prev,
      role: newRole,
      selectedPermissions: roleDef?.defaultPermissions || [],
      maxDiscountPercent: roleDef?.maxDiscountPercent ?? 10,
    }));
  };

  const allAvailablePermissions = [
    { key: "manage_medicines", label: "Medicine Catalog (Add/Edit Medicines, Dosages & Rack Shelves)" },
    { key: "manage_stock_adjustments", label: "Stock Adjustment (Update Physical Stock & Record Waste/Breakage)" },
    { key: "view_cost_price", label: "Purchase Cost Visibility (View Supplier Buying Rates & Cost Prices)" },
    { key: "apply_high_discount", label: "Special Discounts (Authorize POS Counter Discounts Above Limit)" },
    { key: "cancel_invoice", label: "Bill Cancellation & Refunds (Cancel Invoices & Refund POS Bills)" },
    { key: "view_profit_reports", label: "Financial Reports (View Net Profit & Loss, Daily Business Ledgers)" },
    { key: "manage_purchases", label: "Purchases & Inwarding (Create Supplier Purchase Orders & Inward Goods)" },
    { key: "manage_customers", label: "Customer & Patient Profiles (Register Patients & Medical History)" },
    { key: "manage_users", label: "Staff & User Access (Create Counter Accounts & Change Passwords)" },
    { key: "manage_settings", label: "Store Settings & Backup (Manage Drug License, GST No & DB Backup)" },
    { key: "switch_branches", label: "Multi-Store Switch (Switch Between Main Store & Hospital Branch)" },
  ];

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Page Title & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Unified User & Account Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[#1F4E5B]/10 text-[#1F4E5B] text-[10px] font-black tracking-wider uppercase">
              Staff & Portals
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Administer internal staff counter logins, branch assignments, supplier vendor portal credentials, and registered patient profiles.
          </p>
        </div>

        {/* Add User Button */}
        <button
          type="button"
          onClick={handleOpenAddModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>
            {activeTab === "staff"
              ? "Add Staff Account"
              : activeTab === "suppliers"
              ? "Add Supplier User"
              : "Register Patient"}
          </span>
        </button>
      </div>

      {/* Alert Messages */}
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

      {/* Portal Scope Clarification Banner */}
      <div className="p-3 rounded-2xl bg-[#EAF2F4]/60 border border-[#1F4E5B]/20 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-[#1F4E5B] shrink-0" />
          <span className="text-[11px]">
            <strong>Account Classification:</strong> <strong>Staff</strong> = Pharmacy employees & counter agents. <strong>Suppliers</strong> = Medicine distributor extranet accounts. <strong>Patients</strong> = Registered pharmacy clients.
          </span>
        </div>
      </div>

      {/* Segmented 3-Tab Bar (Matching Screenshot & UX Design Plan Section 3.8) */}
      <div className="bg-white p-1.5 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {/* Tab 1: Staff */}
          <button
            type="button"
            onClick={() => setActiveTab("staff")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "staff"
                ? "bg-[#1F4E5B] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1.5">
                <span>Staff & Cashiers</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                    activeTab === "staff" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {tabCounts.staffCount}
                </span>
              </div>
              <span className={`text-[9px] font-normal ${activeTab === "staff" ? "text-emerald-200" : "text-slate-400"}`}>
                Internal Store Employees
              </span>
            </div>
          </button>

          {/* Tab 2: Suppliers */}
          <button
            type="button"
            onClick={() => setActiveTab("suppliers")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "suppliers"
                ? "bg-[#1F4E5B] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1.5">
                <span>Supplier Portal Users</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                    activeTab === "suppliers" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {tabCounts.supplierCount}
                </span>
              </div>
              <span className={`text-[9px] font-normal ${activeTab === "suppliers" ? "text-emerald-200" : "text-slate-400"}`}>
                Distributor Representatives
              </span>
            </div>
          </button>

          {/* Tab 3: Patients */}
          <button
            type="button"
            onClick={() => setActiveTab("patients")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "patients"
                ? "bg-[#1F4E5B] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <HeartPulse className="w-4 h-4 shrink-0" />
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1.5">
                <span>Patients & Customers</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                    activeTab === "patients" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {tabCounts.patientCount}
                </span>
              </div>
              <span className={`text-[9px] font-normal ${activeTab === "patients" ? "text-emerald-200" : "text-slate-400"}`}>
                Customer Self-Service Registry
              </span>
            </div>
          </button>
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          className="p-2 rounded-xl text-slate-500 hover:text-[#1F4E5B] hover:bg-slate-100 transition-colors"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeTab} by name, username, email, phone...`}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none bg-slate-50/50"
          />
        </div>

        {activeTab === "staff" && (
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Branch Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
              <GitBranch className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="bg-transparent text-slate-800 font-medium text-xs focus:outline-none cursor-pointer"
              >
                <option value="all">All Branches</option>
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Role Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
              <Shield className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-transparent text-slate-800 font-medium text-xs focus:outline-none cursor-pointer"
              >
                <option value="all">All Roles</option>
                <option value="admin">Super Admin</option>
                <option value="manager">Store Manager</option>
                <option value="pharmacist">Pharmacist</option>
                <option value="cashier">Cashier</option>
                <option value="staff">Staff</option>
                <option value="accountant">Accountant</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Card with Data Grid */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-[#1F4E5B]" />
            <p className="text-xs font-bold text-slate-600">Loading {activeTab} accounts...</p>
          </div>
        ) : (
          <>
            {/* 1. STAFF TAB TABLE */}
            {activeTab === "staff" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">User / Counter Agent</th>
                      <th className="py-3 px-3.5">Email</th>
                      <th className="py-3 px-3">Role & Level</th>
                      <th className="py-3 px-3.5">Store Branch</th>
                      <th className="py-3 px-3">Permissions</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-3.5 text-right sticky right-0 bg-slate-50/95 shadow-[-6px_0_12px_-4px_rgba(0,0,0,0.06)] z-10">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {staffUsers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-slate-400 font-medium">
                          No staff accounts found matching your filters.
                        </td>
                      </tr>
                    ) : (
                      staffUsers.map((u) => {
                        const isSelf = u.id === currentUser?.userId;
                        const roleColor =
                          u.role === "admin"
                            ? "bg-purple-100 text-purple-800 border-purple-200"
                            : u.role === "manager"
                            ? "bg-blue-100 text-blue-800 border-blue-200"
                            : u.role === "pharmacist"
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : u.role === "cashier"
                            ? "bg-amber-100 text-amber-800 border-amber-200"
                            : u.role === "accountant"
                            ? "bg-indigo-100 text-indigo-800 border-indigo-200"
                            : "bg-cyan-100 text-cyan-800 border-cyan-200";

                        const userInitials = (u.name || u.username)
                          .split(" ")
                          .map((p) => p[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase();

                        return (
                          <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                            {/* User details */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-[#EAF2F4] text-[#1F4E5B] border border-slate-200 flex items-center justify-center font-black text-xs shrink-0">
                                  {userInitials}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-slate-900 whitespace-nowrap">{u.name}</span>
                                    {isSelf && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-extrabold shrink-0">
                                        You
                                      </span>
                                    )}
                                    {u.isOnlyAdmin && (
                                      <span
                                        title="Last active Super Admin (Cannot be deactivated or demoted)"
                                        className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-extrabold flex items-center gap-0.5 shrink-0"
                                      >
                                        <Lock className="w-2.5 h-2.5" />
                                        Primary Admin
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[11px] font-mono text-slate-400 block truncate">@{u.username}</span>
                                </div>
                              </div>
                            </td>

                            {/* Email */}
                            <td className="py-3 px-3.5 font-medium text-slate-600">{u.email}</td>

                            {/* Role */}
                            <td className="py-3 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${roleColor}`}
                              >
                                {roleDefinitions[u.role]?.label || u.role}
                              </span>
                            </td>

                            {/* Branch */}
                            <td className="py-3 px-3.5">
                              {u.branch ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                                  <GitBranch className="w-3.5 h-3.5 text-[#1F4E5B]" />
                                  <span>{u.branch.name}</span>
                                  <span className="text-[10px] text-slate-400">({u.branch.code})</span>
                                </span>
                              ) : (
                                <span className="text-slate-500 font-semibold italic text-[11px]">
                                  Global (All Outlets)
                                </span>
                              )}
                            </td>

                            {/* Permissions */}
                            <td className="py-3 px-3">
                              {(() => {
                                if (u.role === "admin") {
                                  return (
                                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg whitespace-nowrap">
                                      Full Unrestricted
                                    </span>
                                  );
                                }
                                let grantedCount = 0;
                                let revokedCount = 0;
                                if (u.permissions) {
                                  try {
                                    const p = typeof u.permissions === "string" ? JSON.parse(u.permissions) : u.permissions;
                                    if (Array.isArray(p)) {
                                      grantedCount = p.length;
                                    } else if (p && typeof p === "object") {
                                      grantedCount = Array.isArray(p.grantedPermissions) ? p.grantedPermissions.length : 0;
                                      revokedCount = Array.isArray(p.revokedPermissions) ? p.revokedPermissions.length : 0;
                                    }
                                  } catch {}
                                }
                                if (grantedCount > 0 || revokedCount > 0) {
                                  return (
                                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg whitespace-nowrap">
                                      Custom ({grantedCount ? `+${grantedCount}` : ""}{revokedCount ? ` -${revokedCount}` : ""})
                                    </span>
                                  );
                                }
                                return (
                                  <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg whitespace-nowrap">
                                    Default Matrix
                                  </span>
                                );
                              })()}
                            </td>

                            {/* Status Chip */}
                            <td className="py-3 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(u)}
                                disabled={Boolean(u.isOnlyAdmin)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold transition-all cursor-pointer ${
                                  u.active
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                    : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
                                } disabled:cursor-not-allowed disabled:opacity-60`}
                                title={u.isOnlyAdmin ? "Last active admin cannot be deactivated" : "Toggle active status"}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${u.active ? "bg-emerald-500" : "bg-slate-400"}`}
                                />
                                <span>{u.active ? "Active" : "Inactive"}</span>
                              </button>
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-3.5 text-right sticky right-0 bg-white/95 shadow-[-6px_0_12px_-4px_rgba(0,0,0,0.06)] z-10">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(u)}
                                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-[#1F4E5B] transition-colors cursor-pointer"
                                  title="Edit User & Permissions"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(u)}
                                  disabled={isSelf || Boolean(u.isOnlyAdmin)}
                                  className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                  title={
                                    isSelf
                                      ? "Cannot delete yourself"
                                      : u.isOnlyAdmin
                                      ? "Cannot delete the last admin"
                                      : "Delete User Account"
                                  }
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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
            )}

            {/* 2. SUPPLIERS TAB TABLE */}
            {activeTab === "suppliers" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-5">Vendor Company</th>
                      <th className="py-3 px-4">Representative</th>
                      <th className="py-3 px-4">Portal Username</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Phone</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right sticky right-0 bg-slate-50/95 shadow-[-6px_0_12px_-4px_rgba(0,0,0,0.06)] z-10">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {supplierUsers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-slate-400 font-medium">
                          No supplier portal accounts found. Click &apos;Add Supplier User&apos; to onboard vendor representatives.
                        </td>
                      </tr>
                    ) : (
                      supplierUsers.map((su) => (
                        <tr key={su.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-5 font-bold text-slate-900">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-[#1F4E5B] shrink-0" />
                              <span>{su.supplier?.name || "Direct Supplier"}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-800">{su.name}</td>
                          <td className="py-3.5 px-4 font-mono text-slate-500">@{su.username}</td>
                          <td className="py-3.5 px-4 text-slate-600">{su.email}</td>
                          <td className="py-3.5 px-4 text-slate-600">{su.phone || "—"}</td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(su)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold cursor-pointer ${
                                su.active
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-slate-100 text-slate-500 border border-slate-200"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${su.active ? "bg-emerald-500" : "bg-slate-400"}`}
                              />
                              <span>{su.active ? "Active" : "Disabled"}</span>
                            </button>
                          </td>
                          <td className="py-3.5 px-4 text-right sticky right-0 bg-white/95 shadow-[-6px_0_12px_-4px_rgba(0,0,0,0.06)] z-10">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(su)}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-[#1F4E5B] transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(su)}
                                className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
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
            )}

            {/* 3. PATIENTS TAB TABLE */}
            {activeTab === "patients" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-5">Patient Name</th>
                      <th className="py-3 px-4">Mobile / Contact</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Address</th>
                      <th className="py-3 px-4 text-center">Orders</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right sticky right-0 bg-slate-50/95 shadow-[-6px_0_12px_-4px_rgba(0,0,0,0.06)] z-10">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {patientUsers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-slate-400 font-medium">
                          No patient or customer accounts found.
                        </td>
                      </tr>
                    ) : (
                      patientUsers.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-5 font-bold text-slate-900">
                            <div className="flex items-center gap-2">
                              <HeartPulse className="w-4 h-4 text-rose-500 shrink-0" />
                              <span>{p.name}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-[#1F4E5B]">{p.phone}</td>
                          <td className="py-3.5 px-4 text-slate-600">{p.email || "—"}</td>
                          <td className="py-3.5 px-4 text-slate-500 max-w-[200px] truncate">{p.address || "—"}</td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                              {p._count?.sales || 0} visits
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(p)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold cursor-pointer ${
                                p.active
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-slate-100 text-slate-500 border border-slate-200"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${p.active ? "bg-emerald-500" : "bg-slate-400"}`}
                              />
                              <span>{p.active ? "Active" : "Inactive"}</span>
                            </button>
                          </td>
                          <td className="py-3.5 px-4 text-right sticky right-0 bg-white/95 shadow-[-6px_0_12px_-4px_rgba(0,0,0,0.06)] z-10">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(p)}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-[#1F4E5B] transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(p)}
                                className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
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
            )}
          </>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          UNIFIED MODAL: ADD / EDIT ACCOUNTS
      ───────────────────────────────────────────────────────────── */}
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
                  {activeTab === "staff" ? (
                    <ShieldCheck className="w-5 h-5" />
                  ) : activeTab === "suppliers" ? (
                    <Building2 className="w-5 h-5" />
                  ) : (
                    <HeartPulse className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    {editingItem ? "Edit" : "Create New"}{" "}
                    {activeTab === "staff"
                      ? "Staff / Counter Account"
                      : activeTab === "suppliers"
                      ? "Supplier Portal User"
                      : "Patient Record"}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {activeTab === "staff"
                      ? "Assign store outlet, role permissions, and counter credentials."
                      : activeTab === "suppliers"
                      ? "Provide distributor portal credentials for order status and price tracking."
                      : "Store patient medical profile and portal self-service."}
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
            <form onSubmit={handleSaveModal} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Scrollable Modal Body */}
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4 [scrollbar-width:thin] [scrollbar-color:rgba(31,78,91,0.2)_transparent]">
                {/* In-Modal Error Feedback */}
                {modalError && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="flex-1 font-semibold">{modalError}</div>
                  </div>
                )}

                {/* ── 1. STAFF FORM FIELDS ── */}
              {activeTab === "staff" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Full Name */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Full Name *</label>
                      <input
                        type="text"
                        required
                        value={staffForm.name}
                        onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                        placeholder="e.g. Rahul Sharma"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                      />
                    </div>

                    {/* Username */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Counter Username *</label>
                      <input
                        type="text"
                        required
                        disabled={Boolean(editingItem)}
                        value={staffForm.username}
                        onChange={(e) => setStaffForm({ ...staffForm, username: e.target.value.toLowerCase().trim() })}
                        placeholder="e.g. rahul_pos"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </div>

                    {/* Email */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Email Address *</label>
                      <input
                        type="email"
                        required
                        value={staffForm.email}
                        onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                        placeholder="e.g. rahul@store.com"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                      />
                    </div>

                    {/* Password */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">
                        {editingItem ? "New Password (Leave blank to keep)" : "Account Password *"}
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          required={!editingItem}
                          value={staffForm.password}
                          onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                          placeholder={editingItem ? "••••••••" : "Min 6 characters"}
                          className="w-full px-3.5 py-2 pr-9 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Role Selector */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Staff Role & Position *</label>
                      <select
                        value={staffForm.role}
                        onChange={(e) => handleRoleChange(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none bg-white cursor-pointer"
                      >
                        <option value="admin">Super Admin (Full Unrestricted Access to All Settings & Branches)</option>
                        <option value="manager">Store Manager (Discounts, Stock Adjustment & Purchase Orders)</option>
                        <option value="pharmacist">Pharmacist (Medicines Catalog, Batches & Counter POS)</option>
                        <option value="cashier">Cashier (Daily Counter Sales & Bill Printing)</option>
                        <option value="accountant">Accountant (Ledgers, Profit & Loss, Tax Reports)</option>
                        <option value="staff">General Staff (Basic Store Access)</option>
                      </select>
                    </div>

                    {/* Store Branch Assignment */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Assigned Branch / Store Location *</label>
                      <select
                        value={staffForm.branchId}
                        onChange={(e) => setStaffForm({ ...staffForm, branchId: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none bg-white cursor-pointer"
                      >
                        <option value="all">All Branches (Head Office / Global Access)</option>
                        {branchOptions.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.code}) {b.isMain ? "— (Main Branch)" : "— (Branch Store)"}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-500">
                        Staff will only have access to bill and manage stock for this chosen store location.
                      </p>
                    </div>
                  </div>

                  {/* Role Description Helper Card */}
                  {roleDefinitions[staffForm.role] && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                      <span className="font-bold text-[#1F4E5B]">
                        {roleDefinitions[staffForm.role].label} Scope:
                      </span>{" "}
                      {roleDefinitions[staffForm.role].description}
                    </div>
                  )}

                  {/* Dynamic Granular Permissions Accordion */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowCustomPermissions(!showCustomPermissions)}
                      className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-700 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-3.5 h-3.5 text-[#1F4E5B]" />
                        <span>Dynamic Granular Permissions & Route Access</span>
                      </div>
                      {showCustomPermissions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {showCustomPermissions && (
                      <div className="p-4 bg-white space-y-4">
                        <p className="text-[11px] text-slate-500">
                          Override default role capabilities specifically for this staff account. Unchecking default capabilities actively revokes them.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {allAvailablePermissions.map((perm) => {
                            const isBranchBound = staffForm.branchId !== "all";
                            const isSwitchBranches = perm.key === "switch_branches";
                            const isDisabled = isSwitchBranches && isBranchBound;
                            const isChecked = !isDisabled && staffForm.selectedPermissions.includes(perm.key);
                            return (
                              <label
                                key={perm.key}
                                className={`flex items-start gap-2.5 p-2 rounded-xl border text-xs transition-colors ${
                                  isDisabled
                                    ? "bg-slate-100/60 border-slate-200 text-slate-400 cursor-not-allowed"
                                    : isChecked
                                    ? "bg-[#EAF2F4]/40 border-[#1F4E5B]/40 text-slate-900 cursor-pointer"
                                    : "bg-slate-50/50 border-slate-200 text-slate-600 cursor-pointer"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  disabled={isDisabled}
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (isDisabled) return;
                                    const next = e.target.checked
                                      ? [...staffForm.selectedPermissions, perm.key]
                                      : staffForm.selectedPermissions.filter((k) => k !== perm.key);
                                    setStaffForm({ ...staffForm, selectedPermissions: next });
                                  }}
                                  className="mt-0.5 rounded text-[#1F4E5B] focus:ring-0 cursor-pointer disabled:cursor-not-allowed"
                                />
                                <div className="flex flex-col">
                                  <span className="text-[11px] font-medium leading-tight">{perm.label}</span>
                                  {isDisabled && (
                                    <span className="text-[9px] text-amber-600 font-semibold mt-0.5">
                                      Locked to assigned outlet
                                    </span>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>

                        {/* Max Discount Slider */}
                        <div className="pt-2 border-t border-slate-100">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="font-bold text-slate-700">Maximum Allowed POS Counter Discount:</span>
                            <span className="font-extrabold text-[#1F4E5B]">{staffForm.maxDiscountPercent}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={staffForm.maxDiscountPercent}
                            onChange={(e) =>
                              setStaffForm({ ...staffForm, maxDiscountPercent: parseInt(e.target.value, 10) })
                            }
                            className="w-full accent-[#1F4E5B] cursor-pointer"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Send Email Checkbox */}
                  {!editingItem && (
                    <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={staffForm.sendEmail}
                        onChange={(e) => setStaffForm({ ...staffForm, sendEmail: e.target.checked })}
                        className="rounded text-[#1F4E5B] focus:ring-0 cursor-pointer"
                      />
                      <span className="font-medium">
                        Send branded welcome email with counter login link and credentials
                      </span>
                    </label>
                  )}
                </>
              )}

              {/* ── 2. SUPPLIER FORM FIELDS ── */}
              {activeTab === "suppliers" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Supplier Vendor Company */}
                    <div className="space-y-1 sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700">Affiliated Vendor Company *</label>
                      <select
                        required
                        value={supplierForm.supplierId}
                        onChange={(e) => setSupplierForm({ ...supplierForm, supplierId: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none bg-white cursor-pointer"
                      >
                        <option value="">Select Vendor...</option>
                        {supplierOptions.map((sup) => (
                          <option key={sup.id} value={sup.id}>
                            {sup.name} {sup.phone ? `(${sup.phone})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Contact Person Name */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Representative Name *</label>
                      <input
                        type="text"
                        required
                        value={supplierForm.name}
                        onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                        placeholder="e.g. Ramesh Patel"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                      />
                    </div>

                    {/* Portal Username */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Portal Username *</label>
                      <input
                        type="text"
                        required
                        disabled={Boolean(editingItem)}
                        value={supplierForm.username}
                        onChange={(e) =>
                          setSupplierForm({ ...supplierForm, username: e.target.value.toLowerCase().trim() })
                        }
                        placeholder="e.g. ramesh_cipla"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </div>

                    {/* Email */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Contact Email *</label>
                      <input
                        type="email"
                        required
                        value={supplierForm.email}
                        onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                        placeholder="e.g. ramesh@vendor.com"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                      />
                    </div>

                    {/* Phone */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Direct Phone</label>
                      <input
                        type="text"
                        value={supplierForm.phone}
                        onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                        placeholder="e.g. +91 98765 43210"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                      />
                    </div>

                    {/* Password */}
                    <div className="space-y-1 sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700">
                        {editingItem ? "New Password (Leave blank to keep)" : "Portal Password *"}
                      </label>
                      <input
                        type="password"
                        required={!editingItem}
                        value={supplierForm.password}
                        onChange={(e) => setSupplierForm({ ...supplierForm, password: e.target.value })}
                        placeholder={editingItem ? "••••••••" : "Min 6 characters"}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                      />
                    </div>
                  </div>

                  {!editingItem && (
                    <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer pt-2">
                      <input
                        type="checkbox"
                        checked={supplierForm.sendEmail}
                        onChange={(e) => setSupplierForm({ ...supplierForm, sendEmail: e.target.checked })}
                        className="rounded text-[#1F4E5B] focus:ring-0 cursor-pointer"
                      />
                      <span className="font-medium">Send portal login instructions to representative email</span>
                    </label>
                  )}
                </>
              )}

              {/* ── 3. PATIENT FORM FIELDS ── */}
              {activeTab === "patients" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Patient Name */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Patient Full Name *</label>
                      <input
                        type="text"
                        required
                        value={patientForm.name}
                        onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })}
                        placeholder="e.g. Amit Sengupta"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                      />
                    </div>

                    {/* Mobile Phone */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Mobile Number (Primary ID) *</label>
                      <input
                        type="tel"
                        required
                        value={patientForm.phone}
                        onChange={(e) => setPatientForm({ ...patientForm, phone: e.target.value })}
                        placeholder="e.g. 9830012345"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                      />
                    </div>

                    {/* Email */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Email Address (Optional)</label>
                      <input
                        type="email"
                        value={patientForm.email}
                        onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })}
                        placeholder="e.g. amit@gmail.com"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                      />
                    </div>

                    {/* DOB */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">Date of Birth</label>
                      <input
                        type="date"
                        value={patientForm.dob}
                        onChange={(e) => setPatientForm({ ...patientForm, dob: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none bg-white"
                      />
                    </div>

                    {/* Address */}
                    <div className="space-y-1 sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700">Residential Address</label>
                      <input
                        type="text"
                        value={patientForm.address}
                        onChange={(e) => setPatientForm({ ...patientForm, address: e.target.value })}
                        placeholder="Flat, building, street, area, city"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                      />
                    </div>

                    {/* Portal Password */}
                    <div className="space-y-1 sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700">
                        Portal Self-Service Password (Optional)
                      </label>
                      <input
                        type="password"
                        value={patientForm.password}
                        onChange={(e) => setPatientForm({ ...patientForm, password: e.target.value })}
                        placeholder="Leave blank if patient does not need web portal login"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#1F4E5B] focus:outline-none"
                      />
                    </div>
                  </div>
                </>
              )}
              </div>

              {/* Sticky Modal Footer: Pinned at bottom */}
              <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 bg-slate-50/90 shrink-0">
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  Press <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600 font-mono text-[10px]">Esc</kbd> or click outside to cancel
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
                    <span>{editingItem ? "Save Changes" : "Create Account"}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

