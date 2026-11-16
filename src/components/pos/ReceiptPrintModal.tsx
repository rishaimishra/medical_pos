"use client";

import React, { useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { Printer, CheckCircle2, RotateCcw } from "lucide-react";

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
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !saleData) return null;

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const branch = saleData.branch || {};
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Invoice Receipt & Thermal Print"
      description={`Invoice: ${saleData.invoiceNo} — Completed Successfully`}
      headerIcon={
        <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5" />
        </div>
      }
      size="lg"
    >
      <div className="space-y-4">
        {/* Printable Thermal Receipt Box */}
        <div
          ref={receiptRef}
          id="pos-thermal-receipt"
          className="max-w-[340px] mx-auto bg-white border border-slate-300 rounded-2xl p-5 shadow-xs font-mono text-[11px] text-slate-900 leading-tight select-text"
        >
          {/* Store Header */}
          <div className="text-center pb-2 border-b border-dashed border-slate-400 space-y-0.5">
            <h2 className="text-sm font-black uppercase tracking-wider">
              {branch.name || "DRxStore Pharmacy"}
            </h2>
            {branch.address && <p className="text-[10px]">{branch.address}</p>}
            {branch.phone && <p className="text-[10px]">Ph: {branch.phone}</p>}
            {branch.dlNo && <p className="text-[10px]">D.L. No: {branch.dlNo}</p>}
            {branch.gstNo && <p className="text-[10px]">GSTIN: {branch.gstNo}</p>}
            <p className="text-[11px] font-bold pt-1 uppercase">--- TAX INVOICE ---</p>
          </div>

          {/* Invoice Meta */}
          <div className="py-2 border-b border-dashed border-slate-400 space-y-0.5 text-[10px]">
            <div className="flex justify-between">
              <span>Invoice No:</span>
              <span className="font-bold">{saleData.invoiceNo}</span>
            </div>
            <div className="flex justify-between">
              <span>Date/Time:</span>
              <span>{new Date(saleData.createdAt || Date.now()).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Customer:</span>
              <span className="font-bold">{customer ? customer.name : "Walk-in Customer"}</span>
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
                <span>{saleData.doctorName}</span>
              </div>
            )}
          </div>

          {/* Itemized Table */}
          <div className="py-2 border-b border-dashed border-slate-400">
            <div className="flex justify-between font-bold pb-1 text-[10px] uppercase">
              <span className="flex-1">Item [Batch]</span>
              <span className="w-10 text-center">Qty</span>
              <span className="w-14 text-right">MRP</span>
              <span className="w-16 text-right">Total</span>
            </div>
            <div className="divide-y divide-dotted divide-slate-300">
              {items.map((item: any, idx: number) => {
                const medName = item.medicine?.name || item.name || `Item ${idx + 1}`;
                const batchNo = item.batch?.batchNo || item.batchNo || "-";
                const lineTotal = Number(item.price || item.mrp * item.quantity);

                return (
                  <div key={idx} className="py-1 text-[10px]">
                    <div className="font-bold truncate">{medName}</div>
                    <div className="flex justify-between text-slate-600">
                      <span className="text-[9px]">B: {batchNo}</span>
                      <span className="w-10 text-center">{item.quantity}</span>
                      <span className="w-14 text-right">₹{Number(item.mrp).toFixed(2)}</span>
                      <span className="w-16 text-right font-bold text-slate-900">
                        ₹{lineTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Totals & Tax Breakdown */}
          <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[10px]">
            <div className="flex justify-between">
              <span>Items Total:</span>
              <span>₹{totalAmount.toFixed(2)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between font-bold text-rose-600">
                <span>Discount:</span>
                <span>-₹{discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>CGST (Included):</span>
              <span>₹{cgstAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>SGST (Included):</span>
              <span>₹{sgstAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs font-black pt-1 border-t border-slate-400">
              <span>NET GRAND TOTAL:</span>
              <span>₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Info (Module 2.5.1 & 2.6.3) */}
          <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[10px]">
            <div className="flex justify-between font-bold">
              <span>Payment Mode:</span>
              <span className="uppercase">{isSplit ? "SPLIT (MULTI-TENDER)" : saleData.paymentMethod || "CASH"}</span>
            </div>

            {/* Split breakdown rows */}
            {isSplit && splits && (
              <div className="pl-2 space-y-0.5 border-l-2 border-slate-300 text-slate-700">
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
                    <span>• Store Credit:</span>
                    <span>₹{Number(splits.credit).toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Cash change info */}
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
                <span>UPI Ref / UTR:</span>
                <span>{saleData.upiRef}</span>
              </div>
            )}
            {saleData.chequeNo && (
              <div className="flex justify-between">
                <span>Cheque No:</span>
                <span>{saleData.chequeNo} ({saleData.chequeBank})</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="text-center pt-2 text-[9px] text-slate-600 space-y-0.5">
            <p className="font-bold">Thank You For Choosing DRxStore!</p>
            <p>Goods once sold can be returned within 7 days with original bill.</p>
            <p className="text-[8px] text-slate-400">Powered by DRxStore POS Engine</p>
          </div>
        </div>

        {/* Modal Buttons */}
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
            className="px-6 py-2.5 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-extrabold shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Receipt (Ctrl+P)</span>
          </button>
        </div>
      </div>

      {/* Embedded Print CSS for Isolated Thermal Receipt Printing */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #pos-thermal-receipt,
          #pos-thermal-receipt * {
            visibility: visible !important;
          }
          #pos-thermal-receipt {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 4mm !important;
            border: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </Modal>
  );
}
