import type JSZip from "jszip";

const DEFAULT_MAX_ENTRIES = 20_000;
const DEFAULT_MAX_ENTRY_UNCOMPRESSED = 512 * 1024 * 1024; // 512 MiB
const DEFAULT_TOTAL_UNCOMPRESSED_CAP = 1024 * 1024 * 1024; // 1 GiB
const UPLOAD_MAX_DEFAULT = 100 * 1024 * 1024;

function parsePositiveIntEnv(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function getUploadMaxBytesHint(env: NodeJS.ProcessEnv): number {
  const raw = env.UPLOAD_MAX_BYTES?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return UPLOAD_MAX_DEFAULT;
}

/**
 * Limits for EPUB (ZIP) parsing. Declared sizes come from the ZIP central directory and can be
 * spoofed by a malicious archive; these checks still block accidental zip bombs and many attacks.
 */
export function getEpubZipLimits(env: NodeJS.ProcessEnv = process.env) {
  const uploadMax = getUploadMaxBytesHint(env);
  const defaultTotal = Math.max(DEFAULT_TOTAL_UNCOMPRESSED_CAP, uploadMax * 10);
  return {
    maxEntries: parsePositiveIntEnv(env, "EPUB_ZIP_MAX_ENTRIES", DEFAULT_MAX_ENTRIES),
    maxTotalUncompressedBytes: parsePositiveIntEnv(
      env,
      "EPUB_ZIP_MAX_UNCOMPRESSED_TOTAL_BYTES",
      defaultTotal,
    ),
    maxEntryUncompressedBytes: parsePositiveIntEnv(
      env,
      "EPUB_ZIP_MAX_ENTRY_UNCOMPRESSED_BYTES",
      DEFAULT_MAX_ENTRY_UNCOMPRESSED,
    ),
  };
}

type ZipObjectInternal = {
  name: string;
  dir: boolean;
  unsafeOriginalName?: string;
  _data?: { uncompressedSize?: number } | null;
};

function readUncompressedSize(file: JSZip.JSZipObject): number | null {
  const internal = file as unknown as ZipObjectInternal;
  const data = internal._data;
  if (!data || typeof data !== "object") return null;
  const n = data.uncompressedSize;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Reject archive paths that could escape extraction root (zip-slip).
 */
export function assertZipSlipSafePath(entryPath: string): void {
  const normalized = entryPath.replace(/\\/g, "/").trim();
  if (!normalized) {
    throw new Error("Invalid EPUB: empty path in archive");
  }
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error("Invalid EPUB: absolute path in archive");
  }
  const parts = normalized.split("/").filter(Boolean);
  for (const p of parts) {
    if (p === "..") {
      throw new Error("Invalid EPUB: path traversal in archive");
    }
  }
}

/**
 * After JSZip.loadAsync, enforce entry count, declared uncompressed totals, and zip-slip on every path.
 */
export function assertSafeEpubZip(zip: JSZip, env: NodeJS.ProcessEnv = process.env): void {
  const limits = getEpubZipLimits(env);
  const names = Object.keys(zip.files);
  if (names.length > limits.maxEntries) {
    throw new Error(`Invalid EPUB: too many zip entries (max ${limits.maxEntries})`);
  }

  let totalUncompressed = 0;
  for (const name of names) {
    assertZipSlipSafePath(name);
    const file = zip.files[name];
    if (!file || file.dir) continue;

    const unsafe = (file as unknown as ZipObjectInternal).unsafeOriginalName;
    if (typeof unsafe === "string" && unsafe.trim()) {
      assertZipSlipSafePath(unsafe);
    }

    const size = readUncompressedSize(file);
    if (size != null) {
      if (size > limits.maxEntryUncompressedBytes) {
        throw new Error(
          `Invalid EPUB: zip entry exceeds max uncompressed size (${limits.maxEntryUncompressedBytes} bytes)`,
        );
      }
      totalUncompressed += size;
      if (totalUncompressed > limits.maxTotalUncompressedBytes) {
        throw new Error(
          `Invalid EPUB: declared uncompressed total exceeds limit (${limits.maxTotalUncompressedBytes} bytes)`,
        );
      }
    }
  }
}
