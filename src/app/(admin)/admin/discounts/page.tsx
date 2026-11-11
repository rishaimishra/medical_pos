"use client";

import React, { useState, useEffect } from "react";
import {
  Tag,
  Percent,
  Plus,
  Search,
  CheckCircle,
  XCircle,
  Edit2,
  Trash2,
  AlertCircle,
  Receipt,
  IndianRupee,
  Sliders,
  Shield,
} from "lucide-react";
import { toast } from "@/stores/useToastStore";
import { confirmAction } from "@/stores/useConfirmStore";
import { Modal } from "@/components/ui/Modal";
import { useAuthStore } from "@/stores/useAuthStore";

interface DiscountPolicy {
  id: number;
  name: string;
  type: "percent" | "flat";
  value: number;
  minAmount: number;
  active: boolean;
  salesCount: number;
  createdAt: string;
}

export default function DiscountsManagementPage() {
  const { user } = useAuthStore();
  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";

  const [discounts, setDiscounts] = useState<DiscountPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "percent" | "flat">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<DiscountPolicy | null>(null);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"percent" | "flat">("percent");
  const [formValue, setFormValue] = useState("");
  const [formMinAmount, setFormMinAmount] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchDiscounts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/discounts");
      const data = await res.json();
      if (data.success) {
        setDiscounts(data.discounts);
      } else {
        toast.error(data.error || "Failed to load discount policies");
      }
    } catch {
      toast.error("Failed to connect to server");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDiscounts();
  }, []);

  const openCreateModal = () => {
    setEditingPolicy(null);
    setFormName("");
    setFormType("percent");
    setFormValue("");
    setFormMinAmount("0");
    setFormActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (d: DiscountPolicy) => {
    setEditingPolicy(d);
    setFormName(d.name);
    setFormType(d.type);
    setFormValue(String(d.value));
    setFormMinAmount(String(d.minAmount));
    setFormActive(d.active);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim()) {
      setFormError("Policy name is required");
      return;
    }

    const numVal = parseFloat(formValue);
    if (isNaN(numVal) || numVal <= 0) {
      setFormError("Discount value must be a positive number");
      return;
    }

    if (formType === "percent" && numVal > 100) {
      setFormError("Percentage discount cannot exceed 100%");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formName.trim(),
        type: formType,
        value: numVal,
        minAmount: parseFloat(formMinAmount) || 0,
        active: formActive,
      };

      const url = editingPolicy
        ? `/api/admin/discounts/${editingPolicy.id}`
        : "/api/admin/discounts";
      const method = editingPolicy ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.error || "Failed to save discount policy");
        setIsSubmitting(false);
        return;
      }

      toast.success(data.message || "Discount policy saved successfully!");
      setIsModalOpen(false);
      fetchDiscounts();
    } catch {
      setFormError("Failed to communicate with server");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (d: DiscountPolicy) => {
    try {
      const res = await fetch(`/api/admin/discounts/${d.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !d.active }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`'${d.name}' is now ${!d.active ? "Active" : "Inactive"}`);
        fetchDiscounts();
      } else {
        toast.error(data.error || "Failed to toggle status");
      }
    } catch {
      toast.error("Network error");
    }
  };

  const handleDelete = async (d: DiscountPolicy) => {
    const confirmed = await confirmAction({
      title: "Delete Discount Policy",
      message: `Are you sure you want to remove '${d.name}'? If this policy was used in past sales, it will be safely deactivated to preserve accounting records.`,
      confirmText: "Delete Policy",
      type: "danger",
    });

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/admin/discounts/${d.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchDiscounts();
      } else {
        toast.error(data.error || "Failed to delete discount policy");
      }
    } catch {
      toast.error("Failed to connect to server");
    }
  };

  // Filter discounts
  const filtered = discounts.filter((d) => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (filterType !== "all" && d.type !== filterType) {
      return false;
    }
    if (filterStatus === "active" && !d.active) return false;
    if (filterStatus === "inactive" && d.active) return false;
    return true;
  });

  const totalActive = discounts.filter((d) => d.active).length;
  const totalPercent = discounts.filter((d) => d.type === "percent").length;
  const totalFlat = discounts.filter((d) => d.type === "flat").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
              <Percent className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              Master Discount Architecture
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure promotional schemes, senior citizen concessions, and invoice-level threshold discounts (Module 2.4.1)
          </p>
        </div>

        {isAdminOrManager && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Discount Policy</span>
          </button>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Policies
            </span>
            <Tag className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {discounts.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Configured schemes</div>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
              Active In POS
            </span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-950 mt-2">
            {totalActive}
          </div>
          <div className="text-[11px] text-emerald-700 mt-0.5">Ready for cashiers</div>
        </div>

        <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider">
              Percentage (%)
            </span>
            <Percent className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-950 mt-2">
            {totalPercent}
          </div>
          <div className="text-[11px] text-indigo-700 mt-0.5">Proportional schemes</div>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
              Flat Currency (₹)
            </span>
            <IndianRupee className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-950 mt-2">
            {totalFlat}
          </div>
          <div className="text-[11px] text-amber-700 mt-0.5">Threshold vouchers</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search policies by scheme name (e.g. Senior, Regular, Festival)..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="all">All Types</option>
              <option value="percent">Percentage Only</option>
              <option value="flat">Flat Amount Only</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Table / Grid */}
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Policy Scheme</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Discount Value</th>
                <th className="py-3 px-4 text-right">Min. Invoice Amount</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Sales Used</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                    Loading discount architecture...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                    No discount policies found matching criteria
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>{d.name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                          d.type === "percent"
                            ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {d.type === "percent" ? (
                          <>
                            <Percent className="w-3 h-3" /> Percentage
                          </>
                        ) : (
                          <>
                            <IndianRupee className="w-3 h-3" /> Flat
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-slate-900 text-sm">
                      {d.type === "percent" ? `${d.value}%` : `₹${d.value.toFixed(2)}`}
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium text-slate-600">
                      {d.minAmount > 0 ? `₹${d.minAmount.toFixed(2)}` : "None (₹0)"}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(d)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold cursor-pointer transition-all ${
                          d.active
                            ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                            : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                        }`}
                      >
                        {d.active ? "Active" : "Disabled"}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-slate-600">
                      {d.salesCount}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {isAdminOrManager ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(d)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Edit Policy"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(d)}
                            className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete Policy"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">View only</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Policy Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPolicy ? "Edit Discount Policy" : "New Discount Scheme"}
        description="Configure promotional scheme parameters and cart threshold limits"
        headerIcon={
          <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
            <Percent className="w-5 h-5" />
          </div>
        }
        size="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Policy Scheme Name *
            </label>
            <input
              type="text"
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Senior Citizen 10%, Diwali Flat ₹50"
              className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Discount Type *
              </label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as any)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
              >
                <option value="percent">Percentage (%)</option>
                <option value="flat">Flat Amount (₹)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Discount Value *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  value={formValue}
                  onChange={(e) => setFormValue(e.target.value)}
                  placeholder={formType === "percent" ? "10" : "50"}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-slate-400">
                  {formType === "percent" ? "%" : "₹"}
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Minimum Invoice Threshold (₹)
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={formMinAmount}
              onChange={(e) => setFormMinAmount(e.target.value)}
              placeholder="0 (no minimum requirement)"
              className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Cashier cannot apply this discount unless bill subtotal meets or exceeds this amount.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="formActiveCheck"
              checked={formActive}
              onChange={(e) => setFormActive(e.target.checked)}
              className="w-4 h-4 rounded text-[#1F4E5B] border-slate-300 focus:ring-[#1F4E5B] cursor-pointer"
            />
            <label htmlFor="formActiveCheck" className="text-xs font-bold text-slate-700 cursor-pointer">
              Active & Available on POS terminal
            </label>
          </div>

          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel (Esc)
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : editingPolicy ? "Update Policy" : "Create Policy"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
