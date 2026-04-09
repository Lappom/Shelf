import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { Readable } from "node:stream";

import { StorageError } from "@/lib/storage";
import { createCoverAccessToken } from "@/lib/cover/coverToken";

const { getOptionalUserMock } = vi.hoisted(() => ({
  getOptionalUserMock: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/auth/rbac", () => ({
  getOptionalSessionUser: () => getOptionalUserMock(),
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

describe("GET /api/books/[id]/cover", () => {
  const prevSecret = process.env.NEXTAUTH_SECRET;
  beforeAll(() => {
    process.env.NEXTAUTH_SECRET = "c".repeat(32);
  });
  afterAll(() => {
    if (prevSecret === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = prevSecret;
  });

  beforeEach(() => {
    getOptionalUserMock.mockReset();
    getOptionalUserMock.mockResolvedValue({ id: "user-1" });
  });

  it("returns 404 when book not found", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/books/x/cover");
    const res = await GET(req, { params: Promise.resolve({ id: crypto.randomUUID() }) });
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated and no token", async () => {
    getOptionalUserMock.mockResolvedValueOnce(null as never);
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
      coverUrl: "covers/x.jpg",
    });

    const bookId = crypto.randomUUID();
    const { GET } = await import("./route");
    const req = new Request(`http://test.local/api/books/${bookId}/cover`);
    const res = await GET(req, { params: Promise.resolve({ id: bookId }) });
    expect(res.status).toBe(401);
  });

  it("allows access with valid token when unauthenticated", async () => {
    getOptionalUserMock.mockResolvedValueOnce(null as never);
    const bookId = crypto.randomUUID();
    const token = createCoverAccessToken(bookId);
    expect(token).toBeTruthy();

    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: bookId,
      coverUrl: "covers/x.jpg",
    });

    const { getStorageAdapter } = await import("@/lib/storage");
    (getStorageAdapter as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      createReadStream: async () => Readable.from([Buffer.from("IMG")]),
      download: vi.fn(),
    });

    const { GET } = await import("./route");
    const req = new Request(
      `http://test.local/api/books/${bookId}/cover?t=${encodeURIComponent(token!)}`,
    );
    const res = await GET(req, { params: Promise.resolve({ id: bookId }) });
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString("utf8")).toBe("IMG");
  });

  it("streams when adapter provides createReadStream", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
      coverUrl: "covers/x.jpg",
    });

    const { getStorageAdapter } = await import("@/lib/storage");
    (getStorageAdapter as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      createReadStream: async () => Readable.from([Buffer.from("IMG")]),
      download: vi.fn(),
    });

    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/books/x/cover");
    const res = await GET(req, { params: Promise.resolve({ id: crypto.randomUUID() }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/i);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString("utf8")).toBe("IMG");
  });

  it("maps StorageError NOT_FOUND to 404", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
      coverUrl: "covers/missing.jpg",
    });

    const { getStorageAdapter } = await import("@/lib/storage");
    (getStorageAdapter as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      createReadStream: async () => {
        throw new StorageError("File not found.", "NOT_FOUND");
      },
      download: vi.fn(),
    });

    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/books/x/cover");
    const res = await GET(req, { params: Promise.resolve({ id: crypto.randomUUID() }) });
    expect(res.status).toBe(404);
  });
});
