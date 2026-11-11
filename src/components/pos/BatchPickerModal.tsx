"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Package, Check, AlertTriangle, ShieldCheck, Sparkles, Layers } from "lucide-react";
import { useBranchStore } from "@/stores/useBranchStore";
import { useAuthStore } from "@/stores/useAuthStore";

export interface BatchItemData {
  id: number;
  batchNo: string;
  expiryDate: string;
  mfgDate?: string | null;
  quantity: number;
  mrp: number;
  purchasePrice?: number | null;
  daysRemaining: number;
  tier: string;
}

interface BatchPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicineId: number;
  medicineName: string;
  currentBatchId?: number;
  onSelectBatch: (batch: BatchItemData) => void;
}

export function BatchPickerModal({
  isOpen,
  onClose,
  medicineId,
  medicineName,
  currentBatchId,
  onSelectBatch,
}: BatchPickerModalProps) {
  const { activeBranch } = useBranchStore();
  const { user } = useAuthStore();
  const [batches, setBatches] = useState<BatchItemData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canViewCost = user?.role === "admin" || (user?.permissions || []).includes("view_cost_price");

  useEffect(() => {
    if (!isOpen || !medicineId) return;

    const fetchBatches = async () => {
      try {
        setLoading(true);
        setError(null);
        const url = `/api/admin/batches?medicineId=${medicineId}&branchId=${
          activeBranch?.id || ""
        }&stock=in_stock&fefo=true&limit=50`;
        const res = await fetch(url, { cache: "no-store" });
        const json = await res.json();

        if (json.success && Array.isArray(json.data)) {
          setBatches(json.data);
        } else {
          setBatches([]);
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load active batches");
      } finally {
        setLoading(false);
      }
    };

    fetchBatches();
  }, [isOpen, medicineId, activeBranch?.id]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Select Alternative Batch (FEFO Override)"
      description={`${medicineName} — Active Batches in ${activeBranch?.name || "Current Store"}`}
      headerIcon={
        <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-[#1F4E5B] flex items-center justify-center">
          <Layers className="w-5 h-5" />
        </div>
      }
      size="xl"
    >
      <div className="space-y-4">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500 font-medium">
            Loading batches with FEFO priority...
          </div>
        ) : error ? (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        ) : batches.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No active batches with stock available for this medicine.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Batch No</th>
                  <th className="py-3 px-3">Expiry Date</th>
                  <th className="py-3 px-3">Days Left</th>
                  <th className="py-3 px-3 text-right">In Stock</th>
                  <th className="py-3 px-3 text-right">MRP</th>
                  {canViewCost && <th className="py-3 px-3 text-right">Cost Price</th>}
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((batch, index) => {
                  const isCurrent = batch.id === currentBatchId;
                  const isFefoRecommended = index === 0;

                  return (
                    <tr
                      key={batch.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isCurrent ? "bg-teal-50/60 font-semibold" : ""
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{batch.batchNo}</span>
                          {isFefoRecommended && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                              <Sparkles className="w-3 h-3" />
                              FEFO Earliest
                            </span>
                          )}
                          {isCurrent && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-[#1F4E5B]">
                              Current
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-700">
                        {new Date(batch.expiryDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            batch.daysRemaining <= 30
                              ? "bg-rose-100 text-rose-800"
                              : batch.daysRemaining <= 90
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {batch.daysRemaining} days
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900">
                        {batch.quantity}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900">
                        ₹{Number(batch.mrp).toFixed(2)}
                      </td>
                      {canViewCost && (
                        <td className="py-3 px-3 text-right text-slate-500 font-medium">
                          {batch.purchasePrice ? `₹${Number(batch.purchasePrice).toFixed(2)}` : "-"}
                        </td>
                      )}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectBatch(batch);
                            onClose();
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isCurrent
                              ? "bg-teal-700 text-white"
                              : "bg-[#1F4E5B] hover:bg-[#163a44] text-white shadow-2xs"
                          }`}
                        >
                          {isCurrent ? "Selected" : "Pick Batch"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </Modal>
  );
}
