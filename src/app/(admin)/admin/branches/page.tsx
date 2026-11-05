"use client";

import React, { useState, useEffect } from "react";
import {
  GitBranch,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Info,
  CheckCircle2,
  AlertTriangle,
  X,
  Store,
} from "lucide-react";
import { useBranchStore } from "@/stores/useBranchStore";

interface Branch {
  id: number;
  code: string;
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstNo: string | null;
  dlNo: string | null;
  isMain: boolean;
  active: boolean;
  _count?: {
    batches: number;
    sales: number;
    users: number;
    purchaseOrders: number;
    returns: number;
  };
}

export default function StoreBranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchBranches = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/branches");
      const json = await res.json();
      if (json.success && json.data) {
        setBranches(json.data);
        useBranchStore.getState().fetchBranches();
      }
    } catch (err: any) {
      console.error("Failed to load store branches:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  const openBranchModal = (branch?: Branch) => {
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
      const nextNum = branches.length + 1;
      const padNum = nextNum < 10 ? `0${nextNum}` : `${nextNum}`;
      setBranchFormData({
        code: `BR-${padNum}`,
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
    setErrorMsg(null);
    setBranchModalOpen(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    try {
      const url = "/api/admin/branches";
      const method = editingBranch ? "PATCH" : "POST";
      const payload = editingBranch
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
        setSuccessMsg(editingBranch ? "Store branch updated!" : "New store branch added successfully!");
        fetchBranches();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setErrorMsg(json.error || "Could not save branch");
      }
    } catch (err: any) {
      setErrorMsg("Connection error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (branch: Branch) => {
    if (branch.isMain) return;
    try {
      const res = await fetch("/api/admin/branches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: branch.id, active: !branch.active }),
      });
      const json = await res.json();
      if (json.success) {
        fetchBranches();
      } else {
        alert(json.error || "Could not update status");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleDeleteBranch = async (branch: Branch) => {
    if (branch.isMain) {
      alert("The Main Store branch cannot be deleted.");
      return;
    }

    const linkedItems = (branch._count?.batches || 0) + (branch._count?.sales || 0);
    if (linkedItems > 0) {
      alert(
        `This branch already has ${branch._count?.batches} batches and ${branch._count?.sales} bills recorded. To keep your audit logs safe, please deactivate it instead of deleting.`
      );
      return;
    }

    if (!confirm(`Are you sure you want to remove '${branch.name}' (${branch.code})?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/branches?id=${branch.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(`Store branch '${branch.name}' removed.`);
        fetchBranches();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        alert(json.error || "Could not remove store branch");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 font-sans">
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
            <GitBranch className="w-6 h-6 text-[#1F4E5B]" />
            Store Branches
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your main pharmacy store and all secondary branches, counters, and licenses.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {successMsg && (
            <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#EAF5F0] border border-emerald-200 text-[#0F6E56] text-xs font-bold shadow-2xs">
              <CheckCircle2 className="w-4 h-4" />
              {successMsg}
            </div>
          )}
          <button
            onClick={() => openBranchModal()}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add New Store Branch
          </button>
        </div>
      </div>

      {/* Info Callout */}
      <div className="bg-[#EAF5F0] border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-[#0F6E56] mt-0.5 shrink-0" />
        <div className="text-xs text-slate-700 leading-relaxed">
          <strong className="text-slate-900">Multi-Store Operations: </strong>
          You can add Store 2, Store 3, or an OPD counter right here. Every new branch gets its own stock inventory and counter billing, switchable anytime from the top bar dropdown.
        </div>
      </div>

      {/* Branches Table Card */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">
            Active Store Branches ({branches.length})
          </span>
          <span className="text-[11px] text-slate-500">
            Switch active branch from top navbar to bill for that branch
          </span>
        </div>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-[#1F4E5B]" />
            <span className="text-xs">Loading store branches...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
                <tr>
                  <th className="px-5 py-3.5">Branch Code</th>
                  <th className="px-5 py-3.5">Branch Name & Address</th>
                  <th className="px-5 py-3.5">Drug License & GST</th>
                  <th className="px-5 py-3.5 text-center">Batches & Bills</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold px-2.5 py-1 rounded-lg bg-[#EAF2F4] text-[#1F4E5B]">
                          {b.code}
                        </span>
                        {b.isMain && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            Main Store
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        <Store className="w-4 h-4 text-slate-400" />
                        {b.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 pl-5.5">
                        {b.address || "No address added"}
                        {b.phone ? ` • ${b.phone}` : ""}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-xs text-slate-600">
                      <div>DL: <span className="font-mono font-semibold">{b.dlNo || "Same as Main"}</span></div>
                      <div>GST: <span className="font-mono font-semibold">{b.gstNo || "Same as Main"}</span></div>
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
                          onClick={() => handleToggleActive(b)}
                          className={`inline-flex px-3 py-1 rounded-full text-xs font-bold cursor-pointer transition-colors ${
                            b.active
                              ? "bg-[#EAF5F0] text-[#0F6E56] hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
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
                          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
                          title="Edit Branch"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {!b.isMain && (
                          <button
                            onClick={() => handleDeleteBranch(b)}
                            className="p-2 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 cursor-pointer transition-colors"
                            title="Remove Branch"
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
          </div>
        )}
      </div>

      {/* Add / Edit Branch Modal */}
      {branchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-[#1F4E5B]" />
                <h3 className="font-extrabold text-slate-900 text-sm">
                  {editingBranch ? `Edit Branch (${editingBranch.code})` : "Add New Store Branch"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBranchModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBranch} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Branch Code <span className="text-rose-500">*</span>
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
                    placeholder="BR-02"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm uppercase font-mono text-slate-900 focus:outline-none focus:border-[#1F4E5B] disabled:opacity-50"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Store Branch Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={branchFormData.name}
                    onChange={(e) =>
                      setBranchFormData({ ...branchFormData, name: e.target.value })
                    }
                    placeholder="e.g. City Hospital OPD Branch"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
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
                  placeholder="e.g. 24x7 Emergency Counter"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
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
                  placeholder="Physical counter address printed on branch bills..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
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
                    placeholder="+91 98765 43210"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
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
                    placeholder="branch@store.com"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Branch Drug License (DL)
                  </label>
                  <input
                    type="text"
                    value={branchFormData.dlNo}
                    onChange={(e) =>
                      setBranchFormData({ ...branchFormData, dlNo: e.target.value })
                    }
                    placeholder="Leave blank to use Main DL"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Branch GSTIN
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm uppercase text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setBranchModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold shadow-md cursor-pointer transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingBranch ? "Update Branch" : "Add Branch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

