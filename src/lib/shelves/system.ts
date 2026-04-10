import { prisma } from "@/lib/db/prisma";

export async function ensureSystemShelves(userId: string) {
  // Create (or ensure) system shelves for a user.
  // Prisma schema can't express a partial unique constraint for system shelves,
  // so we enforce idempotency in application code.
  await prisma.$transaction(async (tx) => {
    const existing = await tx.shelf.findMany({
      where: { ownerId: userId, type: { in: ["favorites", "reading", "read"] } },
      select: { type: true },
    });
    const hasFavorites = existing.some((s) => s.type === "favorites");
    const hasReading = existing.some((s) => s.type === "reading");
    const hasRead = existing.some((s) => s.type === "read");

    if (!hasFavorites) {
      await tx.shelf.create({
        data: {
          ownerId: userId,
          type: "favorites",
          name: "Favoris",
          icon: "⭐",
          sortOrder: -20,
        },
        select: { id: true },
      });
    }

    if (!hasReading) {
      await tx.shelf.create({
        data: {
          ownerId: userId,
          type: "reading",
          name: "En cours",
          icon: "📖",
          sortOrder: -10,
        },
        select: { id: true },
      });
    }

    if (!hasRead) {
      await tx.shelf.create({
        data: {
          ownerId: userId,
          type: "read",
          name: "Lus",
          icon: "✅",
          sortOrder: -5,
        },
        select: { id: true },
      });
    }
  });
}
