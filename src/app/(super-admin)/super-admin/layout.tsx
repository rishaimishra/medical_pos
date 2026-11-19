"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  Building2,
  Command,
  CreditCard,
  GitBranch,
  KeyRound,
  Layers,
  LayoutDashboard,
  Loader2,
  Megaphone,
  Menu,
  Power,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "@/stores/useToastStore";

interface PlatformUserClient {
  platformUserId: number;
  name: string;
  username: string;
  email: string;
  role: "ceo" | "platform_admin" | "finance_ops" | "support_viewer";
}

interface NavGroup {
  group: string;
  items: Array<{
    id: string;
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
}

const SUPER_ADMIN_NAV: NavGroup[] = [
  {
    group: "Control Panels",
    items: [
      { id: "dashboard", label: "Executive Overview", href: "/super-admin/dashboard", icon: LayoutDashboard },
      { id: "stores", label: "Stores Directory", href: "/super-admin/stores", icon: Building2 },
      { id: "branches", label: "Branches Explorer", href: "/super-admin/branches", icon: GitBranch },
      { id: "users", label: "Global Users & Roles", href: "/super-admin/users", icon: Users },
      { id: "announcements", label: "Broadcasts", href: "/super-admin/announcements", icon: Megaphone },
    ],
  },
  {
    group: "Monetization & Billing",
    items: [
      { id: "plans", label: "Plans & Razorpay Sync", href: "/super-admin/plans", icon: Layers },
      { id: "subscriptions", label: "Store Subscriptions", href: "/super-admin/subscriptions", icon: CreditCard },
      { id: "payments", label: "Payments & Invoices", href: "/super-admin/payments", icon: Receipt },
    ],
  },
  {
    group: "Intelligence & Governance",
    items: [
      { id: "reports", label: "CEO Analytics & Reports", href: "/super-admin/reports", icon: BarChart3 },
      { id: "audit", label: "Platform Audit Logs", href: "/super-admin/audit-logs", icon: Activity },
      { id: "settings", label: "Platform Settings", href: "/super-admin/settings", icon: Settings },
    ],
  },
];

function SuperAdminLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/super-admin/login";

  const [checking, setChecking] = useState(!isLoginPage);
  const [operator, setOperator] = useState<PlatformUserClient | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Command Search (Ctrl+K)
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [cmdLoading, setCmdLoading] = useState(false);
  const [cmdResults, setCmdResults] = useState<{
    stores: any[];
    branches: any[];
    plans: any[];
    invoices: any[];
  }>({ stores: [], branches: [], plans: [], invoices: [] });
  const cmdInputRef = useRef<HTMLInputElement>(null);

  // Password Change Modal
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [currPw, setCurrPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const verifySession = useCallback(async () => {
    if (isLoginPage) {
      setChecking(false);
      return;
    }
    try {
      const res = await fetch("/api/auth/super-admin", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.authenticated && json.platformUser) {
        setOperator(json.platformUser);
        setChecking(false);
      } else {
        setOperator(null);
        router.replace("/super-admin/login");
      }
    } catch {
      router.replace("/super-admin/login");
    }
  }, [isLoginPage, router]);

  useEffect(() => {
    verifySession();
  }, [verifySession]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isLoginPage) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
      if (e.key === "Escape") {
        setCmdOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLoginPage]);

  useEffect(() => {
    if (!cmdOpen) return;
    setTimeout(() => cmdInputRef.current?.focus(), 40);
  }, [cmdOpen]);

  useEffect(() => {
    if (!cmdOpen) return;
    const q = cmdQuery.trim();
    if (!q) {
      setCmdResults({ stores: [], branches: [], plans: [], invoices: [] });
      return;
    }
    let cancelled = false;
    setCmdLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/super-admin/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!cancelled && json.success) {
          setCmdResults({
            stores: json.stores || [],
            branches: json.branches || [],
            plans: json.plans || [],
            invoices: json.invoices || [],
          });
        }
      } catch {
        // Ignore transient search error
      } finally {
        if (!cancelled) setCmdLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cmdOpen, cmdQuery]);

  const handleLogout = async () => {
    await fetch("/api/auth/super-admin", { method: "DELETE" }).catch(() => {});
    setOperator(null);
    router.replace("/super-admin/login");
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingPw) return;
    setSavingPw(true);
    try {
      const res = await fetch("/api/auth/super-admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currPw, newPassword: newPw }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success("Password updated!");
        setCurrPw("");
        setNewPw("");
        setPwModalOpen(false);
      } else {
        toast.error(json.message || "Failed to update password");
      }
    } catch {
      toast.error("Network error updating password");
    } finally {
      setSavingPw(false);
    }
  };

  if (isLoginPage) {
    return (
      <>
        <ToastProvider />
        <ConfirmDialog />
        {children}
      </>
    );
  }

  if (checking || !operator) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center text-slate-200">
        <div className="flex items-center gap-3 text-sm font-semibold">
          <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
          <span>Loading Platform Command Tower...</span>
        </div>
      </div>
    );
  }

  const initials = (operator.name || "CEO")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const renderNavLinks = () => (
    <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
      {SUPER_ADMIN_NAV.map((section) => (
        <div key={section.group}>
          <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {section.group}
          </p>
          <div className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/super-admin/dashboard" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-teal-500/15 text-teal-300 border border-teal-500/30"
                      : "text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="h-screen overflow-hidden bg-slate-50 text-slate-900 flex font-sans">
      <ToastProvider />
      <ConfirmDialog />

      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex w-64 bg-[#0F172A] text-slate-100 flex-col shrink-0 border-r border-slate-800">
        <div className="px-4 py-4 border-b border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/40 text-teal-300 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold tracking-tight text-white truncate">
              Medical POS Cloud
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-400">
              CEO Control Tower
            </p>
          </div>
        </div>

        {renderNavLinks()}

        <div className="p-3 border-t border-slate-800 space-y-2 bg-slate-950/40">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-extrabold shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">{operator.name}</p>
              <p className="text-[10px] text-teal-300 uppercase font-bold">
                {operator.role.replace("_", " ")}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setPwModalOpen(true)}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Password</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-[11px] font-semibold text-rose-300 cursor-pointer"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-72 bg-[#0F172A] text-slate-100 flex flex-col h-full border-r border-slate-800">
            <div className="px-4 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-teal-400" />
                <span className="text-sm font-extrabold text-white">CEO Control Tower</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderNavLinks()}
            <div className="p-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2 rounded-xl bg-rose-500/15 text-rose-300 text-xs font-bold flex items-center justify-center gap-2"
              >
                <Power className="w-4 h-4" />
                <span>Sign Out ({operator.name})</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="flex items-center gap-2.5 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-500 transition-colors cursor-pointer w-56 sm:w-80"
            >
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="flex-1 text-left truncate">
                Search stores, branches, GSTIN, plans...
              </span>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-500 bg-white border border-slate-200 rounded">
                <Command className="w-2.5 h-2.5" />K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
              <span>{operator.role.toUpperCase()}</span>
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>

      {/* Ctrl+K Global Command Palette Modal */}
      {cmdOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-start justify-center pt-20 px-4"
          onClick={() => setCmdOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                ref={cmdInputRef}
                type="text"
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
                placeholder="Type store name, GSTIN, branch code, plan, or SUB-INV-..."
                className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              {cmdLoading && <Loader2 className="w-4 h-4 animate-spin text-teal-600" />}
              <button
                type="button"
                onClick={() => setCmdOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ESC
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto p-3 space-y-3 text-xs">
              {!cmdQuery.trim() ? (
                <p className="text-center text-slate-400 py-6">
                  Start typing to search across all pharmacy stores, branches, plans, and invoices.
                </p>
              ) : (
                <>
                  {cmdResults.stores.length > 0 && (
                    <div>
                      <p className="px-2 pb-1 text-[10px] font-bold uppercase text-slate-400">
                        Stores ({cmdResults.stores.length})
                      </p>
                      {cmdResults.stores.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setCmdOpen(false);
                            router.push(`/super-admin/stores/${s.id}`);
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-teal-50 text-left cursor-pointer"
                        >
                          <div>
                            <p className="font-bold text-slate-800">{s.storeName || `Store #${s.id}`}</p>
                            <p className="text-[11px] text-slate-500">
                              {[s.city, s.state, s.storeGst].filter(Boolean).join(" • ") || "Tenant Store"}
                            </p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                            {s.storeStatus}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {cmdResults.branches.length > 0 && (
                    <div>
                      <p className="px-2 pb-1 text-[10px] font-bold uppercase text-slate-400">
                        Branches ({cmdResults.branches.length})
                      </p>
                      {cmdResults.branches.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            setCmdOpen(false);
                            router.push(`/super-admin/branches/${b.id}`);
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-teal-50 text-left cursor-pointer"
                        >
                          <div>
                            <p className="font-bold text-slate-800">
                              {b.name} ({b.code})
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Store: {b.store?.storeName || `#${b.storeId}`}
                            </p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              b.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {b.active ? "Active" : "Inactive"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {cmdResults.plans.length > 0 && (
                    <div>
                      <p className="px-2 pb-1 text-[10px] font-bold uppercase text-slate-400">
                        Subscription Plans
                      </p>
                      {cmdResults.plans.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setCmdOpen(false);
                            router.push("/super-admin/plans");
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-teal-50 text-left cursor-pointer"
                        >
                          <span className="font-bold text-slate-800">
                            {p.name} ({p.code})
                          </span>
                          <span className="font-mono text-teal-700 font-bold">
                            ₹{p.priceInr} / {p.billingCycle}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {cmdResults.invoices.length > 0 && (
                    <div>
                      <p className="px-2 pb-1 text-[10px] font-bold uppercase text-slate-400">
                        SaaS Invoices
                      </p>
                      {cmdResults.invoices.map((inv) => (
                        <button
                          key={inv.id}
                          type="button"
                          onClick={() => {
                            setCmdOpen(false);
                            router.push("/super-admin/payments");
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-teal-50 text-left cursor-pointer"
                        >
                          <div>
                            <p className="font-mono font-bold text-slate-800">{inv.invoiceNo}</p>
                            <p className="text-[11px] text-slate-500">{inv.store?.storeName}</p>
                          </div>
                          <span className="font-bold text-slate-700">₹{inv.totalAmount}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {!cmdLoading &&
                    cmdResults.stores.length === 0 &&
                    cmdResults.branches.length === 0 &&
                    cmdResults.plans.length === 0 &&
                    cmdResults.invoices.length === 0 && (
                      <p className="text-center text-slate-400 py-6">No matching platform records found.</p>
                    )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Password Change Modal */}
      {pwModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPwModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Change Super Admin Password</h3>
              <button
                type="button"
                onClick={() => setPwModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={currPw}
                  onChange={(e) => setCurrPw(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  New Password (min 8 chars)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-teal-600 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={savingPw}
                className="w-full py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer"
              >
                {savingPw ? "Updating..." : "Update Password"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0B1120] flex items-center justify-center text-slate-200">
          <div className="flex items-center gap-3 text-sm font-semibold">
            <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
            <span>Loading Platform Command Tower...</span>
          </div>
        </div>
      }
    >
      <SuperAdminLayoutInner>{children}</SuperAdminLayoutInner>
    </Suspense>
  );
}
