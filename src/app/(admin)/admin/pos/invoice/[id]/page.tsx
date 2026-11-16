"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Printer, ArrowLeft, Loader2, FileText, CheckCircle2 } from "lucide-react";
import { A4TaxInvoice } from "@/components/pos/A4TaxInvoice";
import { ThermalReceipt } from "@/components/pos/ThermalReceipt";

type PrintLayout = "a4" | "thermal-80" | "thermal-58";
type CopyType =
  | "ORIGINAL FOR RECIPIENT"
  | "DUPLICATE FOR TRANSPORTER"
  | "TRIPLICATE FOR SUPPLIER";

export default function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saleData, setSaleData] = useState<any>(null);

  const [layout, setLayout] = useState<PrintLayout>("a4");
  const [copyType, setCopyType] = useState<CopyType>("ORIGINAL FOR RECIPIENT");

  useEffect(() => {
    async function fetchInvoice() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/admin/pos/invoices/${encodeURIComponent(id)}`);
        const json = await res.json();
        if (res.ok && json.success) {
          setSaleData(json.sale);
        } else {
          setErrorMsg(json.message || "Failed to load invoice details.");
        }
      } catch (err: any) {
        setErrorMsg(err?.message || "Network error while loading invoice.");
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchInvoice();
    }
  }, [id]);

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-slate-600">
        <Loader2 className="w-8 h-8 animate-spin text-[#1F4E5B] mb-2" />
        <p className="text-sm font-bold">Generating Tax Invoice {id}...</p>
      </div>
    );
  }

  if (errorMsg || !saleData) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl p-6 shadow-md border border-slate-200 text-center space-y-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h2 className="text-base font-extrabold text-slate-900">Invoice Not Found</h2>
          <p className="text-xs text-slate-500">{errorMsg || "Could not retrieve invoice."}</p>
          <div className="pt-2">
            <Link
              href="/admin/pos"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#1F4E5B] text-white text-xs font-bold rounded-xl hover:bg-[#163a44] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to POS Terminal</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-200/80 py-6 px-4 print:p-0 print:bg-white">
      {/* Top Controls Bar (Hidden during Print) */}
      <div className="max-w-4xl mx-auto mb-6 bg-white border border-slate-300 rounded-2xl p-3 sm:p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/admin/pos")}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
            title="Back to POS"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
              <span>Invoice {saleData.invoiceNo}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                Finalized
              </span>
            </h1>
            <p className="text-[11px] text-slate-500">
              {new Date(saleData.createdAt || Date.now()).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Format Selector Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
          <button
            type="button"
            onClick={() => setLayout("a4")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              layout === "a4"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            A4 Tax Invoice
          </button>
          <button
            type="button"
            onClick={() => setLayout("thermal-80")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              layout === "thermal-80"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            80mm (3&quot;) Thermal
          </button>
          <button
            type="button"
            onClick={() => setLayout("thermal-58")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              layout === "thermal-58"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            58mm (2&quot;) Thermal
          </button>
        </div>

        {/* Copy Type dropdown for A4 */}
        {layout === "a4" && (
          <select
            value={copyType}
            onChange={(e) => setCopyType(e.target.value as CopyType)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white focus:outline-none"
          >
            <option value="ORIGINAL FOR RECIPIENT">Original (Recipient)</option>
            <option value="DUPLICATE FOR TRANSPORTER">Duplicate (Transporter)</option>
            <option value="TRIPLICATE FOR SUPPLIER">Triplicate (Supplier)</option>
          </select>
        )}

        {/* Print / Save PDF Button */}
        <button
          type="button"
          onClick={handlePrint}
          className="px-5 py-2 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-black shadow-sm flex items-center gap-2 transition-all cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Print / Save PDF</span>
        </button>
      </div>

      {/* Render Document Target */}
      <div id="pos-print-target" className="flex justify-center">
        {layout === "a4" && (
          <A4TaxInvoice
            saleData={saleData}
            copyType={copyType}
            className="shadow-xl rounded-xl print:rounded-none print:shadow-none"
          />
        )}
        {layout === "thermal-80" && (
          <ThermalReceipt
            saleData={saleData}
            format="80mm"
            className="shadow-xl print:shadow-none"
          />
        )}
        {layout === "thermal-58" && (
          <ThermalReceipt
            saleData={saleData}
            format="58mm"
            className="shadow-xl print:shadow-none"
          />
        )}
      </div>

      {/* Embedded Print CSS for Isolated, Auto-Scaled Printing (Module 2.8.2) */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
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
            margin: 0 !important;
            padding: 0 !important;
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
            margin: 0 auto !important;
            page-break-inside: avoid !important;
            page-break-after: avoid !important;
          }
        }
      `}</style>
    </div>
  );
}
