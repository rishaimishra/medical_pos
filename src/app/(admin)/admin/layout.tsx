"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Settings,
  GitBranch,
  Lock,
  Unlock,
  LogOut,
  ShieldAlert,
  KeyRound,
  AlertTriangle,
  Package,
  ClipboardList,
  BarChart3,
  Wrench,
  Search,
  Bell,
  Power,
  Store,
  Loader2,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { useBranchStore } from "@/stores/useBranchStore";
import { useCartStore } from "@/stores/useCartStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { getVisibleMenuItems } from "@/lib/menu-registry";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "@/stores/useToastStore";
import { confirmAction } from "@/stores/useConfirmStore";

const INACTIVITY_TIMEOUT_MS = 120 * 60 * 1000; // 2 hours (120 mins) auto-lock

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { branches, activeBranch, fetchBranches, setActiveBranch, clearBranches } =
    useBranchStore();
  const { items: cartItems, clearCart } = useCartStore();
  const {
    user,
    isAuthenticated,
    setupDone,
    isLocked,
    loading,
    checkSession,
    lockScreen,
    unlockScreen,
    logout,
    touchActivity,
    canAccessPage,
    hasPermission,
  } = useAuthStore();

  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Mobile menu & notifications state (Module 2.1.3)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Close mobile drawer on route navigation
  useEffect(() => {
    setMobileMenuOpen(false);
    setNotificationsOpen(false);
  }, [pathname]);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/admin/notifications", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.notifications)) {
          setNotifications(data.notifications);
          setUnreadCount(data.totalCount || 0);
        }
      }
    } catch {
      // ignore network errors in polling
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 60000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  // 1. Check session & setup status on mount
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // 2. Enforce strict route protection:
  //    - If not signed in (!isAuthenticated) and not on /admin/login -> redirect to /admin/login
  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated && pathname !== "/admin/login") {
      clearBranches();
      router.replace("/admin/login");
      return;
    }

    if (isAuthenticated) {
      fetchBranches(user?.branchId);
    }
  }, [loading, isAuthenticated, pathname, router, fetchBranches, clearBranches, user?.branchId]);

  // 3. Keep staff locked to their assigned branch UNLESS they have permission to switch branches
  useEffect(() => {
    if (
      user &&
      user.role !== "admin" &&
      !hasPermission("switch_branches") &&
      user.branchId &&
      activeBranch?.id !== user.branchId &&
      branches.some((b) => b.id === user.branchId)
    ) {
      setActiveBranch(user.branchId);
    }
  }, [user, activeBranch, branches, setActiveBranch, hasPermission]);

  // 4. Auto-lock screen after 2 hours idle or Alt+L shortcut
  useEffect(() => {
    if (!isAuthenticated || pathname === "/admin/login") return;

    const handleActivity = () => {
      if (!useAuthStore.getState().isLocked) {
        touchActivity();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        lockScreen("manual_shortcut_alt_l");
        return;
      }
      handleActivity();
    };

    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("mousedown", handleActivity, { passive: true });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("touchstart", handleActivity, { passive: true });

    const interval = setInterval(() => {
      const state = useAuthStore.getState();
      if (!state.isAuthenticated || state.isLocked) return;
      const idleMs = Date.now() - state.lastActivityAt;
      if (idleMs >= INACTIVITY_TIMEOUT_MS) {
        state.lockScreen("auto_lock_2h_inactivity");
      }
    }, 15000);

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("touchstart", handleActivity);
      clearInterval(interval);
    };
  }, [isAuthenticated, pathname, touchActivity, lockScreen]);

  // Render Login Page standalone (no dashboard sidebar or navbar)
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  // Strictly block rendering any protected UI until session check passes
  if (loading || !isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-[#EAF2F4] flex flex-col items-center justify-center gap-3 font-sans">
        <Loader2 className="w-8 h-8 animate-spin text-[#1F4E5B]" />
        <p className="text-xs font-bold text-[#1F4E5B]">
          Verifying store access...
        </p>
      </div>
    );
  }

  const handleBranchSwitch = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextBranchId = Number(e.target.value);
    if (!nextBranchId || nextBranchId === activeBranch?.id) return;

    if (!canSwitchBranch) {
      toast.warning(
        `Your account (${user?.username}) does not have permission to switch branches. You are restricted to your assigned store.`
      );
      return;
    }

    if (cartItems.length > 0) {
      const confirmed = await confirmAction({
        title: "Switch Active Store Branch?",
        message: `You have ${cartItems.length} medicine(s) in your billing cart. Switching to another store branch will clear the current cart. Do you want to continue?`,
        confirmText: "Clear Cart & Switch",
        cancelText: "Keep Cart",
        type: "warning",
      });
      if (!confirmed) return;
      clearCart();
    }

    setActiveBranch(nextBranchId);
    toast.info("Active store branch updated.");
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockPassword || unlocking) return;
    setUnlockError(null);
    setUnlocking(true);

    const res = await unlockScreen(unlockPassword);
    setUnlocking(false);

    if (res.success) {
      setUnlockPassword("");
      setUnlockError(null);
    } else {
      setUnlockError(res.message || "Wrong password. Please try again.");
    }
  };

  const handleLogout = async () => {
    clearBranches();
    await logout();
    router.replace("/admin/login");
  };

  const activeBranches = branches.filter((b) => b.active || b.isMain);
  const canSwitchBranch = Boolean(
    user && (user.role === "admin" || hasPermission("switch_branches"))
  );
  const isBranchLockedForUser = !canSwitchBranch;
  const pageAllowed = pathname ? canAccessPage(pathname) : true;

  const menuItems = getVisibleMenuItems(user);

  const userInitials = (user.name || user.username || "U")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="h-screen overflow-hidden bg-[#EAF2F4] text-slate-900 flex font-sans relative">
      {/* Screen Lock Popup (Keeps Billing Cart Safe) */}
      {isLocked && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                <Lock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900">
                  Counter Screen is Locked
                </h2>
                <p className="text-xs text-slate-500">
                  Signed in as <strong>{user.name || user.username}</strong> ({user.role})
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#EAF2F4] border border-slate-200 text-xs text-slate-700 flex items-center justify-between">
              <span>Current Billing Cart:</span>
              <span className="font-bold text-[#1F4E5B]">
                {cartItems.length} item(s) kept safe
              </span>
            </div>

            {unlockError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{unlockError}</span>
              </div>
            )}

            <form onSubmit={handleUnlockSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Enter Your Password to Continue
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    autoFocus
                    value={unlockPassword}
                    onChange={(e) => setUnlockPassword(e.target.value)}
                    placeholder="Enter your password..."
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#1F4E5B] rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="submit"
                  disabled={unlocking}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>{unlocking ? "Checking..." : "Unlock Screen"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="py-2.5 px-3.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Change User</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Desktop Left Vertical Curved Sidebar (Deep Slate-Teal #1F4E5B) */}
      <aside className="hidden lg:flex w-60 bg-[#1F4E5B] text-white flex-col shrink-0 h-screen select-none sticky top-0 z-30">
        {/* User Profile Avatar & Info at Top */}
        <div className="pt-6 pb-4 px-4 flex flex-col items-center text-center shrink-0">
          <div className="w-16 h-16 rounded-full p-1 border-2 border-white/60 shadow-md flex items-center justify-center">
            <div className="w-full h-full rounded-full bg-[#EAF2F4] text-[#1F4E5B] flex items-center justify-center text-lg font-extrabold">
              {userInitials}
            </div>
          </div>
          <h2 className="mt-2.5 text-sm font-extrabold text-white tracking-tight truncate max-w-[200px]">
            {user.name || user.username}
          </h2>
          <p className="text-[11px] text-slate-200/80 truncate max-w-[200px] mt-0.5">
            {user.email}
          </p>
          <span className="mt-1 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-white/15 text-emerald-200">
            {user.role}
          </span>
        </div>

        {/* Curved Pill Navigation Links */}
        <nav className="flex-1 overflow-y-auto space-y-1 pl-4 pr-1 py-1.5 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent]">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin/dashboard" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center justify-between pl-5 pr-4 py-2.5 rounded-l-full text-xs font-bold transition-all ${
                  isActive
                    ? "bg-[#EAF2F4] text-[#1F4E5B] shadow-xs"
                    : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-full font-extrabold ${
                      isActive ? "bg-[#1F4E5B] text-white" : "bg-white/15 text-emerald-200"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Logout Button */}
        <div className="p-4 border-t border-white/10 shrink-0 bg-[#1F4E5B]">
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

      {/* Mobile Drawer Sidebar + Backdrop Overlay (Module 2.1.3) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs animate-fadeIn"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-72 bg-[#1F4E5B] text-white flex flex-col z-50 shadow-2xl animate-scaleUp">
            <div className="p-4 flex items-center justify-between border-b border-white/10">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Store Menu</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="pt-4 pb-3 px-4 flex flex-col items-center text-center shrink-0 border-b border-white/10">
              <div className="w-14 h-14 rounded-full p-1 border-2 border-white/60 flex items-center justify-center">
                <div className="w-full h-full rounded-full bg-[#EAF2F4] text-[#1F4E5B] flex items-center justify-center text-base font-extrabold">
                  {userInitials}
                </div>
              </div>
              <h2 className="mt-2 text-sm font-extrabold text-white truncate max-w-[220px]">
                {user.name || user.username}
              </h2>
              <span className="mt-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/15 text-emerald-200">
                {user.role}
              </span>
            </div>

            <nav className="flex-1 overflow-y-auto space-y-1 p-3 [scrollbar-width:thin]">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/admin/dashboard" && pathname?.startsWith(item.href));
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? "bg-[#EAF2F4] text-[#1F4E5B] shadow-xs"
                        : "text-white/85 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-full font-extrabold ${
                          isActive ? "bg-[#1F4E5B] text-white" : "bg-white/15 text-emerald-200"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t border-white/10 shrink-0 bg-[#1F4E5B]">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Power className="w-4 h-4 text-rose-300" />
                <span>Logout</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Right Canvas (#EAF2F4) */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Top Welcome & Search Bar */}
        <header className="px-4 sm:px-6 pt-5 pb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:text-[#1F4E5B] shadow-2xs cursor-pointer"
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight">
              Welcome {(user.name || user.username).split(" ")[0]} !
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {/* Search Pill */}
            <div className="flex items-center bg-white border border-slate-300 rounded-full overflow-hidden shadow-2xs w-48 sm:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search"
                className="flex-1 bg-transparent px-3.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                className="bg-[#D5E3E8] hover:bg-[#c2d6dd] text-[#1F4E5B] px-3 py-2 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Real Authenticated Store Branch Selector / Locked Pill */}
            {activeBranches.length > 0 &&
              (canSwitchBranch ? (
                <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-full px-3.5 py-1.5 text-xs shadow-2xs hover:border-[#1F4E5B] transition-colors">
                  <GitBranch className="w-3.5 h-3.5 text-[#1F4E5B]" />
                  <select
                    value={activeBranch?.id || ""}
                    onChange={handleBranchSwitch}
                    className="bg-transparent text-[#1F4E5B] font-bold focus:outline-none cursor-pointer text-xs"
                    title="Switch active store branch"
                  >
                    {activeBranches.map((branch) => (
                      <option key={branch.id} value={branch.id} className="bg-white text-slate-800">
                        {branch.name} ({branch.code})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div
                  className="flex items-center gap-1.5 bg-white/90 border border-slate-200 rounded-full px-3.5 py-1.5 text-xs shadow-2xs text-[#1F4E5B] font-bold cursor-default select-none"
                  title={`Assigned Store: ${activeBranch?.name || "Your Outlet"} (Branch locked to your staff credentials)`}
                >
                  <GitBranch className="w-3.5 h-3.5 text-[#1F4E5B]" />
                  <span className="truncate max-w-[150px]">{activeBranch?.name || "Assigned Branch"}</span>
                  <span className="text-[10px] text-slate-400 font-normal">({activeBranch?.code || "Branch"})</span>
                  <Lock className="w-3 h-3 text-slate-400 ml-0.5" />
                </div>
              ))}

            {/* Toggle / Lock Pill */}
            <button
              type="button"
              onClick={() => lockScreen("manual_header_button")}
              title="Lock Counter Screen (Alt+L)"
              className="flex items-center gap-2 bg-[#1F4E5B] text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-xs hover:bg-[#163a44] transition-colors cursor-pointer"
            >
              <span className="w-3.5 h-3.5 rounded-full bg-[#EAF2F4] inline-block" />
              <Lock className="w-3.5 h-3.5" />
            </button>

            {/* Notification Bell Dropdown (Module 2.1.3) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative p-2 rounded-full bg-white border border-slate-200 text-slate-700 hover:text-[#1F4E5B] shadow-2xs cursor-pointer transition-colors"
                title="Store Alerts"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-extrabold flex items-center justify-center animate-pulse">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setNotificationsOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-3xl shadow-2xl z-50 p-4 space-y-3 animate-scaleUp">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-[#1F4E5B]" />
                        <h3 className="text-xs font-extrabold text-slate-900">
                          Store Notifications
                        </h3>
                        {unreadCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-extrabold">
                            {unreadCount} New
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNotifications([]);
                          setUnreadCount(0);
                        }}
                        className="text-[11px] font-bold text-slate-500 hover:text-[#1F4E5B] transition-colors cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>

                    <div className="max-h-72 overflow-y-auto space-y-2 [scrollbar-width:thin]">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          No new alerts. All systems normal.
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <Link
                            key={notif.id}
                            href={notif.href}
                            onClick={() => setNotificationsOpen(false)}
                            className="flex items-start gap-2.5 p-2.5 rounded-2xl hover:bg-slate-50 border border-slate-100 transition-colors block"
                          >
                            <div
                              className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                                notif.severity === "danger"
                                  ? "bg-rose-500"
                                  : notif.severity === "warning"
                                  ? "bg-amber-500"
                                  : "bg-cyan-500"
                              }`}
                            />
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-bold text-slate-800 leading-tight">
                                {notif.title}
                              </h4>
                              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                {notif.message}
                              </p>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 px-4 sm:px-6 pb-8 pt-2">
          {!pageAllowed ? (
            <div className="max-w-xl mx-auto mt-12 bg-white border border-rose-200 rounded-3xl p-8 text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto">
                <ShieldAlert className="w-6 h-6 text-rose-600" />
              </div>
              <h2 className="text-lg font-extrabold text-slate-900">
                Page Restricted for Your Account
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your account role (<strong className="uppercase text-[#1F4E5B]">{user.role}</strong>) does not have permission to open this page.
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Link
                  href="/admin/dashboard"
                  className="px-5 py-2.5 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold transition-colors"
                >
                  Go to Dashboard
                </Link>
                <Link
                  href="/admin/pos"
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
                >
                  Open Billing Counter
                </Link>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      {/* Global Shared Providers (Module 2.1.2) */}
      <ToastProvider />
      <ConfirmDialog />
    </div>
  );
}
