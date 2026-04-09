import Link from "next/link";
import { z } from "zod";

import { requireUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { SearchPageClient } from "@/components/search/SearchPageClient";

export default async function SearchPage() {
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);

  const [tags, shelves, pref] = await Promise.all([
    prisma.tag.findMany({
      select: { id: true, name: true, color: true },
      orderBy: [{ name: "asc" }],
      take: 1000,
    }),
    prisma.shelf.findMany({
      where: { ownerId: userId },
      select: { id: true, name: true, type: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 1000,
    }),
    prisma.userPreference.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        theme: "system",
        booksPerPage: 24,
        libraryInfiniteScroll: false,
      },
      select: { booksPerPage: true, libraryInfiniteScroll: true },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Recherche</h1>
          <p className="text-muted-foreground text-sm">
            Recherche full-text + fuzzy, filtres combinables, tri et pagination.
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

      <SearchPageClient initialTags={tags} initialShelves={shelves} initialPrefs={pref} />
    </div>
  );
}
