import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdminPage } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";

function normalizeAuthors(authors: unknown): string[] {
  if (!Array.isArray(authors)) return [];
  return authors.filter((a): a is string => typeof a === "string").slice(0, 10);
}

function fmtScore(score: number | null) {
  if (score == null) return "—";
  return score.toFixed(3);
}

export default async function AdminDuplicateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;

  const pair = await prisma.duplicatePair.findFirst({
    where: { id },
    select: {
      id: true,
      kind: true,
      status: true,
      score: true,
      lastScannedAt: true,
      mergedIntoBookId: true,
      bookA: {
        select: {
          id: true,
          title: true,
          authors: true,
          subtitle: true,
          isbn10: true,
          isbn13: true,
          publisher: true,
          publishDate: true,
          language: true,
          description: true,
          coverUrl: true,
          format: true,
          contentHash: true,
        },
      },
      bookB: {
        select: {
          id: true,
          title: true,
          authors: true,
          subtitle: true,
          isbn10: true,
          isbn13: true,
          publisher: true,
          publishDate: true,
          language: true,
          description: true,
          coverUrl: true,
          format: true,
          contentHash: true,
        },
      },
    },
  });
  if (!pair) return notFound();

  const a = {
    ...pair.bookA,
    authors: normalizeAuthors(pair.bookA.authors),
  };
  const b = {
    ...pair.bookB,
    authors: normalizeAuthors(pair.bookB.authors),
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Doublon — Détail</h1>
          <p className="text-muted-foreground text-sm">
            {pair.kind} · {pair.status} · score {fmtScore(pair.score)}
          </p>
          <p className="text-muted-foreground text-sm">
            Dernier scan : {pair.lastScannedAt.toLocaleString()}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/duplicates">Retour</Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-(--eleven-border-subtle) p-4">
          <h2 className="text-base font-semibold">A</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="font-medium">{a.title}</div>
            <div className="text-muted-foreground">{a.authors.join(", ") || "—"}</div>
            <div className="text-muted-foreground">Format: {a.format}</div>
            <div className="text-muted-foreground">Hash: {a.contentHash ?? "—"}</div>
            <div className="text-muted-foreground">ISBN-13: {a.isbn13 ?? "—"}</div>
            <div className="text-muted-foreground">Éditeur: {a.publisher ?? "—"}</div>
            <div className="text-muted-foreground">Langue: {a.language ?? "—"}</div>
            <Button asChild variant="outline" className="mt-2">
              <Link href={`/book/${a.id}`}>Ouvrir le livre</Link>
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-(--eleven-border-subtle) p-4">
          <h2 className="text-base font-semibold">B</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="font-medium">{b.title}</div>
            <div className="text-muted-foreground">{b.authors.join(", ") || "—"}</div>
            <div className="text-muted-foreground">Format: {b.format}</div>
            <div className="text-muted-foreground">Hash: {b.contentHash ?? "—"}</div>
            <div className="text-muted-foreground">ISBN-13: {b.isbn13 ?? "—"}</div>
            <div className="text-muted-foreground">Éditeur: {b.publisher ?? "—"}</div>
            <div className="text-muted-foreground">Langue: {b.language ?? "—"}</div>
            <Button asChild variant="outline" className="mt-2">
              <Link href={`/book/${b.id}`}>Ouvrir le livre</Link>
            </Button>
          </div>
        </section>
      </div>

      <div className="text-muted-foreground text-sm">
        Actions merge/ignore seront disponibles sur la liste, avec audit.
      </div>
    </div>
  );
}
