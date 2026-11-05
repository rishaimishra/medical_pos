import {
  LayoutDashboard,
  ShoppingCart,
  Settings,
  GitBranch,
  Package,
  ClipboardList,
  BarChart3,
  Users,
  Pill,
  Layers,
  RotateCcw,
  Truck,
  HeartPulse,
  Receipt,
  MessageSquare,
  Building2,
  SlidersHorizontal,
  LucideIcon,
} from "lucide-react";
import { canAccessPage, hasPermission, PermissionKey, SystemRole } from "./rbac";

export interface MenuItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  requiredPermission?: PermissionKey;
  adminOnly?: boolean;
  status: "ready" | "in_development" | "coming_soon";
  badge?: string;
  description?: string;
}

/**
 * System Central Menu Registry
 * Defines all current and upcoming navigation modules in the Medical POS system.
 */
export const SYSTEM_MENU_REGISTRY: MenuItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/admin/dashboard",
    icon: LayoutDashboard,
    status: "ready",
    description: "Store overview, sales KPIs, and activity feed",
  },
  {
    id: "pos",
    label: "Counter POS",
    href: "/admin/pos",
    icon: ClipboardList,
    status: "ready",
    description: "Fast barcode & medicine billing counter",
  },
  {
    id: "users",
    label: "User Management",
    href: "/admin/users",
    icon: Users,
    requiredPermission: "manage_users",
    adminOnly: true,
    status: "ready",
    description: "Staff, supplier, and customer portal accounts",
  },
  {
    id: "branches",
    label: "Store Branches",
    href: "/admin/branches",
    icon: GitBranch,
    requiredPermission: "switch_branches",
    adminOnly: true,
    status: "ready",
    description: "Multi-outlet pharmacy store locations",
  },
  {
    id: "medicines",
    label: "Medicines Catalog",
    href: "/admin/medicines",
    icon: Pill,
    requiredPermission: "manage_medicines",
    status: "ready",
    description: "Master drug database, rack locations, dosage forms",
  },
  {
    id: "batches",
    label: "Batches & Expiry",
    href: "/admin/batches",
    icon: Layers,
    requiredPermission: "manage_medicines",
    status: "ready",
    description: "Multi-batch inventory and FEFO expiry tracking",
  },
  {
    id: "adjustments",
    label: "Stock Adjustments",
    href: "/admin/adjustments",
    icon: SlidersHorizontal,
    requiredPermission: "manage_stock_adjustments",
    status: "ready",
    description: "Physical audit reconciliation, write-offs & branch transfers",
  },
  {
    id: "sales",
    label: "Sales History",
    href: "/admin/sales",
    icon: Receipt,
    status: "in_development",
    description: "Invoices, payment modes, customer receipts",
  },
  {
    id: "returns",
    label: "Sales Returns",
    href: "/admin/returns",
    icon: RotateCcw,
    status: "in_development",
    description: "Medicine returns and counter refunds",
  },
  {
    id: "purchases",
    label: "Purchase Orders",
    href: "/admin/purchases",
    icon: ShoppingCart,
    requiredPermission: "manage_purchases",
    status: "in_development",
    description: "Vendor PO lifecycle, price updates, GRN inward",
  },
  {
    id: "suppliers",
    label: "Suppliers & Vendors",
    href: "/admin/suppliers",
    icon: Truck,
    requiredPermission: "manage_purchases",
    adminOnly: true,
    status: "in_development",
    description: "Distributor master and ledger accounts",
  },
  {
    id: "customers",
    label: "Patients Directory",
    href: "/admin/customers",
    icon: HeartPulse,
    requiredPermission: "manage_customers",
    status: "in_development",
    description: "Customer credit limits, prescriptions, refills",
  },
  {
    id: "messages",
    label: "Prescription Messages",
    href: "/admin/messages",
    icon: MessageSquare,
    status: "in_development",
    description: "Patient prescriptions and supplier order inbox",
  },
  {
    id: "reports",
    label: "Reports & Financials",
    href: "/admin/reports",
    icon: BarChart3,
    requiredPermission: "view_profit_reports",
    status: "in_development",
    description: "GSTR tax summaries, P&L reports, daily cash register",
  },
  {
    id: "settings",
    label: "Store Settings",
    href: "/admin/settings",
    icon: Settings,
    requiredPermission: "manage_settings",
    adminOnly: true,
    status: "ready",
    description: "DL/GSTIN setup, email gateway, DB backup & restore",
  },
];

/**
 * Returns the filtered list of menu items visible for a given authenticated user.
 * Implements strict role-based & permission-based menu visibility.
 */
export function getVisibleMenuItems(
  user: {
    role: string;
    permissions?: any;
    allowedPages?: string[];
    branchId?: number | null;
  } | null | undefined,
  options?: { includeUpcoming?: boolean }
): MenuItem[] {
  if (!user) return [];

  const role = (user.role?.toLowerCase() as SystemRole) || "staff";

  return SYSTEM_MENU_REGISTRY.filter((item) => {
    // 1. In navigation, hide in_development modules until ready unless options.includeUpcoming is true
    if (!options?.includeUpcoming && item.status !== "ready") {
      return false;
    }

    // 2. Super Admin sees all modules
    if (role === "admin") {
      return true;
    }

    // 3. If marked adminOnly, require the explicitly granted requiredPermission
    if (item.adminOnly) {
      if (!item.requiredPermission || !hasPermission(user, item.requiredPermission)) {
        return false;
      }
    }

    // 4. Check granular permission if required
    if (item.requiredPermission && !hasPermission(user, item.requiredPermission)) {
      return false;
    }

    // 5. Check page allow-list via RBAC
    if (!canAccessPage(user, item.href)) {
      return false;
    }

    return true;
  });
}
