"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  User,
  Percent,
  Printer,
  Sparkles,
  MapPin,
  Clock,
  PauseCircle,
  PlayCircle,
  X,
  AlertTriangle,
  RotateCcw,
  Layers,
  HeartPulse,
  Tag,
  CheckCircle2,
  Barcode,
  Scan,
  Zap,
  Banknote,
} from "lucide-react";
import { useCartStore, CartItem } from "@/stores/useCartStore";
import { useBranchStore } from "@/stores/useBranchStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "@/stores/useToastStore";
import { confirmAction } from "@/stores/useConfirmStore";

import { BatchPickerModal, BatchItemData } from "@/components/pos/BatchPickerModal";
import { CustomerLookupModal } from "@/components/pos/CustomerLookupModal";
import { DiscountModal } from "@/components/pos/DiscountModal";
import { PaymentTenderModal } from "@/components/pos/PaymentTenderModal";
import { ReceiptPrintModal } from "@/components/pos/ReceiptPrintModal";
import { BarcodePrintModal } from "@/components/pos/BarcodePrintModal";
import { ItemDiscountModal } from "@/components/pos/ItemDiscountModal";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { playScanSuccessBeep, playScanErrorBeep } from "@/lib/audioBeep";
import { triggerCashDrawerKick } from "@/lib/cashDrawer";
import { Modal } from "@/components/ui/Modal";

export default function POSBillingPage() {
  const {
    items,
    addItem,
    removeItem,
    updateQuantity,
    updateBatch,
    clearCart,
    getSubtotal,
    getTotalItemDiscounts,
    getSubtotalAfterItemDiscounts,
    getTotalDiscount,
    getTotalGst,
    getGrandTotal,
    discountAmount,
    discountPercent,
    customer,
    parkedBills,
    parkCurrentBill,
    recallParkedBill,
    discardParkedBill,
  } = useCartStore();

  const { activeBranch } = useBranchStore();
  const { user } = useAuthStore();

  // Search & Results state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);

  // Modals state
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isTenderModalOpen, setIsTenderModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [completedSaleData, setCompletedSaleData] = useState<any>(null);

  // Barcode & Item Discount Modals state (Modules 2.3 & 2.4)
  const [isBarcodePrintOpen, setIsBarcodePrintOpen] = useState(false);
  const [barcodePrintTarget, setBarcodePrintTarget] = useState<{
    medicineName?: string;
    batchNo?: string;
    expiryDate?: string;
    mrp?: number;
  } | null>(null);
  const [itemDiscountTarget, setItemDiscountTarget] = useState<CartItem | null>(null);
  const [isBarcodeTestModalOpen, setIsBarcodeTestModalOpen] = useState(false);
  const [testBarcodeInput, setTestBarcodeInput] = useState("");

  // Batch Picker state
  const [batchPickerTarget, setBatchPickerTarget] = useState<{
    medicineId: number;
    medicineName: string;
    currentBatchId: number;
  } | null>(null);

  // POS Store bootstrapping data
  const [storeUpiId, setStoreUpiId] = useState("drxstore@upi");
  const [masterDiscounts, setMasterDiscounts] = useState<any[]>([]);
  const [todayMetrics, setTodayMetrics] = useState({ salesCount: 0, totalRevenue: 0 });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // 1. Fetch POS bootstrap data for active branch
  const fetchPosBootstrap = useCallback(async () => {
    try {
      const url = `/api/admin/pos?branchId=${activeBranch?.id || ""}`;
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        if (json.store?.upiId) setStoreUpiId(json.store.upiId);
        if (json.discounts) setMasterDiscounts(json.discounts);
        if (json.todayMetrics) setTodayMetrics(json.todayMetrics);
      }
    } catch {
      // Ignore network errors in bootstrap
    }
  }, [activeBranch?.id]);

  useEffect(() => {
    fetchPosBootstrap();
  }, [fetchPosBootstrap]);

  // 2. Intelligent Medicine Search (Module 2.2.3)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const url = `/api/admin/pos/search?q=${encodeURIComponent(
          searchQuery.trim()
        )}&branchId=${activeBranch?.id || ""}`;
        const res = await fetch(url, { cache: "no-store" });
        const json = await res.json();
        if (json.success && Array.isArray(json.results)) {
          setSearchResults(json.results);
          setSelectedSearchIndex(0);
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [searchQuery, activeBranch?.id]);

  // Hardware Barcode Scanner Listener & Instant Cart Auto-Add (Module 2.3.1)
  const handleBarcodeScanned = useCallback(
    async (barcode: string) => {
      try {
        const url = `/api/admin/pos/barcode?code=${encodeURIComponent(
          barcode
        )}&branchId=${activeBranch?.id || ""}`;
        const res = await fetch(url);
        const json = await res.json();
        if (res.ok && json.success) {
          const { medicine, batch, availableStock } = json;
          const currentItems = useCartStore.getState().items;
          const existing = currentItems.find((i) => i.batchId === batch.id);
          if (existing && existing.quantity >= availableStock) {
            playScanErrorBeep();
            toast.warning(
              `Cannot add more ${medicine.name}. Max available stock (${availableStock}) reached.`
            );
            return;
          }
          addItem({
            medicineId: medicine.id,
            medicineName: medicine.name,
            genericName: medicine.genericName,
            rackLocation: medicine.rackLocation,
            batchId: batch.id,
            batchNo: batch.batchNo,
            expiryDate: batch.expiryDate,
            quantity: 1,
            availableStock,
            unitPrice: batch.mrp,
            taxPercent: medicine.gstPercent || 12,
          });
          playScanSuccessBeep();
          toast.success(`Scanned: ${medicine.name} (Batch: ${batch.batchNo})`);
        } else {
          playScanErrorBeep();
          toast.error(json.error || `Barcode '${barcode}' not found`);
        }
      } catch {
        playScanErrorBeep();
        toast.error("Barcode lookup failed");
      }
    },
    [activeBranch?.id, addItem]
  );

  const { lastScanned, isScanning, simulateScan } = useBarcodeScanner({
    onScan: handleBarcodeScanned,
  });

  // 3. Add Medicine with FEFO Auto-Selected Batch (Module 2.1.5 & 2.2.4)
  const handleAddMedicine = (med: any) => {
    if (!med.recommendedBatch) {
      toast.warning(
        `No unexpired stock available in ${activeBranch?.name || "current store"} for ${med.name}.`
      );
      return;
    }

    const batch = med.recommendedBatch;

    const cartItem: CartItem = {
      medicineId: med.id,
      medicineName: med.name,
      genericName: med.genericName,
      rackLocation: med.rackLocation,
      batchId: batch.id,
      batchNo: batch.batchNo,
      expiryDate: batch.expiryDate,
      quantity: 1,
      availableStock: batch.quantity,
      unitPrice: batch.mrp,
      taxPercent: med.gstPercent || 12,
    };

    addItem(cartItem);
    toast.success(`Added ${med.name} (Batch: ${batch.batchNo}) to cart.`);
    setSearchQuery("");
    setSearchResults([]);
    searchInputRef.current?.focus();
  };

  // 4. Batch Override Selection
  const handleSelectAlternativeBatch = (batch: BatchItemData) => {
    if (!batchPickerTarget) return;

    updateBatch(batchPickerTarget.currentBatchId, {
      batchId: batch.id,
      batchNo: batch.batchNo,
      expiryDate: batch.expiryDate,
      unitPrice: batch.mrp,
      availableStock: batch.quantity,
    });

    toast.info(`Updated to batch ${batch.batchNo} (₹${batch.mrp.toFixed(2)})`);
    setBatchPickerTarget(null);
  };

  // 5. 100% Keyboard-Driven Workflow Shortcuts (Module 2.2.2)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Ignore if user is inside an open modal or input dialog
      const isAnyModalOpen =
        isCustomerModalOpen ||
        isDiscountModalOpen ||
        isTenderModalOpen ||
        isReceiptModalOpen ||
        Boolean(batchPickerTarget);

      // F2: Focus Search Medicine
      if (e.key === "F2") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // F4: Tender / Payment Modal
      if (e.key === "F4") {
        e.preventDefault();
        if (items.length === 0) {
          toast.warning("Cart is empty. Add medicines before proceeding to payment.");
          return;
        }
        setIsTenderModalOpen(true);
        return;
      }

      // F7: Customer Lookup / Walk-in Modal
      if (e.key === "F7") {
        e.preventDefault();
        setIsCustomerModalOpen(true);
        return;
      }

      // F9: Bill-Level Discount Modal
      if (e.key === "F9") {
        e.preventDefault();
        if (items.length === 0) {
          toast.warning("Add medicines to cart before applying discount.");
          return;
        }
        setIsDiscountModalOpen(true);
        return;
      }

      // F10: Electronic Cash Drawer Kick (Module 2.5.2)
      if (e.key === "F10") {
        e.preventDefault();
        triggerCashDrawerKick({ silent: false, recordAudit: true, reason: "POS F10 Shortcut Kick" });
        toast.success("Cash drawer kick pulse sent (F10)!");
        return;
      }

      // Ctrl+P / Cmd+P: Instant Thermal Print & Complete
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        if (isReceiptModalOpen) {
          window.print();
        } else if (items.length > 0) {
          setIsTenderModalOpen(true);
        }
        return;
      }

      // ESC: Close Modals or Clear Cart (Prompt)
      if (e.key === "Escape") {
        if (!isAnyModalOpen && items.length > 0) {
          e.preventDefault();
          const confirmed = await confirmAction({
            title: "Clear Current Cart?",
            message: `Are you sure you want to discard all ${items.length} item(s) from the billing counter?`,
            confirmText: "Yes, Clear Cart",
            cancelText: "Keep Items",
            type: "danger",
          });
          if (confirmed) {
            clearCart();
            toast.info("Billing cart cleared.");
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    items.length,
    isCustomerModalOpen,
    isDiscountModalOpen,
    isTenderModalOpen,
    isReceiptModalOpen,
    batchPickerTarget,
    clearCart,
  ]);

  // Handle Search Input Navigation (ArrowUp / ArrowDown / Enter)
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (searchResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSearchIndex((prev) =>
        prev < searchResults.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSearchIndex((prev) =>
        prev > 0 ? prev - 1 : searchResults.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const targetMed = searchResults[selectedSearchIndex];
      if (targetMed) {
        handleAddMedicine(targetMed);
      }
    }
  };

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setSearchResults([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle Sale Completed callback
  const handleSaleCompleted = (sale: any) => {
    setCompletedSaleData(sale);
    setIsReceiptModalOpen(true);
    clearCart();
    fetchPosBootstrap();
  };

  // Calculations (Module 2.2 & 2.4)
  const grossSubtotal = getSubtotal();
  const totalItemDiscounts = getTotalItemDiscounts();
  const subtotalAfterItemDiscounts = getSubtotalAfterItemDiscounts();
  const totalCombinedDiscount = getTotalDiscount();
  const totalGst = getTotalGst();
  const grandTotal = getGrandTotal();
  const cgst = totalGst / 2;
  const sgst = totalGst / 2;

  return (
    <div className="max-w-[1600px] mx-auto space-y-3 pb-8 select-none">
      {/* 1. TOP HEADER & KEYBOARD SHORTCUTS BAR (Module 2.2.2) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#EAF2F4] text-[#1F4E5B] flex items-center justify-center font-extrabold shadow-2xs">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-slate-900 tracking-tight">
                Counter Billing Terminal
              </h1>
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#EAF2F4] text-[#1F4E5B]">
                {activeBranch?.name || "Main Outlet"}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              100% Keyboard-Driven High-Speed Dispensing & Tax Invoicing
            </p>
          </div>
        </div>

        {/* Global Shortcut Mapping Badges */}
        <div className="hidden xl:flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 px-4 py-2 rounded-2xl">
          <span className="text-[#1F4E5B] font-extrabold bg-[#EAF2F4] px-1.5 py-0.5 rounded">
            F2
          </span>
          <span>Search</span>
          <span className="text-slate-300">•</span>
          <span className="text-[#1F4E5B] font-extrabold bg-[#EAF2F4] px-1.5 py-0.5 rounded">
            F4
          </span>
          <span>Collect</span>
          <span className="text-slate-300">•</span>
          <span className="text-[#1F4E5B] font-extrabold bg-[#EAF2F4] px-1.5 py-0.5 rounded">
            F7
          </span>
          <span>Customer</span>
          <span className="text-slate-300">•</span>
          <span className="text-[#1F4E5B] font-extrabold bg-[#EAF2F4] px-1.5 py-0.5 rounded">
            F9
          </span>
          <span>Discount</span>
          <span className="text-slate-300">•</span>
          <span className="text-[#1F4E5B] font-extrabold bg-[#EAF2F4] px-1.5 py-0.5 rounded">
            F10
          </span>
          <span>Drawer</span>
          <span className="text-slate-300">•</span>
          <span className="text-[#1F4E5B] font-extrabold bg-[#EAF2F4] px-1.5 py-0.5 rounded">
            Ctrl+P
          </span>
          <span>Print</span>
        </div>

        {/* Barcode Scanner & Thermal Label Actions (Module 2.3) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsBarcodeTestModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold hover:bg-emerald-100 transition-colors cursor-pointer"
            title="Hardware USB/Bluetooth scanner listener active. Click to test manual barcode entry."
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
            </span>
            <Scan className="w-3.5 h-3.5 text-emerald-700" />
            <span>Scanner Ready</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setBarcodePrintTarget({
                medicineName: items[0]?.medicineName || "Sample Medicine",
                batchNo: items[0]?.batchNo || "BAT-001",
                expiryDate: items[0]?.expiryDate || "2028-12-31",
                mrp: items[0]?.unitPrice || 100,
              });
              setIsBarcodePrintOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
            title="Generate thermal barcode labels"
          >
            <Barcode className="w-3.5 h-3.5 text-slate-600" />
            <span>Print Labels</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              await triggerCashDrawerKick({ silent: false, recordAudit: true, reason: "POS Header Action Kick" });
              toast.success("Electronic cash drawer opened (F10)!");
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold hover:bg-amber-100 transition-colors cursor-pointer"
            title="Electronic Cash Drawer Kick (F10)"
          >
            <Banknote className="w-3.5 h-3.5 text-amber-700" />
            <span>Open Drawer</span>
          </button>
        </div>

        {/* Parked Bills Quick Recall Indicator */}
        {parkedBills.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-2xl flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>{parkedBills.length} Held Bill(s)</span>
            </div>
            {parkedBills.slice(0, 2).map((pb) => (
              <button
                key={pb.id}
                type="button"
                onClick={() => recallParkedBill(pb.id)}
                className="px-2.5 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold transition-colors cursor-pointer"
              >
                Recall {pb.customer?.name || "Walk-in"} ({pb.createdAt})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. MAIN 2-COLUMN WORKSPACE: LEFT (70%) CART & SEARCH | RIGHT (30%) TOTALS & TENDER */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: Search Bar & Interactive Cart Table */}
        <div className="lg:col-span-8 space-y-3">
          {/* SEARCH BAR (Module 2.2.3) */}
          <div className="relative" ref={searchContainerRef}>
            <div className="relative flex items-center bg-white border border-slate-300 focus-within:border-[#1F4E5B] focus-within:ring-2 focus-within:ring-[#1F4E5B]/20 rounded-3xl p-1.5 shadow-2xs transition-all">
              <div className="pl-3 text-slate-400">
                <Search className="w-5 h-5" />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Scan Barcode or Search Medicine by Brand Name, Generic Composition, or Rack Location... [F2]"
                className="w-full bg-transparent px-3 py-2 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                    searchInputRef.current?.focus();
                  }}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 mr-2"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <span className="text-[10px] font-extrabold px-2 py-1 rounded-xl bg-slate-100 text-slate-500 mr-1.5 shrink-0 hidden sm:inline-block">
                Shortcut: F2
              </span>
            </div>

            {/* LIVE SEARCH AUTOCOMPLETE DROPDOWN */}
            {searchQuery.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden divide-y divide-slate-100 max-h-[360px] overflow-y-auto [scrollbar-width:thin] animate-scaleUp">
                {searching ? (
                  <div className="py-8 text-center text-xs text-slate-500 font-medium">
                    Searching pharmacy database...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No medicines found matching &quot;{searchQuery}&quot; in {activeBranch?.name || "current branch"}.
                  </div>
                ) : (
                  searchResults.map((med, index) => {
                    const isHighlighted = index === selectedSearchIndex;
                    const hasStock = med.totalBranchStock > 0;
                    const rec = med.recommendedBatch;

                    return (
                      <div
                        key={med.id}
                        onClick={() => handleAddMedicine(med)}
                        onMouseEnter={() => setSelectedSearchIndex(index)}
                        className={`p-3.5 transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                          isHighlighted ? "bg-teal-50/70" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-extrabold text-slate-900 truncate">
                              {med.name}
                            </h4>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700 shrink-0">
                              {med.category}
                            </span>
                            {med.scheduleType !== "normal" && (
                              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 shrink-0">
                                {med.scheduleType.toUpperCase()}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 italic truncate mt-0.5">
                            {med.genericName || "Composition unspecified"} • {med.company}
                          </p>

                          {/* Rack Location Badge (Module 2.2.3) */}
                          <div className="flex items-center gap-2 mt-1">
                            {med.rackLocation ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                                <MapPin className="w-2.5 h-2.5" />
                                {med.rackLocation}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">No Rack Assigned</span>
                            )}
                            {rec && (
                              <span className="text-[10px] text-slate-600 font-medium">
                                Batch: <strong>{rec.batchNo}</strong> (Exp:{" "}
                                {new Date(rec.expiryDate).toLocaleDateString()})
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-sm font-black text-slate-900">
                            {rec ? `₹${rec.mrp.toFixed(2)}` : "-"}
                          </div>
                          <div className="mt-0.5">
                            {hasStock ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                <Sparkles className="w-3 h-3" />
                                {med.totalBranchStock} in stock
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                                Out of Stock
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* CART ITEMS TABLE (Module 2.2.1) */}
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  Billing Cart
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#EAF2F4] text-[#1F4E5B] text-[11px] font-extrabold">
                  {items.length} Item(s)
                </span>
              </div>

              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const id = parkCurrentBill();
                      if (id) toast.info("Bill held. You can start a new customer sale.");
                    }}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Hold current customer cart to bill another customer"
                  >
                    <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Hold Bill</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const confirmed = await confirmAction({
                        title: "Clear Current Cart?",
                        message: "Discard all medicines from the current bill?",
                        type: "danger",
                      });
                      if (confirmed) clearCart();
                    }}
                    className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear (Esc)</span>
                  </button>
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <ShoppingCart className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-700">Billing Counter is Empty</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Press <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-bold">F2</kbd> or
                    scan barcode to add medicines to customer bill.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4">Medicine / Composition</th>
                      <th className="py-3 px-3">Batch & Expiry</th>
                      <th className="py-3 px-3 text-right">MRP</th>
                      <th className="py-3 px-3 text-center">Quantity</th>
                      <th className="py-3 px-3 text-right">GST %</th>
                      <th className="py-3 px-4 text-right">Line Total</th>
                      <th className="py-3 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item) => {
                      const lineGross = item.unitPrice * item.quantity;
                      const lineDiscount = item.discountAmount || 0;
                      const lineNet = Math.max(0, lineGross - lineDiscount);
                      const isStockMax = item.quantity >= item.availableStock;

                      return (
                        <tr key={item.batchId} className="hover:bg-slate-50/70 transition-colors">
                          {/* Medicine details */}
                          <td className="py-3.5 px-4 min-w-[200px]">
                            <div className="font-bold text-slate-900 leading-tight">
                              {item.medicineName}
                            </div>
                            {item.genericName && (
                              <div className="text-[10px] text-slate-500 italic truncate max-w-[240px]">
                                {item.genericName}
                              </div>
                            )}
                            {item.rackLocation && (
                              <div className="mt-1">
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                  <MapPin className="w-2.5 h-2.5" />
                                  {item.rackLocation}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Batch picker trigger */}
                          <td className="py-3.5 px-3 min-w-[140px]">
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-slate-800">
                                {item.batchNo}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setBatchPickerTarget({
                                    medicineId: item.medicineId,
                                    medicineName: item.medicineName,
                                    currentBatchId: item.batchId,
                                  })
                                }
                                className="text-[10px] font-bold text-[#1F4E5B] hover:underline cursor-pointer flex items-center gap-0.5"
                                title="Pick another batch (FEFO override)"
                              >
                                <Layers className="w-3 h-3" />
                                <span>Change</span>
                              </button>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Exp: {new Date(item.expiryDate).toLocaleDateString()}
                            </div>
                          </td>

                          {/* Unit MRP */}
                          <td className="py-3.5 px-3 text-right font-semibold text-slate-900">
                            ₹{item.unitPrice.toFixed(2)}
                          </td>

                          {/* Quantity Stepper with Stock Cap (Module 2.1.5) */}
                          <td className="py-3.5 px-3 text-center">
                            <div className="inline-flex items-center border border-slate-300 rounded-xl bg-white shadow-2xs">
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.batchId, item.quantity - 1)}
                                className="px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-l-xl transition-colors cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={item.availableStock}
                                value={item.quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  if (!isNaN(val)) updateQuantity(item.batchId, val);
                                }}
                                className="w-11 text-center text-xs font-black text-slate-900 focus:outline-none py-1"
                              />
                              <button
                                type="button"
                                disabled={isStockMax}
                                onClick={() => updateQuantity(item.batchId, item.quantity + 1)}
                                className={`px-2 py-1 rounded-r-xl transition-colors ${
                                  isStockMax
                                    ? "text-slate-300 cursor-not-allowed bg-slate-50"
                                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                                }`}
                                title={isStockMax ? "Batch stock cap reached" : "Add one"}
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="text-[9px] text-slate-400 mt-0.5">
                              Max: {item.availableStock} units
                            </div>
                          </td>

                          {/* GST % */}
                          <td className="py-3.5 px-3 text-right text-slate-600 font-medium">
                            {item.taxPercent}%
                          </td>

                          {/* Line Total with Item-Discount Indicator (Module 2.4.2) */}
                          <td className="py-3.5 px-4 text-right">
                            {lineDiscount > 0 ? (
                              <div>
                                <div className="text-[10px] text-slate-400 line-through">
                                  ₹{lineGross.toFixed(2)}
                                </div>
                                <div className="font-black text-slate-900 text-sm">
                                  ₹{lineNet.toFixed(2)}
                                </div>
                                <div className="inline-flex items-center gap-1 text-[9px] font-extrabold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded mt-0.5">
                                  -₹{lineDiscount.toFixed(2)} ({item.discountPercent?.toFixed(1)}%)
                                </div>
                              </div>
                            ) : (
                              <div className="font-black text-slate-900 text-sm">
                                ₹{lineGross.toFixed(2)}
                              </div>
                            )}
                          </td>

                          {/* Action Buttons: Item Discount, Barcode Print, Remove */}
                          <td className="py-3.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => setItemDiscountTarget(item)}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  lineDiscount > 0
                                    ? "bg-amber-100 text-amber-900 hover:bg-amber-200"
                                    : "text-slate-400 hover:text-amber-700 hover:bg-amber-50"
                                }`}
                                title="Apply item-level discount"
                              >
                                <Percent className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setBarcodePrintTarget({
                                    medicineName: item.medicineName,
                                    batchNo: item.batchNo,
                                    expiryDate: item.expiryDate,
                                    mrp: item.unitPrice,
                                  });
                                  setIsBarcodePrintOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-[#1F4E5B] hover:bg-teal-50 transition-colors cursor-pointer"
                                title="Print barcode label for this batch"
                              >
                                <Barcode className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => removeItem(item.batchId)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Remove item"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Customer Details, Financial Breakdown, & Tender Action */}
        <div className="lg:col-span-4 space-y-3">
          {/* CUSTOMER CARD (Module 2.2.2 - F7 Shortcut) */}
          <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-[#1F4E5B]" />
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  Patient / Customer
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(true)}
                className="text-xs font-bold text-[#1F4E5B] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Change (F7)</span>
              </button>
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-extrabold text-slate-900 truncate">
                    {customer ? customer.name : "Walk-in Customer"}
                  </h4>
                  {customer?.isChronic && (
                    <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 shrink-0">
                      Chronic
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {customer ? customer.phone : "Counter walk-in • Immediate payment"}
                </p>
                {customer?.address && (
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {customer.address}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(true)}
                className="p-2 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 transition-colors shrink-0 cursor-pointer"
              >
                <User className="w-4 h-4" />
              </button>
            </div>

            {/* If Customer has Baki Khata account */}
            {customer && customer.creditLimit > 0 && (
              <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold block">Credit Limit:</span>
                  <span className="font-extrabold text-slate-800">
                    ₹{customer.creditLimit.toFixed(2)}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold block">Current Due:</span>
                  <span className="font-extrabold text-rose-600">
                    ₹{customer.currentDue.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* FINANCIAL SUMMARY CARD (Module 2.2.1) */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-4">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center justify-between">
              <span>Bill Financials</span>
              <button
                type="button"
                onClick={() => setIsDiscountModalOpen(true)}
                className="text-xs font-bold text-[#1F4E5B] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Percent className="w-3.5 h-3.5" />
                <span>Discount (F9)</span>
              </button>
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Gross MRP Total:</span>
                <span className="font-bold text-slate-900">₹{grossSubtotal.toFixed(2)}</span>
              </div>

              {totalItemDiscounts > 0 && (
                <div className="flex justify-between text-amber-700 font-semibold">
                  <span>Item Discounts:</span>
                  <span>-₹{totalItemDiscounts.toFixed(2)}</span>
                </div>
              )}

              {discountAmount > 0 && (
                <div className="flex justify-between text-rose-600 font-bold">
                  <span>
                    Bill Discount {discountPercent > 0 ? `(${discountPercent}%)` : ""}:
                  </span>
                  <span>-₹{discountAmount.toFixed(2)}</span>
                </div>
              )}

              {totalCombinedDiscount > 0 && (
                <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 flex justify-between text-emerald-900 font-bold text-[11px]">
                  <span>Total Savings:</span>
                  <span>₹{totalCombinedDiscount.toFixed(2)} OFF</span>
                </div>
              )}

              <div className="flex justify-between text-slate-500 text-[11px] pt-1 border-t border-slate-100">
                <span>CGST (Included):</span>
                <span>₹{cgst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>SGST (Included):</span>
                <span>₹{sgst.toFixed(2)}</span>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-baseline justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    Grand Total
                  </span>
                  <span className="text-[10px] text-slate-400">All Taxes Included</span>
                </div>
                <div className="text-2xl font-black text-[#1F4E5B]">
                  ₹{grandTotal.toFixed(2)}
                </div>
              </div>
            </div>

            {/* COLLECT PAYMENT BUTTON (Module 2.2.2 - F4 Shortcut) */}
            <button
              type="button"
              disabled={items.length === 0}
              onClick={() => setIsTenderModalOpen(true)}
              className={`w-full py-4 rounded-2xl text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
                items.length === 0
                  ? "bg-slate-300 cursor-not-allowed"
                  : "bg-[#1F4E5B] hover:bg-[#163a44] active:scale-[0.99]"
              }`}
            >
              <CreditCard className="w-5 h-5" />
              <span>Collect Payment [F4]</span>
            </button>
          </div>

          {/* TODAY'S TERMINAL METRICS WIDGET */}
          <div className="p-4 rounded-3xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div>
              <span className="text-[10px] text-slate-400 font-bold block uppercase">
                Today&apos;s Store Sales
              </span>
              <span className="font-bold text-slate-800">
                {todayMetrics.salesCount} Invoices Finalized
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">
                Total Revenue
              </span>
              <span className="font-extrabold text-[#1F4E5B]">
                ₹{todayMetrics.totalRevenue.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. MODALS STACK */}

      {/* Alternative Batch Picker Modal (Module 2.2.4) */}
      {batchPickerTarget && (
        <BatchPickerModal
          isOpen={Boolean(batchPickerTarget)}
          onClose={() => setBatchPickerTarget(null)}
          medicineId={batchPickerTarget.medicineId}
          medicineName={batchPickerTarget.medicineName}
          currentBatchId={batchPickerTarget.currentBatchId}
          onSelectBatch={handleSelectAlternativeBatch}
        />
      )}

      {/* Customer Lookup & New Customer Modal (Module 2.2.2 - F7) */}
      <CustomerLookupModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
      />

      {/* Bill-Level Discount Modal (Module 2.2.2 - F9) */}
      <DiscountModal
        isOpen={isDiscountModalOpen}
        onClose={() => setIsDiscountModalOpen(false)}
        masterDiscounts={masterDiscounts}
      />

      {/* Tender & Collect Payment Modal (Module 2.1.4 & 2.2.2 - F4) */}
      <PaymentTenderModal
        isOpen={isTenderModalOpen}
        onClose={() => setIsTenderModalOpen(false)}
        onSaleCompleted={handleSaleCompleted}
        onOpenCustomerModal={() => {
          setIsTenderModalOpen(false);
          setIsCustomerModalOpen(true);
        }}
        storeUpiId={storeUpiId}
      />

      {/* Thermal Receipt Print Modal (Module 2.2.2 - Ctrl+P) */}
      <ReceiptPrintModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        saleData={completedSaleData}
        onNewSale={() => {
          setIsReceiptModalOpen(false);
          setCompletedSaleData(null);
          searchInputRef.current?.focus();
        }}
      />

      {/* Item-Level Discount Modal (Module 2.4.2) */}
      <ItemDiscountModal
        isOpen={Boolean(itemDiscountTarget)}
        onClose={() => setItemDiscountTarget(null)}
        item={itemDiscountTarget}
      />

      {/* Thermal Barcode Label Generation & Printing Modal (Module 2.3.2) */}
      <BarcodePrintModal
        isOpen={isBarcodePrintOpen}
        onClose={() => setIsBarcodePrintOpen(false)}
        medicineName={barcodePrintTarget?.medicineName || "Medicine"}
        batchNo={barcodePrintTarget?.batchNo || "BAT-001"}
        expiryDate={barcodePrintTarget?.expiryDate || "2028-12-31"}
        mrp={barcodePrintTarget?.mrp || 100}
        storeName={activeBranch?.name || "DRx Pharmacy"}
      />

      {/* Manual Barcode Scanner Test Modal (Module 2.3.1) */}
      <Modal
        isOpen={isBarcodeTestModalOpen}
        onClose={() => setIsBarcodeTestModalOpen(false)}
        title="Hardware Barcode Scanner Listener"
        description="USB / Bluetooth handheld scanners automatically trigger into cart anywhere on this screen"
        headerIcon={
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
            <Scan className="w-5 h-5" />
          </div>
        }
        size="md"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-900 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
              </span>
              <span>Active Background Listener</span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              When using a physical barcode gun, simply pull the trigger while pointing at any medicine packaging. The terminal intercepts rapid keystrokes (&lt; 50ms) and adds to cart without requiring focus!
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Simulate Barcode Gun Scan (Manual Test)
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (testBarcodeInput.trim()) {
                  simulateScan(testBarcodeInput.trim());
                  setTestBarcodeInput("");
                  setIsBarcodeTestModalOpen(false);
                }
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                autoFocus
                value={testBarcodeInput}
                onChange={(e) => setTestBarcodeInput(e.target.value)}
                placeholder="Scan or type barcode (e.g. batch number)..."
                className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                Simulate Scan
              </button>
            </form>
          </div>

          {lastScanned && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex justify-between items-center">
              <span className="text-slate-500">Last Scanned Code:</span>
              <span className="font-mono font-bold text-slate-900">{lastScanned}</span>
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsBarcodeTestModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
            >
              Close (Esc)
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
