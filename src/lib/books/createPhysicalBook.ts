import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { enrichFromOpenLibraryByIsbn } from "@/lib/metadata/openlibrary";
import { updateBookSearchVector } from "@/lib/search/searchVector";

export const CreatePhysicalBookInputSchema = z.object({
  title: z.string().min(1).max(500),
  authors: z.array(z.string().min(1)).min(1).max(50),
  isbn: z.string().optional(),
  publisher: z.string().optional(),
  publishDate: z.string().optional(),
  language: z.string().optional(),
  pageCount: z.number().int().positive().optional(),
  description: z.string().optional(),
  subjects: z.array(z.string().min(1)).max(50).optional(),
  applyOpenLibrary: z.boolean().optional(),
});

export type CreatePhysicalBookInput = z.infer<typeof CreatePhysicalBookInputSchema>;

export function normalizeIsbn(raw: string | null | undefined) {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const compact = s.replace(/[\s-]+/g, "").toUpperCase();
  if (/^[0-9]{10}$/.test(compact)) return compact;
  if (/^[0-9]{9}X$/.test(compact)) return compact;
  if (/^[0-9]{13}$/.test(compact)) return compact;
  return null;
}

export async function createPhysicalBook(args: {
  addedByUserId: string;
  input: CreatePhysicalBookInput;
}): Promise<{ bookId: string }> {
  const create = args.input;
  const isbn = normalizeIsbn(create.isbn);
  const applyOpenLibrary = Boolean(create.applyOpenLibrary);

  if (applyOpenLibrary && !isbn) {
    throw new Error("INVALID_ISBN");
  }

  const enrichment =
    applyOpenLibrary && isbn ? await enrichFromOpenLibraryByIsbn(isbn).catch(() => null) : null;

  const subjects = create.subjects?.length ? create.subjects : (enrichment?.subjects ?? []);
  const pageCount = create.pageCount ?? enrichment?.pageCount ?? null;
  const description = create.description ?? enrichment?.description ?? null;
  const metadataSource = enrichment ? "openlibrary" : "manual";

  const book = await prisma.book.create({
    data: {
      title: create.title,
      authors: create.authors,
      isbn10: isbn && isbn.length === 10 ? isbn : null,
      isbn13: isbn && isbn.length === 13 ? isbn : null,
      publisher: create.publisher?.trim() || null,
      publishDate: create.publishDate?.trim() || null,
      language: create.language?.trim() || null,
      pageCount: pageCount ?? null,
      description,
      subjects,
      format: "physical",
      contentHash: null,
      openLibraryId: enrichment?.openLibraryId ?? null,
      metadataSource: metadataSource as never,
      addedById: args.addedByUserId,
    },
    select: { id: true },
  });

  await updateBookSearchVector(book.id);
  return { bookId: book.id };
}
