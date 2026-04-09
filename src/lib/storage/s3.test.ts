import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import { S3StorageAdapter } from "./s3";
import { StorageError } from "./types";

function makeAdapter() {
  return new S3StorageAdapter({
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    bucket: "shelf",
    accessKeyId: "x",
    secretAccessKey: "y",
  });
}

describe("S3StorageAdapter error mapping", () => {
  it("exists() returns false on 404", async () => {
    const adapter = makeAdapter();
    (adapter as unknown as { client: { send: unknown } }).client = {
      send: vi.fn().mockRejectedValue({ name: "NotFound", $metadata: { httpStatusCode: 404 } }),
    };

    await expect(adapter.exists("missing.epub")).resolves.toBe(false);
  });

  it("createReadStream() maps 404 to NOT_FOUND", async () => {
    const adapter = makeAdapter();
    (adapter as unknown as { client: { send: unknown } }).client = {
      send: vi.fn().mockRejectedValue({ name: "NoSuchKey", $metadata: { httpStatusCode: 404 } }),
    };

    await expect(adapter.createReadStream("missing.epub")).rejects.toMatchObject({
      name: "StorageError",
      code: "NOT_FOUND",
    } satisfies Partial<StorageError>);
  });

  it("createReadStream() returns a readable stream when body exists", async () => {
    const adapter = makeAdapter();
    (adapter as unknown as { client: { send: unknown } }).client = {
      send: vi.fn().mockResolvedValue({ Body: Readable.from([Buffer.from("ok")]) }),
    };

    const stream = await adapter.createReadStream("x.epub");
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    expect(Buffer.concat(chunks).toString("utf8")).toBe("ok");
  });
});
