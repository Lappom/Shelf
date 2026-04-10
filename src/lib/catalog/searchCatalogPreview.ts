import { z } from "zod";

import { normalizeIsbn } from "@/lib/books/isbn";
import {
  buildOpenLibraryCoverUrl,
  searchOpenLibraryCatalog,
  type OpenLibrarySearchCandidate,
} from "@/lib/metadata/openlibrary";

export const CatalogSearchInputSchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    title: z.string().trim().max(200).optional(),
    author: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(10).default(10),
  })
  .superRefine((data, ctx) => {
    const hasQ = Boolean(data.q && data.q.length > 0);
    const hasTitle = Boolean(data.title && data.title.length > 0);
    const hasAuthor = Boolean(data.author && data.author.length > 0);

    if (hasQ === hasTitle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of q or title",
        path: ["q"],
      });
    }

    if (hasQ && hasAuthor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "author is only allowed with title search",
        path: ["author"],
      });
    }
  });

export type CatalogSearchInput = z.infer<typeof CatalogSearchInputSchema>;

export type CatalogSearchCandidate = OpenLibrarySearchCandidate & {
  coverPreviewUrl: string | null;
};

function withCoverPreview(c: OpenLibrarySearchCandidate): CatalogSearchCandidate {
  let coverPreviewUrl: string | null = null;
  for (const raw of c.isbns) {
    const n = normalizeIsbn(raw);
    if (!n) continue;
    coverPreviewUrl = buildOpenLibraryCoverUrl(n);
    break;
  }
  return { ...c, coverPreviewUrl };
}

export async function searchCatalogPreview(input: CatalogSearchInput) {
  const q = input.q?.trim();
  const title = input.title?.trim();
  const author = input.author?.trim();
  const candidates = await searchOpenLibraryCatalog({
    q: q && q.length > 0 ? q : undefined,
    title: title && title.length > 0 ? title : undefined,
    author: author && author.length > 0 ? author : undefined,
    limit: input.limit,
  });
  return { candidates: candidates.map(withCoverPreview) };
}
