"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Barcode,
  Bell,
  Building2,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Layers,
  LockKeyhole,
  MessageSquare,
  Package,
  Printer,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Truck,
  Upload,
  User,
  UserCheck,
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
          fetch("/api/admin/settings", { cache: "no-store" })
            .then((sr) => (sr.ok ? sr.json() : null))
            .then((sJson) => {
              if (sJson?.data?.storeName) {
                setStoreName(sJson.data.storeName);
              }
            })
            .catch(() => {});
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

  const brandTitle = storeName || "Medical POS & Pharmacy Suite";

  return (
    <div className="min-h-screen bg-[#F6F9FB] text-slate-900 flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-950">
      {/* Top Clinical Utility Ribbon */}
      <div className="bg-[#0F5A47] text-emerald-50 text-xs py-2 px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2.5 font-medium">
            <span className="inline-flex items-center gap-1.5 font-bold text-white">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              <span>Multi-Branch Pharmacy ERP &amp; Care Suite</span>
            </span>
            <span className="hidden md:inline text-emerald-300/50">•</span>
            <span className="hidden md:inline text-emerald-100/90">
              FEFO Stock Control • Schedule H/H1 Compliance • GST Tax Invoicing • Baki Khata • Z-Report
            </span>
          </div>

          <div className="flex items-center gap-2">
            {setupDone === false ? (
              <Link
                href="/setup/wizard"
                className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-400 text-amber-950 font-extrabold text-[11px] hover:bg-amber-300 transition-colors"
              >
                <Sparkles className="w-3 h-3" />
                <span>Complete Initial Store Setup</span>
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                <span>{storeName ? `Connected: ${storeName}` : "All Pharmacy Portals Online"}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Sticky Header */}
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#0F6E56] to-[#1F4E5B] flex items-center justify-center text-white shadow-sm group-hover:scale-[1.03] transition-transform">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-extrabold tracking-tight text-slate-900 block leading-tight">
                {brandTitle}
              </span>
              <span className="text-[11px] text-slate-500 font-semibold block">
                Billing Counter, Inventory, Distributor &amp; Patient Portal
              </span>
            </div>
          </Link>

          <nav className="flex flex-wrap items-center gap-2">
            {!adminUser && (
              <Link
                href="/setup/wizard"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#0F5A47] border border-emerald-200 text-xs font-extrabold transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Register Store</span>
              </Link>
            )}

            <Link
              href={adminUser ? "/admin/dashboard" : "/admin/login"}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1F4E5B] hover:bg-[#173c46] text-white text-xs font-bold transition-colors shadow-2xs"
            >
              <Store className="w-3.5 h-3.5" />
              <span>{adminUser ? `Store Console (${adminUser.name})` : "Staff Login"}</span>
            </Link>

            <Link
              href={supplierUser ? "/supplier/dashboard" : "/supplier/login"}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#283566] hover:bg-[#1e284f] text-white text-xs font-bold transition-colors shadow-2xs"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>{supplierUser ? `Supplier (${supplierUser.name})` : "Supplier Login"}</span>
            </Link>

            <Link
              href={customerUser ? "/customer/dashboard" : "/customer/login"}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0F6E56] hover:bg-[#0b5643] text-white text-xs font-bold transition-colors shadow-2xs"
            >
              <User className="w-3.5 h-3.5" />
              <span>{customerUser ? `Patient (${customerUser.name})` : "Patient Portal"}</span>
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-white via-[#F6F9FB] to-[#F6F9FB] border-b border-slate-200/70">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-28 -right-24 w-96 h-96 rounded-full bg-emerald-200/25 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-teal-200/25 blur-3xl"
          />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Hero Copy & CTAs */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#EAF5F0] border border-emerald-200 text-[#0F5A47] text-xs font-extrabold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Built for Indian Retail Pharmacies, Multi-Branch Chains &amp; Clinics</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.12]">
                Fast Counter Billing,{" "}
                <span className="text-[#0F6E56]">Smart FEFO Inventory</span> &amp; Connected Patient Care
              </h1>

              <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
                Run every branch from one unified pharmacy workspace—scan barcodes for strip or loose-tablet sales, block expired stock automatically, manage distributor orders and GRNs, and let patients download GST invoices or upload prescriptions online.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  href={adminUser ? "/admin/dashboard" : "/admin/login"}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-[#1F4E5B] hover:bg-[#163a44] text-white font-extrabold text-sm shadow-md transition-all"
                >
                  <span>{adminUser ? "Open Store Dashboard" : "Sign In to Store Counter"}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                {!adminUser && (
                  <Link
                    href="/setup/wizard"
                    className="inline-flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-[#0F6E56] hover:bg-[#0b5643] text-white font-extrabold text-sm shadow-sm transition-all"
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Register New Pharmacy</span>
                  </Link>
                )}

                <Link
                  href={customerUser ? "/customer/dashboard" : "/customer/login"}
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold text-sm transition-colors"
                >
                  <UserCheck className="w-4 h-4 text-[#0F6E56]" />
                  <span>{customerUser ? "My Patient Account" : "Patient Orders & Rx"}</span>
                </Link>
              </div>

              {/* Compact Trust Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {[
                  { label: "FEFO Safety", val: "Zero Expired Sale" },
                  { label: "GST Ready", val: "GSTR-1 & 3B" },
                  { label: "Recovery", val: "Email OTP Reset" },
                  { label: "Multi-Outlet", val: "Branch Sync" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-white/90 border border-slate-200/80 rounded-2xl px-3.5 py-2.5"
                  >
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      {stat.label}
                    </div>
                    <div className="text-xs sm:text-sm font-extrabold text-slate-800 mt-0.5">
                      {stat.val}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero Right Operational Snapshot Card */}
            <div className="lg:col-span-5">
              <div className="bg-white border border-slate-200/90 rounded-3xl shadow-xl p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0F6E56]">
                      Everyday Counter Workflow
                    </span>
                    <h2 className="text-base font-extrabold text-slate-900 mt-0.5">
                      Everything Your Counter Team Needs
                    </h2>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-[#EAF5F0] text-[#0F6E56] flex items-center justify-center">
                    <Barcode className="w-5 h-5" />
                  </div>
                </div>

                <div className="space-y-3.5">
                  {[
                    {
                      icon: Clock3,
                      color: "bg-[#EAF2F4] text-[#1F4E5B]",
                      title: "Keyboard-First POS Checkout",
                      desc: "F2 search, F4 cash tender, split Cash/UPI/Card/Credit & thermal or A4 GST print.",
                    },
                    {
                      icon: Layers,
                      color: "bg-[#EAF5F0] text-[#0F5A47]",
                      title: "Batch Locator & Rack Finder",
                      desc: "Displays exact rack, shelf & box numbers alongside 30/90-day near-expiry alerts.",
                    },
                    {
                      icon: ClipboardCheck,
                      color: "bg-amber-50 text-amber-800",
                      title: "Schedule H & H1 Compliance",
                      desc: "Captures prescribing doctor details & maintains filterable regulatory dispense logs.",
                    },
                    {
                      icon: LockKeyhole,
                      color: "bg-[#EEF0F8] text-[#283566]",
                      title: "Role Isolation & Email OTP Reset",
                      desc: "Separate portals for Staff, Suppliers & Patients with secure 6-digit OTP recovery.",
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.title}
                        className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50/80 border border-slate-100"
                      >
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.color}`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-extrabold text-slate-900">{item.title}</div>
                          <p className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
                            {item.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-12">
          {/* First-Run Setup Banner (shown only if initial setup is incomplete) */}
          {setupDone === false && (
            <section className="bg-gradient-to-r from-amber-50 via-[#FFFDF7] to-emerald-50/50 border border-amber-300/90 rounded-3xl p-6 md:p-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 shadow-xs">
              <div className="space-y-3 max-w-3xl">
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-200/70 text-amber-950 text-xs font-extrabold tracking-wide">
                  <Sparkles className="w-3.5 h-3.5 text-amber-800" />
                  <span>First-Run 4-Step Store Setup Wizard</span>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Your Pharmacy Store Is Not Registered Yet
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Complete the quick 4-step wizard to activate your pharmacy store, Drug License, GSTIN, and POS counter:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
                  {[
                    { step: "Step 1", title: "Store Profile, DL & GST" },
                    { step: "Step 2", title: "Store Owner Account" },
                    { step: "Step 3", title: "System Verification" },
                    { step: "Step 4", title: "20 Default Categories" },
                  ].map((item) => (
                    <div
                      key={item.step}
                      className="bg-white/90 border border-amber-200/80 rounded-xl px-3.5 py-2"
                    >
                      <span className="text-[11px] font-extrabold uppercase text-amber-800 block">
                        {item.step}
                      </span>
                      <span className="text-xs font-bold text-slate-800">{item.title}</span>
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

          {/* Section 1: 3 Dedicated Pharmacy Portals */}
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#0F6E56]">
                  Connected Pharmacy Ecosystem
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
                  3 Dedicated Portals for Every Stakeholder
                </h2>
              </div>
              <p className="text-sm text-slate-500 font-medium">
                Select your workspace below to sign in or register
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-7">
              {/* PORTAL 1: STORE ADMIN & STAFF PANEL */}
              <div className="bg-white border border-slate-200/90 hover:border-[#1F4E5B]/60 rounded-3xl overflow-hidden shadow-xs hover:shadow-xl transition-all flex flex-col justify-between">
                <div>
                  <div className="bg-[#1F4E5B] text-white px-7 py-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-white/15 text-emerald-200">
                        Portal 01 • Central POS
                      </span>
                      <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                        <Store className="w-5 h-5 text-emerald-200" />
                      </div>
                    </div>
                    <h3 className="text-xl font-extrabold tracking-tight">
                      Store Admin &amp; Staff Panel
                    </h3>
                    <p className="text-xs text-slate-200/90 mt-1.5 font-medium leading-relaxed">
                      For Store Owners, Store Managers, Pharmacists, Cashiers &amp; Accountants
                    </p>
                  </div>

                  <div className="p-6 sm:p-7 space-y-4">
                    {[
                      {
                        icon: Calculator,
                        title: "Superfast POS Billing Counter",
                        desc: "Strip & loose tablet calculation, barcode scan, rack finder, UPI QR, Cash, Card & Baki Khata.",
                      },
                      {
                        icon: Layers,
                        title: "Multi-Batch & FEFO Inventory",
                        desc: "Suggests earliest-expiring batches first, blocks expired stock & sends 30/90-day expiry alerts.",
                      },
                      {
                        icon: ClipboardList,
                        title: "Purchase Orders, GRN & Returns",
                        desc: "Low-stock purchase suggestions, rapid GRN entry with bonus quantities & invoice-linked returns.",
                      },
                      {
                        icon: FileText,
                        title: "Financials, GST & Z-Report Closing",
                        desc: "Note-counting cash drawer closing, COGS net profit/loss, GSTR-1/3B reports & store backups.",
                      },
                    ].map((feat) => {
                      const Icon = feat.icon;
                      return (
                        <div key={feat.title} className="flex items-start gap-3.5">
                          <div className="w-9 h-9 rounded-xl bg-[#EAF2F4] text-[#1F4E5B] flex items-center justify-center shrink-0 mt-0.5">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-extrabold text-slate-900">{feat.title}</h4>
                            <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                              {feat.desc}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="px-6 sm:px-7 pb-7 pt-1 space-y-2.5">
                  <Link
                    href={adminUser ? "/admin/dashboard" : "/admin/login"}
                    className="w-full py-3.5 px-5 rounded-2xl bg-[#1F4E5B] hover:bg-[#163a44] text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    <span>
                      {adminUser ? "Open Store Dashboard" : "Sign In to Staff & Store Panel"}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  {!adminUser && (
                    <Link
                      href="/setup/wizard"
                      className="w-full py-2.5 px-4 rounded-xl bg-[#EAF2F4] hover:bg-[#d8e6ea] text-[#1F4E5B] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>New Pharmacy? Start 4-Step Store Setup</span>
                    </Link>
                  )}
                </div>
              </div>

              {/* PORTAL 2: DISTRIBUTOR & SUPPLIER PORTAL */}
              <div className="bg-white border border-slate-200/90 hover:border-[#283566]/60 rounded-3xl overflow-hidden shadow-xs hover:shadow-xl transition-all flex flex-col justify-between">
                <div>
                  <div className="bg-[#283566] text-white px-7 py-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-white/15 text-indigo-200">
                        Portal 02 • Vendor Extranet
                      </span>
                      <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                        <Truck className="w-5 h-5 text-indigo-200" />
                      </div>
                    </div>
                    <h3 className="text-xl font-extrabold tracking-tight">
                      Distributor &amp; Supplier Portal
                    </h3>
                    <p className="text-xs text-indigo-100/90 mt-1.5 font-medium leading-relaxed">
                      For Wholesale Medicine Distributors &amp; Supplying Companies
                    </p>
                  </div>

                  <div className="p-6 sm:p-7 space-y-4">
                    {[
                      {
                        icon: ClipboardList,
                        title: "View & Print Purchase Orders (PO)",
                        desc: "Review incoming pharmacy purchase orders in real time from desktop or mobile.",
                      },
                      {
                        icon: FileSpreadsheet,
                        title: "Update Wholesale Rates & MRP",
                        desc: "Propose updated distributor pricing and GST rates directly for store admin approval.",
                      },
                      {
                        icon: Truck,
                        title: "Dispatch Challan & Shipment Status",
                        desc: "Update order lifecycle cleanly from Confirmed to Shipped and Received with challan tracking.",
                      },
                      {
                        icon: MessageSquare,
                        title: "Ledger Balance & Purchase Chat",
                        desc: "Track cleared vs pending distributor payouts and message pharmacy purchasing desks directly.",
                      },
                    ].map((feat) => {
                      const Icon = feat.icon;
                      return (
                        <div key={feat.title} className="flex items-start gap-3.5">
                          <div className="w-9 h-9 rounded-xl bg-[#EEF0F8] text-[#283566] flex items-center justify-center shrink-0 mt-0.5">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-extrabold text-slate-900">{feat.title}</h4>
                            <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                              {feat.desc}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="px-6 sm:px-7 pb-7 pt-1">
                  <Link
                    href={supplierUser ? "/supplier/dashboard" : "/supplier/login"}
                    className="w-full py-3.5 px-5 rounded-2xl bg-[#283566] hover:bg-[#1e284f] text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    <span>
                      {supplierUser ? "Open Supplier Dashboard" : "Sign In / Register Supplier"}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              {/* PORTAL 3: CUSTOMER & PATIENT PORTAL */}
              <div className="bg-white border border-slate-200/90 hover:border-[#0F5A47]/60 rounded-3xl overflow-hidden shadow-xs hover:shadow-xl transition-all flex flex-col justify-between">
                <div>
                  <div className="bg-[#0F5A47] text-white px-7 py-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-white/15 text-emerald-200">
                        Portal 03 • Patient Self-Service
                      </span>
                      <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                        <UserCheck className="w-5 h-5 text-emerald-200" />
                      </div>
                    </div>
                    <h3 className="text-xl font-extrabold tracking-tight">
                      Customer &amp; Patient Portal
                    </h3>
                    <p className="text-xs text-emerald-100/90 mt-1.5 font-medium leading-relaxed">
                      For Regular Pharmacy Customers &amp; Chronic Care Patients
                    </p>
                  </div>

                  <div className="p-6 sm:p-7 space-y-4">
                    {[
                      {
                        icon: Upload,
                        title: "Targeted Prescription Upload",
                        desc: "Upload PDF or photo prescriptions directly to your chosen pharmacy store and branch outlet.",
                      },
                      {
                        icon: Printer,
                        title: "Unified Bills & GST Tax Invoices",
                        desc: "View purchase history across all visited pharmacies on one phone number and print bills anytime.",
                      },
                      {
                        icon: RotateCcw,
                        title: "Online Sales Return Requests",
                        desc: "Submit return requests from your past invoices for quick verification at the originating counter.",
                      },
                      {
                        icon: Bell,
                        title: "Chronic Refill Alerts & Support Chat",
                        desc: "Receive timely monthly refill reminders for ongoing medicines and message pharmacists securely.",
                      },
                    ].map((feat) => {
                      const Icon = feat.icon;
                      return (
                        <div key={feat.title} className="flex items-start gap-3.5">
                          <div className="w-9 h-9 rounded-xl bg-[#EAF5F0] text-[#0F5A47] flex items-center justify-center shrink-0 mt-0.5">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-extrabold text-slate-900">{feat.title}</h4>
                            <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                              {feat.desc}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

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

          {/* Section 2: Store-Level Team Roles (Strictly Store-Scoped — Zero Super Admin / CEO info) */}
          <section className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#1F4E5B]">
                  Store Access Control (RBAC)
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                  4 Store Team Roles Inside Your Pharmacy Panel
                </h2>
              </div>
              <Link
                href={setupDone === false ? "/setup/wizard" : "/admin/login"}
                className="text-xs font-extrabold text-[#1F4E5B] hover:underline inline-flex items-center gap-1.5"
              >
                <span>Open Store Staff Sign In</span>
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
                  Store Owner (Admin)
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Complete control over store settings, multiple branches, staff permissions, database backups, and profit/loss financials.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#EAF5F0]/60 border border-emerald-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#0F5A47] bg-white px-3 py-1 rounded-lg border border-emerald-200">
                    Role 02
                  </span>
                  <Package className="w-4 h-4 text-[#0F5A47]" />
                </div>
                <h3 className="text-base font-extrabold text-slate-900">Pharmacist</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Manage medicines &amp; rack locators, monitor FEFO expiry alerts, receive wholesale GRN batches, and process prescriptions.
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
                  Dedicated to rapid POS billing, barcode scanning, split tender checkout, and customer lookup with strict financial restrictions.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#EEF0F8]/70 border border-indigo-200/90 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#283566] bg-white px-3 py-1 rounded-lg border border-indigo-200">
                    Role 04
                  </span>
                  <Calculator className="w-4 h-4 text-[#283566]" />
                </div>
                <h3 className="text-base font-extrabold text-slate-900">Accountant</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Handle expense &amp; income vouchers, supplier and customer credit ledgers, GSTR-1/3B filings, and shift Z-Report reconciliation.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Clean Public Pharmacy Footer (No Super Admin / CEO Links) */}
      <footer className="bg-white border-t border-slate-200 py-5 px-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold text-slate-700">
            <Store className="w-4 h-4 text-[#0F6E56]" />
            <span>{brandTitle}</span>
          </div>
          <div className="flex flex-wrap items-center gap-5 font-semibold">
            <Link href="/setup/wizard" className="hover:text-[#0F6E56]">
              4-Step Store Setup
            </Link>
            <Link href="/admin/login" className="hover:text-[#0F6E56]">
              Store &amp; Staff Login
            </Link>
            <Link href="/supplier/login" className="hover:text-[#0F6E56]">
              Supplier Portal
            </Link>
            <Link href="/customer/login" className="hover:text-[#0F6E56]">
              Patient Portal
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
