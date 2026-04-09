import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin/auditLog", () => ({
  logAdminAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/rbac", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
}));

const txMock = {
  duplicatePair: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  duplicateResolutionAudit: {
    create: vi.fn(),
  },
  book: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  bookShelf: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  bookTag: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  bookFile: {
    updateMany: vi.fn(),
  },
  userAnnotation: {
    updateMany: vi.fn(),
  },
  userBookProgress: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  userRecommendation: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  bookMetadataSnapshot: {
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

const prismaMock = {
  duplicatePair: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<void>) => {
    await fn(txMock);
  }),
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: prismaMock,
}));

describe("admin duplicates actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignoreDuplicatePairAction sets status ignored and audits", async () => {
    prismaMock.duplicatePair.findFirst.mockResolvedValueOnce({
      id: crypto.randomUUID(),
      status: "open",
    });

    const { ignoreDuplicatePairAction } = await import("./actions");
    const fd = new FormData();
    fd.set("pairId", crypto.randomUUID());
    const res = await ignoreDuplicatePairAction(fd);

    expect(res.ok).toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(txMock.duplicatePair.update).toHaveBeenCalled();
    expect(txMock.duplicateResolutionAudit.create).toHaveBeenCalled();
  });

  it("mergeDuplicatePairAction soft-deletes absorbed and marks pair merged", async () => {
    const pairId = crypto.randomUUID();
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();

    txMock.duplicatePair.findFirst.mockResolvedValueOnce({
      id: pairId,
      status: "open",
      bookIdA: a,
      bookIdB: b,
    });
    txMock.book.findFirst.mockResolvedValueOnce({ id: a });
    txMock.book.findFirst.mockResolvedValueOnce({ id: b });
    txMock.bookShelf.findMany.mockResolvedValueOnce([]);
    txMock.bookTag.findMany.mockResolvedValueOnce([]);
    txMock.userBookProgress.findMany.mockResolvedValueOnce([]);
    txMock.userRecommendation.findMany.mockResolvedValueOnce([]);
    txMock.bookMetadataSnapshot.findFirst.mockResolvedValueOnce(null);
    txMock.bookMetadataSnapshot.findFirst.mockResolvedValueOnce(null);

    const { mergeDuplicatePairAction } = await import("./actions");
    const fd = new FormData();
    fd.set("pairId", pairId);
    fd.set("primaryBookId", a);
    fd.set("absorbedBookId", b);
    const res = await mergeDuplicatePairAction(fd);

    expect(res.ok).toBe(true);
    expect(txMock.book.update).toHaveBeenCalled();
    expect(txMock.duplicatePair.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: pairId },
        data: expect.objectContaining({ status: "merged" }),
      }),
    );
    expect(txMock.duplicateResolutionAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "merged", primaryBookId: a, absorbedBookId: b }),
      }),
    );
  });
});
