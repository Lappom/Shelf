import { prisma } from "@/lib/db/prisma";

export async function ensureSystemShelves(userId: string) {
  // Create (or ensure) the two system shelves for a user.
  // Prisma schema can't express a partial unique constraint for system shelves,
  // so we enforce idempotency in application code.
  await prisma.$transaction(async (tx) => {
    const existing = await tx.shelf.findMany({
      where: { ownerId: userId, type: { in: ["favorites", "reading"] } },
      select: { type: true },
    });
    const hasFavorites = existing.some((s) => s.type === "favorites");
    const hasReading = existing.some((s) => s.type === "reading");

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
  });
}
