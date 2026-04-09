export interface StorageAdapter {
  upload(file: Buffer, path: string): Promise<string>;
  download(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  getUrl(path: string): Promise<string>;
  getSize(path: string): Promise<number>;
}

export type StorageErrorCode = "INVALID_PATH" | "NOT_FOUND" | "FORBIDDEN" | "TIMEOUT" | "UNKNOWN";

export class StorageError extends Error {
  override name = "StorageError";

  constructor(
    message: string,
    public readonly code: StorageErrorCode = "UNKNOWN",
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export function isStorageError(e: unknown): e is StorageError {
  return e instanceof StorageError;
}
