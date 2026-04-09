import Link from "next/link";

import { requireUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { ShelvesPageClient, type ShelfListItem } from "@/components/shelf";

export default async function ShelvesPage() {
  const user = await requireUser();

  type ShelfRow = {
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    type: ShelfListItem["type"];
    sortOrder: number;
    createdAt: Date;
    _count: { books: number };
  };

  const shelves: ShelfRow[] = await prisma.shelf.findMany({
    where: { ownerId: user.id },
    select: {
      id: true,
      name: true,
      description: true,
      icon: true,
      type: true,
      sortOrder: true,
      createdAt: true,
      _count: { select: { books: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
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
  }));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Étagères</h1>
          <p className="text-muted-foreground text-sm">
            Organise tes livres avec des étagères manuelles et dynamiques.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
            href="/library"
          >
            Retour bibliothèque
          </Link>
        </div>
      </div>

      <ShelvesPageClient initialShelves={items} />
    </div>
  );
}

