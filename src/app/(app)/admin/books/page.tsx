import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/rbac";
import { AdminBooksClient, type AdminBookRow } from "./ui";

function normalizeAuthors(authors: unknown): string[] {
  if (!Array.isArray(authors)) return [];
  return authors.filter((a): a is string => typeof a === "string").slice(0, 5);
}

export default async function AdminBooksPage() {
  await requireAdmin();

  const books = await prisma.book.findMany({
    select: {
      id: true,
      title: true,
      authors: true,
      format: true,
      deletedAt: true,
      createdAt: true,
    },
    orderBy: [{ deletedAt: "asc" }, { createdAt: "desc" }],
    take: 500,
  });

  const rows: AdminBookRow[] = books.map((b) => ({
    id: b.id,
    title: b.title,
    authors: normalizeAuthors(b.authors),
    format: b.format,
    deletedAt: b.deletedAt ? b.deletedAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Livres</h2>
        <p className="text-muted-foreground text-sm">
          Soft delete garde les fichiers en storage. Purge définitive supprime storage + DB.
        </p>
      </div>
      <AdminBooksClient initialRows={rows} />
    </div>
  );
}
