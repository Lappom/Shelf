import { z } from "zod";

import { requireUserPage } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { loadShelfBooksPage } from "@/lib/shelves/shelfBooksPage";
import { ShelfDetailClient, type ShelfDetailShelf } from "@/components/shelf/ShelfDetailClient";

const ParamsSchema = z.object({ id: z.string().uuid() });

export default async function ShelfDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserPage();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return <div className="p-6">Étagère invalide.</div>;

  const shelf = await prisma.shelf.findFirst({
    where: { id: parsed.data.id, ownerId: userId },
    select: {
      id: true,
      name: true,
      description: true,
      icon: true,
      type: true,
      createdAt: true,
      sortOrder: true,
      rule: { select: { rules: true } },
    },
  });

  if (!shelf) return <div className="p-6">Introuvable.</div>;

  const shelfDto: ShelfDetailShelf = {
    id: shelf.id,
    name: shelf.name,
    description: shelf.description,
    icon: shelf.icon,
    type: shelf.type,
    createdAt: shelf.createdAt.toISOString(),
    rules:
      shelf.type === "dynamic" ? (shelf.rule?.rules ?? { match: "all", conditions: [] }) : null,
  };

  const { books, nextCursor } = await loadShelfBooksPage({
    userId,
    shelfId: shelf.id,
    shelfType: shelf.type,
    rulesJson: shelf.type === "dynamic" ? (shelf.rule?.rules ?? null) : null,
    cursor: null,
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-10">
      <ShelfDetailClient shelf={shelfDto} initialBooks={books} initialNextCursor={nextCursor} />
    </div>
  );
}
