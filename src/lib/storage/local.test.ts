import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { LocalStorageAdapter } from "./local";
import { StorageError } from "./types";

describe("LocalStorageAdapter", () => {
  it("rejects path traversal with INVALID_PATH", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shelf-local-"));
    const adapter = new LocalStorageAdapter(dir);

    await expect(adapter.download("../secrets.txt")).rejects.toMatchObject({
      name: "StorageError",
      code: "INVALID_PATH",
    } satisfies Partial<StorageError>);
  });

  it("maps ENOENT to NOT_FOUND", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shelf-local-"));
    const adapter = new LocalStorageAdapter(dir);

    await expect(adapter.download("missing.epub")).rejects.toMatchObject({
      name: "StorageError",
      code: "NOT_FOUND",
    } satisfies Partial<StorageError>);
  });

  it("uploads and downloads a file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shelf-local-"));
    const adapter = new LocalStorageAdapter(dir);

    await adapter.upload(Buffer.from("hello"), "epub/Author/file.epub");
    const buf = await adapter.download("epub/Author/file.epub");
    expect(buf.toString("utf8")).toBe("hello");
  });

  it("createReadStream streams an existing file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shelf-local-"));
    const adapter = new LocalStorageAdapter(dir);

    const rel = "epub/Author/file.epub";
    const full = join(dir, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, Buffer.from("stream-me"));

    const stream = adapter.createReadStream(rel);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    expect(Buffer.concat(chunks).toString("utf8")).toBe("stream-me");
  });
});

