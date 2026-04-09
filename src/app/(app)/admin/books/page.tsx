import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/rbac";
import { ADMIN_BOOKS_PAGE, encodeAdminBooksCursor, toAdminBookRow } from "./adminBooksShared";
import { AdminBooksClient, type AdminBookRow } from "./ui";

export default async function AdminBooksPage() {
  await requireAdmin();

  const fetched = await prisma.book.findMany({
    select: {
      id: true,
      title: true,
      authors: true,
      format: true,
      deletedAt: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ADMIN_BOOKS_PAGE + 1,
  });

  const hasMore = fetched.length > ADMIN_BOOKS_PAGE;
  const page = hasMore ? fetched.slice(0, ADMIN_BOOKS_PAGE) : fetched;
  const rows: AdminBookRow[] = page.map(toAdminBookRow);

  const last = page[page.length - 1];
  const initialNextCursor =
    hasMore && last ? encodeAdminBooksCursor(last.createdAt, last.id) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Livres</h2>
        <p className="text-muted-foreground text-sm">
          Soft delete garde les fichiers en storage. Purge définitive supprime storage + DB. Tri :
          plus récemment créés en premier.
        </p>
      </div>
      <AdminBooksClient initialRows={rows} initialNextCursor={initialNextCursor} />
    </div>
  );
}
