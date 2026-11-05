import React from "react";

export default function SupplierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <header className="h-14 border-b border-indigo-900/60 px-6 flex items-center justify-between bg-slate-950/80 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <span className="font-bold text-indigo-400 text-lg tracking-wide">
            Distributor Extranet
          </span>
          <span className="text-xs bg-indigo-950 border border-indigo-800 text-indigo-300 px-2 py-0.5 rounded font-mono">
            Supplier Portal
          </span>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

