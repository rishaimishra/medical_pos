"use client";

import React from "react";

export interface ThermalReceiptProps {
  saleData: any;
  format?: "80mm" | "58mm";
  id?: string;
  className?: string;
}

export function ThermalReceipt({
  saleData,
  format = "80mm",
  id = "pos-thermal-receipt",
  className = "",
}: ThermalReceiptProps) {
  if (!saleData) return null;

  const branch = saleData.branch || saleData.store || {};
  const customer = saleData.customer || null;
  const items = saleData.items || [];
  const grandTotal = Number(saleData.grandTotal || 0);
  const totalAmount = Number(saleData.totalAmount || 0);
  const gstAmount = Number(saleData.gstAmount || 0);
  const discountAmount = Number(saleData.discountAmount || 0);

  const cgstAmount = gstAmount / 2;
  const sgstAmount = gstAmount / 2;

  const isSplit = saleData.paymentMethod === "split";
  const splits = saleData.splitPayments;
  const cashTendered = Number(saleData.cashTendered || 0);
  const changeDue = Number(saleData.changeDue || 0);

  // Formatter for Expiry Date (MM/YY)
  const formatExpiry = (dateStr?: string | Date) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "-";
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yy = String(d.getFullYear()).slice(-2);
      return `${mm}/${yy}`;
    } catch {
      return "-";
    }
  };

  const is58mm = format === "58mm";

  return (
    <div
      id={id}
      className={`mx-auto bg-white border border-slate-300 rounded-xl p-3 shadow-xs font-mono text-slate-900 leading-tight select-text print:border-none print:shadow-none print:p-0 ${
        is58mm ? "max-w-[220px] text-[9px]" : "max-w-[320px] text-[11px]"
      } ${className}`}
      style={{
        width: is58mm ? "58mm" : "80mm",
      }}
    >
      {/* Store Header */}
      <div className="text-center pb-2 border-b border-dashed border-slate-400 space-y-0.5">
        <h2
          className={`font-black uppercase tracking-wider ${
            is58mm ? "text-xs leading-tight" : "text-sm"
          }`}
        >
          {branch.name || "DRxStore Pharmacy"}
        </h2>
        {branch.address && (
          <p className={is58mm ? "text-[8px]" : "text-[10px]"}>{branch.address}</p>
        )}
        {branch.phone && (
          <p className={is58mm ? "text-[8px]" : "text-[10px]"}>Ph: {branch.phone}</p>
        )}
        {branch.dlNo && (
          <p className={is58mm ? "text-[8px]" : "text-[10px]"}>D.L. No: {branch.dlNo}</p>
        )}
        {branch.gstNo && (
          <p className={is58mm ? "text-[8px]" : "text-[10px]"}>GSTIN: {branch.gstNo}</p>
        )}
        <p className="font-extrabold pt-1 uppercase tracking-wide">
          --- TAX INVOICE ({format.toUpperCase()}) ---
        </p>
      </div>

      {/* Invoice Meta */}
      <div
        className={`py-1.5 border-b border-dashed border-slate-400 space-y-0.5 ${
          is58mm ? "text-[8.5px]" : "text-[10px]"
        }`}
      >
        <div className="flex justify-between">
          <span>Inv No:</span>
          <span className="font-bold">{saleData.invoiceNo}</span>
        </div>
        <div className="flex justify-between">
          <span>Date/Time:</span>
          <span>
            {new Date(saleData.createdAt || Date.now()).toLocaleDateString("en-IN")}{" "}
            {new Date(saleData.createdAt || Date.now()).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Customer:</span>
          <span className="font-bold truncate max-w-[140px]">
            {customer ? customer.name : "Walk-in Customer"}
          </span>
        </div>
        {customer?.phone && (
          <div className="flex justify-between">
            <span>Phone:</span>
            <span>{customer.phone}</span>
          </div>
        )}
        {saleData.doctorName && (
          <div className="flex justify-between">
            <span>Dr. Name:</span>
            <span className="font-medium truncate max-w-[130px]">{saleData.doctorName}</span>
          </div>
        )}
      </div>

      {/* Itemized Table */}
      <div className="py-1.5 border-b border-dashed border-slate-400">
        <div
          className={`flex justify-between font-bold pb-1 uppercase border-b border-dotted border-slate-300 ${
            is58mm ? "text-[8px]" : "text-[10px]"
          }`}
        >
          <span className="flex-1 truncate">Item</span>
          <span className={is58mm ? "w-7 text-center" : "w-9 text-center"}>Qty</span>
          <span className={is58mm ? "w-11 text-right" : "w-14 text-right"}>MRP</span>
          <span className={is58mm ? "w-12 text-right" : "w-16 text-right"}>Total</span>
        </div>
        <div className="divide-y divide-dotted divide-slate-200">
          {items.map((item: any, idx: number) => {
            const medName = item.medicine?.name || item.name || `Item ${idx + 1}`;
            const genericName = item.medicine?.genericName || item.genericName || "";
            const batchNo = item.batch?.batchNo || item.batchNo || "-";
            const expDate = formatExpiry(item.batch?.expiryDate || item.expiryDate);
            const lineTotal = Number(item.price ?? item.mrp * item.quantity);

            return (
              <div key={idx} className={`py-1 ${is58mm ? "text-[8.5px]" : "text-[10px]"}`}>
                <div className="font-bold truncate">{medName}</div>
                {genericName && !is58mm && (
                  <div className="text-[8px] text-slate-500 truncate italic">
                    {genericName}
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span className={is58mm ? "text-[7.5px]" : "text-[9px]"}>
                    B:{batchNo} E:{expDate}
                  </span>
                  <span className={is58mm ? "w-7 text-center" : "w-9 text-center font-bold"}>
                    {item.quantity}
                  </span>
                  <span className={is58mm ? "w-11 text-right" : "w-14 text-right"}>
                    ₹{Number(item.mrp).toFixed(2)}
                  </span>
                  <span
                    className={`${
                      is58mm ? "w-12" : "w-16"
                    } text-right font-bold text-slate-900`}
                  >
                    ₹{lineTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Totals & Tax Summary */}
      <div
        className={`py-1.5 border-b border-dashed border-slate-400 space-y-0.5 ${
          is58mm ? "text-[8.5px]" : "text-[10px]"
        }`}
      >
        <div className="flex justify-between">
          <span>Items Total (Gross):</span>
          <span>₹{totalAmount.toFixed(2)}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between font-bold text-rose-600">
            <span>Discount Applied:</span>
            <span>-₹{discountAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-slate-600">
          <span>Taxable Value:</span>
          <span>₹{(grandTotal - gstAmount).toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>CGST (Incl):</span>
          <span>₹{cgstAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>SGST (Incl):</span>
          <span>₹{sgstAmount.toFixed(2)}</span>
        </div>
        <div
          className={`flex justify-between font-black pt-1 border-t border-slate-400 ${
            is58mm ? "text-[10px]" : "text-xs"
          }`}
        >
          <span>NET PAYABLE:</span>
          <span>₹{grandTotal.toFixed(2)}</span>
        </div>
      </div>

      {/* Payment Settlement Info */}
      <div
        className={`py-1.5 border-b border-dashed border-slate-400 space-y-0.5 ${
          is58mm ? "text-[8.5px]" : "text-[10px]"
        }`}
      >
        <div className="flex justify-between font-bold">
          <span>Payment Mode:</span>
          <span className="uppercase">
            {isSplit ? "SPLIT / MULTI" : saleData.paymentMethod || "CASH"}
          </span>
        </div>

        {isSplit && splits && (
          <div className="pl-1.5 space-y-0.5 border-l-2 border-slate-300 text-slate-700">
            {splits.cash > 0 && (
              <div className="flex justify-between">
                <span>• Cash:</span>
                <span>₹{Number(splits.cash).toFixed(2)}</span>
              </div>
            )}
            {splits.upi > 0 && (
              <div className="flex justify-between">
                <span>• UPI:</span>
                <span>₹{Number(splits.upi).toFixed(2)}</span>
              </div>
            )}
            {splits.card > 0 && (
              <div className="flex justify-between">
                <span>• Card:</span>
                <span>₹{Number(splits.card).toFixed(2)}</span>
              </div>
            )}
            {splits.cheque > 0 && (
              <div className="flex justify-between">
                <span>• Cheque:</span>
                <span>₹{Number(splits.cheque).toFixed(2)}</span>
              </div>
            )}
            {splits.credit > 0 && (
              <div className="flex justify-between">
                <span>• Credit:</span>
                <span>₹{Number(splits.credit).toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {cashTendered > 0 && (
          <>
            <div className="flex justify-between text-slate-600">
              <span>Cash Tendered:</span>
              <span>₹{cashTendered.toFixed(2)}</span>
            </div>
            {changeDue > 0 && (
              <div className="flex justify-between font-bold text-emerald-800">
                <span>Change Returned:</span>
                <span>₹{changeDue.toFixed(2)}</span>
              </div>
            )}
          </>
        )}

        {saleData.upiRef && (
          <div className="flex justify-between">
            <span>UPI Ref/UTR:</span>
            <span className="font-medium truncate max-w-[120px]">{saleData.upiRef}</span>
          </div>
        )}
        {saleData.cardLast4 && (
          <div className="flex justify-between">
            <span>Card Last 4:</span>
            <span>**** {saleData.cardLast4}</span>
          </div>
        )}
        {saleData.chequeNo && (
          <div className="flex justify-between">
            <span>Cheque No:</span>
            <span>
              {saleData.chequeNo} ({saleData.chequeBank || "Bank"})
            </span>
          </div>
        )}
      </div>

      {/* Return Policy & Legal Disclaimer Footer */}
      <div
        className={`text-center pt-2 text-slate-600 space-y-0.5 ${
          is58mm ? "text-[7.5px]" : "text-[8.5px]"
        }`}
      >
        <p className="font-bold">Thank You For Choosing DRxStore!</p>
        <p>Return policy: Goods returnable within 7 days with bill.</p>
        <p className="text-slate-400">Keep medicines in a cool & dry place</p>
        <p className="text-[7px] text-slate-400 uppercase pt-0.5">
          --- Powered by DRxStore POS Engine ---
        </p>
      </div>
    </div>
  );
}
