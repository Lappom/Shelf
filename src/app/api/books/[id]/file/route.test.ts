import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

import { StorageError } from "@/lib/storage";

vi.mock("@/lib/auth/rbac", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    book: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/storage", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...mod,
    getStorageAdapter: vi.fn(),
  };
});

vi.mock("@/lib/security/cors", () => ({
  handleCorsPreflight: vi.fn(() => null),
  addCorsHeaders: vi.fn((res: unknown) => res),
}));

vi.mock("@/lib/security/origin", () => ({
  assertSameOriginFromHeaders: vi.fn(() => undefined),
}));

describe("GET /api/books/[id]/file", () => {
  it("returns 404 when book not found", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/books/x/file");
    const res = await GET(req, { params: Promise.resolve({ id: crypto.randomUUID() }) });
    expect(res.status).toBe(404);
  });

  it("streams when adapter provides createReadStream", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
      format: "epub",
      files: [{ storagePath: "epub/A/file.epub", filename: "file.epub", mimeType: "application/epub+zip" }],
    });

    const { getStorageAdapter } = await import("@/lib/storage");
    (getStorageAdapter as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      createReadStream: async () => Readable.from([Buffer.from("EPUB")]),
      download: vi.fn(),
    });

    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/books/x/file");
    const res = await GET(req, { params: Promise.resolve({ id: crypto.randomUUID() }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/i);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString("utf8")).toBe("EPUB");
  });

  it("maps StorageError NOT_FOUND to 404", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
      format: "epub",
      files: [{ storagePath: "missing.epub", filename: "missing.epub", mimeType: "application/epub+zip" }],
    });

    const { getStorageAdapter } = await import("@/lib/storage");
    (getStorageAdapter as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      createReadStream: async () => {
        throw new StorageError("File not found.", "NOT_FOUND");
      },
      download: vi.fn(),
    });

    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/books/x/file");
    const res = await GET(req, { params: Promise.resolve({ id: crypto.randomUUID() }) });
    expect(res.status).toBe(404);
  });
});

