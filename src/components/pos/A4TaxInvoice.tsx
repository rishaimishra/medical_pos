"use client";

import React from "react";
import { numberToIndianWords } from "@/lib/numberToWords";

export interface A4TaxInvoiceProps {
  saleData: any;
  copyType?: "ORIGINAL FOR RECIPIENT" | "DUPLICATE FOR TRANSPORTER" | "TRIPLICATE FOR SUPPLIER";
  id?: string;
  className?: string;
}

export function A4TaxInvoice({
  saleData,
  copyType = "ORIGINAL FOR RECIPIENT",
  id = "pos-a4-invoice",
  className = "",
}: A4TaxInvoiceProps) {
  if (!saleData) return null;

  const branch = saleData.branch || saleData.store || {};
  const customer = saleData.customer || null;
  const items = saleData.items || [];
  const grandTotal = Number(saleData.grandTotal || 0);
  const totalAmount = Number(saleData.totalAmount || 0);
  const gstAmount = Number(saleData.gstAmount || 0);
  const discountAmount = Number(saleData.discountAmount || 0);
  const taxableBase = grandTotal - gstAmount;

  const cgstTotal = gstAmount / 2;
  const sgstTotal = gstAmount / 2;

  const isSplit = saleData.paymentMethod === "split";
  const splits = saleData.splitPayments;
  const isPaid = saleData.paymentMethod !== "credit" || Number(saleData.creditAmount || 0) <= 0;

  // Format Expiry Date (MM/YYYY)
  const formatExpiry = (dateStr?: string | Date) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "-";
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${mm}/${yyyy}`;
    } catch {
      return "-";
    }
  };

  // Group items by HSN for HSN Tax Breakdown Summary
  const hsnMap = new Map<
    string,
    {
      hsnCode: string;
      taxableValue: number;
      gstPercent: number;
      cgstAmount: number;
      sgstAmount: number;
      totalGst: number;
    }
  >();

  items.forEach((item: any) => {
    const hsn = item.medicine?.hsnCode || item.hsnCode || "3004";
    const lineNet = Number(item.price ?? item.mrp * item.quantity);
    const gstRate = Number(item.gstPercent ?? 12);
    const lineTaxable = Number(item.taxableBase ?? lineNet / (1 + gstRate / 100));
    const lineGst = Number(item.gstAmount ?? lineNet - lineTaxable);

    const existing = hsnMap.get(hsn) || {
      hsnCode: hsn,
      taxableValue: 0,
      gstPercent: gstRate,
      cgstAmount: 0,
      sgstAmount: 0,
      totalGst: 0,
    };

    existing.taxableValue += lineTaxable;
    existing.cgstAmount += lineGst / 2;
    existing.sgstAmount += lineGst / 2;
    existing.totalGst += lineGst;

    hsnMap.set(hsn, existing);
  });

  const hsnBreakdown = Array.from(hsnMap.values());

  // Auto-scale detection based on item count for Single-Page A4 Fit (Module 2.8.2)
  const isCompact = items.length > 7;
  const isUltraCompact = items.length > 12;

  const containerPadding = isUltraCompact ? "p-4" : isCompact ? "p-6" : "p-8";
  const tableFontSize = isUltraCompact ? "text-[9px]" : isCompact ? "text-[10px]" : "text-[11px]";
  const cellPadding = isUltraCompact ? "py-1 px-1.5" : isCompact ? "py-1.5 px-2" : "py-2 px-2.5";

  return (
    <div
      id={id}
      className={`a4-invoice-page mx-auto bg-white border border-slate-300 shadow-sm text-slate-900 font-sans print:border-none print:shadow-none print:p-0 select-text ${containerPadding} ${className}`}
      style={{
        width: "210mm",
        minHeight: "297mm",
        boxSizing: "border-box",
      }}
    >
      {/* Top Header: Business Details & Legal Title */}
      <div className="border-b-2 border-slate-800 pb-3 mb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-0.5 max-w-[65%]">
            <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
              {branch.name || "DRxStore Pharmacy"}
            </h1>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              {branch.address || "Main Healthcare Avenue, Commercial Area"}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-700 pt-0.5">
              {branch.phone && (
                <span>
                  <strong>Tel:</strong> {branch.phone}
                </span>
              )}
              {branch.email && (
                <span>
                  <strong>Email:</strong> {branch.email}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-800 font-bold pt-0.5">
              <span>
                <strong>D.L. No:</strong> {branch.dlNo || "DL-20B/21B-PHARM-2026"}
              </span>
              <span>
                <strong>GSTIN:</strong> {branch.gstNo || "19AAACP1234F1Z5"}
              </span>
            </div>
          </div>

          <div className="text-right space-y-1">
            <span className="inline-block px-3 py-1 bg-slate-900 text-white text-xs font-black tracking-widest uppercase rounded">
              TAX INVOICE
            </span>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
              {copyType}
            </div>
            {isPaid ? (
              <span className="inline-block px-2.5 py-0.5 border-2 border-emerald-600 text-emerald-700 text-xs font-black uppercase tracking-wider rounded">
                ✓ PAID
              </span>
            ) : (
              <span className="inline-block px-2.5 py-0.5 border-2 border-amber-600 text-amber-700 text-xs font-black uppercase tracking-wider rounded">
                CREDIT / UNPAID
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Invoice Meta & Bill-To Grid */}
      <div className="grid grid-cols-2 gap-4 border border-slate-300 rounded-lg p-3 mb-3 bg-slate-50/50 text-xs leading-snug">
        {/* Bill To */}
        <div className="space-y-1 border-r border-slate-200 pr-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            BILL TO (CUSTOMER DETAILS)
          </p>
          <p className="font-extrabold text-slate-900 text-sm">
            {customer ? customer.name : "Walk-in Retail Customer"}
          </p>
          {customer?.phone && (
            <p className="text-slate-700">
              <strong>Phone:</strong> {customer.phone}
            </p>
          )}
          {customer?.email && (
            <p className="text-slate-700">
              <strong>Email:</strong> {customer.email}
            </p>
          )}
          {customer?.address && (
            <p className="text-slate-700">
              <strong>Address:</strong> {customer.address}
            </p>
          )}
          {customer?.gstin && (
            <p className="text-slate-700 font-bold">
              <strong>Customer GSTIN:</strong> {customer.gstin}
            </p>
          )}
        </div>

        {/* Invoice & Doctor Info */}
        <div className="space-y-1 pl-1">
          <div className="flex justify-between">
            <span className="text-slate-600 font-medium">Invoice Number:</span>
            <strong className="text-slate-900 font-black">{saleData.invoiceNo}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 font-medium">Invoice Date:</span>
            <span>
              {new Date(saleData.createdAt || Date.now()).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 font-medium">Time of Supply:</span>
            <span>
              {new Date(saleData.createdAt || Date.now()).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 font-medium">Payment Mode:</span>
            <span className="font-bold uppercase">
              {isSplit ? "SPLIT (MULTI-TENDER)" : saleData.paymentMethod || "CASH"}
            </span>
          </div>
          {saleData.doctorName && (
            <div className="flex justify-between pt-1 border-t border-slate-200">
              <span className="text-slate-600 font-medium">Prescribed By:</span>
              <span className="font-bold text-slate-900">
                Dr. {saleData.doctorName}
                {saleData.doctorRegNo ? ` (${saleData.doctorRegNo})` : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Itemized Table: Legal 11 Columns (Module 2.7.2 & 2.8.1) */}
      <div className="border border-slate-300 rounded-lg overflow-hidden mb-3">
        <table className={`w-full text-left border-collapse ${tableFontSize}`}>
          <thead className="bg-slate-100 text-slate-800 font-black uppercase tracking-wider border-b border-slate-300">
            <tr>
              <th className={`${cellPadding} w-8 text-center`}>#</th>
              <th className={`${cellPadding}`}>Medicine Description</th>
              <th className={`${cellPadding} w-14 text-center`}>HSN</th>
              <th className={`${cellPadding} w-18 text-center`}>Batch</th>
              <th className={`${cellPadding} w-16 text-center`}>Expiry</th>
              <th className={`${cellPadding} w-10 text-center`}>Qty</th>
              <th className={`${cellPadding} w-14 text-right`}>MRP</th>
              <th className={`${cellPadding} w-14 text-right`}>Unit Rate</th>
              <th className={`${cellPadding} w-12 text-center`}>CGST</th>
              <th className={`${cellPadding} w-12 text-center`}>SGST</th>
              <th className={`${cellPadding} w-16 text-right`}>Amount (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((item: any, idx: number) => {
              const medName = item.medicine?.name || item.name || `Medicine ${idx + 1}`;
              const genericName = item.medicine?.genericName || item.genericName || "";
              const hsn = item.medicine?.hsnCode || item.hsnCode || "3004";
              const batchNo = item.batch?.batchNo || item.batchNo || "-";
              const expDate = formatExpiry(item.batch?.expiryDate || item.expiryDate);
              const lineTotal = Number(item.price ?? item.mrp * item.quantity);
              const gstRate = Number(item.gstPercent ?? 12);
              const halfGst = (gstRate / 2).toFixed(1);
              const lineTaxable = Number(item.taxableBase ?? lineNetTaxable(lineTotal, gstRate));
              const unitRate = item.quantity > 0 ? lineTaxable / item.quantity : 0;

              return (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className={`${cellPadding} text-center font-medium text-slate-500`}>
                    {idx + 1}
                  </td>
                  <td className={`${cellPadding}`}>
                    <strong className="text-slate-900 block">{medName}</strong>
                    {genericName && (
                      <span className="text-[9px] text-slate-500 italic block leading-none">
                        {genericName}
                      </span>
                    )}
                  </td>
                  <td className={`${cellPadding} text-center font-mono text-slate-600`}>
                    {hsn}
                  </td>
                  <td className={`${cellPadding} text-center font-mono text-slate-800 font-medium`}>
                    {batchNo}
                  </td>
                  <td className={`${cellPadding} text-center font-mono text-slate-600`}>
                    {expDate}
                  </td>
                  <td className={`${cellPadding} text-center font-black text-slate-900`}>
                    {item.quantity}
                  </td>
                  <td className={`${cellPadding} text-right tabular-nums`}>
                    {Number(item.mrp).toFixed(2)}
                  </td>
                  <td className={`${cellPadding} text-right tabular-nums text-slate-700`}>
                    {unitRate.toFixed(2)}
                  </td>
                  <td className={`${cellPadding} text-center tabular-nums text-slate-600 text-[9px]`}>
                    {halfGst}%
                  </td>
                  <td className={`${cellPadding} text-center tabular-nums text-slate-600 text-[9px]`}>
                    {halfGst}%
                  </td>
                  <td className={`${cellPadding} text-right font-bold text-slate-900 tabular-nums`}>
                    {lineTotal.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tax Breakdown & Summary Section */}
      <div className="grid grid-cols-2 gap-4 mb-3">
        {/* Left Box: HSN/SAC Summary & Words */}
        <div className="space-y-2">
          <div className="border border-slate-300 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-700 border-b border-slate-300">
              GST Tax Analysis (HSN Summary)
            </div>
            <table className="w-full text-[9px] border-collapse text-left">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                <tr>
                  <th className="py-1 px-1.5">HSN</th>
                  <th className="py-1 px-1.5 text-right">Taxable (₹)</th>
                  <th className="py-1 px-1.5 text-right">CGST (₹)</th>
                  <th className="py-1 px-1.5 text-right">SGST (₹)</th>
                  <th className="py-1 px-1.5 text-right">Total Tax (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hsnBreakdown.map((row, i) => (
                  <tr key={i}>
                    <td className="py-1 px-1.5 font-mono">{row.hsnCode}</td>
                    <td className="py-1 px-1.5 text-right tabular-nums">
                      {row.taxableValue.toFixed(2)}
                    </td>
                    <td className="py-1 px-1.5 text-right tabular-nums">
                      {row.cgstAmount.toFixed(2)}
                    </td>
                    <td className="py-1 px-1.5 text-right tabular-nums">
                      {row.sgstAmount.toFixed(2)}
                    </td>
                    <td className="py-1 px-1.5 text-right font-medium tabular-nums">
                      {row.totalGst.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Amount In Words (Module 2.13.2) */}
          <div className="p-2 border border-slate-300 rounded-lg bg-slate-50 text-[10px]">
            <span className="font-bold text-slate-600 block uppercase tracking-wider text-[9px]">
              Amount Chargeable in Words:
            </span>
            <span className="font-black text-slate-900 italic">
              {numberToIndianWords(grandTotal)}
            </span>
          </div>

          {/* Multi-Tender Breakdown (if split) */}
          {isSplit && splits && (
            <div className="p-2 border border-slate-300 rounded-lg text-[10px] space-y-0.5">
              <span className="font-bold text-slate-700 block text-[9px] uppercase">
                Payment Breakdown:
              </span>
              <div className="grid grid-cols-2 gap-1 text-slate-600">
                {splits.cash > 0 && <span>Cash: ₹{Number(splits.cash).toFixed(2)}</span>}
                {splits.upi > 0 && <span>UPI: ₹{Number(splits.upi).toFixed(2)}</span>}
                {splits.card > 0 && <span>Card: ₹{Number(splits.card).toFixed(2)}</span>}
                {splits.cheque > 0 && <span>Cheque: ₹{Number(splits.cheque).toFixed(2)}</span>}
                {splits.credit > 0 && <span>Credit: ₹{Number(splits.credit).toFixed(2)}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Right Box: Grand Totals */}
        <div className="border border-slate-300 rounded-lg p-3 bg-slate-50/70 space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-700">
            <span>Subtotal (Gross Value):</span>
            <span className="tabular-nums font-semibold">₹{totalAmount.toFixed(2)}</span>
          </div>

          {discountAmount > 0 && (
            <div className="flex justify-between text-rose-600 font-bold">
              <span>Bill Discount:</span>
              <span className="tabular-nums">-₹{discountAmount.toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-between text-slate-700 pt-1 border-t border-slate-200">
            <span>Total Taxable Base:</span>
            <span className="tabular-nums font-semibold">₹{taxableBase.toFixed(2)}</span>
          </div>

          <div className="flex justify-between text-slate-600 text-[11px]">
            <span>Central GST (CGST):</span>
            <span className="tabular-nums">₹{cgstTotal.toFixed(2)}</span>
          </div>

          <div className="flex justify-between text-slate-600 text-[11px]">
            <span>State GST (SGST):</span>
            <span className="tabular-nums">₹{sgstTotal.toFixed(2)}</span>
          </div>

          <div className="flex justify-between items-center pt-2 border-t-2 border-slate-900 text-sm font-black text-slate-900">
            <span className="uppercase tracking-wider">Net Amount Payable:</span>
            <span className="text-base font-black tabular-nums">
              ₹{grandTotal.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Terms & Conditions and Signature Section */}
      <div className="border-t border-slate-300 pt-3 mt-auto">
        <div className="grid grid-cols-2 gap-4 items-end text-[9.5px] text-slate-600">
          <div className="space-y-1">
            <strong className="text-slate-800 uppercase block text-[9px]">
              Terms & Legal Declarations:
            </strong>
            <ul className="list-disc pl-3.5 space-y-0.5 text-slate-500">
              <li>Goods once sold can be returned within 7 days with original invoice.</li>
              <li>Medicines must be stored in cool & dry place away from sunlight.</li>
              <li>Schedule H/H1 drugs dispensed strictly on registered medical prescription.</li>
              <li>Certified that particulars given in this tax invoice are true and correct.</li>
            </ul>
          </div>

          <div className="text-right space-y-8">
            <div className="text-[10px] font-bold text-slate-800 uppercase">
              For {branch.name || "DRxStore Pharmacy"}
            </div>
            <div className="border-t border-dashed border-slate-400 pt-1 inline-block min-w-[180px] text-center">
              <span className="font-bold text-slate-800 block">
                Registered Pharmacist
              </span>
              <span className="text-[8.5px] text-slate-500">
                (Authorized Signatory / Seal)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper calculation
function lineNetTaxable(lineNet: number, gstRate: number): number {
  return lineNet / (1 + gstRate / 100);
}
