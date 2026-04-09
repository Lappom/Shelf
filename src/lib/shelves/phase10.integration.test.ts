import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { assertIntegrationDatabaseOrThrow } from "@/lib/db/integrationDb";
import { ensureSystemShelves } from "@/lib/shelves/system";

let dbAvailable = false;

async function cleanupAll() {
  await prisma.adminAuditLog.deleteMany({});
  await prisma.apiKey.deleteMany({});
  await prisma.userRecommendation.deleteMany({});
  await prisma.userAnnotation.deleteMany({});
  await prisma.userBookProgress.deleteMany({});
  await prisma.bookTag.deleteMany({});
  await prisma.tag.deleteMany({});
  await prisma.bookShelf.deleteMany({});
  await prisma.shelfRule.deleteMany({});
  await prisma.shelf.deleteMany({});
  await prisma.bookMetadataSnapshot.deleteMany({});
  await prisma.bookFile.deleteMany({});
  await prisma.book.deleteMany({});
  await prisma.userPreference.deleteMany({});
  await prisma.user.deleteMany({});
}

describe("Phase 10 (Shelves integration)", () => {
  beforeAll(async () => {
    dbAvailable = await assertIntegrationDatabaseOrThrow();
    if (dbAvailable) await cleanupAll();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    await cleanupAll();
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await cleanupAll();
    await prisma.$disconnect();
  });

  test("a user can have multiple manual shelves", async () => {
    if (!dbAvailable) return;

    const user = await prisma.user.create({
      data: { email: "u@example.com", username: "u", role: "reader" },
      select: { id: true },
    });

    await prisma.shelf.create({
      data: { ownerId: user.id, type: "manual", name: "S1", description: null, icon: null },
      select: { id: true },
    });
    await prisma.shelf.create({
      data: { ownerId: user.id, type: "manual", name: "S2", description: null, icon: null },
      select: { id: true },
    });

    const count = await prisma.shelf.count({ where: { ownerId: user.id, type: "manual" } });
    expect(count).toBe(2);
  });

  test("ensureSystemShelves creates favorites + reading and is idempotent", async () => {
    if (!dbAvailable) return;

    const user = await prisma.user.create({
      data: { email: "u2@example.com", username: "u2", role: "reader" },
      select: { id: true },
    });

    await ensureSystemShelves(user.id);
    await ensureSystemShelves(user.id);

    const types = await prisma.shelf.findMany({
      where: { ownerId: user.id, type: { in: ["favorites", "reading"] } },
      select: { type: true },
      orderBy: { type: "asc" },
    });

    expect(types.map((s) => s.type).sort()).toEqual(["favorites", "reading"]);
  });

  test("reordering BookShelf.sortOrder persists manual shelf order", async () => {
    if (!dbAvailable) return;

    const user = await prisma.user.create({
      data: { email: "u3@example.com", username: "u3", role: "admin" },
      select: { id: true },
    });

    const shelf = await prisma.shelf.create({
      data: { ownerId: user.id, type: "manual", name: "ToSort", description: null, icon: null },
      select: { id: true },
    });

    const bookA = await prisma.book.create({
      data: {
        title: "A",
        authors: [],
        subjects: [],
        format: "epub",
        metadataSource: "manual",
        addedById: user.id,
      },
      select: { id: true },
    });
    const bookB = await prisma.book.create({
      data: {
        title: "B",
        authors: [],
        subjects: [],
        format: "epub",
        metadataSource: "manual",
        addedById: user.id,
      },
      select: { id: true },
    });

    await prisma.bookShelf.createMany({
      data: [
        { bookId: bookA.id, shelfId: shelf.id, sortOrder: 0 },
        { bookId: bookB.id, shelfId: shelf.id, sortOrder: 1 },
      ],
    });

    await prisma.bookShelf.update({
      where: { bookId_shelfId: { bookId: bookB.id, shelfId: shelf.id } },
      data: { sortOrder: 0 },
    });
    await prisma.bookShelf.update({
      where: { bookId_shelfId: { bookId: bookA.id, shelfId: shelf.id } },
      data: { sortOrder: 1 },
    });

    const ordered = await prisma.bookShelf.findMany({
      where: { shelfId: shelf.id },
      select: { bookId: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { addedAt: "asc" }],
    });

    expect(ordered.map((x) => x.bookId)).toEqual([bookB.id, bookA.id]);
  });
});
