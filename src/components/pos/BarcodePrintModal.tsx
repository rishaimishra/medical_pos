"use client";

import React, { useState, useId, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Barcode, Printer, Sliders, RefreshCw } from "lucide-react";
import { generateBarcodeSvg } from "@/lib/barcode";

interface BarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicineName?: string;
  batchNo?: string;
  expiryDate?: string;
  mrp?: number;
  storeName?: string;
}

export function BarcodePrintModal({
  isOpen,
  onClose,
  medicineName = "Amoxicillin 500mg",
  batchNo = "BAT-2026-001",
  expiryDate = "2028-12-31",
  mrp = 120,
  storeName = "DRx Pharmacy",
}: BarcodePrintModalProps) {
  const [medName, setMedName] = useState(medicineName);
  const [batch, setBatch] = useState(batchNo);
  const [exp, setExp] = useState(expiryDate);
  const [price, setPrice] = useState(String(mrp));
  const [store, setStore] = useState(storeName);
  const [count, setCount] = useState<number>(1);
  const [labelSize, setLabelSize] = useState<"50x25" | "38x25" | "sheet24">("50x25");

  useEffect(() => {
    if (isOpen) {
      setMedName(medicineName);
      setBatch(batchNo);
      setExp(expiryDate);
      setPrice(String(mrp));
      setStore(storeName);
    }
  }, [isOpen, medicineName, batchNo, expiryDate, mrp, storeName]);

  const formattedExp = exp
    ? new Date(exp).toLocaleDateString("en-IN", { month: "2-digit", year: "2-digit" })
    : "12/28";

  // Generate Code 128 Barcode SVG
  const barcodeSvgHtml = generateBarcodeSvg(batch || "DRX-000", {
    width: 220,
    height: 50,
    includeText: true,
  });

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Print Barcode Labels"
      description="Generate standard thermal barcode stickers for inventory and medicine packaging"
      headerIcon={
        <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-[#1F4E5B] flex items-center justify-center">
          <Barcode className="w-5 h-5" />
        </div>
      }
      size="lg"
    >
      <div className="space-y-5">
        {/* Configuration Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Medicine Name
              </label>
              <input
                type="text"
                value={medName}
                onChange={(e) => setMedName(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Batch No
                </label>
                <input
                  type="text"
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={exp ? exp.split("T")[0] : ""}
                  onChange={(e) => setExp(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  MRP (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Store Tag
                </label>
                <input
                  type="text"
                  value={store}
                  onChange={(e) => setStore(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                />
              </div>
            </div>

            {/* Label Size & Copies */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Label Format
                </label>
                <select
                  value={labelSize}
                  onChange={(e) => setLabelSize(e.target.value as any)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                >
                  <option value="50x25">50mm x 25mm (Thermal)</option>
                  <option value="38x25">38mm x 25mm (Compact)</option>
                  <option value="sheet24">A4 Sheet (24 Labels)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Copies
                </label>
                <div className="flex items-center gap-1.5">
                  {[1, 5, 10, 24].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCount(n)}
                      className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
                        count === n
                          ? "bg-[#1F4E5B] border-[#1F4E5B] text-white"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Label Preview */}
          <div className="flex flex-col items-center justify-center p-4 bg-slate-100 rounded-2xl border border-slate-200">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Thermal Label Live Preview
            </span>

            {/* 50x25mm preview box */}
            <div
              className={`bg-white border-2 border-dashed border-slate-300 rounded-lg p-2.5 shadow-sm flex flex-col justify-between text-slate-900 select-none ${
                labelSize === "38x25" ? "w-[190px] h-[120px]" : "w-[240px] h-[130px]"
              }`}
            >
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-600 border-b border-slate-200 pb-0.5">
                <span className="truncate max-w-[140px] uppercase tracking-wide">{store}</span>
                <span className="text-[9px] font-mono text-slate-500">EXP:{formattedExp}</span>
              </div>

              <div className="text-center my-0.5">
                <div className="text-xs font-black truncate leading-tight text-slate-950">
                  {medName}
                </div>
                <div className="text-[10px] font-bold text-slate-700">
                  B: <span className="font-mono">{batch}</span> | MRP: ₹{parseFloat(price || "0").toFixed(2)}
                </div>
              </div>

              {/* Barcode Vector */}
              <div
                className="flex justify-center overflow-hidden py-0.5"
                dangerouslySetInnerHTML={{ __html: barcodeSvgHtml }}
              />

              <div className="text-[8px] text-center font-semibold text-slate-400">
                (Inclusive of all taxes)
              </div>
            </div>

            <div className="mt-3 text-center text-[11px] text-slate-500">
              Output: <strong>{count}</strong> {count === 1 ? "label" : "labels"} on <strong>{labelSize}</strong> stock
            </div>
          </div>
        </div>

        {/* Print Action Bar */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            Cancel (Esc)
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print {count} Barcode {count === 1 ? "Label" : "Labels"}</span>
          </button>
        </div>

        {/* Hidden Printable Label Section for Thermal Printers */}
        <div id="thermal-barcode-print-area" className="hidden">
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              body * { visibility: hidden; }
              #thermal-barcode-print-area, #thermal-barcode-print-area * { visibility: visible; }
              #thermal-barcode-print-area {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                display: block !important;
              }
              .thermal-label-page {
                width: 50mm;
                height: 25mm;
                padding: 1.5mm;
                box-sizing: border-box;
                page-break-after: always;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                font-family: system-ui, -apple-system, sans-serif;
              }
            }
          `}} />
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="thermal-label-page">
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "7pt", fontWeight: "bold" }}>
                <span>{store}</span>
                <span>EXP:{formattedExp}</span>
              </div>
              <div style={{ textAlign: "center", fontSize: "8pt", fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden" }}>
                {medName}
              </div>
              <div style={{ textAlign: "center", fontSize: "7pt" }}>
                B:{batch} | MRP: ₹{parseFloat(price || "0").toFixed(2)}
              </div>
              <div style={{ display: "flex", justifyContent: "center" }} dangerouslySetInnerHTML={{ __html: barcodeSvgHtml }} />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
