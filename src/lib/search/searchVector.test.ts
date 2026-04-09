import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $executeRawUnsafe: vi.fn(async () => 1),
  },
}));

describe("updateBookSearchVector", () => {
  it("includes tag names in SQL", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const { updateBookSearchVector } = await import("./searchVector");

    const bookId = crypto.randomUUID();
    await updateBookSearchVector(bookId);

    const calls = (prisma.$executeRawUnsafe as unknown as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    expect(calls.length).toBe(1);
    const sql = String(calls[0]?.[0] ?? "");
    expect(sql).toMatch(/FROM \"book_tags\"/);
    expect(sql).toMatch(/JOIN \"tags\"/);
  });
});

