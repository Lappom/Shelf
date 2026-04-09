import Link from "next/link";
import Image from "next/image";
import { z } from "zod";

import { requireUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResyncMetadataPanel } from "@/components/book/ResyncMetadataPanel";
import { OpenLibraryEnrichmentPanel } from "@/components/book/OpenLibraryEnrichmentPanel";
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

function normalizeAuthors(authors: unknown): string[] {
  if (!Array.isArray(authors)) return [];
  return authors
    .filter((a): a is string => typeof a === "string" && Boolean(a.trim()))
    .map((a) => a.trim())
    .slice(0, 12);
}

function formatPercent(p: number | null) {
  if (p == null || !Number.isFinite(p)) return "—";
  const x = Math.round(Math.max(0, Math.min(1, p)) * 1000) / 10;
  return `${x.toFixed(1)}%`;
}

export default async function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (user as any).role as string | undefined;
  const isAdmin = role === "admin";
  const userId = z.string().uuid().parse((user as { id?: unknown }).id);

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
      coverUrl: true,
      format: true,
      tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
    },
  });

  if (!book) return <div className="p-6">Introuvable.</div>;

  const [progress, annotations] = await Promise.all([
    prisma.userBookProgress.findUnique({
      where: { userId_bookId: { userId, bookId: book.id } },
      select: { progress: true, status: true, updatedAt: true },
    }),
    prisma.userAnnotation.findMany({
      where: { userId, bookId: book.id },
      select: { id: true, type: true, content: true, note: true, color: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
    }),
  ]);

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
    type: s.type as AddToShelfMenuShelf["type"],
    checked: memberSet.has(s.id),
  }));

  const authorList = normalizeAuthors(book.authors);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
        <Card className="overflow-hidden shadow-eleven-card">
          <div className="relative aspect-2/3 w-full bg-muted">
            {book.coverUrl ? (
              <Image
                src={`/api/books/${book.id}/cover`}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 768px) 60vw, 240px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-eleven-muted">
                Couverture
              </div>
            )}
          </div>
          <div className="space-y-2 p-4">
            <div className="text-xs text-eleven-muted">Progression</div>
            <div className="text-sm">{formatPercent(progress?.progress ?? null)}</div>
            <div className="h-2 w-full overflow-hidden rounded-eleven-pill bg-muted">
              <div
                className="h-full bg-foreground/80"
                style={{
                  width: `${Math.round(Math.max(0, Math.min(1, progress?.progress ?? 0)) * 100)}%`,
                }}
              />
            </div>
            <div className="text-xs text-eleven-muted">
              Statut: <span className="text-foreground">{progress?.status ?? "not_started"}</span>
            </div>
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <h1 className="eleven-display-section text-3xl">{book.title}</h1>
              <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-eleven-secondary">
                {authorList.length ? (
                  authorList.map((a) => (
                    <Link
                      key={a}
                      href={`/search?author=${encodeURIComponent(a)}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {a}
                    </Link>
                  ))
                ) : (
                  <span>{formatAuthors(book.authors)}</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {book.format === "epub" ? (
                <Button asChild className="rounded-eleven-pill">
                  <Link href={`/reader/${book.id}`}>Lire</Link>
                </Button>
              ) : null}
              {book.format === "epub" ? (
                <Button asChild variant="outline" className="rounded-eleven-pill">
                  <a href={`/api/books/${book.id}/file`} download>
                    Télécharger
                  </a>
                </Button>
              ) : null}
              <AddToShelfMenu bookId={book.id} shelves={shelfMenuItems} />
              <Button asChild variant="outline" className="rounded-eleven-pill">
                <Link href="/library">Retour</Link>
              </Button>
            </div>
          </div>

          <Card className="shadow-eleven-card">
            <CardHeader className="border-b border-(--eleven-border-subtle)">
              <CardTitle>Métadonnées</CardTitle>
              <CardDescription>Données en base (DB).</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs text-eleven-muted">Format</div>
                <div className="text-sm">{book.format}</div>
              </div>
              <div>
                <div className="text-xs text-eleven-muted">Langue</div>
                <div className="text-sm">{book.language ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-eleven-muted">Éditeur</div>
                <div className="text-sm">{book.publisher ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-eleven-muted">Date</div>
                <div className="text-sm">{book.publishDate ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-eleven-muted">ISBN</div>
                <div className="text-sm">{book.isbn13 ?? book.isbn10 ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-eleven-muted">Pages</div>
                <div className="text-sm">{book.pageCount ?? "—"}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs text-eleven-muted">Sujets</div>
                <div className="text-sm">
                  {Array.isArray(book.subjects) ? book.subjects.join(", ") : "—"}
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs text-eleven-muted">Tags</div>
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
                <div className="text-xs text-eleven-muted">Description</div>
                <div className="text-sm">{book.description ?? "—"}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-eleven-card">
            <CardHeader className="border-b border-(--eleven-border-subtle)">
              <CardTitle>Annotations</CardTitle>
              <CardDescription>Vos highlights, notes et marque-pages sur ce livre.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {annotations.length ? (
                <div className="space-y-3">
                  {annotations.map((a) => (
                    <div key={a.id} className="rounded-2xl border px-4 py-3">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <div className="text-xs text-eleven-muted">{a.type}</div>
                        <div className="text-xs text-eleven-muted">
                          {a.createdAt.toISOString().slice(0, 10)}
                        </div>
                      </div>
                      {a.content ? <div className="text-sm">{a.content}</div> : null}
                      {a.note ? <div className="mt-2 text-sm text-eleven-secondary">{a.note}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-eleven-muted">Aucune annotation pour l’instant.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {isAdmin && (
        <>
          <OpenLibraryEnrichmentPanel
            bookId={book.id}
            hasCover={Boolean(book.coverUrl)}
            currentIsbn={(book.isbn13 ?? book.isbn10 ?? null) as string | null}
          />
          <ResyncMetadataPanel bookId={book.id} />
        </>
      )}
    </div>
  );
}
