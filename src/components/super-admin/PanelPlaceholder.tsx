import React from "react";
import Link from "next/link";
import { ArrowLeft, Layers } from "lucide-react";

export function PanelPlaceholder({
  title,
  moduleRef,
  description,
}: {
  title: string;
  moduleRef: string;
  description: string;
}) {
  return (
    <div className="max-w-3xl mx-auto mt-10 bg-white border border-slate-200 rounded-2xl p-8 shadow-2xs text-center space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center mx-auto">
        <Layers className="w-6 h-6" />
      </div>
      <span className="inline-block px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold uppercase">
        {moduleRef} — Pending Implementation
      </span>
      <h1 className="text-xl font-extrabold text-slate-900">{title}</h1>
      <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">{description}</p>
      <div className="pt-2">
        <Link
          href="/super-admin/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Executive Overview</span>
        </Link>
      </div>
    </div>
  );
}
