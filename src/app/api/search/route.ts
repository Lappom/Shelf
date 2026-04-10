import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/rbac";
import { runApiRoute } from "@/lib/api/route";
import { getClientIp, corsPreflight } from "@/lib/api/http";
import { asUuidOrThrow } from "@/lib/api/errors";
import {
  LibrarySortDirSchema,
  LibrarySortSchema,
  searchBooksForUser,
  splitCsvList,
} from "@/lib/library/searchBooksForUser";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const QuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).max(512).optional(),
  mode: z.enum(["websearch", "plain"]).default("websearch"),
  sort: LibrarySortSchema.default("relevance"),
  dir: LibrarySortDirSchema.default("desc"),

  formats: z.string().optional(),
  languages: z.string().optional(),
  tagIds: z.string().optional(),
  shelfId: z.string().uuid().optional(),
  statuses: z.string().optional(),

  author: z.string().trim().min(1).max(200).optional(),
  publisher: z.string().trim().min(1).max(255).optional(),

  addedFrom: z.string().trim().min(1).max(40).optional(),
  addedTo: z.string().trim().min(1).max(40).optional(),
  pagesMin: z.coerce.number().int().min(1).optional(),
  pagesMax: z.coerce.number().int().min(1).optional(),
});

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
        await rateLimitOrThrow({ key: `search:${userId}:${ip}`, limit: 120, windowMs: 60_000 });
      },
    },
    async ({ req, user }) => {
      const userId = z
        .string()
        .uuid()
        .parse((user as { id?: unknown }).id);

      const url = new URL(req.url);
      const parsed = QuerySchema.safeParse({
        q: url.searchParams.get("q") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
        mode: url.searchParams.get("mode") ?? undefined,
        sort: url.searchParams.get("sort") ?? undefined,
        dir: url.searchParams.get("dir") ?? undefined,

        formats: url.searchParams.get("formats") ?? undefined,
        languages: url.searchParams.get("languages") ?? undefined,
        tagIds: url.searchParams.get("tagIds") ?? undefined,
        shelfId: url.searchParams.get("shelfId") ?? undefined,
        statuses: url.searchParams.get("statuses") ?? undefined,

        author: url.searchParams.get("author") ?? undefined,
        publisher: url.searchParams.get("publisher") ?? undefined,

        addedFrom: url.searchParams.get("addedFrom") ?? undefined,
        addedTo: url.searchParams.get("addedTo") ?? undefined,
        pagesMin: url.searchParams.get("pagesMin") ?? undefined,
        pagesMax: url.searchParams.get("pagesMax") ?? undefined,
      });
      if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

      const d = parsed.data;
      const formatsList = splitCsvList(d.formats);
      const languagesList = splitCsvList(d.languages);
      const tagIdsList = splitCsvList(d.tagIds);
      const statusesList = splitCsvList(d.statuses);

      const res = await searchBooksForUser({
        userId,
        q: d.q,
        limit: d.limit,
        cursor: d.cursor,
        mode: d.mode,
        sort: d.sort,
        dir: d.dir,
        formats: formatsList,
        languages: languagesList,
        tagIds: tagIdsList,
        shelfId: d.shelfId,
        statuses: statusesList,
        author: d.author,
        publisher: d.publisher,
        addedFrom: d.addedFrom,
        addedTo: d.addedTo,
        pagesMin: d.pagesMin,
        pagesMax: d.pagesMax,
      });

      if (!res.ok) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

      return NextResponse.json(
        { results: res.results, nextCursor: res.nextCursor },
        { status: 200 },
      );
    },
  );
}
