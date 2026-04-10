import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/rbac";
import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp } from "@/lib/api/http";
import { asUuidOrThrow } from "@/lib/api/errors";
import { normalizeIsbn } from "@/lib/books/isbn";
import {
  buildOpenLibraryCoverUrl,
  searchOpenLibraryCatalog,
  type OpenLibrarySearchCandidate,
} from "@/lib/metadata/openlibrary";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const QuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    title: z.string().trim().max(200).optional(),
    author: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(10).default(10),
  })
  .superRefine((data, ctx) => {
    const hasQ = Boolean(data.q && data.q.length > 0);
    const hasTitle = Boolean(data.title && data.title.length > 0);
    if (hasQ && hasTitle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either q or title, not both",
        path: ["q"],
      });
    }
    if (!hasQ && !hasTitle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide q or title",
        path: ["q"],
      });
    }
  });

export type CatalogSearchCandidate = OpenLibrarySearchCandidate & {
  coverPreviewUrl: string | null;
};

function withCoverPreview(c: OpenLibrarySearchCandidate): CatalogSearchCandidate {
  let coverPreviewUrl: string | null = null;
  for (const raw of c.isbns) {
    const n = normalizeIsbn(raw);
    if (n) {
      coverPreviewUrl = buildOpenLibraryCoverUrl(n);
      break;
    }
  }
  return { ...c, coverPreviewUrl };
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request) {
  return runApiRoute(
    req,
    {
      auth: requireUser,
      rateLimit: async ({ req, user }) => {
        const ip = getClientIp(req);
        const userId = asUuidOrThrow((user as { id?: unknown } | null)?.id);
        await rateLimitOrThrow({
          key: `catalog:openlibrary:${userId}:${ip}`,
          limit: 30,
          windowMs: 60_000,
        });
      },
    },
    async ({ req }) => {
      const url = new URL(req.url);
      const parsed = QuerySchema.safeParse({
        q: url.searchParams.get("q") ?? undefined,
        title: url.searchParams.get("title") ?? undefined,
        author: url.searchParams.get("author") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
      });
      if (!parsed.success) {
        const first = parsed.error.flatten().formErrors[0] ?? "Invalid query";
        return NextResponse.json({ error: first }, { status: 400 });
      }

      const { q, title, author, limit } = parsed.data;

      try {
        const candidates = await searchOpenLibraryCatalog({
          q: q && q.length > 0 ? q : undefined,
          title: title && title.length > 0 ? title : undefined,
          author: author && author.length > 0 ? author : undefined,
          limit,
        });
        const out: CatalogSearchCandidate[] = candidates.map(withCoverPreview);
        return NextResponse.json({ candidates: out }, { status: 200 });
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "OpenLibrary error" },
          { status: 502 },
        );
      }
    },
  );
}
