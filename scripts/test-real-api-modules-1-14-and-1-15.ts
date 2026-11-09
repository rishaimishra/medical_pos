import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db-transaction";
import { createSessionToken, SESSION_COOKIE_NAME } from "../src/lib/auth";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";

// Routes to test
import * as backupRoute from "../src/app/api/admin/backup/route";
import * as restoreRoute from "../src/app/api/admin/backup/restore/route";
import * as migrateJsonRoute from "../src/app/api/admin/backup/migrate-json/route";
import * as updateVersionRoute from "../src/app/api/admin/update/version/route";
import * as updateInspectRoute from "../src/app/api/admin/update/inspect/route";
import * as updateApplyRoute from "../src/app/api/admin/update/apply/route";

let adminCookie = "";
let adminToken = "";
let testPassed = 0;
let testFailed = 0;

function assert(condition: boolean, msg: string, details?: any) {
  if (condition) {
    console.log(`  ✔ [PASS] ${msg}`);
    testPassed++;
  } else {
    console.error(`  ✖ [FAIL] ${msg}`);
    if (details !== undefined) console.error("     Details:", details);
    testFailed++;
  }
}

function makeRequest(
  url: string,
  options?: {
    method?: string;
    cookie?: string;
    body?: any;
    headers?: Record<string, string>;
  }
): NextRequest {
  const method = options?.method || "GET";
  const headers = new Headers(options?.headers || {});
  if (options?.cookie) {
    headers.set("cookie", options.cookie);
  }

  let body: any = undefined;
  if (options?.body) {
    if (options.body instanceof FormData) {
      body = options.body;
    } else if (typeof options.body === "string") {
      body = options.body;
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    } else {
      body = JSON.stringify(options.body);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }
  }

  return new NextRequest(url, { method, headers, body });
}

async function runTests() {
  console.log("\n================================================================================");
  console.log("🧪 STARTING REAL API INTEGRATION TESTS: MODULE 1.14 & MODULE 1.15");
  console.log("================================================================================\n");

  // 1. Setup Admin Authentication
  console.log("1. Authenticating Admin Session...");
  let admin = await prisma.user.findFirst({
    where: { role: "admin", active: true },
  });

  if (!admin) {
    admin = await prisma.user.create({
      data: {
        username: "test_admin_backup",
        name: "Test Admin",
        email: "test_admin_backup@medicalpos.com",
        password: "$2a$10$wK1bJ9yqQZ0Q1gP6b7vMjeoXvE.j5s5qCgC3tYg8s1Pq8Q5E1E1E.",
        role: "admin",
        active: true,
      },
    });
  }

  adminToken = createSessionToken({
    userId: admin.id,
    storeId: admin.storeId || 1,
    username: admin.username,
    name: admin.name,
    email: admin.email,
    role: "admin",
    branchId: admin.branchId,
    allowedPages: ["*"],
    maxDiscountPercent: 100,
    issuedAt: Date.now(),
    lastActive: Date.now(),
    permissions: [
      "manage_settings",
      "manage_users",
      "manage_medicines",
      "manage_purchases",
      "manage_customers",
    ],
  });
  adminCookie = `${SESSION_COOKIE_NAME}=${adminToken}`;
  console.log(`   Authenticated as ${admin.username} (ID: ${admin.id})\n`);

  // ============================================================================
  // MODULE 1.14: BACKUP, RESTORE & STORAGE MIGRATION TESTS
  // ============================================================================
  console.log("--------------------------------------------------------------------------------");
  console.log("📦 MODULE 1.14: BACKUP, RESTORE & STORAGE MIGRATION");
  console.log("--------------------------------------------------------------------------------");

  // 1.14.1 One-Click Full Database Backup
  console.log("\n--- Testing 1.14.1: Database Backup (.sql) ---");

  // Unauthorized request rejected
  const unauthReq = makeRequest("http://localhost:3000/api/admin/backup");
  const unauthRes = await backupRoute.GET(unauthReq);
  assert(unauthRes.status === 401, "GET /api/admin/backup rejects unauthenticated requests");

  // Authorized export .sql
  const backupReq = makeRequest("http://localhost:3000/api/admin/backup", { cookie: adminCookie });
  const backupRes = await backupRoute.GET(backupReq);
  assert(backupRes.status === 200, "GET /api/admin/backup returns HTTP 200");

  const contentType = backupRes.headers.get("content-type") || "";
  assert(
    contentType.includes("application/sql"),
    "Backup response content-type is application/sql",
    contentType
  );

  const contentDisp = backupRes.headers.get("content-disposition") || "";
  assert(
    contentDisp.includes("attachment") && contentDisp.includes("medical_pos_backup_"),
    "Backup has attachment header with timestamped filename",
    contentDisp
  );

  const sqlDump = await backupRes.text();
  assert(sqlDump.length > 500, "SQL dump contains substantial output", `${sqlDump.length} bytes`);
  assert(sqlDump.includes("Full SQL Database Backup"), "SQL dump contains expected header comment");
  assert(sqlDump.includes("SET client_encoding = 'UTF8';"), "SQL dump configures UTF8 encoding");
  assert(sqlDump.includes('INSERT INTO "settings"'), "SQL dump contains settings table inserts");
  assert(sqlDump.includes('INSERT INTO "medicines"'), "SQL dump contains medicines table inserts");

  // Verify ?format=json
  const jsonBackupReq = makeRequest("http://localhost:3000/api/admin/backup?format=json", {
    cookie: adminCookie,
  });
  const jsonBackupRes = await backupRoute.GET(jsonBackupReq);
  const jsonBackupData = await jsonBackupRes.json();
  assert(
    jsonBackupData.success === true && jsonBackupData.totalTables >= 20,
    "GET /api/admin/backup?format=json returns structured table statistics",
    jsonBackupData.totalTables
  );
  assert(
    typeof jsonBackupData.filename === "string" && jsonBackupData.filename.endsWith(".sql"),
    "Backup metadata reports valid filename",
    jsonBackupData.filename
  );

  // Verify ?list=true
  const listReq = makeRequest("http://localhost:3000/api/admin/backup?list=true", {
    cookie: adminCookie,
  });
  const listRes = await backupRoute.GET(listReq);
  const listData = await listRes.json();
  assert(
    listData.success === true && Array.isArray(listData.backups) && listData.backups.length > 0,
    "GET /api/admin/backup?list=true reports list of saved backup files",
    listData.backups?.length
  );

  // Verify downloading saved file by name
  const firstFilename = listData.backups[0].filename;
  const downloadFileReq = makeRequest(
    `http://localhost:3000/api/admin/backup?file=${encodeURIComponent(firstFilename)}`,
    { cookie: adminCookie }
  );
  const downloadFileRes = await backupRoute.GET(downloadFileReq);
  assert(
    downloadFileRes.status === 200,
    `GET /api/admin/backup?file=${firstFilename} downloads saved backup`,
    downloadFileRes.status
  );

  // 1.14.2 Restore From SQL File
  console.log("\n--- Testing 1.14.2: Restore From SQL File ---");

  // Reject unauthenticated
  const unauthRestoreReq = makeRequest("http://localhost:3000/api/admin/backup/restore", {
    method: "POST",
  });
  const unauthRestoreRes = await restoreRoute.POST(unauthRestoreReq);
  assert(
    unauthRestoreRes.status === 401,
    "POST /api/admin/backup/restore rejects unauthenticated requests"
  );

  // Reject empty payload
  const emptyRestoreReq = makeRequest("http://localhost:3000/api/admin/backup/restore", {
    method: "POST",
    cookie: adminCookie,
    body: { sql: "" },
  });
  const emptyRestoreRes = await restoreRoute.POST(emptyRestoreReq);
  assert(emptyRestoreRes.status === 400, "Restore rejects empty SQL content");

  // Reject dangerous commands (Security check)
  const dangerousRestoreReq = makeRequest("http://localhost:3000/api/admin/backup/restore", {
    method: "POST",
    cookie: adminCookie,
    body: { sql: "DROP DATABASE medical_pos; -- dangerous" },
  });
  const dangerousRestoreRes = await restoreRoute.POST(dangerousRestoreReq);
  assert(
    dangerousRestoreRes.status === 500 || dangerousRestoreRes.status === 400,
    "Restore blocks prohibited SQL keywords (drop database)"
  );

  // Dry run test
  const sampleRestoreSql = `
    -- Medical POS Standard Export
    INSERT INTO "categories" ("name", "type") VALUES ('Test Category 999', 'dosage')
    ON CONFLICT ("name") DO NOTHING;
  `;
  const dryRunReq = makeRequest("http://localhost:3000/api/admin/backup/restore", {
    method: "POST",
    cookie: adminCookie,
    body: { sql: sampleRestoreSql, dryRun: true },
  });
  const dryRunRes = await restoreRoute.POST(dryRunReq);
  const dryRunData = await dryRunRes.json();
  assert(
    dryRunData.success === true && dryRunData.dryRun === true && dryRunData.statementsCount >= 1,
    "Restore dryRun validates syntax and counts statements without applying",
    dryRunData
  );
  assert(
    dryRunData.tablesAffected.includes("categories"),
    "Restore dryRun correctly detects affected tables",
    dryRunData.tablesAffected
  );

  // Unconfirmed restore rejection
  const unconfirmedRestoreReq = makeRequest("http://localhost:3000/api/admin/backup/restore", {
    method: "POST",
    cookie: adminCookie,
    body: { sql: sampleRestoreSql, confirmOverwrite: false },
  });
  const unconfirmedRestoreRes = await restoreRoute.POST(unconfirmedRestoreReq);
  const unconfirmedData = await unconfirmedRestoreRes.json();
  assert(
    unconfirmedRestoreRes.status === 400 && unconfirmedData.requiresConfirmation === true,
    "Restore requires explicit confirmOverwrite flag before mutating data"
  );

  // Execute actual restore with confirmOverwrite: true
  const executeRestoreReq = makeRequest("http://localhost:3000/api/admin/backup/restore", {
    method: "POST",
    cookie: adminCookie,
    body: { sql: sampleRestoreSql, confirmOverwrite: true },
  });
  const executeRestoreRes = await restoreRoute.POST(executeRestoreReq);
  const executeData = await executeRestoreRes.json();
  assert(
    executeRestoreRes.status === 200 && executeData.success === true,
    "Restore successfully executes valid SQL statements",
    executeData
  );

  // Verify created row
  const createdCategory = await prisma.category.findUnique({
    where: { name: "Test Category 999" },
  });
  assert(Boolean(createdCategory), "Restored category row exists in database");

  // phpMyAdmin format compatibility test (with `#` comments and MySQL backticks)
  const phpMyAdminSql = `
    # phpMyAdmin SQL Dump
    # Host: localhost
    /*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
    INSERT INTO \`categories\` (\`name\`, \`type\`) VALUES ('phpMyAdmin Cat', 'dosage')
    ON CONFLICT ("name") DO NOTHING;
  `;
  const phpMyAdminRestoreReq = makeRequest("http://localhost:3000/api/admin/backup/restore", {
    method: "POST",
    cookie: adminCookie,
    body: { sql: phpMyAdminSql, confirmOverwrite: true },
  });
  const phpMyAdminRestoreRes = await restoreRoute.POST(phpMyAdminRestoreReq);
  const phpMyAdminData = await phpMyAdminRestoreRes.json();
  assert(
    phpMyAdminRestoreRes.status === 200 && phpMyAdminData.success === true,
    "Restore successfully normalizes and executes phpMyAdmin / MySQL format exports"
  );

  // 1.14.3 Local-JSON to Relational DB Migration Tool
  console.log("\n--- Testing 1.14.3: Local-JSON to Relational DB Migration ---");

  const unauthMigrateReq = makeRequest("http://localhost:3000/api/admin/backup/migrate-json", {
    method: "POST",
  });
  const unauthMigrateRes = await migrateJsonRoute.POST(unauthMigrateReq);
  assert(
    unauthMigrateRes.status === 401,
    "POST /api/admin/backup/migrate-json rejects unauthenticated requests"
  );

  const testMigrationPayload = {
    categories: [{ name: "Inhalers & Sprays", type: "dosage" }],
    suppliers: [
      {
        name: "Legacy Apex Pharma",
        phone: "9876500001",
        email: "apex@legacypharma.com",
        address: "77 Old Market Road",
        gstin: "19ABCDE1234F1Z5",
      },
    ],
    customers: [
      {
        name: "Legacy Patient John",
        phone: "9876543299",
        email: "patient.john@example.com",
        gender: "male",
        medicalNotes: "Hypertensive since 2021",
        creditLimit: 5000,
      },
    ],
    medicines: [
      {
        name: "AsthmaCare Inhaler 50mcg",
        genericName: "Salbutamol",
        manufacturer: "Legacy Apex Pharma",
        dosageForm: "Inhaler",
        rackLocation: "RACK-IN-01",
        hsnCode: "30049099",
        gstPercent: 12.0,
      },
    ],
    batches: [
      {
        medicineName: "AsthmaCare Inhaler 50mcg",
        batchNo: "LEG-INH-2026",
        expiryDate: "2028-12-31",
        purchasePrice: 120,
        mrp: 180,
        quantity: 50,
      },
    ],
  };

  const migrateReq = makeRequest("http://localhost:3000/api/admin/backup/migrate-json", {
    method: "POST",
    cookie: adminCookie,
    body: testMigrationPayload,
  });
  const migrateRes = await migrateJsonRoute.POST(migrateReq);
  const migrateData = await migrateRes.json();
  assert(
    migrateRes.status === 200 && migrateData.success === true,
    "POST /api/admin/backup/migrate-json succeeds with valid JSON bundle",
    migrateData
  );
  assert(
    migrateData.migrated.categories >= 1 &&
      migrateData.migrated.suppliers >= 1 &&
      migrateData.migrated.customers >= 1 &&
      migrateData.migrated.medicines >= 1 &&
      migrateData.migrated.batches >= 1,
    "Migration summary accurately counts all migrated entity arrays",
    migrateData.migrated
  );

  // Verify database record created
  const migratedMed = await prisma.medicine.findFirst({
    where: { name: "AsthmaCare Inhaler 50mcg" },
    include: { batches: true },
  });
  assert(Boolean(migratedMed), "Migrated medicine exists in relational database");
  assert(
    Boolean(migratedMed?.batches.some((b) => b.batchNo === "LEG-INH-2026")),
    "Migrated batch exists and links to medicine"
  );

  // Verify fallback backup JSON was written
  assert(
    typeof migrateData.backupFile === "string" && migrateData.backupFile.endsWith(".json"),
    "Fallback JSON backup path reported in response",
    migrateData.backupFile
  );
  const backupJsonPath = path.join(process.cwd(), "backups", "json_migrations", migrateData.backupFile);
  assert(fs.existsSync(backupJsonPath), "Fallback JSON file physically written to disk");

  // ============================================================================
  // MODULE 1.15: SOFTWARE UPDATE SYSTEM TESTS
  // ============================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("🚀 MODULE 1.15: SOFTWARE UPDATE SYSTEM TESTS");
  console.log("--------------------------------------------------------------------------------");

  // Version Info check
  const versionReq = makeRequest("http://localhost:3000/api/admin/update/version", {
    cookie: adminCookie,
  });
  const versionRes = await updateVersionRoute.GET(versionReq);
  const versionData = await versionRes.json();
  assert(versionRes.status === 200, "GET /api/admin/update/version returns HTTP 200");
  assert(
    typeof versionData.data?.currentVersion === "string",
    "Current installed version reported",
    versionData.data?.currentVersion
  );

  // Security Test: Path Traversal Detection in ZIP
  console.log("\n--- Testing 1.15.1 Security: Path Traversal Detection ---");

  // Create malicious ZIP with ../ traversal
  const evilZip = new AdmZip();
  evilZip.addFile("update.json", Buffer.from(JSON.stringify({ version: "2.0.0" })));
  evilZip.addFile("escaped_file.txt", Buffer.from("malicious payload"));
  evilZip.getEntries()[1].entryName = "../escaped_file.txt";
  const evilZipBuffer = evilZip.toBuffer();

  const evilFormData = new FormData();
  evilFormData.append(
    "package",
    new Blob([new Uint8Array(evilZipBuffer)], { type: "application/zip" }),
    "evil_update.zip"
  );

  const evilInspectReq = makeRequest("http://localhost:3000/api/admin/update/inspect", {
    method: "POST",
    cookie: adminCookie,
    body: evilFormData,
  });
  const evilInspectRes = await updateInspectRoute.POST(evilInspectReq);
  const evilInspectData = await evilInspectRes.json();
  assert(
    evilInspectRes.status === 400 && evilInspectData.error?.includes("Path traversal"),
    "ZIP Inspector strictly blocks and rejects Path Traversal (../) attacks",
    evilInspectData.error
  );

  // Security Test: Target protected system file (.env)
  const envTargetZip = new AdmZip();
  envTargetZip.addFile("update.json", Buffer.from(JSON.stringify({ version: "2.0.0" })));
  envTargetZip.addFile(".env", Buffer.from("DATABASE_URL=hacked"));
  const envZipBuffer = envTargetZip.toBuffer();

  const envFormData = new FormData();
  envFormData.append(
    "package",
    new Blob([new Uint8Array(envZipBuffer)], { type: "application/zip" }),
    "env_target.zip"
  );

  const envInspectReq = makeRequest("http://localhost:3000/api/admin/update/inspect", {
    method: "POST",
    cookie: adminCookie,
    body: envFormData,
  });
  const envInspectRes = await updateInspectRoute.POST(envInspectReq);
  const envInspectData = await envInspectRes.json();
  assert(
    envInspectRes.status === 400 && envInspectData.error?.includes("protected system path"),
    "ZIP Inspector strictly protects sensitive files (.env) from being overwritten",
    envInspectData.error
  );

  // Valid Package Inspection Test
  console.log("\n--- Testing 1.15.1: Valid Update Package Inspection ---");
  const validZip = new AdmZip();
  const manifest = {
    name: "medical-pos",
    version: "1.1.0",
    minVersion: "0.1.0",
    releaseNotes: "Critical security patches and enhanced financial reports.",
    releaseDate: "2026-11-06",
  };
  validZip.addFile("update.json", Buffer.from(JSON.stringify(manifest)));
  validZip.addFile("src/lib/test-update-file.txt", Buffer.from("System update verified v1.1.0"));
  const validZipBuffer = validZip.toBuffer();

  const validFormData = new FormData();
  validFormData.append(
    "package",
    new Blob([new Uint8Array(validZipBuffer)], { type: "application/zip" }),
    "valid_update_1.1.0.zip"
  );

  const validInspectReq = makeRequest("http://localhost:3000/api/admin/update/inspect", {
    method: "POST",
    cookie: adminCookie,
    body: validFormData,
  });
  const validInspectRes = await updateInspectRoute.POST(validInspectReq);
  const validInspectData = await validInspectRes.json();
  assert(
    validInspectRes.status === 200 && validInspectData.success === true,
    "Inspect valid package succeeds with HTTP 200",
    validInspectData
  );
  assert(
    validInspectData.data?.newVersion === "1.1.0" && validInspectData.data?.isUpgrade === true,
    "Inspection recognizes upgrade to v1.1.0",
    validInspectData.data?.newVersion
  );
  assert(
    validInspectData.data?.requiresBackupConfirmation === true,
    "Inspection flags that backup confirmation is mandatory"
  );
  assert(
    validInspectData.data?.changedFiles.some((f: any) => f.path.includes("test-update-file.txt")),
    "Inspection accurately inventories changed files list"
  );

  // Apply Update Without Backup Confirmation: Rejected
  console.log("\n--- Testing 1.15.1: Apply Update with Confirmation Guard ---");
  const applyNoConfirmData = new FormData();
  applyNoConfirmData.append(
    "package",
    new Blob([new Uint8Array(validZipBuffer)], { type: "application/zip" }),
    "valid_update_1.1.0.zip"
  );
  applyNoConfirmData.append("confirmBackup", "false");

  const rejectApplyReq = makeRequest("http://localhost:3000/api/admin/update/apply", {
    method: "POST",
    cookie: adminCookie,
    body: applyNoConfirmData,
  });
  const rejectApplyRes = await updateApplyRoute.POST(rejectApplyReq);
  const rejectApplyData = await rejectApplyRes.json();
  assert(
    rejectApplyRes.status === 400 && rejectApplyData.requiresConfirmation === true,
    "POST /api/admin/update/apply blocks update when confirmBackup is false"
  );

  // Apply Update With Backup Confirmation: Success
  const applyConfirmData = new FormData();
  applyConfirmData.append(
    "package",
    new Blob([new Uint8Array(validZipBuffer)], { type: "application/zip" }),
    "valid_update_1.1.0.zip"
  );
  applyConfirmData.append("confirmBackup", "true");

  const applySuccessReq = makeRequest("http://localhost:3000/api/admin/update/apply", {
    method: "POST",
    cookie: adminCookie,
    body: applyConfirmData,
  });
  const applySuccessRes = await updateApplyRoute.POST(applySuccessReq);
  const applySuccessData = await applySuccessRes.json();
  assert(
    applySuccessRes.status === 200 && applySuccessData.success === true,
    "POST /api/admin/update/apply succeeds with confirmBackup: true",
    applySuccessData
  );
  assert(
    applySuccessData.data?.newVersion === "1.1.0" && applySuccessData.data?.filesUpdated >= 1,
    "Update application reports new version and count of updated files"
  );

  // Verify updated file extracted
  const extractedFilePath = path.join(process.cwd(), "src/lib/test-update-file.txt");
  assert(fs.existsSync(extractedFilePath), "Updated file was extracted into project workspace");
  if (fs.existsSync(extractedFilePath)) {
    fs.unlinkSync(extractedFilePath); // Clean up temporary test file
  }

  // Verify Audit Trail for software update
  const auditEntry = await prisma.auditLog.findFirst({
    where: { action: "SOFTWARE_UPDATE_APPLIED" },
    orderBy: { id: "desc" },
  });
  assert(Boolean(auditEntry), "AuditLog recorded SOFTWARE_UPDATE_APPLIED event");

  // Clean up test category
  await prisma.category.deleteMany({
    where: { name: { in: ["Test Category 999", "phpMyAdmin Cat", "Inhalers & Sprays"] } },
  });

  // Final Summary
  console.log("\n================================================================================");
  console.log(`🏁 TEST RESULTS: TOTAL: ${testPassed + testFailed} | PASSED: ${testPassed} | FAILED: ${testFailed}`);
  console.log("================================================================================\n");

  if (testFailed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((err) => {
    console.error("Test Suite crashed with unexpected exception:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
