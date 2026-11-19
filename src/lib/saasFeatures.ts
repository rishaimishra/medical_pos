import { prisma } from "./prisma";

/**
 * MODULE 3.4.1 & 3.4.2: SaaS Feature Entitlement Registry, Quota Resources & 4-Tier Blueprint
 * Maps 16 canonical feature flags covering every capability across Parts 1 & 2,
 * plus 8 quantified count/storage limits (-1 = Unlimited).
 */

export type FeatureKey =
  | "posBilling"
  | "salesAndReturnsCore"
  | "bakiKhataCreditLedger"
  | "purchasesAndGrn"
  | "multiBranchManagement"
  | "supplierPortalAndGrn"
  | "patientPortalAndRxQueue"
  | "twoWayMessagingInboxes"
  | "gstAndRegulatoryReports"
  | "advancedBiAndProfitReports"
  | "excelAndCsvExports"
  | "customDiscountsAndDayEndClose"
  | "bulkMedicineImport"
  | "barcodeAndThermalLabels"
  | "expenseAndFinancialLedger"
  | "auditAndBackupCompliance";

export type QuotaResourceKey =
  | "maxBranches"
  | "maxStaffUsers"
  | "maxMedicines"
  | "maxMonthlyInvoices"
  | "maxSuppliers"
  | "maxRxStorageMb"
  | "maxCustomers"
  | "maxDiscountSchemes";

export type PlanFeatureFlags = Record<FeatureKey, boolean>;
export type PlanQuotaLimits = Record<QuotaResourceKey, number>;

export interface FeatureMeta {
  key: FeatureKey;
  label: string;
  description: string;
  category: "Core POS & Stock" | "Portals & Messaging" | "Compliance & Exports" | "Analytics & Governance";
  recommendedTier: "Starter" | "Growth" | "Enterprise";
}

export interface QuotaMeta {
  key: QuotaResourceKey;
  label: string;
  unit: string;
  description: string;
}

export const SAAS_FEATURE_REGISTRY: FeatureMeta[] = [
  {
    key: "posBilling",
    label: "Core POS Billing & FEFO Inventory",
    description: "Keyboard-driven POS terminal, FEFO batch picking, and thermal/A4 receipts.",
    category: "Core POS & Stock",
    recommendedTier: "Starter",
  },
  {
    key: "salesAndReturnsCore",
    label: "Sales History & Discount-Proportional Returns",
    description: "Invoice lookup, partial/full returns with restock/write-off handling.",
    category: "Core POS & Stock",
    recommendedTier: "Starter",
  },
  {
    key: "purchasesAndGrn",
    label: "Purchase Orders & GRN Receiving",
    description: "Vendor PO workflow and inward batch stock entry with expiry tracking.",
    category: "Core POS & Stock",
    recommendedTier: "Starter",
  },
  {
    key: "bakiKhataCreditLedger",
    label: "Baki Khata Credit & Settlement Ledger",
    description: "Customer credit limits, due tracking, and partial payment collections.",
    category: "Core POS & Stock",
    recommendedTier: "Starter",
  },
  {
    key: "multiBranchManagement",
    label: "Multi-Branch Outlets & Consolidated View",
    description: "Create/switch multiple branches with separate DL/GSTIN and cross-branch views.",
    category: "Portals & Messaging",
    recommendedTier: "Growth",
  },
  {
    key: "supplierPortalAndGrn",
    label: "Supplier Self-Service Extranet Portal",
    description: "External portal for vendors to update PO prices, ship challans & track batches.",
    category: "Portals & Messaging",
    recommendedTier: "Growth",
  },
  {
    key: "patientPortalAndRxQueue",
    label: "Customer Portal, Digital Rx Upload & Refills",
    description: "Self-serve patient invoices, Rx upload queue to POS, chronic care & portal returns.",
    category: "Portals & Messaging",
    recommendedTier: "Growth",
  },
  {
    key: "twoWayMessagingInboxes",
    label: "Two-Way Patient & Supplier Messaging Inboxes",
    description: "Admin-to-patient chat threads, supplier inbox & public vendor contact routing.",
    category: "Portals & Messaging",
    recommendedTier: "Growth",
  },
  {
    key: "gstAndRegulatoryReports",
    label: "GSTR-1 / GSTR-3B & Schedule H / H1 Register",
    description: "Statutory HSN tax breakup and controlled Schedule H/H1 prescription drug register.",
    category: "Compliance & Exports",
    recommendedTier: "Growth",
  },
  {
    key: "excelAndCsvExports",
    label: "Multi-Sheet Excel (.xlsx) & UTF-8 CSV Exports",
    description: "One-click OpenXML multi-sheet Excel workbooks and UTF-8 BOM CSV exports.",
    category: "Compliance & Exports",
    recommendedTier: "Growth",
  },
  {
    key: "bulkMedicineImport",
    label: "Bulk Medicine Catalog Import",
    description: "Upload CSV/Excel catalogs with preview validation and duplicate skipping.",
    category: "Compliance & Exports",
    recommendedTier: "Growth",
  },
  {
    key: "barcodeAndThermalLabels",
    label: "Code 128 Barcode & Thermal Label Print",
    description: "Hardware barcode scanning listener & custom 50x25mm/A4 sticker sheets.",
    category: "Compliance & Exports",
    recommendedTier: "Growth",
  },
  {
    key: "advancedBiAndProfitReports",
    label: "Admin Sales Summary, COGS P&L & Dead Stock BI",
    description: "12-month growth metrics, COGS-based margin analysis & 60/90/180d dead stock.",
    category: "Analytics & Governance",
    recommendedTier: "Growth",
  },
  {
    key: "customDiscountsAndDayEndClose",
    label: "Discount Overrides & Day-End Cash Z-Report",
    description: "Promo discount schemes, manager PIN overrides & cash denomination reconciliation.",
    category: "Analytics & Governance",
    recommendedTier: "Growth",
  },
  {
    key: "expenseAndFinancialLedger",
    label: "Operating Expense Vouchers & Party Ledger",
    description: "Track store rent/salary overheads and party-wise credit/debit ledger.",
    category: "Analytics & Governance",
    recommendedTier: "Growth",
  },
  {
    key: "auditAndBackupCompliance",
    label: "Tamper-Proof Audit Trail, Email Alerts & Backups",
    description: "Security forensic audit logs, automated expiry/low-stock emails & 1-click DB backups.",
    category: "Analytics & Governance",
    recommendedTier: "Enterprise",
  },
];

export const QUOTA_RESOURCE_REGISTRY: QuotaMeta[] = [
  { key: "maxBranches", label: "Store Branches", unit: "outlets", description: "Max outlets under one store tenant (-1 = Unlimited)" },
  { key: "maxStaffUsers", label: "Active Staff Accounts", unit: "users", description: "Max active admins, managers, pharmacists & cashiers" },
  { key: "maxMedicines", label: "Medicine Master SKUs", unit: "medicines", description: "Max catalog medicines created by the store" },
  { key: "maxMonthlyInvoices", label: "Monthly POS Invoices", unit: "bills/mo", description: "Calendar-month billing invoice quota" },
  { key: "maxSuppliers", label: "Registered Suppliers", unit: "vendors", description: "Max distributor records in vendor directory" },
  { key: "maxRxStorageMb", label: "Rx File Storage", unit: "MB", description: "Total patient prescription attachment disk quota" },
  { key: "maxCustomers", label: "Customer Directory", unit: "patients", description: "Registered patient records cap (-1 = Unlimited)" },
  { key: "maxDiscountSchemes", label: "Active Discount Schemes", unit: "promos", description: "Max promotional discount rules" },
];

export function buildEmptyFeatureFlags(defaultVal = false): PlanFeatureFlags {
  return {
    posBilling: true, // Core billing always enabled on valid plans
    salesAndReturnsCore: defaultVal,
    bakiKhataCreditLedger: defaultVal,
    purchasesAndGrn: defaultVal,
    multiBranchManagement: defaultVal,
    supplierPortalAndGrn: defaultVal,
    patientPortalAndRxQueue: defaultVal,
    twoWayMessagingInboxes: defaultVal,
    gstAndRegulatoryReports: defaultVal,
    advancedBiAndProfitReports: defaultVal,
    excelAndCsvExports: defaultVal,
    customDiscountsAndDayEndClose: defaultVal,
    bulkMedicineImport: defaultVal,
    barcodeAndThermalLabels: defaultVal,
    expenseAndFinancialLedger: defaultVal,
    auditAndBackupCompliance: defaultVal,
  };
}

export function parseFeaturesJson(raw?: string | null): PlanFeatureFlags {
  const base = buildEmptyFeatureFlags(false);
  if (!raw) return base;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") return base;
    for (const meta of SAAS_FEATURE_REGISTRY) {
      if (typeof parsed[meta.key] === "boolean") {
        base[meta.key] = parsed[meta.key];
      }
    }
    return base;
  } catch {
    return base;
  }
}

export function parseCustomLimitsJson(raw?: string | null): Partial<PlanQuotaLimits> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Partial<PlanQuotaLimits> = {};
    for (const q of QUOTA_RESOURCE_REGISTRY) {
      if (typeof parsed[q.key] === "number" && Number.isFinite(parsed[q.key])) {
        out[q.key] = Math.trunc(parsed[q.key]);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function parseCustomFeaturesJson(raw?: string | null): Partial<PlanFeatureFlags> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Partial<PlanFeatureFlags> = {};
    for (const meta of SAAS_FEATURE_REGISTRY) {
      if (typeof parsed[meta.key] === "boolean") {
        out[meta.key] = parsed[meta.key];
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function formatLimit(val: number): string {
  return val < 0 ? "Unlimited" : val.toLocaleString("en-IN");
}

const GROWTH_FEATURES: PlanFeatureFlags = {
  posBilling: true,
  salesAndReturnsCore: true,
  bakiKhataCreditLedger: true,
  purchasesAndGrn: true,
  multiBranchManagement: true,
  supplierPortalAndGrn: true,
  patientPortalAndRxQueue: true,
  twoWayMessagingInboxes: true,
  gstAndRegulatoryReports: true,
  advancedBiAndProfitReports: true,
  excelAndCsvExports: true,
  customDiscountsAndDayEndClose: true,
  bulkMedicineImport: true,
  barcodeAndThermalLabels: true,
  expenseAndFinancialLedger: true,
  auditAndBackupCompliance: false,
};

const STARTER_FEATURES: PlanFeatureFlags = {
  ...buildEmptyFeatureFlags(false),
  posBilling: true,
  salesAndReturnsCore: true,
  purchasesAndGrn: true,
  bakiKhataCreditLedger: true,
  barcodeAndThermalLabels: true,
};

const ENTERPRISE_FEATURES: PlanFeatureFlags = buildEmptyFeatureFlags(true);

export interface SeedPlanDefinition {
  code: string;
  name: string;
  tagline: string;
  description: string;
  billingCycle: "monthly" | "quarterly" | "yearly" | "lifetime";
  intervalCount: number;
  priceInr: number;
  setupFeeInr: number;
  trialDays: number;
  isPublic: boolean;
  isRecommended: boolean;
  isActive: boolean;
  sortOrder: number;
  maxBranches: number;
  maxStaffUsers: number;
  maxMedicines: number;
  maxMonthlyInvoices: number;
  maxSuppliers: number;
  maxRxStorageMb: number;
  maxCustomers: number;
  maxDiscountSchemes: number;
  features: PlanFeatureFlags;
}

export const DEFAULT_SAAS_PLANS: SeedPlanDefinition[] = [
  {
    code: "FREE_TRIAL",
    name: "14-Day Growth Trial",
    tagline: "Full Growth pharmacy preview for newly onboarded stores",
    description:
      "Auto-activated 14-day trial with Growth features enabled so clinics can test POS, portals, GST, and BI analytics.",
    billingCycle: "monthly",
    intervalCount: 1,
    priceInr: 0,
    setupFeeInr: 0,
    trialDays: 14,
    isPublic: false,
    isRecommended: false,
    isActive: true,
    sortOrder: 0,
    maxBranches: 1,
    maxStaffUsers: 5,
    maxMedicines: 2500,
    maxMonthlyInvoices: 1000,
    maxSuppliers: 50,
    maxRxStorageMb: 250,
    maxCustomers: 1000,
    maxDiscountSchemes: 10,
    features: GROWTH_FEATURES,
  },
  {
    code: "STARTER",
    name: "Starter Clinic",
    tagline: "Single-counter medical stores & neighborhood clinics",
    description:
      "Fast FEFO POS billing, inventory batches, vendor POs/GRN, and customer Baki Khata ledger for single-outlet stores.",
    billingCycle: "monthly",
    intervalCount: 1,
    priceInr: 799,
    setupFeeInr: 0,
    trialDays: 0,
    isPublic: true,
    isRecommended: false,
    isActive: true,
    sortOrder: 10,
    maxBranches: 1,
    maxStaffUsers: 3,
    maxMedicines: 2000,
    maxMonthlyInvoices: 1000,
    maxSuppliers: 25,
    maxRxStorageMb: 250,
    maxCustomers: 2000,
    maxDiscountSchemes: 5,
    features: STARTER_FEATURES,
  },
  {
    code: "GROWTH",
    name: "Growth Pharmacy",
    tagline: "Multi-branch pharmacies with Portals, GST & COGS BI",
    description:
      "Recommended plan unlocking Multi-Branch operations, Customer & Supplier Portals, GSTR-1/3B, Schedule H1, COGS P&L & Excel exports.",
    billingCycle: "monthly",
    intervalCount: 1,
    priceInr: 1999,
    setupFeeInr: 0,
    trialDays: 0,
    isPublic: true,
    isRecommended: true,
    isActive: true,
    sortOrder: 20,
    maxBranches: 3,
    maxStaffUsers: 15,
    maxMedicines: 15000,
    maxMonthlyInvoices: 10000,
    maxSuppliers: 150,
    maxRxStorageMb: 2048,
    maxCustomers: 25000,
    maxDiscountSchemes: 30,
    features: GROWTH_FEATURES,
  },
  {
    code: "ENTERPRISE",
    name: "Enterprise Chain",
    tagline: "Unlimited pharmacy chains with audit & automated backups",
    description:
      "Unlimited outlets, staff, catalog & monthly bills with 25 GB Rx storage, forensic audit trail, automated alerts, and backups.",
    billingCycle: "monthly",
    intervalCount: 1,
    priceInr: 4999,
    setupFeeInr: 0,
    trialDays: 0,
    isPublic: true,
    isRecommended: false,
    isActive: true,
    sortOrder: 30,
    maxBranches: -1,
    maxStaffUsers: -1,
    maxMedicines: -1,
    maxMonthlyInvoices: -1,
    maxSuppliers: -1,
    maxRxStorageMb: 25600,
    maxCustomers: -1,
    maxDiscountSchemes: -1,
    features: ENTERPRISE_FEATURES,
  },
];

/**
 * Idempotently creates any missing default SaaS plans (`FREE_TRIAL`, `STARTER`, `GROWTH`, `ENTERPRISE`)
 * without overwriting custom price/quota edits made by Super Admin.
 */
export async function ensureDefaultPlansSeeded(): Promise<{ createdCodes: string[]; totalPlans: number }> {
  const createdCodes: string[] = [];
  for (const def of DEFAULT_SAAS_PLANS) {
    const existing = await prisma.subscriptionPlan.findUnique({ where: { code: def.code } });
    if (!existing) {
      await prisma.subscriptionPlan.create({
        data: {
          code: def.code,
          name: def.name,
          tagline: def.tagline,
          description: def.description,
          billingCycle: def.billingCycle,
          intervalCount: def.intervalCount,
          priceInr: def.priceInr,
          setupFeeInr: def.setupFeeInr,
          trialDays: def.trialDays,
          isPublic: def.isPublic,
          isRecommended: def.isRecommended,
          isActive: def.isActive,
          sortOrder: def.sortOrder,
          razorpaySyncStatus: def.priceInr > 0 ? "pending" : "not_applicable",
          maxBranches: def.maxBranches,
          maxStaffUsers: def.maxStaffUsers,
          maxMedicines: def.maxMedicines,
          maxMonthlyInvoices: def.maxMonthlyInvoices,
          maxSuppliers: def.maxSuppliers,
          maxRxStorageMb: def.maxRxStorageMb,
          maxCustomers: def.maxCustomers,
          maxDiscountSchemes: def.maxDiscountSchemes,
          featuresJson: JSON.stringify(def.features),
        },
      });
      createdCodes.push(def.code);
    }
  }
  const totalPlans = await prisma.subscriptionPlan.count();
  return { createdCodes, totalPlans };
}
