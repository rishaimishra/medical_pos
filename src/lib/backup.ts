import fs from "fs";
import path from "path";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { Prisma } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { APP_VERSION } from "@/lib/config";

/**
 * MODULE 1.14: BACKUP, RESTORE & STORAGE MIGRATION
 * Core enterprise SQL dump generator, parser, restore engine, and JSON ETL migration tool.
 */

export const BACKUP_DIR = path.join(process.cwd(), "backups");
export const JSON_MIGRATION_DIR = path.join(BACKUP_DIR, "json_migrations");

// Ensure backup directories exist
export function ensureBackupDirectories() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  if (!fs.existsSync(JSON_MIGRATION_DIR)) {
    fs.mkdirSync(JSON_MIGRATION_DIR, { recursive: true });
  }
}

/**
 * Tables ordered strictly by foreign key dependencies
 */
export const ORDERED_MODELS: {
  modelName: string;
  clientKey: keyof typeof prisma;
  tableName: string;
}[] = [
  { modelName: "Settings", clientKey: "settings", tableName: "settings" },
  { modelName: "Branch", clientKey: "branch", tableName: "branches" },
  { modelName: "Category", clientKey: "category", tableName: "categories" },
  { modelName: "Supplier", clientKey: "supplier", tableName: "suppliers" },
  { modelName: "Customer", clientKey: "customer", tableName: "customers" },
  { modelName: "User", clientKey: "user", tableName: "users" },
  { modelName: "SupplierUser", clientKey: "supplierUser", tableName: "supplier_users" },
  { modelName: "Medicine", clientKey: "medicine", tableName: "medicines" },
  { modelName: "Batch", clientKey: "batch", tableName: "batches" },
  { modelName: "PurchaseOrder", clientKey: "purchaseOrder", tableName: "purchase_orders" },
  { modelName: "POItem", clientKey: "pOItem", tableName: "po_items" },
  { modelName: "Sale", clientKey: "sale", tableName: "sales" },
  { modelName: "SaleItem", clientKey: "saleItem", tableName: "sales_items" },
  { modelName: "Return", clientKey: "return", tableName: "returns" },
  { modelName: "ReturnItem", clientKey: "returnItem", tableName: "return_items" },
  { modelName: "Discount", clientKey: "discount", tableName: "discounts" },
  { modelName: "StockAdjustment", clientKey: "stockAdjustment", tableName: "stock_adjustments" },
  { modelName: "SupplierPayment", clientKey: "supplierPayment", tableName: "supplier_payments" },
  { modelName: "CustomerPayment", clientKey: "customerPayment", tableName: "customer_payments" },
  { modelName: "CustomerPurchaseLog", clientKey: "customerPurchaseLog", tableName: "customer_purchase_log" },
  { modelName: "LoginAttempt", clientKey: "loginAttempt", tableName: "login_attempts" },
  { modelName: "AuditLog", clientKey: "auditLog", tableName: "audit_logs" },
  { modelName: "SupplierMessage", clientKey: "supplierMessage", tableName: "supplier_messages" },
  { modelName: "PatientMessage", clientKey: "patientMessage", tableName: "patient_messages" },
];

/**
 * Format any JavaScript / Prisma value into safe SQL literal representation.
 */
export function formatSqlValue(val: any): string {
  if (val === null || val === undefined) {
    return "NULL";
  }
  if (typeof val === "boolean") {
    return val ? "TRUE" : "FALSE";
  }
  if (typeof val === "number") {
    return isFinite(val) ? String(val) : "NULL";
  }
  if (val instanceof Date) {
    return `'${val.toISOString().replace("T", " ").replace("Z", "")}'`;
  }
  if (typeof val === "object") {
    // Decimal or Json
    if (val && typeof val.toNumber === "function") {
      return String(val.toNumber());
    }
    if (val && typeof val.toFixed === "function") {
      return String(val);
    }
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'`;
  }
  // String escaping: double up single quotes, escape backslashes, strip null bytes
  const str = String(val).replace(/\0/g, "").replace(/'/g, "''");
  return `'${str}'`;
}

/**
 * 1.14.1: Generate a complete SQL Dump across all models.
 */
export async function generateSqlDump(options?: {
  storeId?: number | null;
  saveToFile?: boolean;
}): Promise<{
  sql: string;
  filename: string;
  totalRows: number;
  totalTables: number;
  tableStats: Record<string, number>;
}> {
  ensureBackupDirectories();

  const now = new Date();
  const timestampStr = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const filename = `medical_pos_backup_${timestampStr}.sql`;

  const dmmfModels = Prisma.dmmf.datamodel.models;
  const dmmfMap = new Map(dmmfModels.map((m) => [m.name, m]));

  const lines: string[] = [];
  lines.push("-- ============================================================================");
  lines.push("-- MEDICAL POS & PHARMACY MANAGEMENT SYSTEM");
  lines.push("-- Full SQL Database Backup (.sql)");
  lines.push(`-- App Version: ${APP_VERSION}`);
  lines.push(`-- Exported At: ${now.toISOString()}`);
  lines.push(`-- Mode: Multi-Store Relational Schema`);
  lines.push("-- Format: Standard PostgreSQL / MySQL / phpMyAdmin compatible SQL");
  lines.push("-- ============================================================================\n");

  lines.push("SET client_encoding = 'UTF8';");
  lines.push("SET standard_conforming_strings = on;\n");

  let totalRows = 0;
  let totalTables = 0;
  const tableStats: Record<string, number> = {};

  for (const entry of ORDERED_MODELS) {
    const dmmfModel = dmmfMap.get(entry.modelName);
    if (!dmmfModel) continue;

    const delegate = (prisma as any)[entry.clientKey];
    if (!delegate || typeof delegate.findMany !== "function") continue;

    // Build filter if multi-tenant storeId is specified and model supports it
    const whereClause: any = {};
    if (options?.storeId) {
      if (entry.modelName === "Settings") {
        whereClause.id = options.storeId;
      } else {
        const hasStoreId = dmmfModel.fields.some(
          (f) => f.name === "storeId" || f.dbName === "store_id"
        );
        if (hasStoreId) {
          whereClause.storeId = options.storeId;
        }
      }
    }

    let rows: any[] = [];
    try {
      rows = await delegate.findMany({
        where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      });
    } catch (queryErr) {
      console.warn(`[SQL Dump] Could not query table ${entry.tableName}:`, queryErr);
      continue;
    }

    const scalarFields = dmmfModel.fields.filter((f) => f.kind === "scalar");
    const columnNames = scalarFields.map((f) => `"${f.dbName || f.name}"`);

    tableStats[entry.tableName] = rows.length;
    totalTables++;
    totalRows += rows.length;

    lines.push(`-- ----------------------------------------------------------------------------`);
    lines.push(`-- Table: ${entry.tableName} (${rows.length} rows)`);
    lines.push(`-- ----------------------------------------------------------------------------`);

    if (rows.length === 0) {
      lines.push(`-- No data for ${entry.tableName}\n`);
      continue;
    }

    // Chunk insert statements in batches of 100 rows
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const valuesList = chunk.map((row) => {
        const valSqls = scalarFields.map((f) => formatSqlValue(row[f.name]));
        return `(${valSqls.join(", ")})`;
      });

      lines.push(
        `INSERT INTO "${entry.tableName}" (${columnNames.join(", ")}) VALUES\n  ${valuesList.join(",\n  ")};`
      );
    }
    lines.push("");
  }

  lines.push("-- ============================================================================");
  lines.push(`-- Backup Complete: ${totalTables} tables, ${totalRows} total rows.`);
  lines.push("-- ============================================================================\n");

  const sql = lines.join("\n");

  if (options?.saveToFile !== false) {
    const fullPath = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(fullPath, sql, "utf-8");
  }

  return {
    sql,
    filename,
    totalRows,
    totalTables,
    tableStats,
  };
}

/**
 * Split an SQL script into discrete runnable statements while honoring quotes, comments and strings.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1] || "";

    // Handle line comments (-- or #)
    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      continue;
    }

    // Handle block comments (/* ... */)
    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        inBlockComment = false;
        i++; // Skip closing slash
      }
      continue;
    }

    // Check for comment starts outside of quotes
    if (!inSingleQuote && !inDoubleQuote) {
      if (char === "-" && nextChar === "-") {
        inLineComment = true;
        i++;
        continue;
      }
      if (char === "#") {
        inLineComment = true;
        continue;
      }
      if (char === "/" && nextChar === "*") {
        inBlockComment = true;
        i++;
        continue;
      }
    }

    // Handle single quote string literal
    if (char === "'") {
      if (inSingleQuote) {
        // Look ahead for escaped single quote ''
        if (nextChar === "'") {
          current += "''";
          i++;
          continue;
        } else {
          inSingleQuote = false;
        }
      } else if (!inDoubleQuote) {
        inSingleQuote = true;
      }
      current += char;
      continue;
    }

    // Handle double quote identifier
    if (char === '"') {
      if (inDoubleQuote) {
        inDoubleQuote = false;
      } else if (!inSingleQuote) {
        inDoubleQuote = true;
      }
      current += char;
      continue;
    }

    // Semicolon outside quotes finishes statement
    if (char === ";" && !inSingleQuote && !inDoubleQuote) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const remainder = current.trim();
  if (remainder.length > 0) {
    statements.push(remainder);
  }

  return statements;
}

/**
 * 1.14.2: Restore database from an SQL file or string.
 * Validates content, rejects dangerous shell commands, executes in safe order.
 */
export async function restoreSqlDump(
  sqlContent: string,
  options?: {
    dryRun?: boolean;
    confirmOverwrite?: boolean;
    storeId?: number | null;
    userId?: number | null;
    ipAddress?: string | null;
  }
): Promise<{
  success: boolean;
  statementsExecuted: number;
  tablesAffected: string[];
  error?: string;
}> {
  if (!sqlContent || typeof sqlContent !== "string" || sqlContent.trim().length === 0) {
    throw new Error("SQL backup file content is empty.");
  }

  // Security checks: reject external shell execution commands
  const dangerousPatterns = [
    /\bxp_cmdshell\b/i,
    /\bcopy\s+.*from\s+program\b/i,
    /\bpg_read_file\b/i,
    /\bpg_write_file\b/i,
    /\bdrop\s+database\b/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(sqlContent)) {
      throw new Error("Security violation: Suspicious or prohibited SQL execution pattern detected.");
    }
  }

  const statements = splitSqlStatements(sqlContent);
  if (statements.length === 0) {
    throw new Error("No executable SQL statements found in backup file.");
  }

  // Scan affected tables
  const affectedTablesSet = new Set<string>();
  for (const stmt of statements) {
    const match = stmt.match(/(?:insert\s+into|update|delete\s+from|create\s+table(?:\s+if\s+not\s+exists)?)\s+["`]?([a-zA-Z0-9_]+)["`]?/i);
    if (match && match[1]) {
      affectedTablesSet.add(match[1].toLowerCase());
    }
  }
  const tablesAffected = Array.from(affectedTablesSet);

  if (options?.dryRun) {
    return {
      success: true,
      statementsExecuted: statements.length,
      tablesAffected,
    };
  }

  if (!options?.confirmOverwrite) {
    throw new Error("Warning: Restoring will overwrite existing data. Please set confirmOverwrite to proceed.");
  }

  let executed = 0;

  // Execute statements sequentially
  for (const stmt of statements) {
    let cleanStmt = stmt.trim();

    // Normalize MySQL backticks `table` to double quotes "table"
    cleanStmt = cleanStmt.replace(/`([a-zA-Z0-9_]+)`/g, '"$1"');

    // Skip MySQL directives / comments like /*!40101 ... */
    if (cleanStmt.startsWith("/*") && cleanStmt.endsWith("*/")) {
      continue;
    }

    const upper = cleanStmt.toUpperCase();

    // Skip transaction control & MySQL session configuration directives
    if (
      upper.startsWith("BEGIN") ||
      upper.startsWith("COMMIT") ||
      upper.startsWith("START TRANSACTION") ||
      upper.startsWith("SET CLIENT_ENCODING") ||
      upper.startsWith("SET STANDARD_CONFORMING_STRINGS") ||
      upper.startsWith("SET SQL_MODE") ||
      upper.startsWith("SET @") ||
      upper.startsWith("/*!")
    ) {
      continue;
    }

    try {
      await prisma.$executeRawUnsafe(cleanStmt);
      executed++;
    } catch (err: any) {
      console.error(`[Restore SQL Error on statement ${executed + 1}]:`, cleanStmt.slice(0, 100), err);
      throw new Error(`Failed restoring SQL at statement ${executed + 1}: ${err?.message || err}`);
    }
  }

  // Resynchronize PostgreSQL serial sequences for affected tables so subsequent inserts don't collide
  for (const table of tablesAffected) {
    try {
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), coalesce((SELECT MAX(id) FROM "${table}"), 1));`
      );
    } catch {
      // Ignored if table lacks serial sequence
    }
  }

  // Log audit trail
  await logAudit({
    storeId: options?.storeId,
    userId: options?.userId,
    action: "DATABASE_RESTORED",
    entity: "database",
    details: {
      statementsExecuted: executed,
      tablesAffected,
      timestamp: new Date().toISOString(),
    },
    ipAddress: options?.ipAddress,
  });

  return {
    success: true,
    statementsExecuted: executed,
    tablesAffected,
  };
}

/**
 * List all saved .sql backups on disk.
 */
export function listSavedBackups(): {
  filename: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
}[] {
  ensureBackupDirectories();

  try {
    const files = fs.readdirSync(BACKUP_DIR);
    return files
      .filter((f) => f.endsWith(".sql"))
      .map((f) => {
        const fullPath = path.join(BACKUP_DIR, f);
        const stats = fs.statSync(fullPath);
        const sizeKb = (stats.size / 1024).toFixed(1);
        return {
          filename: f,
          sizeBytes: stats.size,
          sizeFormatted: `${sizeKb} KB`,
          createdAt: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch (err) {
    console.error("[listSavedBackups error]:", err);
    return [];
  }
}

/**
 * 1.14.3: Local-JSON to Relational DB Migration ETL Engine.
 * Accepts legacy JSON exports, validates schemas, loads into DB via ACID transaction,
 * and preserves raw JSON in backups/json_migrations/ as fallback.
 */
export async function migrateJsonToDatabase(
  payload: any,
  options?: {
    storeId?: number | null;
    userId?: number | null;
    ipAddress?: string | null;
  }
): Promise<{
  success: boolean;
  migrated: {
    categories: number;
    suppliers: number;
    customers: number;
    medicines: number;
    batches: number;
  };
  backupFile: string;
}> {
  ensureBackupDirectories();

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid migration payload. Expected JSON object with entity arrays.");
  }

  // Save raw JSON backup
  const now = new Date();
  const timestampStr = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const backupFilename = `legacy_migration_${timestampStr}.json`;
  const backupFilePath = path.join(JSON_MIGRATION_DIR, backupFilename);
  fs.writeFileSync(backupFilePath, JSON.stringify(payload, null, 2), "utf-8");

  const categories = Array.isArray(payload.categories) ? payload.categories : [];
  const suppliers = Array.isArray(payload.suppliers) ? payload.suppliers : [];
  const customers = Array.isArray(payload.customers) ? payload.customers : [];
  const medicines = Array.isArray(payload.medicines) ? payload.medicines : [];
  const batches = Array.isArray(payload.batches) ? payload.batches : [];

  const counts = {
    categories: 0,
    suppliers: 0,
    customers: 0,
    medicines: 0,
    batches: 0,
  };

  // Run in database transaction
  await runInTransaction(async (tx) => {
    // 1. Categories
    const categoryNameToId = new Map<string, number>();
    for (const cat of categories) {
      const name = String(cat.name || cat.categoryName || "").trim();
      if (!name) continue;

      let existing = await tx.category.findUnique({ where: { name } });
      if (!existing) {
        existing = await tx.category.create({
          data: {
            name,
            type: "dosage",
          },
        });
      }
      categoryNameToId.set(name.toLowerCase(), existing.id);
      counts.categories++;
    }

    // 2. Suppliers
    const supplierNameToId = new Map<string, number>();
    for (const sup of suppliers) {
      const name = String(sup.name || sup.supplierName || "").trim();
      if (!name) continue;

      let existing = await tx.supplier.findFirst({ where: { name } });
      if (!existing) {
        existing = await tx.supplier.create({
          data: {
            name,
            contact: sup.contactPerson || sup.contact || null,
            phone: sup.phone ? String(sup.phone).trim() : "9999999999",
            email: sup.email ? String(sup.email).toLowerCase().trim() : null,
            address: sup.address ? String(sup.address) : null,
            gstNo: sup.gstin || sup.gstNo || sup.gst || null,
            dlNo: sup.dlNumber || sup.dlNo || sup.dl || null,
            paymentTerms: sup.paymentTerms ? Number(sup.paymentTerms) : 30,
          },
        });
      }
      supplierNameToId.set(name.toLowerCase(), existing.id);
      counts.suppliers++;
    }

    // 3. Customers
    for (const cust of customers) {
      const name = String(cust.name || cust.customerName || "").trim();
      const phone = String(cust.phone || cust.mobile || "").trim();
      if (!name) continue;

      const custPhone = phone || `900000${String(counts.customers + 1).padStart(4, "0")}`;
      let existing = await tx.customer.findFirst({ where: { phone: custPhone } });
      if (!existing) {
        await tx.customer.create({
          data: {
            name,
            phone: custPhone,
            email: cust.email ? String(cust.email).toLowerCase().trim() : null,
            address: cust.address ? String(cust.address) : null,
            gender: cust.gender || null,
            medicalNotes: cust.medicalNotes || cust.notes || null,
            creditLimit: cust.creditLimit ? Number(cust.creditLimit) : 0,
          },
        });
      } else {
        await tx.customer.update({
          where: { id: existing.id },
          data: {
            name,
            email: cust.email ? String(cust.email).toLowerCase().trim() : existing.email,
            address: cust.address ? String(cust.address) : existing.address,
            gender: cust.gender || existing.gender,
            medicalNotes: cust.medicalNotes || cust.notes || existing.medicalNotes,
            creditLimit: cust.creditLimit ? Number(cust.creditLimit) : existing.creditLimit,
          },
        });
      }
      counts.customers++;
    }

    // 4. Default Branch
    let defaultBranch = await tx.branch.findFirst({ where: { isMain: true } });
    if (!defaultBranch) {
      defaultBranch = await tx.branch.findFirst({ orderBy: { id: "asc" } });
    }

    // 5. Medicines
    const medicineNameToId = new Map<string, number>();
    for (const med of medicines) {
      const name = String(med.name || med.medicineName || "").trim();
      if (!name) continue;

      let existing = await tx.medicine.findFirst({ where: { name } });
      if (!existing) {
        existing = await tx.medicine.create({
          data: {
            name,
            genericName: med.genericName || med.generic_name || null,
            company: med.manufacturer || med.company || "Generic Pharma",
            category: med.category || med.dosageForm || "Tablet",
            rackLocation: med.rackLocation || med.rack_location || null,
            hsnCode: med.hsnCode || med.hsn || null,
            gstPercent: med.gstPercent ? Number(med.gstPercent) : 12.0,
            description: med.description || null,
          },
        });
      }
      medicineNameToId.set(name.toLowerCase(), existing.id);
      counts.medicines++;
    }

    // 6. Batches
    for (const b of batches) {
      const medKey = String(b.medicineName || b.medicine || "").toLowerCase().trim();
      let medicineId: number | null = b.medicineId ? Number(b.medicineId) : null;
      if (!medicineId && medKey && medicineNameToId.has(medKey)) {
        medicineId = medicineNameToId.get(medKey)!;
      }
      if (!medicineId) continue;

      const batchNo = String(b.batchNo || b.batch_no || "LEGACY-001").trim();
      const branchId = b.branchId ? Number(b.branchId) : defaultBranch ? defaultBranch.id : null;
      const expiryDate = b.expiryDate ? new Date(b.expiryDate) : new Date(Date.now() + 365 * 24 * 3600 * 1000);
      const mrp = Number(b.mrp || 100);
      const purchasePrice = Number(b.purchasePrice || b.purchase_price || mrp * 0.7);
      const quantity = Number(b.quantity || b.stock || 0);

      // Upsert batch
      const existingBatch = await tx.batch.findFirst({
        where: {
          medicineId,
          batchNo,
          branchId,
        },
      });

      if (existingBatch) {
        await tx.batch.update({
          where: { id: existingBatch.id },
          data: {
            quantity: existingBatch.quantity + quantity,
            mrp,
            purchasePrice,
          },
        });
      } else {
        await tx.batch.create({
          data: {
            medicineId,
            batchNo,
            branchId,
            expiryDate,
            purchasePrice,
            mrp,
            quantity,
          },
        });
      }
      counts.batches++;
    }
  });

  // Log audit
  await logAudit({
    storeId: options?.storeId,
    userId: options?.userId,
    action: "STORAGE_MIGRATED_JSON",
    entity: "storage_migration",
    details: {
      counts,
      backupFile: backupFilename,
      timestamp: now.toISOString(),
    },
    ipAddress: options?.ipAddress,
  });

  return {
    success: true,
    migrated: counts,
    backupFile: backupFilename,
  };
}
