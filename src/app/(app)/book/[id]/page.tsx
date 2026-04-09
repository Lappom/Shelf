import Link from "next/link";
import { z } from "zod";

import { requireUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResyncMetadataPanel } from "@/components/book/ResyncMetadataPanel";
import { BookTagsPanel, type BookTagItem } from "@/components/book/BookTagsPanel";
import { AddToShelfMenu, type AddToShelfMenuShelf } from "@/components/shelf/AddToShelfMenu";

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

function formatAuthors(authors: unknown) {
  if (!Array.isArray(authors)) return "—";
  const s = authors.filter((a): a is string => typeof a === "string").join(", ");
  return s || "—";
}

export default async function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (user as any).role as string | undefined;
  const isAdmin = role === "admin";

  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return <div className="p-6">Livre invalide.</div>;

  const book = await prisma.book.findFirst({
    where: { id: parsed.data.id, deletedAt: null },
    select: {
      id: true,
      title: true,
      authors: true,
      language: true,
      description: true,
      isbn10: true,
      isbn13: true,
      publisher: true,
      publishDate: true,
      subjects: true,
      pageCount: true,
      openLibraryId: true,
      format: true,
      tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
    },
  });

  if (!book) return <div className="p-6">Introuvable.</div>;

  const selectedTags: BookTagItem[] = book.tags
    .map((bt) => bt.tag)
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));

  const allTags: BookTagItem[] = isAdmin
    ? await prisma.tag.findMany({
        select: { id: true, name: true, color: true },
        orderBy: [{ name: "asc" }],
        take: 1000,
      })
    : [];

  const shelves = await prisma.shelf.findMany({
    where: { ownerId: user.id, type: { in: ["manual", "favorites"] } },
    select: { id: true, name: true, icon: true, type: true, sortOrder: true, createdAt: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const memberships = await prisma.bookShelf.findMany({
    where: { bookId: book.id, shelfId: { in: shelves.map((s) => s.id) } },
    select: { shelfId: true },
  });
  const memberSet = new Set(memberships.map((m) => m.shelfId));

  const shelfMenuItems: AddToShelfMenuShelf[] = shelves.map((s) => ({
    id: s.id,
    name: s.name,
    icon: s.icon,
    type: s.type,
    checked: memberSet.has(s.id),
  }));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{book.title}</h1>
          <p className="text-muted-foreground text-sm">{formatAuthors(book.authors)}</p>
        </div>

        <div className="flex items-center gap-2">
          {book.format === "epub" && (
            <Button asChild>
              <Link href={`/reader/${book.id}`}>Lire</Link>
            </Button>
          )}
          <AddToShelfMenu bookId={book.id} shelves={shelfMenuItems} />
          <Button asChild variant="outline">
            <Link href="/library">Retour</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Métadonnées</CardTitle>
          <CardDescription>Données en base (DB).</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div className="text-muted-foreground text-xs">Langue</div>
            <div className="text-sm">{book.language ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Éditeur</div>
            <div className="text-sm">{book.publisher ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Date</div>
            <div className="text-sm">{book.publishDate ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">ISBN</div>
            <div className="text-sm">{book.isbn13 ?? book.isbn10 ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Pages</div>
            <div className="text-sm">{book.pageCount ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Open Library</div>
            <div className="text-sm">{book.openLibraryId ?? "—"}</div>
          </div>
          <div className="md:col-span-2">
            <div className="text-muted-foreground text-xs">Sujets</div>
            <div className="text-sm">
              {Array.isArray(book.subjects) ? book.subjects.join(", ") : "—"}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-muted-foreground text-xs">Tags</div>
            <div className="pt-1">
              <BookTagsPanel
                bookId={book.id}
                canEdit={isAdmin}
                initialSelected={selectedTags}
                allTags={allTags}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-muted-foreground text-xs">Description</div>
            <div className="text-sm">{book.description ?? "—"}</div>
          </div>
        </CardContent>
      </Card>

      {isAdmin && <ResyncMetadataPanel bookId={book.id} />}
    </div>
  );
}
