import { createReadStream, promises as fs } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

import { StorageAdapter, StorageError } from "./types";

function toStorageError(e: unknown): StorageError {
  if (e instanceof StorageError) return e;
  const err = e as { code?: string; message?: string };
  const code = err?.code;
  if (code === "ENOENT") return new StorageError("File not found.", "NOT_FOUND", { cause: e });
  if (code === "EACCES" || code === "EPERM")
    return new StorageError("Permission denied.", "FORBIDDEN", { cause: e });
  return new StorageError(err?.message ?? "Storage error.", "UNKNOWN", { cause: e });
}

function resolveLocalPath(basePath: string, relativePath: string) {
  const safeBase = normalize(basePath);
  const full = normalize(join(safeBase, relativePath));
  if (!full.startsWith(safeBase)) throw new StorageError("Invalid storage path.", "INVALID_PATH");
  return full;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly basePath: string) {}

  async upload(file: Buffer, path: string) {
    try {
      const full = resolveLocalPath(this.basePath, path);
      await mkdir(dirname(full), { recursive: true });
      await fs.writeFile(full, file);
      return path;
    } catch (e) {
      throw toStorageError(e);
    }
  }

  async download(path: string) {
    try {
      const full = resolveLocalPath(this.basePath, path);
      return await fs.readFile(full);
    } catch (e) {
      throw toStorageError(e);
    }
  }

  async delete(path: string) {
    try {
      const full = resolveLocalPath(this.basePath, path);
      await unlink(full);
    } catch (e) {
      throw toStorageError(e);
    }
  }

  async exists(path: string) {
    try {
      const full = resolveLocalPath(this.basePath, path);
      await fs.access(full);
      return true;
    } catch (e) {
      const se = toStorageError(e);
      if (se.code === "NOT_FOUND") return false;
      throw se;
    }
  }

  async getUrl(path: string): Promise<string> {
    void path;
    throw new StorageError("Local storage does not support public URLs.");
  }

  async getSize(path: string) {
    try {
      const full = resolveLocalPath(this.basePath, path);
      const s = await stat(full);
      return s.size;
    } catch (e) {
      throw toStorageError(e);
    }
  }

  // Used for streaming (server-side).
  createReadStream(path: string) {
    try {
      const full = resolveLocalPath(this.basePath, path);
      return createReadStream(full);
    } catch (e) {
      throw toStorageError(e);
    }
  }
}
