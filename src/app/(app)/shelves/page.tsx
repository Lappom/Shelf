import Link from "next/link";
import { z } from "zod";

import { requireUserPage } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { loadShelfCoverPreviewsForList } from "@/lib/shelves/shelfCoverPreviews";
import { ShelvesPageClient, type ShelfListItem } from "@/components/shelf";
import { Button } from "@/components/ui/button";

export default async function ShelvesPage() {
  const user = await requireUserPage();
  const userId = z.string().uuid().parse((user as { id?: unknown }).id);

  type ShelfRow = {
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    type: ShelfListItem["type"];
    sortOrder: number;
    createdAt: Date;
    _count: { books: number };
    rule: { rules: unknown } | null;
  };

  const shelves: ShelfRow[] = await prisma.shelf.findMany({
    where: { ownerId: userId },
    select: {
      id: true,
      name: true,
      description: true,
      icon: true,
      type: true,
      sortOrder: true,
      createdAt: true,
      _count: { select: { books: true } },
      rule: { select: { rules: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const coverPreviews = await loadShelfCoverPreviewsForList({
    userId,
    shelves: shelves.map((s) => ({
      id: s.id,
      type: s.type,
      rulesJson: s.type === "dynamic" ? (s.rule?.rules ?? null) : null,
    })),
  });

  const items: ShelfListItem[] = shelves.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    icon: s.icon,
    type: s.type,
    sortOrder: s.sortOrder,
    createdAt: s.createdAt.toISOString(),
    booksCount: s.type === "manual" || s.type === "favorites" ? s._count.books : null,
    previewCovers: coverPreviews[s.id] ?? [],
  }));

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="eleven-display-section text-foreground text-3xl md:text-4xl">Étagères</h1>
          <p className="text-eleven-secondary eleven-body-airy text-sm">
            Organise tes livres avec des étagères manuelles et dynamiques.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="whitePill">
            <Link href="/library">Bibliothèque</Link>
          </Button>
        </div>
      </div>

      <ShelvesPageClient initialShelves={items} />
    </div>
  );
}
