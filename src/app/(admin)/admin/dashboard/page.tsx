"use client";

import React from "react";
import {
  Package,
  Layers,
  TrendingUp,
  PackageX,
  Users,
  MoreVertical,
} from "lucide-react";
import { useBranchStore } from "@/stores/useBranchStore";

export default function AdminDashboardPage() {
  const { branches } = useBranchStore();

  // Top 10 Stores / Medicines by Sales (Uses real branches if multiple exist, otherwise top medicines/categories)
  const topSalesItems =
    branches.length > 1
      ? branches.slice(0, 10).map((b, idx) => ({
          name: b.name,
          valueLabel: "₹0",
          percent: Math.max(20, 90 - idx * 12),
        }))
      : [
          { name: "Omega-3 Fish Oil", valueLabel: "874k", percent: 95 },
          { name: "Accu-Chek Active", valueLabel: "721k", percent: 82 },
          { name: "Vitamin D3 2000 IU", valueLabel: "590k", percent: 68 },
          { name: "Cetaphil Cleanser", valueLabel: "586k", percent: 66 },
          { name: "Vitamin C + Zinc", valueLabel: "395k", percent: 48 },
          { name: "Himalaya Ashwagandha", valueLabel: "344k", percent: 42 },
          { name: "Liv.52 Liver Syrup", valueLabel: "274k", percent: 34 },
          { name: "Vicks VapoRub 50ml", valueLabel: "213k", percent: 27 },
          { name: "Digene Acidity Gel", valueLabel: "183k", percent: 22 },
          { name: "Shelcal 500 Calcium", valueLabel: "176k", percent: 20 },
        ];

  return (
    <div className="space-y-5 font-sans">
      {/* 1. Top "Over View" 4-Card White Container (Matching Screenshot 3) */}
      <section className="bg-white rounded-2xl p-5 shadow-xs">
        <h2 className="text-sm font-extrabold text-slate-800 mb-3.5">
          Over View
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Products */}
          <div className="rounded-2xl border border-emerald-200/80 bg-white px-4 py-3.5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#DDF3E8] text-[#1F4E5B] flex items-center justify-center shrink-0">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xl font-extrabold text-slate-900 leading-tight">
                0
              </p>
              <span className="text-xs font-semibold text-slate-500">
                Total Products
              </span>
            </div>
          </div>

          {/* Card 2: Orders */}
          <div className="rounded-2xl border border-emerald-200/80 bg-white px-4 py-3.5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#DDF3E8] text-[#1F4E5B] flex items-center justify-center shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xl font-extrabold text-slate-900 leading-tight">
                0
              </p>
              <span className="text-xs font-semibold text-slate-500">
                Orders
              </span>
            </div>
          </div>

          {/* Card 3: Total Stock */}
          <div className="rounded-2xl border border-emerald-200/80 bg-white px-4 py-3.5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#DDF3E8] text-[#1F4E5B] flex items-center justify-center shrink-0">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xl font-extrabold text-slate-900 leading-tight">
                0
              </p>
              <span className="text-xs font-semibold text-slate-500">
                Total Stock
              </span>
            </div>
          </div>

          {/* Card 4: Out of Stock (Rose-Peach Border + Bottom-Right 'i' Badge) */}
          <div className="relative rounded-2xl border border-[#E2A99E] bg-[#FDF8F6] px-4 py-3.5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#F5DDD6] text-slate-800 flex items-center justify-center shrink-0">
              <PackageX className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xl font-extrabold text-slate-900 leading-tight">
                0
              </p>
              <span className="text-xs font-semibold text-slate-500">
                Out of Stock
              </span>
            </div>
            <span
              className="absolute -bottom-2.5 right-3 w-5 h-5 rounded-full bg-[#F5DDD6] border border-[#E2A99E] text-slate-800 text-[11px] font-serif font-bold flex items-center justify-center shadow-2xs"
              title="Out of stock alert items"
            >
              i
            </span>
          </div>
        </div>
      </section>

      {/* 2. Lower Grid: Left/Center (8 cols) + Right Top 10 Bar Chart (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left & Center Column (8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Middle Row: "No of users" + "Inventory Values" */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* No of users (4 cols) */}
            <div className="md:col-span-4 bg-white rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-800">
                  No of users
                </h3>
                <MoreVertical className="w-4 h-4 text-slate-400" />
              </div>

              <div className="my-4 flex flex-col items-start gap-3">
                <div className="w-14 h-12 rounded-xl bg-[#D8E8EE] border border-[#9BBAC6] text-[#1F4E5B] flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-slate-900">0</p>
                  <span className="text-xs font-semibold text-slate-500">
                    Total Customers
                  </span>
                </div>
              </div>
            </div>

            {/* Inventory Values Pie / Donut Chart (8 cols) */}
            <div className="md:col-span-8 bg-white rounded-2xl p-5 shadow-xs">
              <h3 className="text-sm font-extrabold text-slate-800 mb-3">
                Inventory Values
              </h3>

              <div className="flex flex-wrap items-center justify-around gap-4 py-2">
                {/* Exploded Two-Slice Pie SVG (32% vs 68% matching Screenshot 3) */}
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <svg viewBox="0 0 120 120" className="w-full h-full">
                    {/* 68% Total Units Slice (#4E7381) */}
                    <path
                      d="M 56 62 L 56 14 A 48 48 0 1 0 100 80 Z"
                      fill="#4E7381"
                    />
                    {/* 32% Sold Units Slice (#BCCAD0 - slightly offset) */}
                    <path
                      d="M 62 56 L 106 74 A 48 48 0 0 0 62 8 Z"
                      fill="#BCCAD0"
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
                      fill="#1E293B"
                      fontSize="11"
                      fontWeight="700"
                    >
                      32%
                    </text>
                  </svg>
                </div>

                {/* Legend */}
                <div className="space-y-3 text-xs font-bold text-slate-700">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-md bg-[#BCCAD0] inline-block" />
                    <span>Sold units</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-md bg-[#4E7381] inline-block" />
                    <span>Total units</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Card: "Expense vs Profit" (Last 6 months Area Chart) */}
          <div className="bg-white rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold text-slate-800">
                Expense vs Profit
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
                <defs>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1B6B53" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#1B6B53" stopOpacity="0.02" />
                  </linearGradient>
                  <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C87D55" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#C87D55" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Horizontal Grid Lines & Y-Axis Labels */}
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

                {/* Expense Smooth Curve Area & Stroke */}
                <path
                  d="M 75 100 C 125 90, 150 130, 195 135 C 245 140, 275 105, 325 112 C 375 118, 405 72, 445 78 C 485 84, 520 96, 585 68 L 585 165 L 75 165 Z"
                  fill="url(#expenseGrad)"
                />
                <path
                  d="M 75 100 C 125 90, 150 130, 195 135 C 245 140, 275 105, 325 112 C 375 118, 405 72, 445 78 C 485 84, 520 96, 585 68"
                  fill="none"
                  stroke="#C87D55"
                  strokeWidth="2"
                />

                {/* Profit Smooth Curve Area & Stroke */}
                <path
                  d="M 75 98 C 125 122, 160 138, 195 132 C 240 125, 265 95, 315 108 C 365 120, 410 92, 460 82 C 510 72, 545 56, 585 58 L 585 165 L 75 165 Z"
                  fill="url(#profitGrad)"
                />
                <path
                  d="M 75 98 C 125 122, 160 138, 195 132 C 240 125, 265 95, 315 108 C 365 120, 410 92, 460 82 C 510 72, 545 56, 585 58"
                  fill="none"
                  stroke="#1B6B53"
                  strokeWidth="2"
                />

                {/* Highest Expense Callout Badge */}
                <line
                  x1="435"
                  y1="78"
                  x2="435"
                  y2="160"
                  stroke="#C87D55"
                  strokeDasharray="2 2"
                />
                <circle cx="435" cy="78" r="3.5" fill="#C87D55" />
                <rect
                  x="390"
                  y="48"
                  width="90"
                  height="20"
                  rx="4"
                  fill="#B86B35"
                />
                <text
                  x="435"
                  y="61"
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize="9"
                  fontWeight="700"
                >
                  Highest Expense
                </text>

                {/* Highest Profit Callout Badge */}
                <line
                  x1="575"
                  y1="58"
                  x2="575"
                  y2="160"
                  stroke="#1B6B53"
                  strokeDasharray="2 2"
                />
                <circle cx="575" cy="58" r="3.5" fill="#1B6B53" />
                <rect
                  x="530"
                  y="28"
                  width="86"
                  height="20"
                  rx="4"
                  fill="#1B6B53"
                />
                <text
                  x="573"
                  y="41"
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize="9"
                  fontWeight="700"
                >
                  Highest Profit
                </text>

                {/* X-Axis Months */}
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

        {/* Right Tall Card: "Top 10 Stores / Medicines by sales" (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 mb-5">
              {branches.length > 1
                ? "Top Stores by sales"
                : "Top 10 Medicines by sales"}
            </h3>

            <div className="space-y-4">
              {topSalesItems.map((item) => (
                <div
                  key={item.name}
                  className="grid grid-cols-12 items-center gap-2 text-xs"
                >
                  <span
                    className="col-span-4 font-semibold text-slate-700 truncate"
                    title={item.name}
                  >
                    {item.name}
                  </span>
                  <div className="col-span-6 flex items-center">
                    <div
                      className="h-3.5 rounded-full bg-[#4E7381] transition-all"
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
    </div>
  );
}
