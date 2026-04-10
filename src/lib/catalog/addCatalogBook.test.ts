import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    book: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/search/searchVector", () => ({
  updateBookSearchVector: vi.fn(async () => undefined),
}));

import { addBookFromCatalog } from "@/lib/catalog/addCatalogBook";
import { prisma } from "@/lib/db/prisma";

describe("addBookFromCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns already_exists by provider id", async () => {
    const findFirst = prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>;
    findFirst.mockResolvedValueOnce({ id: "book-1" });

    const result = await addBookFromCatalog({
      provider: "googlebooks",
      providerId: "g-1",
      title: "Book",
      authors: ["A"],
      adminUserId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.status).toBe("already_exists");
    expect(result.bookId).toBe("book-1");
  });

  it("returns potential_conflict on fuzzy match", async () => {
    const findFirst = prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>;
    const findMany = prisma.book.findMany as unknown as ReturnType<typeof vi.fn>;
    findFirst.mockResolvedValue(null);
    findMany.mockResolvedValue([{ id: "book-2", title: "Book", authors: ["Ada"] }]);

    const result = await addBookFromCatalog({
      provider: "googlebooks",
      providerId: "g-2",
      title: "Book",
      authors: ["Ada Lovelace"],
      adminUserId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.status).toBe("potential_conflict");
  });
});
