import { describe, expect, test, beforeAll, afterAll, beforeEach } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { assertIntegrationDatabaseOrThrow } from "@/lib/db/integrationDb";
import { ensureSystemShelves } from "@/lib/shelves/system";

let dbAvailable = false;

async function cleanupAll() {
  // Order matters due to FK constraints.
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

describe("Phase 1 (DB integration)", () => {
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

  test("ensureSystemShelves creates favorites + reading and is idempotent", async () => {
    if (!dbAvailable) return;

    const user = await prisma.user.create({
      data: { email: "u1@example.com", username: "u1", role: "reader" },
      select: { id: true },
    });

    await ensureSystemShelves(user.id);
    await ensureSystemShelves(user.id);

    const shelves = await prisma.shelf.findMany({
      where: { ownerId: user.id },
      select: { type: true, name: true },
      orderBy: { type: "asc" },
    });

    expect(shelves.map((s) => s.type).sort()).toEqual(["favorites", "reading"]);
  });

  test("partial unique index prevents duplicate active books by content_hash", async () => {
    if (!dbAvailable) return;

    const user = await prisma.user.create({
      data: { email: "admin@example.com", username: "admin", role: "admin" },
      select: { id: true },
    });

    await prisma.book.create({
      data: {
        title: "A",
        authors: [],
        subjects: [],
        format: "epub",
        contentHash: "a".repeat(64),
        metadataSource: "manual",
        addedById: user.id,
      },
      select: { id: true },
    });

    await expect(
      prisma.book.create({
        data: {
          title: "B",
          authors: [],
          subjects: [],
          format: "epub",
          contentHash: "a".repeat(64),
          metadataSource: "manual",
          addedById: user.id,
        },
        select: { id: true },
      }),
    ).rejects.toBeTruthy();
  });

  test("partial unique index prevents duplicate active books by isbn_13", async () => {
    if (!dbAvailable) return;

    const user = await prisma.user.create({
      data: { email: "admin2@example.com", username: "admin2", role: "admin" },
      select: { id: true },
    });

    await prisma.book.create({
      data: {
        title: "A",
        authors: [],
        subjects: [],
        format: "physical",
        isbn13: "9781234567890",
        metadataSource: "manual",
        addedById: user.id,
      },
      select: { id: true },
    });

    await expect(
      prisma.book.create({
        data: {
          title: "B",
          authors: [],
          subjects: [],
          format: "physical",
          isbn13: "9781234567890",
          metadataSource: "manual",
          addedById: user.id,
        },
        select: { id: true },
      }),
    ).rejects.toBeTruthy();
  });
});
