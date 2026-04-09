import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/rbac";
import { AdminDuplicatesClient, type AdminDuplicateRow } from "./ui";

function normalizeAuthors(authors: unknown): string[] {
  if (!Array.isArray(authors)) return [];
  return authors.filter((a): a is string => typeof a === "string").slice(0, 5);
}

export default async function AdminDuplicatesPage() {
  await requireAdmin();

  const pairs = await prisma.duplicatePair.findMany({
    select: {
      id: true,
      kind: true,
      status: true,
      score: true,
      lastScannedAt: true,
      createdAt: true,
      updatedAt: true,
      mergedIntoBookId: true,
      bookA: { select: { id: true, title: true, authors: true, format: true, coverUrl: true } },
      bookB: { select: { id: true, title: true, authors: true, format: true, coverUrl: true } },
    },
    orderBy: [{ status: "asc" }, { lastScannedAt: "desc" }],
    take: 500,
  });

  const rows: AdminDuplicateRow[] = pairs.map((p) => ({
    id: p.id,
    kind: p.kind,
    status: p.status,
    score: p.score ?? null,
    lastScannedAt: p.lastScannedAt.toISOString(),
    mergedIntoBookId: p.mergedIntoBookId ?? null,
    bookA: {
      id: p.bookA.id,
      title: p.bookA.title,
      authors: normalizeAuthors(p.bookA.authors),
      format: p.bookA.format,
      coverUrl: p.bookA.coverUrl ?? null,
    },
    bookB: {
      id: p.bookB.id,
      title: p.bookB.title,
      authors: normalizeAuthors(p.bookB.authors),
      format: p.bookB.format,
      coverUrl: p.bookB.coverUrl ?? null,
    },
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Doublons</h2>
        <p className="text-muted-foreground text-sm">
          Scan hash (fichiers identiques) + scan fuzzy (titre+auteurs) pour proposer des fusions.
        </p>
      </div>
      <AdminDuplicatesClient initialRows={rows} />
    </div>
  );
}
