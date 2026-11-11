/**
 * MODULE 1.4.3: Granular Role & Permission Management (RBAC)
 * Defines pre-defined roles, granular permission keys, staff page allow-lists,
 * and multi-branch access control rules.
 */

export type SystemRole = "admin" | "manager" | "pharmacist" | "cashier" | "staff" | "accountant";

export type PermissionKey =
  | "view_cost_price"
  | "manage_stock_adjustments"
  | "apply_high_discount"
  | "cancel_invoice"
  | "view_profit_reports"
  | "manage_medicines"
  | "manage_purchases"
  | "manage_customers"
  | "manage_users"
  | "manage_settings"
  | "switch_branches";

export interface RoleDefinition {
  role: SystemRole;
  label: string;
  description: string;
  defaultPermissions: PermissionKey[];
  allowedPages: string[]; // Route prefixes under /admin
  maxDiscountPercent: number;
}

/**
 * Staff Page Access Allow-List (1.5.3 & 1.4.3):
 * Staff roles are restricted to operational pages; admin-only pages are blocked unless admin.
 */
export const STAFF_ALLOWED_PAGES = [
  "/admin/dashboard",
  "/admin/pos",
  "/admin/medicines",
  "/admin/batches",
  "/admin/adjustments",
  "/admin/sales",
  "/admin/customers",
  "/admin/returns",
  "/admin/expiry",
  "/admin/purchases",
  "/admin/grn",
  "/admin/messages",
  "/admin/discounts",
];

export const ADMIN_ONLY_PAGES = [
  "/admin/users",
  "/admin/branches",
  "/admin/settings",
  "/admin/updates",
  "/admin/suppliers",
];

export const ALL_ADMIN_PAGES = [
  ...STAFF_ALLOWED_PAGES,
  ...ADMIN_ONLY_PAGES,
  "/admin/financials",
  "/admin/reports",
];

export const ROLE_MATRIX: Record<SystemRole, RoleDefinition> = {
  admin: {
    role: "admin",
    label: "Super Admin",
    description: "Full unrestricted access to all store branches, settings, users, financials, and audit logs.",
    defaultPermissions: [
      "view_cost_price",
      "manage_stock_adjustments",
      "apply_high_discount",
      "cancel_invoice",
      "view_profit_reports",
      "manage_medicines",
      "manage_purchases",
      "manage_customers",
      "manage_users",
      "manage_settings",
      "switch_branches",
    ],
    allowedPages: ALL_ADMIN_PAGES,
    maxDiscountPercent: 100,
  },
  manager: {
    role: "manager",
    label: "Store Manager",
    description: "Manages daily store operations, inventory adjustments, POs, discounts, and sales reports.",
    defaultPermissions: [
      "view_cost_price",
      "manage_stock_adjustments",
      "apply_high_discount",
      "cancel_invoice",
      "view_profit_reports",
      "manage_medicines",
      "manage_purchases",
      "manage_customers",
    ],
    allowedPages: [...STAFF_ALLOWED_PAGES, "/admin/suppliers", "/admin/reports", "/admin/financials"],
    maxDiscountPercent: 50,
  },
  pharmacist: {
    role: "pharmacist",
    label: "Pharmacist",
    description: "Handles POS billing, prescription verification, medicine catalog, batches, and GRN inwarding.",
    defaultPermissions: [
      "manage_medicines",
      "manage_purchases",
      "manage_customers",
      "manage_stock_adjustments",
    ],
    allowedPages: STAFF_ALLOWED_PAGES,
    maxDiscountPercent: 10,
  },
  cashier: {
    role: "cashier",
    label: "Cashier",
    description: "High-speed POS counter billing, customer lookup, and sales return initiation.",
    defaultPermissions: ["manage_customers"],
    allowedPages: [
      "/admin/dashboard",
      "/admin/pos",
      "/admin/sales",
      "/admin/customers",
      "/admin/returns",
      "/admin/medicines",
    ],
    maxDiscountPercent: 10,
  },
  staff: {
    role: "staff",
    label: "General Staff",
    description: "Standard staff access following the reference staff page allow-list.",
    defaultPermissions: ["manage_medicines", "manage_purchases", "manage_customers"],
    allowedPages: STAFF_ALLOWED_PAGES,
    maxDiscountPercent: 10,
  },
  accountant: {
    role: "accountant",
    label: "Accountant",
    description: "Access to financial ledgers, P&L reports, GSTR-1/3B tax summaries, cost prices, and PO bills.",
    defaultPermissions: [
      "view_cost_price",
      "view_profit_reports",
      "manage_purchases",
    ],
    allowedPages: [
      "/admin/dashboard",
      "/admin/sales",
      "/admin/returns",
      "/admin/purchases",
      "/admin/financials",
      "/admin/reports",
    ],
    maxDiscountPercent: 0,
  },
};

export interface CustomUserPermissions {
  grantedPermissions?: PermissionKey[];
  revokedPermissions?: PermissionKey[];
  allowedPages?: string[];
  maxDiscountPercent?: number;
}

/**
 * Safely parses a user's `permissions` JSON, comma-separated string, or array from DB/Session.
 */
export function parseUserPermissions(
  rawPermissions?: string | PermissionKey[] | CustomUserPermissions | null
): CustomUserPermissions {
  if (!rawPermissions) {
    return {};
  }
  if (Array.isArray(rawPermissions)) {
    return { grantedPermissions: rawPermissions };
  }
  if (typeof rawPermissions === "object") {
    return rawPermissions as CustomUserPermissions;
  }
  if (typeof rawPermissions !== "string" || !rawPermissions.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(rawPermissions);
    if (Array.isArray(parsed)) {
      return { grantedPermissions: parsed as PermissionKey[] };
    }
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as CustomUserPermissions;
    }
  } catch {
    // Fallback for legacy comma-separated permission strings
    const items = rawPermissions
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      grantedPermissions: items as PermissionKey[],
    };
  }
  return {};
}

/**
 * Resolves the effective permissions list for a user given their role and custom overrides.
 */
export function getEffectivePermissions(
  role: string,
  rawPermissions?: string | PermissionKey[] | CustomUserPermissions | null,
  branchId?: number | null
): PermissionKey[] {
  const normalizedRole = (role?.toLowerCase() as SystemRole) || "staff";
  const roleDef = ROLE_MATRIX[normalizedRole] || ROLE_MATRIX.staff;

  if (normalizedRole === "admin") {
    return ROLE_MATRIX.admin.defaultPermissions;
  }

  // If already resolved array of PermissionKey is passed directly without custom JSON object
  if (Array.isArray(rawPermissions)) {
    const directSet = new Set<PermissionKey>(rawPermissions);
    if ((branchId === null || branchId === undefined) && normalizedRole === "manager") {
      directSet.add("switch_branches");
    }
    return Array.from(directSet);
  }

  const custom = parseUserPermissions(rawPermissions);
  const set = new Set<PermissionKey>(roleDef.defaultPermissions);

  if (Array.isArray(custom.grantedPermissions)) {
    for (const p of custom.grantedPermissions) set.add(p);
  }
  if (Array.isArray(custom.revokedPermissions)) {
    for (const p of custom.revokedPermissions) set.delete(p);
  }

  // Global Manager (branchId == null) can switch across branches; branch-bound staff cannot
  if ((branchId === null || branchId === undefined) && normalizedRole === "manager") {
    set.add("switch_branches");
  } else if (branchId !== null && branchId !== undefined) {
    set.delete("switch_branches");
  }

  return Array.from(set);
}

/**
 * Resolves the effective allowed route prefixes for a user.
 */
export function getEffectiveAllowedPages(
  role: string,
  rawPermissions?: string | PermissionKey[] | CustomUserPermissions | null,
  branchId?: number | null
): string[] {
  const normalizedRole = (role?.toLowerCase() as SystemRole) || "staff";
  if (normalizedRole === "admin") {
    return ALL_ADMIN_PAGES;
  }

  const roleDef = ROLE_MATRIX[normalizedRole] || ROLE_MATRIX.staff;
  const custom = parseUserPermissions(rawPermissions);

  const pages = new Set<string>(
    Array.isArray(custom.allowedPages) && custom.allowedPages.length > 0
      ? custom.allowedPages
      : roleDef.allowedPages
  );

  // Automatically grant corresponding page routes when specific permissions are granted
  const perms = getEffectivePermissions(role, rawPermissions, branchId);
  if (perms.includes("manage_users")) pages.add("/admin/users");
  if (perms.includes("manage_settings")) pages.add("/admin/settings");
  if (perms.includes("manage_stock_adjustments")) pages.add("/admin/adjustments");
  if (perms.includes("switch_branches") && (branchId === null || branchId === undefined)) {
    pages.add("/admin/branches");
  }
  if (perms.includes("manage_purchases")) pages.add("/admin/suppliers");
  if (perms.includes("view_profit_reports")) {
    pages.add("/admin/reports");
    pages.add("/admin/financials");
  }

  return Array.from(pages);
}

/**
 * Resolves the effective maximum POS discount percentage for a user.
 */
export function getEffectiveMaxDiscount(
  role: string,
  rawPermissions?: string | PermissionKey[] | CustomUserPermissions | null
): number {
  const normalizedRole = (role?.toLowerCase() as SystemRole) || "staff";
  if (normalizedRole === "admin") return 100;

  const roleDef = ROLE_MATRIX[normalizedRole] || ROLE_MATRIX.staff;
  const custom = parseUserPermissions(rawPermissions);

  if (
    typeof custom.maxDiscountPercent === "number" &&
    custom.maxDiscountPercent >= 0 &&
    custom.maxDiscountPercent <= 100
  ) {
    return custom.maxDiscountPercent;
  }

  const effectivePerms = getEffectivePermissions(role, rawPermissions);
  if (effectivePerms.includes("apply_high_discount")) {
    return Math.max(roleDef.maxDiscountPercent, 50);
  }

  return roleDef.maxDiscountPercent;
}

/**
 * Checks whether a user has a specific granular permission.
 */
export function hasPermission(
  user:
    | {
      role: string;
      permissions?: string | PermissionKey[] | CustomUserPermissions | null;
      branchId?: number | null;
    }
    | null
    | undefined,
  permission: PermissionKey
): boolean {
  if (!user) return false;
  if (user.role?.toLowerCase() === "admin") return true;
  const effective = getEffectivePermissions(user.role, user.permissions, user.branchId);
  return effective.includes(permission);
}

/**
 * Checks whether a user can access a specific admin route path.
 */
export function canAccessPage(
  user:
    | {
      role: string;
      permissions?: string | PermissionKey[] | CustomUserPermissions | null;
      allowedPages?: string[];
    }
    | null
    | undefined,
  pathname: string
): boolean {
  if (!user) return false;
  if (pathname === "/admin/login" || pathname === "/admin") return true;

  const normalizedRole = (user.role?.toLowerCase() as SystemRole) || "staff";
  if (normalizedRole === "admin") return true;

  const allowedList =
    Array.isArray(user.allowedPages) && user.allowedPages.length > 0
      ? user.allowedPages
      : getEffectiveAllowedPages(user.role, user.permissions);

  return allowedList.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Checks whether a user is authorized to operate on a given store branchId.
 * Super Admin (`role === 'admin'`) or staff with `branchId === null` can access all branches.
 * Staff assigned to a specific `branchId` can only operate on that branch.
 */
export function canAccessBranch(
  user:
    | {
        role: string;
        branchId?: number | null;
        permissions?: string | PermissionKey[] | CustomUserPermissions | null;
      }
    | null
    | undefined,
  targetBranchId: number | null | undefined
): boolean {
  if (!user) return false;
  if (user.role?.toLowerCase() === "admin") return true;
  if (hasPermission(user as any, "switch_branches")) return true;
  if (user.branchId === null || user.branchId === undefined) return true; // Global staff
  if (targetBranchId === null || targetBranchId === undefined) return false; // Branch-bound staff cannot query "ALL branches"
  return Number(user.branchId) === Number(targetBranchId);
}
