export interface StorageAdapter {
  upload(file: Buffer, path: string): Promise<string>;
  download(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  getUrl(path: string): Promise<string>;
  getSize(path: string): Promise<number>;
}

export class StorageError extends Error {
  override name = "StorageError";
}
