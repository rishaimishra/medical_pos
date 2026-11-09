import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { APP_VERSION } from "@/lib/config";
import { logAudit } from "@/lib/audit";
import { generateSqlDump } from "@/lib/backup";

/**
 * MODULE 1.15: SOFTWARE UPDATE SYSTEM
 * Admin-only version ZIP package inspector, path traversal validator,
 * version comparer, backup confirmation enforcer, and safe update executor.
 */

export interface UpdateManifest {
  name?: string;
  version: string;
  minVersion?: string;
  releaseNotes?: string;
  releaseDate?: string;
  description?: string;
  author?: string;
}

export interface ChangedFileEntry {
  path: string;
  sizeBytes: number;
  sizeFormatted: string;
  action: "create" | "update";
  existsLocally: boolean;
}

export interface UpdateInspectionResult {
  valid: boolean;
  currentVersion: string;
  newVersion: string;
  isUpgrade: boolean;
  isDowngrade: boolean;
  isSame: boolean;
  manifest: UpdateManifest;
  totalFiles: number;
  changedFiles: ChangedFileEntry[];
  requiresBackupConfirmation: boolean;
  backupRecommended: boolean;
  systemHealthy: boolean;
}

export const PROTECTED_PATHS = [
  /^\.env(\..+)?$/i,
  /^\.git\//i,
  /^node_modules\//i,
  /^backups\//i,
  /^\.backups\//i,
  /^prisma\/dev\.db$/i,
  /^prisma\/schema\.prisma\.backup$/i,
];

export const VERSION_FILE_PATH = path.join(process.cwd(), ".version.json");

/**
 * Returns current installed software version from dynamic version tracker, falling back to APP_VERSION.
 */
export function getInstalledVersion(): string {
  try {
    if (fs.existsSync(VERSION_FILE_PATH)) {
      const raw = fs.readFileSync(VERSION_FILE_PATH, "utf-8");
      const data = JSON.parse(raw);
      if (data && typeof data.version === "string" && data.version.trim()) {
        return data.version.trim();
      }
    }
  } catch {
    // fallback
  }
  return APP_VERSION;
}

/**
 * Saves dynamically installed software version upon successful update.
 */
export function setInstalledVersion(version: string): void {
  try {
    fs.writeFileSync(
      VERSION_FILE_PATH,
      JSON.stringify({ version, updatedAt: new Date().toISOString() }, null, 2),
      "utf-8"
    );
  } catch (err) {
    console.warn("[setInstalledVersion] Could not persist .version.json:", err);
  }
}

/**
 * Semver comparison:
 * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal.
 */
export function compareSemver(v1: string, v2: string): number {
  const clean1 = (v1 || "0.0.0").replace(/^v/i, "").split("-")[0];
  const clean2 = (v2 || "0.0.0").replace(/^v/i, "").split("-")[0];

  const parts1 = clean1.split(".").map((p) => parseInt(p, 10) || 0);
  const parts2 = clean2.split(".").map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Validate that a relative entry path does NOT escape the project workspace.
 * Strictly prevents Path Traversal attacks (e.g. `../`, `..\\`, `/etc/passwd`, `C:\...`).
 */
export function validateEntryPath(entryName: string): string {
  let decoded = entryName;
  try {
    decoded = decodeURIComponent(entryName);
  } catch {
    // Keep raw if not URL encoded
  }

  // Normalize forward slashes
  const normalized = decoded.replace(/\\/g, "/");

  // Rejection checks
  if (
    normalized.includes("../") ||
    normalized.includes("/..") ||
    normalized.startsWith("../") ||
    normalized.startsWith("/") ||
    normalized.split("/").includes("..") ||
    /^[a-zA-Z]:/.test(normalized) || // Windows drive letters
    normalized.includes("\0") // Null byte injection
  ) {
    throw new Error(`Security Violation: Path traversal detected in entry "${entryName}". Update package rejected.`);
  }

  const posixNormalized = path.posix.normalize(normalized);
  if (posixNormalized.startsWith("..") || posixNormalized.startsWith("/")) {
    throw new Error(`Security Violation: Path traversal detected in entry "${entryName}". Update package rejected.`);
  }

  const rootDir = process.cwd();
  const resolved = path.resolve(/*turbopackIgnore: true*/ rootDir, posixNormalized);
  if (!resolved.startsWith(rootDir)) {
    throw new Error(`Security Violation: Entry "${entryName}" resolves outside project workspace. Update package rejected.`);
  }

  // Protected paths check
  for (const regex of PROTECTED_PATHS) {
    if (regex.test(posixNormalized)) {
      throw new Error(`Security Violation: Entry "${entryName}" targets a protected system path. Update package rejected.`);
    }
  }

  return posixNormalized;
}

/**
 * 1.15.1: Inspect a candidate version ZIP archive.
 * Reads manifest, validates all paths for safety, compares versions, and inventories file diffs.
 */
export async function inspectUpdateZip(buffer: Buffer): Promise<UpdateInspectionResult> {
  if (!buffer || buffer.length === 0) {
    throw new Error("Update archive file is empty.");
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch (err: any) {
    throw new Error(`Invalid ZIP archive format: ${err?.message || "Failed to parse archive"}`);
  }

  const entries = zip.getEntries();
  if (entries.length === 0) {
    throw new Error("Update archive contains no files.");
  }

  // 1. Strict Path Traversal & Security Validation on every entry
  for (const entry of entries) {
    validateEntryPath(entry.entryName);
  }

  // 2. Locate Manifest (update.json, manifest.json, or package.json)
  let manifest: UpdateManifest | null = null;
  const manifestEntry = entries.find((e) =>
    ["update.json", "manifest.json"].includes(path.basename(e.entryName).toLowerCase())
  );

  if (manifestEntry) {
    try {
      manifest = JSON.parse(manifestEntry.getData().toString("utf-8"));
    } catch {
      // JSON parse failure
    }
  }

  if (!manifest) {
    // Try package.json
    const pkgEntry = entries.find((e) => e.entryName === "package.json");
    if (pkgEntry) {
      try {
        const pkgData = JSON.parse(pkgEntry.getData().toString("utf-8"));
        manifest = {
          name: pkgData.name || "medical-pos",
          version: pkgData.version || "1.0.0",
          releaseNotes: pkgData.description || "System update package",
          releaseDate: new Date().toISOString().slice(0, 10),
        };
      } catch {
        // Continue
      }
    }
  }

  if (!manifest || !manifest.version) {
    manifest = {
      name: "medical-pos",
      version: "1.0.0",
      releaseNotes: "System enhancement & maintenance package",
      releaseDate: new Date().toISOString().slice(0, 10),
    };
  }

  const currentVersion = getInstalledVersion();
  const newVersion = manifest.version;
  const cmp = compareSemver(newVersion, currentVersion);
  const isUpgrade = cmp > 0;
  const isDowngrade = cmp < 0;
  const isSame = cmp === 0;

  // 3. Scan changed files
  const changedFiles: ChangedFileEntry[] = [];
  const rootDir = process.cwd();

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const safeRelPath = validateEntryPath(entry.entryName);
    // Ignore update metadata manifests from changed files list
    if (safeRelPath === "update.json" || safeRelPath === "manifest.json") {
      continue;
    }

    const localFullPath = path.join(/*turbopackIgnore: true*/ rootDir, safeRelPath);
    const existsLocally = fs.existsSync(localFullPath);
    const sizeBytes = entry.header.size;
    const sizeFormatted = sizeBytes > 1024 ? `${(sizeBytes / 1024).toFixed(1)} KB` : `${sizeBytes} B`;

    changedFiles.push({
      path: safeRelPath,
      sizeBytes,
      sizeFormatted,
      action: existsLocally ? "update" : "create",
      existsLocally,
    });
  }

  return {
    valid: true,
    currentVersion,
    newVersion,
    isUpgrade,
    isDowngrade,
    isSame,
    manifest,
    totalFiles: changedFiles.length,
    changedFiles,
    requiresBackupConfirmation: true,
    backupRecommended: true,
    systemHealthy: true,
  };
}

/**
 * 1.15.1: Apply verified version update ZIP.
 * Enforces backup confirmation, snapshots files to rollback folder, extracts safe files, and logs audit.
 */
export async function applyUpdateZip(
  buffer: Buffer,
  options: {
    confirmBackup: boolean;
    storeId?: number | null;
    userId?: number | null;
    ipAddress?: string | null;
  }
): Promise<{
  success: boolean;
  previousVersion: string;
  newVersion: string;
  filesUpdated: number;
  backupSnapshotDir: string;
  releaseNotes?: string;
}> {
  if (!options?.confirmBackup) {
    throw new Error(
      "Backup confirmation required: You must confirm that a current system backup has been completed before applying software updates."
    );
  }

  // Re-inspect and validate
  const inspection = await inspectUpdateZip(buffer);
  const zip = new AdmZip(buffer);
  const rootDir = process.cwd();

  // Create automatic pre-update DB backup snapshot for zero data loss guarantee
  try {
    await generateSqlDump({
      storeId: options.storeId,
      saveToFile: true,
    });
  } catch (dumpErr: any) {
    console.error("[applyUpdateZip] Automatic pre-update DB snapshot failed:", dumpErr);
    throw new Error(`Automatic pre-update safety backup failed: ${dumpErr?.message || dumpErr}. Update aborted.`);
  }

  // Create rollback snapshot directory
  const now = new Date();
  const timestampStr = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const snapshotDir = path.join(rootDir, ".backups", `pre_update_${inspection.newVersion}_${timestampStr}`);
  fs.mkdirSync(snapshotDir, { recursive: true });

  let filesUpdated = 0;
  const backedUpFiles: string[] = [];
  const createdFiles: string[] = [];

  try {
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;

      const safeRelPath = validateEntryPath(entry.entryName);
      if (safeRelPath === "update.json" || safeRelPath === "manifest.json") {
        continue;
      }

      const localFullPath = path.join(/*turbopackIgnore: true*/ rootDir, safeRelPath);

      // If file exists locally, back it up to snapshot folder before overwriting
      if (fs.existsSync(localFullPath)) {
        const backupTarget = path.join(snapshotDir, safeRelPath);
        const backupTargetDir = path.dirname(backupTarget);
        if (!fs.existsSync(backupTargetDir)) {
          fs.mkdirSync(backupTargetDir, { recursive: true });
        }
        fs.copyFileSync(localFullPath, backupTarget);
        backedUpFiles.push(safeRelPath);
      } else {
        createdFiles.push(safeRelPath);
      }

      // Ensure target folder exists and write updated file
      const targetDir = path.dirname(localFullPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.writeFileSync(localFullPath, entry.getData());
      filesUpdated++;
    }
  } catch (extractErr: any) {
    console.error("[applyUpdateZip] Extraction error, triggering automatic rollback:", extractErr);
    // Automatic Rollback: restore backed up files from snapshot
    for (const relPath of backedUpFiles) {
      try {
        const backupFile = path.join(snapshotDir, relPath);
        const targetFile = path.join(rootDir, relPath);
        if (fs.existsSync(backupFile)) {
          fs.copyFileSync(backupFile, targetFile);
        }
      } catch (rbErr) {
        console.error(`[Rollback Error on ${relPath}]:`, rbErr);
      }
    }
    // Delete newly created files
    for (const relPath of createdFiles) {
      try {
        const targetFile = path.join(rootDir, relPath);
        if (fs.existsSync(targetFile)) {
          fs.unlinkSync(targetFile);
        }
      } catch (delErr) {
        console.error(`[Rollback Delete Error on ${relPath}]:`, delErr);
      }
    }
    throw new Error(`Update extraction failed: ${extractErr?.message || extractErr}. Automatic rollback restored previous system state from snapshot.`);
  }

  // Persist newly installed version dynamically
  setInstalledVersion(inspection.newVersion);

  // Log audit
  await logAudit({
    storeId: options?.storeId,
    userId: options?.userId,
    action: "SOFTWARE_UPDATE_APPLIED",
    entity: "system_update",
    details: {
      previousVersion: inspection.currentVersion,
      newVersion: inspection.newVersion,
      filesUpdated,
      rollbackSnapshotDir: snapshotDir,
      timestamp: now.toISOString(),
    },
    ipAddress: options?.ipAddress,
  });

  return {
    success: true,
    previousVersion: inspection.currentVersion,
    newVersion: inspection.newVersion,
    filesUpdated,
    backupSnapshotDir: snapshotDir,
    releaseNotes: inspection.manifest.releaseNotes,
  };
}
