import { requireUserPage } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { UploadEpubDialog } from "@/components/book/UploadEpubDialog";
import { AddPhysicalBookDialog } from "@/components/book/AddPhysicalBookDialog";
import { LibraryAdminFab } from "@/components/library/LibraryAdminFab";
import { LibraryPageClient } from "@/components/library/LibraryPageClient";
import { loadRecommendationsPage } from "@/lib/recommendations/loadRecommendationsPage";

export default async function LibraryPage() {
  const user = await requireUserPage();
  if (!user.id) throw new Error("User id is missing");
  const userId = user.id;
  const role = (user as { role?: unknown }).role;
  const isAdmin = (typeof role === "string" ? role : undefined) === "admin";

  const [tags, shelves, pref, recoFirst] = await Promise.all([
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
        libraryView: "grid",
        booksPerPage: 24,
        libraryInfiniteScroll: false,
      },
      select: { booksPerPage: true, libraryInfiniteScroll: true, libraryView: true },
    }),
    loadRecommendationsPage({ userId, limit: 10, cursor: null, reasonCode: null }),
  ]);

  const initialRecommendations = recoFirst.rows.map((r) => ({
    bookId: r.bookId,
    title: r.title,
    authors: r.authors,
    coverUrl: r.coverUrl,
    coverToken: r.coverToken,
    reasons: r.reasons,
  }));

  return (
    <>
      {isAdmin ? <LibraryAdminFab /> : null}
      <LibraryPageClient
        initialRecommendations={initialRecommendations}
        initialTags={tags}
        initialShelves={shelves}
        initialPrefs={{
          booksPerPage: pref.booksPerPage,
          libraryInfiniteScroll: pref.libraryInfiniteScroll,
          libraryView: pref.libraryView ?? "grid",
        }}
        isAdmin={isAdmin}
        adminFab={
          isAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              <AddPhysicalBookDialog />
              <UploadEpubDialog />
            </div>
          ) : null
        }
      />
    </>
  );
}
