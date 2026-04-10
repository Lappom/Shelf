import type { CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { z } from "zod";

import { requireUserPage } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResyncMetadataPanel } from "@/components/book/ResyncMetadataPanel";
import { OpenLibraryEnrichmentPanel } from "@/components/book/OpenLibraryEnrichmentPanel";
import { BookTagsPanel, type BookTagItem } from "@/components/book/BookTagsPanel";
import { BookReadingStatusSelect } from "@/components/book/BookReadingStatusSelect";
import { BookRecoFeedbackPanel } from "@/components/book/BookRecoFeedbackPanel";
import { FavoriteToggle } from "@/components/book/FavoriteToggle";
import { AddToShelfMenu, type AddToShelfMenuShelf } from "@/components/shelf/AddToShelfMenu";
import { createCoverAccessToken } from "@/lib/cover/coverToken";

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
  const user = await requireUserPage();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (user as any).role as string | undefined;
  const isAdmin = role === "admin";
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);

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

  const [progress, annotations, recoFeedback] = await Promise.all([
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
    prisma.userRecommendationFeedback.findUnique({
      where: { userId_bookId: { userId, bookId: book.id } },
      select: { kind: true },
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

  const favoritesShelf = shelves.find((s) => s.type === "favorites");
  const progressStatus = (progress?.status ?? "not_started") as
    | "not_started"
    | "reading"
    | "finished"
    | "abandoned";
  const recoKind = recoFeedback?.kind === "like" || recoFeedback?.kind === "dislike" ? recoFeedback.kind : null;

  const authorList = normalizeAuthors(book.authors);
  const coverToken = book.coverUrl ? createCoverAccessToken(book.id) : null;
  const coverSrc = book.coverUrl
    ? coverToken
      ? `/api/books/${book.id}/cover?t=${encodeURIComponent(coverToken)}`
      : `/api/books/${book.id}/cover`
    : null;

  const annotationEnterDelayMs = (index: number) =>
    index < 8 ? 320 + index * 45 : 320 + 7 * 45;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
        <Card
          className="book-detail-enter shadow-eleven-card gap-0 overflow-hidden p-0"
          style={{ "--book-enter-delay": "0ms" } as CSSProperties}
        >
          <div className="bg-muted relative aspect-2/3 w-full">
            {coverSrc ? (
              <Image
                src={coverSrc}
                alt=""
                fill
                unoptimized={!coverToken}
                className="object-cover"
                sizes="(max-width: 768px) 60vw, 240px"
              />
            ) : (
              <div className="text-eleven-muted flex h-full w-full items-center justify-center text-xs">
                Couverture
              </div>
            )}
          </div>
          <div className="space-y-2 p-4">
            <div className="text-eleven-muted text-xs">Progression</div>
            <div className="text-sm">{formatPercent(progress?.progress ?? null)}</div>
            <div className="rounded-eleven-pill bg-muted h-2 w-full overflow-hidden">
              <div
                className="bg-foreground/80 h-full"
                style={{
                  width: `${Math.round(Math.max(0, Math.min(1, progress?.progress ?? 0)) * 100)}%`,
                }}
              />
            </div>
            <BookReadingStatusSelect
              bookId={book.id}
              bookFormat={book.format}
              initialStatus={progressStatus}
              className="pt-1"
            />
            <BookRecoFeedbackPanel bookId={book.id} initialKind={recoKind} className="border-eleven-border-subtle border-t pt-3" />
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div
              className="book-detail-enter min-w-0 space-y-2"
              style={{ "--book-enter-delay": "70ms" } as CSSProperties}
            >
              <h1 className="eleven-display-section text-3xl">{book.title}</h1>
              <div className="text-eleven-secondary flex flex-wrap gap-x-2 gap-y-1 text-sm">
                {authorList.length ? (
                  authorList.map((a) => (
                    <Link
                      key={a}
                      href={`/library?author=${encodeURIComponent(a)}`}
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

            <div
              className="book-detail-actions book-detail-enter flex flex-wrap items-center gap-2"
              style={{ "--book-enter-delay": "140ms" } as CSSProperties}
            >
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
              {favoritesShelf ? (
                <FavoriteToggle
                  bookId={book.id}
                  favoritesShelfId={favoritesShelf.id}
                  initialFavorite={memberSet.has(favoritesShelf.id)}
                />
              ) : null}
              <AddToShelfMenu bookId={book.id} shelves={shelfMenuItems} />
              <Button asChild variant="outline" className="rounded-eleven-pill">
                <Link href="/library">Retour</Link>
              </Button>
            </div>
          </div>

          <Card
            className="book-detail-enter shadow-eleven-card"
            style={{ "--book-enter-delay": "210ms" } as CSSProperties}
          >
            <CardHeader className="border-b border-(--eleven-border-subtle)">
              <CardTitle>Métadonnées</CardTitle>
              <CardDescription>Données en base (DB).</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="text-eleven-muted text-xs">Format</div>
                <div className="text-sm">{book.format}</div>
              </div>
              <div>
                <div className="text-eleven-muted text-xs">Langue</div>
                <div className="text-sm">{book.language ?? "—"}</div>
              </div>
              <div>
                <div className="text-eleven-muted text-xs">Éditeur</div>
                <div className="text-sm">{book.publisher ?? "—"}</div>
              </div>
              <div>
                <div className="text-eleven-muted text-xs">Date</div>
                <div className="text-sm">{book.publishDate ?? "—"}</div>
              </div>
              <div>
                <div className="text-eleven-muted text-xs">ISBN</div>
                <div className="text-sm">{book.isbn13 ?? book.isbn10 ?? "—"}</div>
              </div>
              <div>
                <div className="text-eleven-muted text-xs">Pages</div>
                <div className="text-sm">{book.pageCount ?? "—"}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-eleven-muted text-xs">Sujets</div>
                <div className="text-sm">
                  {Array.isArray(book.subjects) ? book.subjects.join(", ") : "—"}
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="text-eleven-muted text-xs">Tags</div>
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
                <div className="text-eleven-muted text-xs">Description</div>
                <div className="text-sm">{book.description ?? "—"}</div>
              </div>
            </CardContent>
          </Card>

          <Card
            className="book-detail-enter shadow-eleven-card"
            style={{ "--book-enter-delay": "280ms" } as CSSProperties}
          >
            <CardHeader className="border-b border-(--eleven-border-subtle)">
              <CardTitle>Annotations</CardTitle>
              <CardDescription>Vos highlights, notes et marque-pages sur ce livre.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {annotations.length ? (
                <div className="space-y-3">
                  {annotations.map((a, index) => (
                    <div
                      key={a.id}
                      className="book-detail-note-enter rounded-2xl border px-4 py-3"
                      style={
                        {
                          "--book-enter-delay": `${annotationEnterDelayMs(index)}ms`,
                        } as CSSProperties
                      }
                    >
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <div className="text-eleven-muted text-xs">{a.type}</div>
                        <div className="text-eleven-muted text-xs">
                          {a.createdAt.toISOString().slice(0, 10)}
                        </div>
                      </div>
                      {a.content ? <div className="text-sm">{a.content}</div> : null}
                      {a.note ? (
                        <div className="text-eleven-secondary mt-2 text-sm">{a.note}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-eleven-muted text-sm">Aucune annotation pour l’instant.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {isAdmin && (
        <>
          <div
            className="book-detail-enter"
            style={{ "--book-enter-delay": "350ms" } as CSSProperties}
          >
            <OpenLibraryEnrichmentPanel
              bookId={book.id}
              hasCover={Boolean(book.coverUrl)}
              currentIsbn={(book.isbn13 ?? book.isbn10 ?? null) as string | null}
            />
          </div>
          {book.format === "epub" ? (
            <div
              className="book-detail-enter"
              style={{ "--book-enter-delay": "420ms" } as CSSProperties}
            >
              <ResyncMetadataPanel bookId={book.id} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
