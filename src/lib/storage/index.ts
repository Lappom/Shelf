import { LocalStorageAdapter } from "./local";
import { S3StorageAdapter } from "./s3";
import type { StorageAdapter } from "./types";
import { StorageError } from "./types";

export type StorageType = "local" | "s3";

export function getStorageAdapter(): StorageAdapter {
  const type = (process.env.STORAGE_TYPE?.trim() ?? "local") as StorageType;

  if (type === "local") {
    const basePath = process.env.STORAGE_PATH?.trim() ?? "./data/library";
    return new LocalStorageAdapter(basePath);
  }

  if (type === "s3") {
    return S3StorageAdapter.fromEnv();
  }

  throw new StorageError(`Unsupported STORAGE_TYPE: ${type}`);
}

export { StorageError };
