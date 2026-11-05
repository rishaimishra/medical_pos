"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  FileText,
  Upload,
  RefreshCw,
  HelpCircle,
  User,
  Power,
  Search,
  Bell,
  Package,
  Layers,
  TrendingUp,
  Clock,
  MoreVertical,
  Loader2,
  Store,
} from "lucide-react";

interface CustomerProfile {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  ordersCount: number;
  returnsCount: number;
}

export default function CustomerDashboardPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetch("/api/auth/customer", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!json?.authenticated || !json?.customer) {
          router.replace("/customer/login");
          return;
        }
        setCustomer(json.customer);
        setLoading(false);
      })
      .catch(() => {
        router.replace("/customer/login");
      });
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/auth/customer", { method: "DELETE" });
    router.replace("/customer/login");
  };

  if (loading || !customer) {
    return (
      <div className="min-h-screen bg-[#EAF5F0] flex flex-col items-center justify-center gap-3 font-sans">
        <Loader2 className="w-8 h-8 animate-spin text-[#0F5A47]" />
        <p className="text-xs font-bold text-[#0F5A47]">
          Checking your customer account...
        </p>
      </div>
    );
  }

  const initials = customer.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "My Orders", icon: ShoppingBag },
    { label: "Prescriptions", icon: Upload },
    { label: "Medicine Bills", icon: FileText },
    { label: "Monthly Refills", icon: RefreshCw },
    { label: "Support", icon: HelpCircle },
    { label: "Profile", icon: User },
  ];

  const topOrderedMedicines = [
    { name: "Omega-3 Fish Oil", valueLabel: "₹449", percent: 92 },
    { name: "Vitamin D3 2000 IU", valueLabel: "₹269", percent: 78 },
    { name: "Cetaphil Cleanser", valueLabel: "₹345", percent: 70 },
    { name: "Vitamin C + Zinc", valueLabel: "₹235", percent: 62 },
    { name: "Himalaya Ashwagandha", valueLabel: "₹195", percent: 54 },
    { name: "Liv.52 Liver Syrup", valueLabel: "₹168", percent: 45 },
    { name: "Vicks VapoRub 50ml", valueLabel: "₹155", percent: 38 },
    { name: "Digene Acidity Gel", valueLabel: "₹145", percent: 32 },
    { name: "Shelcal 500 Calcium", valueLabel: "₹132", percent: 26 },
    { name: "Benadryl Syrup", valueLabel: "₹118", percent: 22 },
  ];

  return (
    <div className="h-screen overflow-hidden bg-[#EAF5F0] text-slate-900 flex font-sans">
      {/* Left Vertical Curved Sidebar (Customer Theme: Deep Pharmacy Emerald #0F5A47) */}
      <aside className="w-60 bg-[#0F5A47] text-white flex flex-col shrink-0 h-screen select-none sticky top-0 z-30">
        {/* Customer Avatar & Info */}
        <div className="pt-6 pb-4 px-4 flex flex-col items-center text-center shrink-0">
          <div className="w-16 h-16 rounded-full p-1 border-2 border-emerald-200/70 shadow-md flex items-center justify-center">
            <div className="w-full h-full rounded-full bg-[#EAF5F0] text-[#0F5A47] flex items-center justify-center text-lg font-extrabold">
              {initials}
            </div>
          </div>
          <h2 className="mt-2.5 text-sm font-extrabold text-white tracking-tight truncate max-w-[200px]">
            {customer.name}
          </h2>
          <p className="text-[11px] text-emerald-100/80 truncate max-w-[200px] mt-0.5">
            {customer.email || customer.phone}
          </p>
          <span className="mt-1 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-white/15 text-emerald-200">
            Customer Account
          </span>
        </div>

        {/* Curved Pill Navigation Links (Scrollable if needed) */}
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
                    ? "bg-[#EAF5F0] text-[#0F5A47] shadow-xs"
                    : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}

          <Link
            href="/"
            className="flex items-center gap-3.5 pl-5 pr-4 py-2.5 rounded-l-full text-xs font-bold text-emerald-200 hover:bg-white/10 hover:text-white transition-all"
          >
            <Store className="w-4 h-4 shrink-0" />
            <span>Visit Portal Home</span>
          </Link>
        </nav>

        {/* Bottom Logout Button (Always pinned and visible) */}
        <div className="p-4 border-t border-white/10 shrink-0 bg-[#0F5A47]">
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

      {/* Main Right Canvas (#EAF5F0) - Scrolls independently */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Top Welcome & Search Bar (Matching Screenshot 3) */}
        <header className="px-6 pt-5 pb-3 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">
            Welcome {customer.name.split(" ")[0]} !
          </h1>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white border border-emerald-200 rounded-full overflow-hidden shadow-2xs w-60 sm:w-72">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search my bills or medicines"
                className="flex-1 bg-transparent px-4 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                className="bg-[#D1EBE0] hover:bg-[#bce2d2] text-[#0F5A47] px-3.5 py-2 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </div>

            <Link
              href="/"
              className="px-4 py-2 rounded-full bg-[#0F5A47] hover:bg-[#0b4637] text-white text-xs font-bold shadow-xs transition-colors"
            >
              Order Medicines
            </Link>

            <button
              type="button"
              className="relative p-2 rounded-full bg-white border border-emerald-200 text-slate-700 hover:text-[#0F5A47] shadow-2xs cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
            </button>
          </div>
        </header>

        {/* Main Content Matching Screenshot 3 */}
        <main className="flex-1 px-6 pb-8 pt-2 space-y-5">
          {/* 1. "Over View" 4-Card White Container */}
          <section className="bg-white rounded-2xl p-5 shadow-xs">
            <h2 className="text-sm font-extrabold text-slate-800 mb-3.5">
              Over View
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-emerald-200/80 bg-white px-4 py-3.5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#DDF3E8] text-[#0F5A47] flex items-center justify-center shrink-0">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xl font-extrabold text-slate-900 leading-tight">
                    {customer.ordersCount}
                  </p>
                  <span className="text-xs font-semibold text-slate-500">
                    Total Orders
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-200/80 bg-white px-4 py-3.5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#DDF3E8] text-[#0F5A47] flex items-center justify-center shrink-0">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xl font-extrabold text-slate-900 leading-tight">
                    {customer.ordersCount}
                  </p>
                  <span className="text-xs font-semibold text-slate-500">
                    Medicine Bills
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-200/80 bg-white px-4 py-3.5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#DDF3E8] text-[#0F5A47] flex items-center justify-center shrink-0">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xl font-extrabold text-slate-900 leading-tight">
                    0
                  </p>
                  <span className="text-xs font-semibold text-slate-500">
                    Active Refills
                  </span>
                </div>
              </div>

              <div className="relative rounded-2xl border border-[#E2A99E] bg-[#FDF8F6] px-4 py-3.5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#F5DDD6] text-slate-800 flex items-center justify-center shrink-0">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xl font-extrabold text-slate-900 leading-tight">
                    {customer.returnsCount}
                  </p>
                  <span className="text-xs font-semibold text-slate-500">
                    Returns / Pending
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
                {/* Family Members / Prescriptions Card */}
                <div className="md:col-span-4 bg-white rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-slate-800">
                      My Account
                    </h3>
                    <MoreVertical className="w-4 h-4 text-slate-400" />
                  </div>

                  <div className="my-4 flex flex-col items-start gap-3">
                    <div className="w-14 h-12 rounded-xl bg-[#DDF3E8] border border-emerald-300 text-[#0F5A47] flex items-center justify-center">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xl font-extrabold text-slate-900">
                        Verified
                      </p>
                      <span className="text-xs font-semibold text-slate-500">
                        {customer.phone}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Health & Medicine Savings Donut */}
                <div className="md:col-span-8 bg-white rounded-2xl p-5 shadow-xs">
                  <h3 className="text-sm font-extrabold text-slate-800 mb-3">
                    Medicine Order Summary
                  </h3>

                  <div className="flex flex-wrap items-center justify-around gap-4 py-2">
                    <div className="relative w-36 h-36 flex items-center justify-center">
                      <svg viewBox="0 0 120 120" className="w-full h-full">
                        <path
                          d="M 56 62 L 56 14 A 48 48 0 1 0 100 80 Z"
                          fill="#0F5A47"
                        />
                        <path
                          d="M 62 56 L 106 74 A 48 48 0 0 0 62 8 Z"
                          fill="#A7D7C5"
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
                          fill="#0F5A47"
                          fontSize="11"
                          fontWeight="700"
                        >
                          32%
                        </text>
                      </svg>
                    </div>

                    <div className="space-y-3 text-xs font-bold text-slate-700">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-md bg-[#A7D7C5] inline-block" />
                        <span>Wellness & Vitamins</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-md bg-[#0F5A47] inline-block" />
                        <span>Regular Medicines</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly Medicine Spending Area Chart */}
              <div className="bg-white rounded-2xl p-5 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-extrabold text-slate-800">
                    Monthly Medicine Spend vs Savings
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
                      { y: 40, label: "4k" },
                      { y: 80, label: "3k" },
                      { y: 120, label: "2k" },
                      { y: 160, label: "1k" },
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
                      d="M 75 110 C 125 95, 150 130, 195 135 C 245 140, 275 105, 325 112 C 375 118, 405 78, 445 82 C 485 88, 520 96, 585 72"
                      fill="none"
                      stroke="#C87D55"
                      strokeWidth="2.5"
                    />
                    <path
                      d="M 75 105 C 125 122, 160 138, 195 132 C 240 125, 265 95, 315 108 C 365 120, 410 92, 460 82 C 510 72, 545 58, 585 60"
                      fill="none"
                      stroke="#0F5A47"
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

            {/* Right Tall Card: Popular Medicines */}
            <div className="lg:col-span-4 bg-white rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 mb-5">
                  Recommended Medicines
                </h3>

                <div className="space-y-4">
                  {topOrderedMedicines.map((item) => (
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
                          className="h-3.5 rounded-full bg-[#0F5A47]"
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
