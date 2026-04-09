import { createReadStream, promises as fs } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

import { StorageAdapter, StorageError } from "./types";

function resolveLocalPath(basePath: string, relativePath: string) {
  const safeBase = normalize(basePath);
  const full = normalize(join(safeBase, relativePath));
  if (!full.startsWith(safeBase)) throw new StorageError("Invalid storage path.");
  return full;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly basePath: string) {}

  async upload(file: Buffer, path: string) {
    const full = resolveLocalPath(this.basePath, path);
    await mkdir(dirname(full), { recursive: true });
    await fs.writeFile(full, file);
    return path;
  }

  async download(path: string) {
    const full = resolveLocalPath(this.basePath, path);
    return fs.readFile(full);
  }

  async delete(path: string) {
    const full = resolveLocalPath(this.basePath, path);
    await unlink(full);
  }

  async exists(path: string) {
    const full = resolveLocalPath(this.basePath, path);
    try {
      await fs.access(full);
      return true;
    } catch {
      return false;
    }
  }

  async getUrl(path: string): Promise<string> {
    void path;
    throw new StorageError("Local storage does not support public URLs.");
  }

  async getSize(path: string) {
    const full = resolveLocalPath(this.basePath, path);
    const s = await stat(full);
    return s.size;
  }

  // Used for streaming (server-side).
  createReadStream(path: string) {
    const full = resolveLocalPath(this.basePath, path);
    return createReadStream(full);
  }
}
