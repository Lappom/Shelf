import { z } from "zod";

import { requireUserPage } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { EpubReaderLazy } from "@/components/reader/EpubReaderLazy";

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

export default async function ReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserPage();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return <div className="p-6">Livre invalide.</div>;

  const fileUrl = `/api/books/${parsed.data.id}/file`;

  const book = await prisma.book.findFirst({
    where: { id: parsed.data.id, deletedAt: null },
    select: { id: true, title: true, authors: true, format: true },
  });
  if (!book) return <div className="p-6">Introuvable.</div>;
  if (book.format !== "epub") return <div className="p-6">Ce livre n’est pas un EPUB.</div>;

  const prefs = await prisma.userPreference.findUnique({
    where: { userId },
    select: {
      readerFontFamily: true,
      readerFontSize: true,
      readerLineHeight: true,
      readerMargin: true,
      readerTheme: true,
      readerFlow: true,
    },
  });

  const progress = await prisma.userBookProgress.findUnique({
    where: { userId_bookId: { userId, bookId: book.id } },
    select: { progress: true, currentCfi: true, currentPage: true, status: true, updatedAt: true },
  });

  const annotations = await prisma.userAnnotation.findMany({
    where: { userId, bookId: book.id },
    select: { id: true, type: true, cfiRange: true, content: true, note: true, color: true },
    orderBy: [{ createdAt: "asc" }],
    take: 2000,
  });

  const authors = Array.isArray(book.authors)
    ? book.authors.filter((a): a is string => typeof a === "string").slice(0, 50)
    : [];

  return (
    <EpubReaderLazy
      bookId={book.id}
      fileUrl={fileUrl}
      bookTitle={book.title}
      bookAuthors={authors}
      initialPrefs={prefs}
      initialProgress={progress}
      initialAnnotations={annotations}
    />
  );
}
