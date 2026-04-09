import { prisma } from "@/lib/db/prisma";

export async function ensureSystemShelves(userId: string) {
  // Create (or ensure) the two system shelves for a user.
  // Uniqueness is enforced by DB unique index (owner_id, type).
  await prisma.shelf.upsert({
    where: {
      ownerId_type: { ownerId: userId, type: "favorites" },
    },
    update: {},
    create: {
      ownerId: userId,
      type: "favorites",
      name: "Favoris",
      icon: "⭐",
      sortOrder: -20,
    },
  });

  await prisma.shelf.upsert({
    where: {
      ownerId_type: { ownerId: userId, type: "reading" },
    },
    update: {},
    create: {
      ownerId: userId,
      type: "reading",
      name: "En cours",
      icon: "📖",
      sortOrder: -10,
    },
  });
}

