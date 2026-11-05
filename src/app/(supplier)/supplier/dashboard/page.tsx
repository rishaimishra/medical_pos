"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Truck,
  ClipboardList,
  BarChart3,
  HelpCircle,
  Settings,
  Power,
  Search,
  Bell,
  Layers,
  TrendingUp,
  Clock,
  Users,
  MoreVertical,
  Loader2,
} from "lucide-react";

interface SupplierProfile {
  id: number;
  supplierId: number;
  name: string;
  companyName: string;
  username: string;
  email: string;
  phone: string | null;
  ordersCount: number;
  batchesCount: number;
}

export default function SupplierDashboardPage() {
  const router = useRouter();
  const [supplier, setSupplier] = useState<SupplierProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetch("/api/auth/supplier", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!json?.authenticated || !json?.supplier) {
          router.replace("/supplier/login");
          return;
        }
        setSupplier(json.supplier);
        setLoading(false);
      })
      .catch(() => {
        router.replace("/supplier/login");
      });
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/auth/supplier", { method: "DELETE" });
    router.replace("/supplier/login");
  };

  if (loading || !supplier) {
    return (
      <div className="min-h-screen bg-[#EEF0F8] flex flex-col items-center justify-center gap-3 font-sans">
        <Loader2 className="w-8 h-8 animate-spin text-[#283566]" />
        <p className="text-xs font-bold text-[#283566]">
          Verifying supplier portal access...
        </p>
      </div>
    );
  }

  const initials = supplier.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "Supplied Batches", icon: Package },
    { label: "Purchase Orders", icon: ClipboardList },
    { label: "Dispatches", icon: Truck },
    { label: "Reporting", icon: BarChart3 },
    { label: "Support", icon: HelpCircle },
    { label: "Settings", icon: Settings },
  ];

  const topSuppliedItems = [
    { name: "Omega-3 Fish Oil", valueLabel: "500u", percent: 90 },
    { name: "Accu-Chek Strips", valueLabel: "420u", percent: 78 },
    { name: "Vitamin D3 2000 IU", valueLabel: "380u", percent: 68 },
    { name: "Cetaphil Cleanser", valueLabel: "310u", percent: 58 },
    { name: "Vitamin C + Zinc", valueLabel: "275u", percent: 48 },
    { name: "Himalaya Ashwagandha", valueLabel: "240u", percent: 42 },
    { name: "Liv.52 Liver Syrup", valueLabel: "190u", percent: 35 },
    { name: "Vicks VapoRub 50ml", valueLabel: "160u", percent: 28 },
    { name: "Digene Acidity Gel", valueLabel: "130u", percent: 24 },
    { name: "Shelcal 500 Calcium", valueLabel: "110u", percent: 20 },
  ];

  return (
    <div className="h-screen overflow-hidden bg-[#EEF0F8] text-slate-900 flex font-sans">
      {/* Left Vertical Curved Sidebar (Supplier Theme: Deep Indigo-Navy #283566) */}
      <aside className="w-60 bg-[#283566] text-white flex flex-col shrink-0 h-screen select-none sticky top-0 z-30">
        <div className="pt-6 pb-4 px-4 flex flex-col items-center text-center shrink-0">
          <div className="w-16 h-16 rounded-full p-1 border-2 border-indigo-200/70 shadow-md flex items-center justify-center">
            <div className="w-full h-full rounded-full bg-[#EEF0F8] text-[#283566] flex items-center justify-center text-lg font-extrabold">
              {initials}
            </div>
          </div>
          <h2 className="mt-2.5 text-sm font-extrabold text-white tracking-tight truncate max-w-[200px]">
            {supplier.name}
          </h2>
          <p className="text-[11px] text-indigo-100/80 truncate max-w-[200px] mt-0.5">
            {supplier.email}
          </p>
          <span className="mt-1 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-white/15 text-indigo-200">
            {supplier.companyName}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto space-y-1 pl-4 pr-1 py-1.5 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.label;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => setActiveNav(item.label)}
                className={`w-full flex items-center gap-3.5 pl-5 pr-4 py-2.5 rounded-l-full text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#EEF0F8] text-[#283566] shadow-xs"
                    : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom Logout Button (Always pinned and visible) */}
        <div className="p-4 border-t border-white/10 shrink-0 bg-[#283566]">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Power className="w-4 h-4 text-rose-300" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Right Canvas (#EEF0F8) - Scrolls independently */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <header className="px-6 pt-5 pb-3 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">
            Welcome {supplier.name.split(" ")[0]} !
          </h1>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white border border-indigo-200 rounded-full overflow-hidden shadow-2xs w-60 sm:w-72">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search POs or batches"
                className="flex-1 bg-transparent px-4 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                className="bg-[#D8DEF2] hover:bg-[#c5cef0] text-[#283566] px-3.5 py-2 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </div>

            <Link
              href="/"
              className="px-4 py-2 rounded-full bg-[#283566] hover:bg-[#1e284f] text-white text-xs font-bold shadow-xs transition-colors"
            >
              Storefront
            </Link>

            <button
              type="button"
              className="relative p-2 rounded-full bg-white border border-indigo-200 text-slate-700 hover:text-[#283566] shadow-2xs cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
            </button>
          </div>
        </header>

        <main className="flex-1 px-6 pb-8 pt-2 space-y-5">
          {/* 1. "Over View" 4-Card White Container */}
          <section className="bg-white rounded-2xl p-5 shadow-xs">
            <h2 className="text-sm font-extrabold text-slate-800 mb-3.5">
              Over View
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-indigo-200/80 bg-white px-4 py-3.5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#E2E6F7] text-[#283566] flex items-center justify-center shrink-0">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xl font-extrabold text-slate-900 leading-tight">
                    {supplier.batchesCount}
                  </p>
                  <span className="text-xs font-semibold text-slate-500">
                    Supplied Batches
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-indigo-200/80 bg-white px-4 py-3.5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#E2E6F7] text-[#283566] flex items-center justify-center shrink-0">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xl font-extrabold text-slate-900 leading-tight">
                    {supplier.ordersCount}
                  </p>
                  <span className="text-xs font-semibold text-slate-500">
                    Purchase Orders
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-indigo-200/80 bg-white px-4 py-3.5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#E2E6F7] text-[#283566] flex items-center justify-center shrink-0">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xl font-extrabold text-slate-900 leading-tight">
                    0
                  </p>
                  <span className="text-xs font-semibold text-slate-500">
                    Dispatched Units
                  </span>
                </div>
              </div>

              <div className="relative rounded-2xl border border-[#E2A99E] bg-[#FDF8F6] px-4 py-3.5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#F5DDD6] text-slate-800 flex items-center justify-center shrink-0">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xl font-extrabold text-slate-900 leading-tight">
                    0
                  </p>
                  <span className="text-xs font-semibold text-slate-500">
                    Pending Confirmation
                  </span>
                </div>
                <span className="absolute -bottom-2.5 right-3 w-5 h-5 rounded-full bg-[#F5DDD6] border border-[#E2A99E] text-slate-800 text-[11px] font-serif font-bold flex items-center justify-center shadow-2xs">
                  i
                </span>
              </div>
            </div>
          </section>

          {/* 2. Lower Grid (Matching Screenshot 3) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                <div className="md:col-span-4 bg-white rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-slate-800">
                      Connected Stores
                    </h3>
                    <MoreVertical className="w-4 h-4 text-slate-400" />
                  </div>

                  <div className="my-4 flex flex-col items-start gap-3">
                    <div className="w-14 h-12 rounded-xl bg-[#E2E6F7] border border-indigo-300 text-[#283566] flex items-center justify-center">
                      <Users className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-2xl font-extrabold text-slate-900">1</p>
                      <span className="text-xs font-semibold text-slate-500">
                        Active Pharmacy Partners
                      </span>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-8 bg-white rounded-2xl p-5 shadow-xs">
                  <h3 className="text-sm font-extrabold text-slate-800 mb-3">
                    Supply Fulfillment Ratio
                  </h3>

                  <div className="flex flex-wrap items-center justify-around gap-4 py-2">
                    <div className="relative w-36 h-36 flex items-center justify-center">
                      <svg viewBox="0 0 120 120" className="w-full h-full">
                        <path
                          d="M 56 62 L 56 14 A 48 48 0 1 0 100 80 Z"
                          fill="#283566"
                        />
                        <path
                          d="M 62 56 L 106 74 A 48 48 0 0 0 62 8 Z"
                          fill="#B8C2E6"
                        />
                        <text
                          x="34"
                          y="78"
                          fill="#FFFFFF"
                          fontSize="11"
                          fontWeight="700"
                        >
                          68%
                        </text>
                        <text
                          x="71"
                          y="46"
                          fill="#283566"
                          fontSize="11"
                          fontWeight="700"
                        >
                          32%
                        </text>
                      </svg>
                    </div>

                    <div className="space-y-3 text-xs font-bold text-slate-700">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-md bg-[#B8C2E6] inline-block" />
                        <span>In-Transit Units</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-md bg-[#283566] inline-block" />
                        <span>Delivered Units</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-extrabold text-slate-800">
                    Dispatch Volume vs Invoices
                  </h3>
                  <span className="text-xs font-semibold text-slate-500">
                    Last 6 months
                  </span>
                </div>

                <div className="w-full overflow-x-auto">
                  <svg
                    viewBox="0 0 640 210"
                    className="w-full h-48 min-w-[480px]"
                  >
                    {[
                      { y: 40, label: "40k" },
                      { y: 80, label: "30k" },
                      { y: 120, label: "20k" },
                      { y: 160, label: "10k" },
                    ].map((row) => (
                      <g key={row.label}>
                        <text
                          x="15"
                          y={row.y + 4}
                          fontSize="11"
                          fontWeight="600"
                          fill="#475569"
                        >
                          {row.label}
                        </text>
                        <line
                          x1="55"
                          y1={row.y}
                          x2="610"
                          y2={row.y}
                          stroke="#CBD5E1"
                          strokeDasharray="3 3"
                          strokeWidth="1"
                        />
                      </g>
                    ))}

                    <path
                      d="M 75 100 C 125 90, 150 130, 195 135 C 245 140, 275 105, 325 112 C 375 118, 405 72, 445 78 C 485 84, 520 96, 585 68"
                      fill="none"
                      stroke="#C87D55"
                      strokeWidth="2.5"
                    />
                    <path
                      d="M 75 98 C 125 122, 160 138, 195 132 C 240 125, 265 95, 315 108 C 365 120, 410 92, 460 82 C 510 72, 545 56, 585 58"
                      fill="none"
                      stroke="#283566"
                      strokeWidth="2.5"
                    />

                    {[
                      { x: 75, m: "Dec" },
                      { x: 160, m: "Jan" },
                      { x: 245, m: "Feb" },
                      { x: 330, m: "Mar" },
                      { x: 415, m: "April" },
                      { x: 500, m: "May" },
                      { x: 580, m: "Jun" },
                    ].map((item) => (
                      <text
                        key={item.m}
                        x={item.x}
                        y="192"
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="700"
                        fill="#334155"
                      >
                        {item.m}
                      </text>
                    ))}
                  </svg>
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 bg-white rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 mb-5">
                  Top 10 Supplied Medicines
                </h3>

                <div className="space-y-4">
                  {topSuppliedItems.map((item) => (
                    <div
                      key={item.name}
                      className="grid grid-cols-12 items-center gap-2 text-xs"
                    >
                      <span
                        className="col-span-5 font-semibold text-slate-700 truncate"
                        title={item.name}
                      >
                        {item.name}
                      </span>
                      <div className="col-span-5 flex items-center">
                        <div
                          className="h-3.5 rounded-full bg-[#283566]"
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                      <span className="col-span-2 text-right font-bold text-slate-700 text-[11px]">
                        {item.valueLabel}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
