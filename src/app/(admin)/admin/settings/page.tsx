"use client";

import React, { useState, useEffect } from "react";
import {
  Building2,
  ShieldCheck,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Server,
  KeyRound,
  FileText,
  Clock,
  Layers,
  Store,
  Info,
  Database,
  DownloadCloud,
  UploadCloud,
  HardDrive,
  FileCode,
  ArrowUpCircle,
  Sparkles,
  ShieldAlert,
  Terminal,
  Check,
} from "lucide-react";
import { useBranchStore } from "@/stores/useBranchStore";

interface SettingsData {
  id?: number;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
  storeGst: string;
  storeDl: string;
  currency: string;
  lowQty: number;
  expiryDays: number;
  emailProvider: "sendgrid" | "smtp";
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass?: string;
  hasSmtpPass: boolean;
  smtpFrom: string;
  smtpName: string;
  smtpSecure: string;
  hasSendgridKey: boolean;
  sendgridKeyMasked?: string;
  sendgridKey?: string;
}

interface Branch {
  id: number;
  code: string;
  name: string;
  tagline?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  gstNo?: string | null;
  dlNo?: string | null;
  isMain: boolean;
  active: boolean;
  _count?: {
    batches: number;
    sales: number;
  };
}

interface AuditLogRow {
  id: number;
  action: string;
  entity: string;
  entityId?: number | null;
  details?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  user?: { id: number; username: string; name: string; role: string } | null;
  branch?: { id: number; code: string; name: string } | null;
}

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<
    "profile" | "branches" | "security" | "backup" | "updates"
  >("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [roleMatrix, setRoleMatrix] = useState<Record<string, any>>({});
  const [auditSearch, setAuditSearch] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);

  // MODULE 1.14: Backup & Restore State
  const [savedBackups, setSavedBackups] = useState<
    { filename: string; sizeBytes: number; sizeFormatted: string; createdAt: string }[]
  >([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupExporting, setBackupExporting] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [dryRunning, setDryRunning] = useState(false);
  const [dryRunInfo, setDryRunInfo] = useState<{
    statementsCount: number;
    tablesAffected: string[];
    warning: string;
  } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreConfirmModalOpen, setRestoreConfirmModalOpen] = useState(false);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);

  // 1.14.3: JSON Migration State
  const [jsonMigrateFile, setJsonMigrateFile] = useState<File | null>(null);
  const [jsonMigrating, setJsonMigrating] = useState(false);
  const [jsonMigrateResult, setJsonMigrateResult] = useState<{
    migrated: {
      categories: number;
      suppliers: number;
      customers: number;
      medicines: number;
      batches: number;
    };
    backupFile: string;
  } | null>(null);

  // MODULE 1.15: Software Update System State
  const [appVersionInfo, setAppVersionInfo] = useState<{
    currentVersion: string;
    environment: string;
    status: string;
    lastBackupAt: string | null;
  }>({
    currentVersion: "0.1.0",
    environment: "development",
    status: "healthy",
    lastBackupAt: null,
  });
  const [updatePackageFile, setUpdatePackageFile] = useState<File | null>(null);
  const [updateInspecting, setUpdateInspecting] = useState(false);
  const [updateInspection, setUpdateInspection] = useState<any | null>(null);
  const [confirmBackupChecked, setConfirmBackupChecked] = useState(false);
  const [updateApplying, setUpdateApplying] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);

  const fetchSavedBackups = async () => {
    try {
      setBackupsLoading(true);
      const res = await fetch("/api/admin/backup?list=true");
      const json = await res.json();
      if (json.success && Array.isArray(json.backups)) {
        setSavedBackups(json.backups);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBackupsLoading(false);
    }
  };

  const handleOneClickBackup = async () => {
    try {
      setBackupExporting(true);
      setErrorMessage(null);
      window.open("/api/admin/backup", "_blank");
      setSaveSuccess("Database backup generated and download initiated!");
      setTimeout(() => {
        fetchSavedBackups();
      }, 1000);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to generate backup");
    } finally {
      setBackupExporting(false);
    }
  };

  const handleDryRunRestore = async () => {
    if (!restoreFile) {
      alert("Please choose an .sql backup file to validate.");
      return;
    }
    try {
      setDryRunning(true);
      setErrorMessage(null);
      setDryRunInfo(null);
      const fd = new FormData();
      fd.append("backupFile", restoreFile);
      fd.append("dryRun", "true");
      const res = await fetch("/api/admin/backup/restore", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (json.success) {
        setDryRunInfo(json);
      } else {
        setErrorMessage(json.error || "Dry run validation failed");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to validate SQL file");
    } finally {
      setDryRunning(false);
    }
  };

  const handleExecuteRestore = async () => {
    if (!restoreFile) return;
    try {
      setRestoring(true);
      setErrorMessage(null);
      setRestoreSuccessMsg(null);
      const fd = new FormData();
      fd.append("backupFile", restoreFile);
      fd.append("confirmOverwrite", "true");
      const res = await fetch("/api/admin/backup/restore", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (json.success) {
        setRestoreSuccessMsg(json.message);
        setRestoreConfirmModalOpen(false);
        setRestoreFile(null);
        setDryRunInfo(null);
        fetchSavedBackups();
      } else {
        setErrorMessage(json.error || "Failed to restore database");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to execute restore");
    } finally {
      setRestoring(false);
    }
  };

  const handleExecuteJsonMigration = async () => {
    if (!jsonMigrateFile) {
      alert("Please select a JSON file to migrate.");
      return;
    }
    try {
      setJsonMigrating(true);
      setErrorMessage(null);
      setJsonMigrateResult(null);
      const fd = new FormData();
      fd.append("file", jsonMigrateFile);
      const res = await fetch("/api/admin/backup/migrate-json", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (json.success) {
        setJsonMigrateResult(json);
        setSaveSuccess("Legacy JSON storage successfully migrated!");
        setJsonMigrateFile(null);
      } else {
        setErrorMessage(json.error || "Failed to migrate JSON data");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to migrate JSON");
    } finally {
      setJsonMigrating(false);
    }
  };

  const fetchVersionInfo = async () => {
    try {
      const res = await fetch("/api/admin/update/version");
      const json = await res.json();
      if (json.success && json.data) {
        setAppVersionInfo(json.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleInspectUpdate = async (file: File) => {
    try {
      setUpdateInspecting(true);
      setErrorMessage(null);
      setUpdateInspection(null);
      setUpdateSuccess(null);
      setConfirmBackupChecked(false);
      const fd = new FormData();
      fd.append("package", file);
      const res = await fetch("/api/admin/update/inspect", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (json.success) {
        setUpdateInspection(json.data);
      } else {
        setErrorMessage(json.error || "Failed to inspect update package");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to inspect update");
    } finally {
      setUpdateInspecting(false);
    }
  };

  const handleApplyUpdate = async () => {
    if (!updatePackageFile) return;
    if (!confirmBackupChecked) {
      alert("Please confirm that you have taken a database backup.");
      return;
    }
    try {
      setUpdateApplying(true);
      setErrorMessage(null);
      setUpdateSuccess(null);
      const fd = new FormData();
      fd.append("package", updatePackageFile);
      fd.append("confirmBackup", "true");
      const res = await fetch("/api/admin/update/apply", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (json.success) {
        setUpdateSuccess(json.message);
        setUpdateInspection(null);
        setUpdatePackageFile(null);
        setConfirmBackupChecked(false);
        fetchVersionInfo();
      } else {
        setErrorMessage(json.error || "Failed to apply system update");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to apply update");
    } finally {
      setUpdateApplying(false);
    }
  };

  const [settings, setSettings] = useState<SettingsData>({
    storeName: "",
    storeAddress: "",
    storePhone: "",
    storeEmail: "",
    storeGst: "",
    storeDl: "",
    currency: "₹",
    lowQty: 10,
    expiryDays: 90,
    emailProvider: "sendgrid",
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    hasSmtpPass: false,
    smtpFrom: "",
    smtpName: "",
    smtpSecure: "tls",
    hasSendgridKey: false,
  });

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchFormData, setBranchFormData] = useState({
    code: "",
    name: "",
    tagline: "",
    address: "",
    phone: "",
    email: "",
    gstNo: "",
    dlNo: "",
    active: true,
  });
  const [branchSaving, setBranchSaving] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/settings");
      const json = await res.json();
      if (json.success && json.data) {
        setSettings(json.data);
      }
    } catch (err: any) {
      setErrorMessage("Could not load settings: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      setBranchesLoading(true);
      const res = await fetch("/api/admin/branches");
      const json = await res.json();
      if (json.success && json.data) {
        setBranches(json.data);
        useBranchStore.getState().fetchBranches();
      }
    } catch (err: any) {
      console.error("Failed to load branches:", err);
    } finally {
      setBranchesLoading(false);
    }
  };

  const fetchAuditLogs = async (searchQuery = auditSearch) => {
    try {
      setAuditLoading(true);
      const q = searchQuery ? `?search=${encodeURIComponent(searchQuery)}&limit=50` : "?limit=50";
      const res = await fetch(`/api/admin/audit-logs${q}`);
      const json = await res.json();
      if (json.success) {
        setAuditLogs(json.logs || []);
        if (json.roleMatrix) setRoleMatrix(json.roleMatrix);
      }
    } catch (err) {
      console.error("Failed to load activity history:", err);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchBranches();
    fetchAuditLogs("");
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "branches" || tab === "security" || tab === "profile") {
        setActiveTab(tab as any);
      }
    }
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(null);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (json.success) {
        setSaveSuccess("Store settings saved!");
        fetchSettings();
        fetchBranches();
        setTimeout(() => setSaveSuccess(null), 4000);
      } else {
        setErrorMessage(json.error || "Could not save settings");
      }
    } catch (err: any) {
      setErrorMessage("Connection error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const openBranchModal = (branch?: Branch) => {
    setBranchError(null);
    if (branch) {
      setEditingBranch(branch);
      setBranchFormData({
        code: branch.code,
        name: branch.name,
        tagline: branch.tagline || "",
        address: branch.address || "",
        phone: branch.phone || "",
        email: branch.email || "",
        gstNo: branch.gstNo || "",
        dlNo: branch.dlNo || "",
        active: branch.active,
      });
    } else {
      setEditingBranch(null);
      setBranchFormData({
        code: "",
        name: "",
        tagline: "",
        address: "",
        phone: "",
        email: "",
        gstNo: "",
        dlNo: "",
        active: true,
      });
    }
    setBranchModalOpen(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setBranchSaving(true);
    setBranchError(null);

    try {
      const isEdit = !!editingBranch;
      const url = "/api/admin/branches";
      const method = isEdit ? "PATCH" : "POST";
      const payload = isEdit
        ? { id: editingBranch.id, ...branchFormData }
        : branchFormData;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success) {
        setBranchModalOpen(false);
        fetchBranches();
      } else {
        setBranchError(json.error || "Could not save store branch");
      }
    } catch (err: any) {
      setBranchError("Connection error: " + err.message);
    } finally {
      setBranchSaving(false);
    }
  };

  const handleToggleBranchActive = async (branch: Branch) => {
    if (branch.isMain) return;
    try {
      const res = await fetch("/api/admin/branches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: branch.id,
          active: !branch.active,
        }),
      });
      const json = await res.json();
      if (json.success) {
        fetchBranches();
      } else {
        alert(json.error || "Could not update store status");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleDeleteBranch = async (branch: Branch) => {
    if (branch.isMain) {
      alert("The Main Store cannot be deleted.");
      return;
    }
    const confirmed = window.confirm(
      `Do you really want to remove "${branch.name}" (${branch.code})?`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/admin/branches?id=${branch.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        fetchBranches();
      } else {
        alert(json.error || "Could not remove store branch");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-[#0F6E56]" />
        <span className="text-sm font-semibold">Loading store settings...</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 font-sans">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-[#0F6E56]" />
            Store Settings & Branches
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Update your pharmacy name, drug license, extra store branches, and staff permissions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saveSuccess && (
            <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#EAF5F0] border border-emerald-200 text-[#0F6E56] text-xs font-bold">
              <CheckCircle2 className="w-4 h-4" />
              {saveSuccess}
            </div>
          )}
          {errorMessage && (
            <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
              <AlertTriangle className="w-4 h-4" />
              {errorMessage}
            </div>
          )}
        </div>
      </div>

      {/* Simple User-Friendly Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-px">
        <button
          onClick={() => setActiveTab("profile")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "profile"
              ? "bg-white text-[#0F6E56] border border-b-0 border-slate-200 shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Store Details & License
        </button>

        <button
          onClick={() => setActiveTab("branches")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "branches"
              ? "bg-white text-[#0F6E56] border border-b-0 border-slate-200 shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
          }`}
        >
          <GitBranch className="w-4 h-4" />
          Store Branches
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#EAF5F0] text-[#0F6E56] font-extrabold">
            {branches.length}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab("security");
            fetchAuditLogs();
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "security"
              ? "bg-white text-[#0F6E56] border border-b-0 border-slate-200 shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
          }`}
        >
          <KeyRound className="w-4 h-4" />
          Staff Access & Activity History
        </button>

        <button
          onClick={() => {
            setActiveTab("backup");
            fetchSavedBackups();
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "backup"
              ? "bg-white text-[#0F6E56] border border-b-0 border-slate-200 shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
          }`}
        >
          <Database className="w-4 h-4" />
          Backup & Restore
        </button>

        <button
          onClick={() => {
            setActiveTab("updates");
            fetchVersionInfo();
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "updates"
              ? "bg-white text-[#0F6E56] border border-b-0 border-slate-200 shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
          }`}
        >
          <ArrowUpCircle className="w-4 h-4" />
          Software Updates
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: STORE DETAILS & LICENSE                                            */}
      {/* ========================================================================= */}
      {activeTab === "profile" && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Store className="w-5 h-5 text-[#0F6E56]" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Pharmacy Name & Contact Info
                </h3>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pharmacy / Store Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={settings.storeName}
                    onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#0F6E56]"
                    placeholder="e.g. HealthPharma Medical Store"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Full Shop Address (Printed on Customer Bills)
                  </label>
                  <textarea
                    rows={2}
                    value={settings.storeAddress}
                    onChange={(e) => setSettings({ ...settings, storeAddress: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#0F6E56]"
                    placeholder="Shop No. 4, Main Hospital Road, Kolkata 700001"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={settings.storePhone}
                      onChange={(e) => setSettings({ ...settings, storePhone: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#0F6E56]"
                      placeholder="+91 98765 43210"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Store Email
                    </label>
                    <input
                      type="email"
                      value={settings.storeEmail}
                      onChange={(e) => setSettings({ ...settings, storeEmail: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#0F6E56]"
                      placeholder="store@healthpharma.com"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <ShieldCheck className="w-5 h-5 text-[#0F6E56]" />
                <h3 className="font-bold text-slate-900 text-sm">
                  License Numbers & Stock Alerts
                </h3>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Drug License Number (DL 20B / 21B)
                  </label>
                  <input
                    type="text"
                    value={settings.storeDl}
                    onChange={(e) => setSettings({ ...settings, storeDl: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#0F6E56]"
                    placeholder="e.g. DL-20B/10492, DL-21B/10493"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    GST Number (GSTIN)
                  </label>
                  <input
                    type="text"
                    value={settings.storeGst}
                    maxLength={15}
                    onChange={(e) =>
                      setSettings({ ...settings, storeGst: e.target.value.toUpperCase() })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm uppercase text-slate-900 focus:outline-none focus:border-[#0F6E56]"
                    placeholder="19AAAAA0000A1Z5"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Low Stock Alert (Units)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={settings.lowQty}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          lowQty: e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0),
                        })
                      }
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#0F6E56]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Expiry Alert (Days Before)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={settings.expiryDays}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          expiryDays: e.target.value === "" ? 0 : Math.max(1, parseInt(e.target.value, 10) || 0),
                        })
                      }
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#0F6E56]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#0F6E56] hover:bg-[#0b5643] text-white rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              {saving ? "Saving..." : "Save Store Details"}
            </button>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: OTHER STORE BRANCHES                                               */}
      {/* ========================================================================= */}
      {activeTab === "branches" && (
        <div className="space-y-5">
          <div className="bg-[#EAF5F0] border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-[#0F6E56] mt-0.5 shrink-0" />
            <div className="text-xs text-slate-700 leading-relaxed">
              <strong className="text-slate-900">Open Multiple Stores Easily: </strong>
              You can add Store 2, Store 3, or any new branch right here. New branches start working immediately for billing and stock tracking without needing any extra setup.
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-600">
              Total Stores:{" "}
              <span className="text-slate-900 font-extrabold">{branches.length}</span>
            </div>

            <button
              onClick={() => openBranchModal()}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#0F6E56] hover:bg-[#0b5643] text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add New Store Branch
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            {branchesLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[#0F6E56]" />
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
                  <tr>
                    <th className="px-5 py-3.5">Store Code</th>
                    <th className="px-5 py-3.5">Store Name & Address</th>
                    <th className="px-5 py-3.5">License & GST</th>
                    <th className="px-5 py-3.5 text-center">Stock & Bills</th>
                    <th className="px-5 py-3.5 text-center">Status</th>
                    <th className="px-5 py-3.5 text-right">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {branches.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/80">
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold px-2.5 py-1 rounded-lg bg-[#EAF5F0] text-[#0F6E56]">
                            {b.code}
                          </span>
                          {b.isMain && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              Main Store
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-900 text-sm">{b.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {b.address || "No address added"}
                          {b.phone ? ` • ${b.phone}` : ""}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-xs text-slate-600">
                        <div>DL: {b.dlNo || "Same as Main"}</div>
                        <div>GST: {b.gstNo || "Same as Main"}</div>
                      </td>

                      <td className="px-5 py-4 text-center text-xs text-slate-600">
                        <div className="font-bold text-slate-800">
                          {b._count?.batches ?? 0} batches
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {b._count?.sales ?? 0} bills
                        </div>
                      </td>

                      <td className="px-5 py-4 text-center">
                        {b.isMain ? (
                          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-[#EAF5F0] text-[#0F6E56]">
                            Always Open
                          </span>
                        ) : (
                          <button
                            onClick={() => handleToggleBranchActive(b)}
                            className={`inline-flex px-3 py-1 rounded-full text-xs font-bold cursor-pointer ${
                              b.active
                                ? "bg-[#EAF5F0] text-[#0F6E56]"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {b.active ? "Open" : "Closed"}
                          </button>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openBranchModal(b)}
                            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                            title="Edit Store"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {!b.isMain && (
                            <button
                              onClick={() => handleDeleteBranch(b)}
                              className="p-2 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 cursor-pointer"
                              title="Remove Store"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: STAFF ACCESS & ACTIVITY HISTORY                                    */}
      {/* ========================================================================= */}
      {activeTab === "security" && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Layers className="w-5 h-5 text-[#0F6E56]" />
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Staff Roles & What They Can Do
                </h3>
                <p className="text-xs text-slate-500">
                  Each staff member gets access based on their role in the pharmacy.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.values(roleMatrix).map((r: any) => (
                <div
                  key={r.role}
                  className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-sm text-slate-900">
                      {r.label}
                    </span>
                    <span className="text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-[#EAF5F0] text-[#0F6E56]">
                      {r.role}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {r.description}
                  </p>
                  <div className="pt-2 flex items-center justify-between text-xs text-slate-700 border-t border-slate-200">
                    <span>Maximum Bill Discount:</span>
                    <span className="font-extrabold text-[#0F6E56]">
                      Up to {r.maxDiscountPercent}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#0F6E56]" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Recent Store Activity History
                  </h3>
                  <p className="text-xs text-slate-500">
                    Automatic record of staff logins, settings updates, and store changes.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchAuditLogs(auditSearch)}
                  placeholder="Search activity..."
                  className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#0F6E56]"
                />
                <button
                  type="button"
                  onClick={() => fetchAuditLogs(auditSearch)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                  title="Refresh List"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      auditLoading ? "animate-spin text-[#0F6E56]" : ""
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
                  <tr>
                    <th className="px-4 py-3">Date & Time</th>
                    <th className="px-4 py-3">Activity</th>
                    <th className="px-4 py-3">Staff Member</th>
                    <th className="px-4 py-3">Store Branch</th>
                    <th className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        No activity recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {new Date(log.createdAt).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`font-bold px-2.5 py-0.5 rounded-full text-[11px] ${
                              log.action.includes("FAILED") || log.action.includes("LOCKED")
                                ? "bg-rose-50 text-rose-700"
                                : "bg-[#EAF5F0] text-[#0F6E56]"
                            }`}
                          >
                            {log.action.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {log.user ? (
                            <span className="font-bold text-slate-800">
                              {log.user.username} ({log.user.role})
                            </span>
                          ) : (
                            <span className="text-slate-400">System</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-700">
                          {log.branch ? log.branch.name : "All Stores"}
                        </td>
                        <td className="px-4 py-3 max-w-md truncate text-slate-600">
                          {log.details || "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: DATABASE BACKUP & RESTORE (MODULE 1.14)                            */}
      {/* ========================================================================= */}
      {activeTab === "backup" && (
        <div className="space-y-6">
          {restoreSuccessMsg && (
            <div className="flex items-center gap-2 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{restoreSuccessMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card 1: 1.14.1 One-Click Full Database Backup */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                <div className="w-9 h-9 rounded-xl bg-[#EAF5F0] flex items-center justify-center text-[#0F6E56]">
                  <DownloadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    1-Click Full SQL Database Backup
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Export a timestamped .sql file covering all 24 relational tables
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Generates a clean, standard SQL dump with table definitions and row inserts in foreign-key dependency order. Fully compatible with PostgreSQL, MySQL, and phpMyAdmin exports.
              </p>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleOneClickBackup}
                  disabled={backupExporting}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#0F6E56] hover:bg-[#0b5643] text-white text-xs font-extrabold shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {backupExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating SQL Dump...
                    </>
                  ) : (
                    <>
                      <DownloadCloud className="w-4 h-4" />
                      Download Complete .sql Backup
                    </>
                  )}
                </button>
              </div>

              {/* Past Backups Table */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800">
                    Saved Backups on Server
                  </span>
                  <button
                    type="button"
                    onClick={fetchSavedBackups}
                    className="text-[11px] text-[#0F6E56] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${backupsLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>

                {savedBackups.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">
                    No past backups saved locally yet. Click download above to generate your first backup.
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-100">
                    {savedBackups.map((b) => (
                      <div
                        key={b.filename}
                        className="flex items-center justify-between p-2.5 text-xs hover:bg-slate-50 transition-colors"
                      >
                        <div className="truncate pr-2">
                          <p className="font-bold text-slate-800 truncate">{b.filename}</p>
                          <p className="text-[10px] text-slate-400">
                            {b.sizeFormatted} • {new Date(b.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <a
                          href={`/api/admin/backup?file=${encodeURIComponent(b.filename)}`}
                          download={b.filename}
                          className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-[#EAF5F0] text-slate-700 hover:text-[#0F6E56] text-[11px] font-bold transition-colors"
                        >
                          Download
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Card 2: 1.14.2 Restore From SQL File */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    Restore Database from SQL File
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Accepts system backups and phpMyAdmin / standard SQL exports
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Caution:</strong> Restoring will overwrite existing records. We strongly advise validating with Dry Run first.
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Select .sql Backup File
                </label>
                <input
                  type="file"
                  accept=".sql,text/plain"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setRestoreFile(f);
                    setDryRunInfo(null);
                  }}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                />
              </div>

              {/* Dry Run Report */}
              {dryRunInfo && (
                <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    Validation Passed: {dryRunInfo.statementsCount} statements detected
                  </div>
                  <p className="text-[11px] text-blue-800">
                    Affected Tables ({dryRunInfo.tablesAffected.length}):
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {dryRunInfo.tablesAffected.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] font-mono font-bold"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleDryRunRestore}
                  disabled={!restoreFile || dryRunning}
                  className="flex-1 px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {dryRunning ? "Validating SQL..." : "Dry Run / Validate"}
                </button>
                <button
                  type="button"
                  onClick={() => setRestoreConfirmModalOpen(true)}
                  disabled={!restoreFile || restoring}
                  className="flex-1 px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  Restore Database
                </button>
              </div>
            </div>
          </div>

          {/* Card 3: 1.14.3 Local-JSON to MySQL / PostgreSQL Migration Tool */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <FileCode className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Local-JSON to Relational DB Migration Tool (1.14.3)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Import legacy JSON catalogs, suppliers, and customer lists into PostgreSQL/MySQL
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Upload existing JSON data exported from legacy versions. The ETL engine maps categories, medicines, suppliers, customers, and inventory batches into your active relational database while saving a fallback JSON backup in <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">backups/json_migrations/</code>.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="md:col-span-2 space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Select Legacy JSON File
                </label>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => setJsonMigrateFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                />
              </div>

              <button
                type="button"
                onClick={handleExecuteJsonMigration}
                disabled={!jsonMigrateFile || jsonMigrating}
                className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {jsonMigrating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Migrating...
                  </>
                ) : (
                  <>
                    <HardDrive className="w-4 h-4" />
                    Run JSON Migration
                  </>
                )}
              </button>
            </div>

            {/* Migration Result Stats */}
            {jsonMigrateResult && (
              <div className="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-200 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                  JSON Migration Successful! Fallback preserved at: {jsonMigrateResult.backupFile}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center pt-1">
                  <div className="p-2 bg-white rounded-xl border border-indigo-100">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Categories</p>
                    <p className="text-sm font-extrabold text-indigo-900">{jsonMigrateResult.migrated.categories}</p>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-indigo-100">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Suppliers</p>
                    <p className="text-sm font-extrabold text-indigo-900">{jsonMigrateResult.migrated.suppliers}</p>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-indigo-100">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Customers</p>
                    <p className="text-sm font-extrabold text-indigo-900">{jsonMigrateResult.migrated.customers}</p>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-indigo-100">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Medicines</p>
                    <p className="text-sm font-extrabold text-indigo-900">{jsonMigrateResult.migrated.medicines}</p>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-indigo-100">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Batches</p>
                    <p className="text-sm font-extrabold text-indigo-900">{jsonMigrateResult.migrated.batches}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: SOFTWARE UPDATES SYSTEM (MODULE 1.15)                               */}
      {/* ========================================================================= */}
      {activeTab === "updates" && (
        <div className="space-y-6">
          {updateSuccess && (
            <div className="flex items-center gap-2 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{updateSuccess}</span>
            </div>
          )}

          {/* Current System Version HUD */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-slate-400">Current Version</span>
              <p className="text-lg font-black text-slate-900 mt-0.5 flex items-center gap-1.5">
                v{appVersionInfo.currentVersion}
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Active
                </span>
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-slate-400">Environment</span>
              <p className="text-base font-extrabold text-slate-800 mt-1 capitalize">
                {appVersionInfo.environment}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-slate-400">System Health</span>
              <p className="text-base font-extrabold text-emerald-600 mt-1 flex items-center gap-1">
                <Check className="w-4 h-4" /> Operational
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-slate-400">Last DB Backup</span>
              <p className="text-xs font-bold text-slate-700 mt-1 truncate">
                {appVersionInfo.lastBackupAt
                  ? new Date(appVersionInfo.lastBackupAt).toLocaleDateString()
                  : "No backup today"}
              </p>
            </div>
          </div>

          {/* Package Uploader & Inspector */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-[#0F6E56]">
                <ArrowUpCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Upload & Inspect Version Update (.zip)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Validates path traversal safety, compares versions, and requires pre-update backup confirmation
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="md:col-span-2 space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Select Version ZIP Archive
                </label>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setUpdatePackageFile(f);
                    setUpdateInspection(null);
                    setConfirmBackupChecked(false);
                    if (f) {
                      handleInspectUpdate(f);
                    }
                  }}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                />
              </div>

              <button
                type="button"
                onClick={() => updatePackageFile && handleInspectUpdate(updatePackageFile)}
                disabled={!updatePackageFile || updateInspecting}
                className="px-5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-extrabold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {updateInspecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Inspecting...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Inspect Package
                  </>
                )}
              </button>
            </div>

            {/* Inspection Results Card */}
            {updateInspection && (
              <div className="p-5 rounded-3xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400">Target Version</span>
                    <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                      v{updateInspection.newVersion}
                      {updateInspection.isUpgrade ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold">
                          Upgrade from v{updateInspection.currentVersion}
                        </span>
                      ) : updateInspection.isSame ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-extrabold">
                          Re-install v{updateInspection.currentVersion}
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-extrabold">
                          Downgrade
                        </span>
                      )}
                    </h4>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-100/70 border border-emerald-200 text-[#0F6E56] text-xs font-bold">
                    <ShieldCheck className="w-4 h-4" />
                    Path Traversal Scan: Passed
                  </div>
                </div>

                {updateInspection.manifest?.releaseNotes && (
                  <div className="text-xs text-slate-600 bg-white p-3 rounded-2xl border border-slate-200/80">
                    <span className="font-bold text-slate-800 block mb-0.5">Release Notes:</span>
                    {updateInspection.manifest.releaseNotes}
                  </div>
                )}

                {/* Changed Files Inventory */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span>Changed Files Inventory ({updateInspection.totalFiles})</span>
                    <span className="text-slate-400 text-[11px]">All paths validated</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-200/60 rounded-2xl border border-slate-200 bg-white">
                    {updateInspection.changedFiles.map((f: any) => (
                      <div
                        key={f.path}
                        className="flex items-center justify-between p-2.5 text-xs hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-2 truncate pr-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black uppercase ${
                              f.action === "create"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {f.action}
                          </span>
                          <span className="font-mono text-slate-800 text-[11px] truncate">
                            {f.path}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono shrink-0">
                          {f.sizeFormatted}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mandatory Backup Confirmation Checkbox */}
                <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmBackupChecked}
                      onChange={(e) => setConfirmBackupChecked(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-[#0F6E56] border-slate-300 focus:ring-[#0F6E56]"
                    />
                    <div className="text-xs text-slate-800">
                      <span className="font-extrabold text-amber-950 block">
                        Mandatory Pre-Update Backup Confirmation
                      </span>
                      I confirm that I have downloaded or verified a current database backup. If unexpected issues occur, files replaced by this update will be archived in <code className="bg-amber-100 px-1 rounded text-[10px]">.backups/pre_update_...</code>.
                    </div>
                  </label>

                  <button
                    type="button"
                    onClick={handleApplyUpdate}
                    disabled={!confirmBackupChecked || updateApplying}
                    className="w-full py-3 px-5 rounded-2xl bg-[#0F6E56] hover:bg-[#0b5643] text-white text-xs font-extrabold shadow-sm transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {updateApplying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Applying System Update...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Apply System Update to v{updateInspection.newVersion}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Confirm Database Restore Overwrite */}
      {restoreConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-rose-200 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  Confirm Database Overwrite
                </h3>
                <p className="text-xs text-slate-500">
                  Irreversible operation warning
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Restoring from <strong className="text-slate-900">{restoreFile?.name}</strong> will overwrite current rows across the affected database tables. Any unbacked data may be permanently lost.
            </p>

            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-[11px] text-rose-800 font-bold">
              Are you sure you want to proceed with restoring this database backup?
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRestoreConfirmModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteRestore}
                disabled={restoring}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {restoring ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Restoring...
                  </>
                ) : (
                  "Yes, Overwrite & Restore"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add / Edit Store Branch */}
      {branchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-[#0F6E56]" />
                <h3 className="font-extrabold text-slate-900 text-base">
                  {editingBranch
                    ? `Edit Store: ${editingBranch.name}`
                    : "Add New Store Branch"}
                </h3>
              </div>
              <button
                onClick={() => setBranchModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-base font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {branchError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {branchError}
              </div>
            )}

            <form onSubmit={handleSaveBranch} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Short Code *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={editingBranch?.isMain}
                    value={branchFormData.code}
                    onChange={(e) =>
                      setBranchFormData({
                        ...branchFormData,
                        code: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm uppercase text-slate-900 disabled:opacity-50"
                    placeholder="BR-02"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Store Branch Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={branchFormData.name}
                    onChange={(e) =>
                      setBranchFormData({ ...branchFormData, name: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900"
                    placeholder="e.g. City Hospital Branch"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tagline / Counter Type
                </label>
                <input
                  type="text"
                  value={branchFormData.tagline}
                  onChange={(e) =>
                    setBranchFormData({ ...branchFormData, tagline: e.target.value })
                  }
                  placeholder="e.g. 24x7 Emergency OPD"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Branch Address
                </label>
                <textarea
                  rows={2}
                  value={branchFormData.address}
                  onChange={(e) =>
                    setBranchFormData({ ...branchFormData, address: e.target.value })
                  }
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900"
                  placeholder="Ground Floor, Hospital Road"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={branchFormData.phone}
                    onChange={(e) =>
                      setBranchFormData({ ...branchFormData, phone: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Branch Email
                  </label>
                  <input
                    type="email"
                    value={branchFormData.email}
                    onChange={(e) =>
                      setBranchFormData({ ...branchFormData, email: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Drug License (DL)
                  </label>
                  <input
                    type="text"
                    value={branchFormData.dlNo}
                    onChange={(e) =>
                      setBranchFormData({ ...branchFormData, dlNo: e.target.value })
                    }
                    placeholder="Leave blank to use Main DL"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    GSTIN
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    value={branchFormData.gstNo}
                    onChange={(e) =>
                      setBranchFormData({
                        ...branchFormData,
                        gstNo: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="Leave blank to use Main GST"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm uppercase text-slate-900"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setBranchModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={branchSaving}
                  className="px-5 py-2 bg-[#0F6E56] hover:bg-[#0b5643] text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  {branchSaving
                    ? "Saving..."
                    : editingBranch
                    ? "Save Changes"
                    : "Create Store Branch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
