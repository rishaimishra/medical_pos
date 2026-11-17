"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Printer, CheckCircle2, RotateCcw, ExternalLink } from "lucide-react";
import { ThermalReceipt } from "@/components/pos/ThermalReceipt";
import { A4TaxInvoice } from "@/components/pos/A4TaxInvoice";

type PrintLayout = "thermal-80" | "thermal-58" | "a4";

interface ReceiptPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleData: any;
  onNewSale: () => void;
}

export function ReceiptPrintModal({
  isOpen,
  onClose,
  saleData,
  onNewSale,
}: ReceiptPrintModalProps) {
  const [layout, setLayout] = useState<PrintLayout>("thermal-80");

  if (!isOpen || !saleData) return null;

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const invoiceId = saleData.id || saleData.invoiceNo;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onNewSale || onClose}
      title="Invoice Receipt & Printing Desk"
      description={`Invoice: ${saleData.invoiceNo} — Completed Successfully`}
      headerIcon={
        <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5" />
        </div>
      }
      size={layout === "a4" ? "4xl" : "lg"}
    >
      <div className="space-y-4">
        {/* Format Selector Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
          <div className="flex items-center gap-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setLayout("thermal-80")}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                layout === "thermal-80"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              3&quot; Thermal (80mm)
            </button>
            <button
              type="button"
              onClick={() => setLayout("thermal-58")}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                layout === "thermal-58"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              2&quot; Thermal (58mm)
            </button>
            <button
              type="button"
              onClick={() => setLayout("a4")}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                layout === "a4"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Legal A4 Tax Invoice
            </button>
          </div>

          {invoiceId && (
            <Link
              href={`/admin/pos/invoice/${invoiceId}`}
              target="_blank"
              className="text-xs text-[#1F4E5B] hover:text-[#163a44] font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <span>Full Page</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        {/* Printable Target Box */}
        <div
          id="pos-print-target"
          className="max-h-[62vh] overflow-y-auto p-2 bg-slate-100/70 rounded-2xl border border-slate-200 flex justify-center print:p-0 print:m-0 print:border-none print:bg-white print:overflow-visible print:max-h-none"
        >
          {layout === "thermal-80" && (
            <ThermalReceipt
              saleData={saleData}
              format="80mm"
              className="bg-white shadow-xs"
            />
          )}
          {layout === "thermal-58" && (
            <ThermalReceipt
              saleData={saleData}
              format="58mm"
              className="bg-white shadow-xs"
            />
          )}
          {layout === "a4" && (
            <div className="w-full max-w-[210mm] bg-white shadow-xs rounded-xl overflow-hidden">
              <A4TaxInvoice saleData={saleData} copyType="ORIGINAL FOR RECIPIENT" />
            </div>
          )}
        </div>

        {/* Modal Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onNewSale}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-slate-500" />
            <span>New Sale (Esc)</span>
          </button>

          <button
            type="button"
            autoFocus
            onClick={handlePrint}
            className="px-6 py-2.5 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-black shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save PDF (Ctrl+P)</span>
          </button>
        </div>
      </div>

      {/* Embedded Print CSS for Isolated Print Execution (Module 2.7 & 2.8) */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          [role="dialog"],
          [role="dialog"] > div {
            position: static !important;
            overflow: visible !important;
            max-height: none !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          #pos-print-target,
          #pos-print-target * {
            visibility: visible !important;
          }
          #pos-print-target {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: ${layout === "a4"
              ? "210mm"
              : layout === "thermal-58"
              ? "58mm"
              : "80mm"} !important;
            max-height: none !important;
            overflow: visible !important;
            margin: 0 auto !important;
            padding: ${layout === "a4" ? "0" : "2mm"} !important;
            border: none !important;
            box-shadow: none !important;
          }
          @page {
            size: ${layout === "a4"
              ? "A4 portrait"
              : layout === "thermal-58"
              ? "58mm auto"
              : "80mm auto"};
            margin: ${layout === "a4" ? "8mm" : "0"};
          }
          .a4-invoice-page {
            width: 100% !important;
            max-width: 210mm !important;
            page-break-inside: avoid !important;
            page-break-after: avoid !important;
          }
        }
      `}</style>
    </Modal>
  );
}
