import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/rbac", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
}));

vi.mock("@/lib/security/cors", () => ({
  handleCorsPreflight: vi.fn(() => null),
  addCorsHeaders: vi.fn((res: unknown) => res),
}));

vi.mock("@/lib/security/origin", () => ({
  assertSameOriginFromHeaders: vi.fn(() => undefined),
}));

vi.mock("@/lib/security/rateLimit", () => ({
  rateLimitOrThrow: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    book: {
      create: vi.fn(),
      update: vi.fn(),
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

vi.mock("@/lib/search/searchVector", () => ({
  updateBookSearchVector: vi.fn(async () => undefined),
}));

vi.mock("@/lib/metadata/openlibrary", () => ({
  enrichFromOpenLibraryByIsbn: vi.fn(async () => ({
    openLibraryId: "/works/OL1W",
    description: "Desc",
    subjects: ["A"],
    pageCount: 10,
    coverUrl: "https://covers.openlibrary.org/b/isbn/x-L.jpg",
  })),
  searchOpenLibraryByTitleAuthor: vi.fn(async () => [
    {
      key: "/works/OL123W",
      title: "The Book",
      authors: ["Ada Lovelace"],
      firstPublishYear: 1843,
      isbns: ["9781234567890"],
    },
  ]),
}));

describe("POST /api/books (JSON intents)", () => {
  it("openlibrary_preview_isbn returns enrichment", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://test.local/api/books", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "openlibrary_preview_isbn", isbn: "9781234567890" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { enrichment?: unknown };
    expect(json.enrichment).toBeTruthy();
  });

  it("openlibrary_search returns candidates", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://test.local/api/books", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "openlibrary_search", title: "The Book", author: "Ada" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { candidates?: unknown[] };
    expect(Array.isArray(json.candidates)).toBe(true);
    expect(json.candidates?.length).toBe(1);
  });

  it("create_physical creates a physical book", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: crypto.randomUUID() });

    const { POST } = await import("./route");
    const req = new Request("http://test.local/api/books", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "create_physical",
        title: "The Book",
        authors: ["Ada Lovelace"],
        isbn: "9781234567890",
        applyOpenLibrary: true,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { bookId?: string };
    expect(typeof json.bookId).toBe("string");
  });
});

