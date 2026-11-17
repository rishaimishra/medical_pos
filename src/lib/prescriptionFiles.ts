import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export const PRESCRIPTION_STORAGE_DIR = path.resolve(process.cwd(), "storage", "prescriptions");
export const MAX_PRESCRIPTION_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXT_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function sanitizeFileName(rawName: string): string {
  const base = path.basename(rawName || "prescription");
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
  return cleaned.slice(0, 120) || "prescription";
}

export function validatePrescriptionUpload(
  originalName: string,
  mimeType: string,
  sizeBytes: number
): { valid: boolean; ext: string; normalizedMime: string; safeName: string; message?: string } {
  const safeName = sanitizeFileName(originalName);
  const ext = path.extname(safeName).toLowerCase();
  const normalizedMime = (mimeType || "").toLowerCase().split(";")[0].trim();

  if (sizeBytes <= 0) {
    return { valid: false, ext, normalizedMime, safeName, message: "Uploaded file is empty." };
  }
  if (sizeBytes > MAX_PRESCRIPTION_BYTES) {
    return {
      valid: false,
      ext,
      normalizedMime,
      safeName,
      message: "File exceeds maximum allowed size of 10 MB.",
    };
  }

  const extAllowed = ext in ALLOWED_EXT_TO_MIME;
  const mimeAllowed = ALLOWED_MIMES.has(normalizedMime);

  // Disallow dangerous extensions (e.g. .html, .exe, .js) even if client spoofs Content-Type
  if (ext && !extAllowed) {
    return {
      valid: false,
      ext,
      normalizedMime,
      safeName,
      message: "Unsupported file format. Allowed: PDF, JPG, PNG, WEBP, HEIC.",
    };
  }

  if (!extAllowed && !mimeAllowed) {
    return {
      valid: false,
      ext,
      normalizedMime,
      safeName,
      message: "Unsupported file format. Allowed: PDF, JPG, PNG, WEBP, HEIC.",
    };
  }

  const mimeToExtMap: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
  };
  const resolvedExt = extAllowed ? ext : mimeToExtMap[normalizedMime] || ".jpg";
  const resolvedMime = ALLOWED_EXT_TO_MIME[resolvedExt] || normalizedMime || "application/octet-stream";

  return {
    valid: true,
    ext: resolvedExt,
    normalizedMime: resolvedMime,
    safeName: extAllowed ? safeName : `${safeName}${resolvedExt}`,
  };
}

export function verifyMagicBytes(ext: string, buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  switch (ext) {
    case ".pdf":
      return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    case ".jpg":
    case ".jpeg":
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case ".png":
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    case ".webp":
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
      );
    case ".heic":
    case ".heif":
      return buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
    default:
      return false;
  }
}

export async function savePrescriptionBuffer(
  customerId: number,
  originalName: string,
  mimeType: string,
  buffer: Buffer
): Promise<{ storedRelativePath: string; safeFileName: string; normalizedMime: string }> {
  const check = validatePrescriptionUpload(originalName, mimeType, buffer.length);
  if (!check.valid) {
    throw new Error(check.message || "Invalid prescription file");
  }
  if (!verifyMagicBytes(check.ext, buffer)) {
    throw new Error("Unsupported file format: file signature does not match PDF/JPG/PNG/WEBP/HEIC.");
  }

  await fs.mkdir(PRESCRIPTION_STORAGE_DIR, { recursive: true });

  const uniqueName = `rx_c${customerId}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${check.safeName}`;
  const fullPath = path.resolve(PRESCRIPTION_STORAGE_DIR, uniqueName);
  if (!fullPath.startsWith(PRESCRIPTION_STORAGE_DIR + path.sep)) {
    throw new Error("Invalid file storage path");
  }

  await fs.writeFile(fullPath, buffer);

  return {
    storedRelativePath: uniqueName,
    safeFileName: check.safeName,
    normalizedMime: check.normalizedMime,
  };
}

export async function readPrescriptionBuffer(
  storedPath: string
): Promise<{ buffer: Buffer; resolvedPath: string } | null> {
  const baseName = path.basename(storedPath);
  if (!baseName) return null;

  const fullPath = path.resolve(PRESCRIPTION_STORAGE_DIR, baseName);
  if (!fullPath.startsWith(PRESCRIPTION_STORAGE_DIR + path.sep)) {
    return null;
  }

  try {
    const buffer = await fs.readFile(fullPath);
    return { buffer, resolvedPath: fullPath };
  } catch {
    return null;
  }
}

export async function deletePrescriptionFile(storedPath: string | null | undefined): Promise<void> {
  if (!storedPath) return;
  const baseName = path.basename(storedPath);
  if (!baseName) return;

  const fullPath = path.resolve(PRESCRIPTION_STORAGE_DIR, baseName);
  if (!fullPath.startsWith(PRESCRIPTION_STORAGE_DIR + path.sep)) {
    return;
  }

  try {
    await fs.unlink(fullPath);
  } catch {
    // Ignore missing file on disk
  }
}
