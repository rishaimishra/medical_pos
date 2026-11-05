"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Store,
  ShoppingCart,
  Package,
  Truck,
  UserCheck,
  ShieldCheck,
  FileText,
  Upload,
  RotateCcw,
  Calculator,
  Layers,
  CheckCircle2,
  ArrowRight,
  KeyRound,
  ClipboardList,
  Printer,
  MessageSquare,
  Bell,
  User,
  Sparkles,
} from "lucide-react";

export default function MedicalPosHomePage() {
  const [setupDone, setSetupDone] = useState<boolean | null>(null);
  const [storeName, setStoreName] = useState<string>("");
  const [adminUser, setAdminUser] = useState<{ name: string; role: string } | null>(null);
  const [customerUser, setCustomerUser] = useState<{ name: string; phone: string } | null>(null);
  const [supplierUser, setSupplierUser] = useState<{ name: string; companyName: string } | null>(
    null
  );

  useEffect(() => {
    // Check store setup & active portal sessions from database
    fetch("/api/auth/admin", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (typeof json?.setupDone === "boolean") {
          setSetupDone(json.setupDone);
        }
        if (json?.authenticated && json?.session) {
          setAdminUser({
            name: json.session.name || json.session.username,
            role: json.session.role,
          });
        }
      })
      .catch(() => {});

    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json?.setupDone && json?.data?.storeName) {
          setStoreName(json.data.storeName);
        }
      })
      .catch(() => {});

    fetch("/api/auth/customer", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json?.authenticated && json?.customer) {
          setCustomerUser({ name: json.customer.name, phone: json.customer.phone });
        }
      })
      .catch(() => {});

    fetch("/api/auth/supplier", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json?.authenticated && json?.supplier) {
          setSupplierUser({
            name: json.supplier.name,
            companyName: json.supplier.companyName,
          });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#F4F7F9] text-slate-900 flex flex-col font-sans">
      {/* 1. Top System Status Bar */}
      <div className="bg-[#EAF5F0] border-b border-emerald-200/80 text-xs text-slate-700 py-2.5 px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 font-extrabold text-[#0F6E56]">
              <ShieldCheck className="w-4 h-4" />
              Medical POS & Pharmacy Management System
            </span>
            <span className="hidden md:inline text-slate-300">|</span>
            <span className="hidden md:inline text-slate-600 font-medium">
              Multi-Batch FEFO Inventory • Rack Finder • GST Billing • Credit Ledger • Day-End Z-Report
            </span>
          </div>

          <div className="flex items-center gap-3">
            {setupDone === false ? (
              <Link
                href="/setup/wizard"
                className="inline-flex items-center gap-1.5 text-amber-900 bg-amber-100/90 border border-amber-300 px-3 py-1 rounded-full text-xs font-bold hover:bg-amber-200 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                Store Not Registered — Click to Start Setup
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[#0F6E56] text-xs font-bold">
                <CheckCircle2 className="w-4 h-4" />
                {storeName ? `Active Store: ${storeName}` : "Pharmacy System Ready"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Main Navigation Header */}
      <header className="bg-white border-b border-slate-200/90 sticky top-0 z-40 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          {/* Brand Identity */}
          <Link href="/" className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[#0F6E56] flex items-center justify-center text-white shadow-sm">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-extrabold tracking-tight text-slate-900 block leading-none">
                {storeName || "Medical POS & Pharmacy System"}
              </span>
              <span className="text-xs text-slate-500 font-medium mt-1 block">
                Central Pharmacy Billing, Inventory, Supplier & Patient Portal
              </span>
            </div>
          </Link>

          {/* 3 Main Portals Quick Access */}
          <div className="flex flex-wrap items-center gap-2.5">
            {!adminUser && (
              <Link
                href="/setup/wizard"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#EAF5F0] hover:bg-emerald-100 text-[#0F6E56] border border-emerald-200 text-xs font-extrabold transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>Register New Store</span>
              </Link>
            )}

            <Link
              href={adminUser ? "/admin/dashboard" : "/admin/login"}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold transition-all shadow-xs"
            >
              <Store className="w-4 h-4" />
              <span>
                {adminUser
                  ? `Staff Portal (${adminUser.name})`
                  : "1. Admin & Staff Login"}
              </span>
            </Link>

            <Link
              href={supplierUser ? "/supplier/dashboard" : "/supplier/login"}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#283566] hover:bg-[#1e284f] text-white text-xs font-bold transition-all shadow-xs"
            >
              <Truck className="w-4 h-4" />
              <span>
                {supplierUser
                  ? `Supplier Portal (${supplierUser.name})`
                  : "2. Supplier Login"}
              </span>
            </Link>

            <Link
              href={customerUser ? "/customer/dashboard" : "/customer/login"}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F5A47] hover:bg-[#0b4637] text-white text-xs font-bold transition-all shadow-xs"
            >
              <User className="w-4 h-4" />
              <span>
                {customerUser
                  ? `Patient Portal (${customerUser.name})`
                  : "3. Patient Login / Register"}
              </span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 space-y-10 flex-1">
        {/* First-Time Store Setup Banner (Shown only when setupDone === false in DB) */}
        {setupDone === false && (
          <section className="bg-gradient-to-r from-amber-50 via-[#FFFDF7] to-emerald-50/40 border border-amber-300/90 rounded-3xl p-6 md:p-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 shadow-xs">
            <div className="space-y-3 max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-200/70 text-amber-950 text-xs font-extrabold tracking-wide">
                <Sparkles className="w-3.5 h-3.5 text-amber-800" />
                <span>First-Run 4-Step Store Setup Wizard</span>
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Your Pharmacy Store is Not Registered Yet
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Complete the one-time 4-step setup to activate your pharmacy store and POS counter:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
                {[
                  { step: "Step 1", title: "Store Profile, DL & GST" },
                  { step: "Step 2", title: "Store Owner Account" },
                  { step: "Step 3", title: "System Setup Check" },
                  { step: "Step 4", title: "20 Default Categories" },
                ].map((item) => (
                  <div
                    key={item.step}
                    className="bg-white/90 border border-amber-200/80 rounded-xl px-3.5 py-2"
                  >
                    <span className="text-[11px] font-extrabold uppercase text-amber-800 block">
                      {item.step}
                    </span>
                    <span className="text-xs font-bold text-slate-800">
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <Link
              href="/setup/wizard"
              className="shrink-0 inline-flex items-center gap-2.5 px-6 py-4 rounded-2xl bg-[#0F6E56] hover:bg-[#0b5643] text-white text-sm font-extrabold shadow-md transition-all"
            >
              <span>Start 4-Step Store Setup</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </section>
        )}

        {/* Section 1: The 3 Core User Portals (Polished UI & Typography) */}
        <section className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#0F6E56]">
                Pharmacy System Architecture
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
                3 Dedicated Portals for Your Pharmacy
              </h2>
            </div>
            <p className="text-sm text-slate-500 font-medium">
              Select your portal below to sign in or register an account
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-7">
            {/* PORTAL 1: ADMIN & STAFF MANAGEMENT PANEL */}
            <div className="bg-white border border-slate-200/90 hover:border-[#1F4E5B]/60 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all flex flex-col justify-between">
              <div>
                {/* Card Header */}
                <div className="bg-[#1F4E5B] text-white px-7 py-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-white/15 text-emerald-200">
                      Portal 01 • Central POS
                    </span>
                    <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                      <Store className="w-5 h-5 text-emerald-200" />
                    </div>
                  </div>
                  <h3 className="text-xl font-extrabold tracking-tight leading-snug">
                    Admin & Staff Management
                  </h3>
                  <p className="text-xs text-slate-200/90 mt-1.5 font-medium leading-relaxed">
                    For Pharmacy Owner, Manager, Pharmacist, Cashier & Accountant
                  </p>
                </div>

                {/* Feature List */}
                <div className="p-6 sm:p-7 space-y-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-[#EAF2F4] text-[#1F4E5B] flex items-center justify-center shrink-0 mt-0.5">
                      <Calculator className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900">
                        Superfast POS Billing Counter
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                        Keyboard shortcuts (F2, F4, Enter), barcode scan, rack & shelf finder, strip & loose tablet billing, UPI QR, Cash, Card & Credit Ledger.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-[#EAF2F4] text-[#1F4E5B] flex items-center justify-center shrink-0 mt-0.5">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900">
                        Multi-Batch & FEFO Inventory
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                        Suggests earliest expiring batch first (FEFO), blocks expired stock automatically, 30/90-day expiry alerts, and 1-click CSV bulk import.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-[#EAF2F4] text-[#1F4E5B] flex items-center justify-center shrink-0 mt-0.5">
                      <ClipboardList className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900">
                        Purchase Orders, GRN & Returns
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                        Auto purchase orders for low stock, fast GRN stock entry with bonus quantities, and invoice-scanned sales returns.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-[#EAF2F4] text-[#1F4E5B] flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900">
                        Financials & Day-End Z-Report
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                        Cash drawer note counting reconciliation, COGS net profit & loss, GSTR-1 / GSTR-3B tax reports, and 1-click SQL backup.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Footer */}
              <div className="px-6 sm:px-7 pb-7 pt-1 space-y-2.5">
                <Link
                  href={adminUser ? "/admin/dashboard" : "/admin/login"}
                  className="w-full py-3.5 px-5 rounded-2xl bg-[#1F4E5B] hover:bg-[#163a44] text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  <span>
                    {adminUser
                      ? "Open Admin & Staff Dashboard"
                      : "Sign In to Admin & Staff Panel"}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                {!adminUser && (
                  <Link
                    href="/setup/wizard"
                    className="w-full py-2.5 px-4 rounded-xl bg-[#EAF2F4] hover:bg-[#d8e6ea] text-[#1F4E5B] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>New Owner? Register a New Pharmacy Store</span>
                  </Link>
                )}
              </div>
            </div>

            {/* PORTAL 2: DISTRIBUTOR & SUPPLIER PORTAL */}
            <div className="bg-white border border-slate-200/90 hover:border-[#283566]/60 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all flex flex-col justify-between">
              <div>
                {/* Card Header */}
                <div className="bg-[#283566] text-white px-7 py-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-white/15 text-indigo-200">
                      Portal 02 • Vendor Extranet
                    </span>
                    <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                      <Truck className="w-5 h-5 text-indigo-200" />
                    </div>
                  </div>
                  <h3 className="text-xl font-extrabold tracking-tight leading-snug">
                    Distributor & Supplier Portal
                  </h3>
                  <p className="text-xs text-indigo-100/90 mt-1.5 font-medium leading-relaxed">
                    For Wholesale Medicine Distributors & Supplying Companies
                  </p>
                </div>

                {/* Feature List */}
                <div className="p-6 sm:p-7 space-y-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-[#EEF0F8] text-[#283566] flex items-center justify-center shrink-0 mt-0.5">
                      <ClipboardList className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900">
                        View & Print Purchase Orders (PO)
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                        Instantly view, download, and print new purchase orders issued by the pharmacy on mobile or computer.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-[#EEF0F8] text-[#283566] flex items-center justify-center shrink-0 mt-0.5">
                      <Calculator className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900">
                        Update Wholesale Medicine Rates
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                        Submit updated wholesale rates and MRP directly from your supplier portal for pharmacy admin confirmation.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-[#EEF0F8] text-[#283566] flex items-center justify-center shrink-0 mt-0.5">
                      <Truck className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900">
                        Challan & Shipment Tracking
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                        Update live delivery status from Confirmed to Shipped and Received along with courier or vehicle tracking details.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-[#EEF0F8] text-[#283566] flex items-center justify-center shrink-0 mt-0.5">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900">
                        Payment Ledger & Direct Messaging
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                        Track pending and paid wholesale invoices and chat directly with the pharmacy purchase department.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Footer */}
              <div className="px-6 sm:px-7 pb-7 pt-1">
                <Link
                  href={supplierUser ? "/supplier/dashboard" : "/supplier/login"}
                  className="w-full py-3.5 px-5 rounded-2xl bg-[#283566] hover:bg-[#1e284f] text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  <span>
                    {supplierUser
                      ? "Open Supplier Dashboard"
                      : "Sign In / Register Supplier"}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* PORTAL 3: CUSTOMER & PATIENT PORTAL */}
            <div className="bg-white border border-slate-200/90 hover:border-[#0F5A47]/60 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all flex flex-col justify-between">
              <div>
                {/* Card Header */}
                <div className="bg-[#0F5A47] text-white px-7 py-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-white/15 text-emerald-200">
                      Portal 03 • Patient Self-Service
                    </span>
                    <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                      <UserCheck className="w-5 h-5 text-emerald-200" />
                    </div>
                  </div>
                  <h3 className="text-xl font-extrabold tracking-tight leading-snug">
                    Customer & Patient Portal
                  </h3>
                  <p className="text-xs text-emerald-100/90 mt-1.5 font-medium leading-relaxed">
                    For Regular Pharmacy Customers & Chronic Care Patients
                  </p>
                </div>

                {/* Feature List */}
                <div className="p-6 sm:p-7 space-y-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-[#EAF5F0] text-[#0F5A47] flex items-center justify-center shrink-0 mt-0.5">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900">
                        Digital Prescription Upload
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                        Upload a photo or PDF of your doctor&apos;s prescription so our pharmacist can prepare your medicines in advance.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-[#EAF5F0] text-[#0F5A47] flex items-center justify-center shrink-0 mt-0.5">
                      <Printer className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900">
                        Purchase History & GST Bills
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                        Access all your past medicine records and download official GST tax invoices and receipts in 1 click.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-[#EAF5F0] text-[#0F5A47] flex items-center justify-center shrink-0 mt-0.5">
                      <RotateCcw className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900">
                        Online Return Request
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                        Request a return for purchased medicines online and collect your refund at the counter once approved.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-[#EAF5F0] text-[#0F5A47] flex items-center justify-center shrink-0 mt-0.5">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900">
                        Refill Reminders & Pharmacy Chat
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                        Get automatic refill alerts before regular Diabetes or BP medicines run out and chat with the pharmacy.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Footer */}
              <div className="px-6 sm:px-7 pb-7 pt-1">
                <Link
                  href={customerUser ? "/customer/dashboard" : "/customer/login"}
                  className="w-full py-3.5 px-5 rounded-2xl bg-[#0F5A47] hover:bg-[#0b4637] text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  <span>
                    {customerUser
                      ? "Open Patient Dashboard"
                      : "Customer Sign In / Create Account"}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: 4 Role-Based Staff Sub-Panels inside Admin & Staff Panel */}
        <section className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#1F4E5B]">
                Role-Based Access Control (RBAC)
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                4 Staff Roles Inside the Main Management Panel
              </h2>
            </div>
            <Link
              href={setupDone === false ? "/setup/wizard" : "/admin/login"}
              className="text-xs font-extrabold text-[#1F4E5B] hover:underline inline-flex items-center gap-1.5"
            >
              <span>Go to Staff Role Login</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="p-5 rounded-2xl bg-[#EAF2F4]/60 border border-slate-200/90 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#1F4E5B] bg-white px-3 py-1 rounded-lg border border-slate-200">
                  Role 01
                </span>
                <KeyRound className="w-4 h-4 text-[#1F4E5B]" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">
                Super Admin (Owner)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                100% control over store settings, multi-outlet branches, staff accounts, automated secure backups, and COGS net profit/loss reports.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#EAF5F0]/60 border border-emerald-200/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#0F5A47] bg-white px-3 py-1 rounded-lg border border-emerald-200">
                  Role 02
                </span>
                <Package className="w-4 h-4 text-[#0F5A47]" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">
                Pharmacist
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Add new medicines & rack locations, monitor multi-batch FEFO expiry alerts, receive wholesale GRN stock, and bill customers.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-amber-50/60 border border-amber-200/90 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-amber-900 bg-white px-3 py-1 rounded-lg border border-amber-200">
                  Role 03
                </span>
                <ShoppingCart className="w-4 h-4 text-amber-700" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">
                Cashier (POS Counter)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Dedicated to fast POS counter billing, barcode scanning, and customer lookup (restricted from backups or profit/loss reports).
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#EEF0F8]/70 border border-indigo-200/90 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#283566] bg-white px-3 py-1 rounded-lg border border-indigo-200">
                  Role 04
                </span>
                <Calculator className="w-4 h-4 text-[#283566]" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">
                Accountant
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Manage income & expense ledgers (rent, salaries, bills), GSTR-1 & GSTR-3B tax reports, and day-end cash drawer Z-Report closing.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Clean System Footer */}
      <footer className="bg-white border-t border-slate-200 py-5 px-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold text-slate-700">
            <Store className="w-4 h-4 text-[#0F6E56]" />
            <span>{storeName || "Medical POS & Pharmacy Management System"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-5 font-semibold">
            <Link href="/setup/wizard" className="hover:text-[#0F6E56]">
              4-Step Setup Wizard
            </Link>
            <Link href="/admin/login" className="hover:text-[#0F6E56]">
              Admin & Staff Login
            </Link>
            <Link href="/supplier/login" className="hover:text-[#0F6E56]">
              Supplier Portal
            </Link>
            <Link href="/customer/login" className="hover:text-[#0F6E56]">
              Customer / Patient Portal
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
