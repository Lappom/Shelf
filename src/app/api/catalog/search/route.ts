import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/rbac";
import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp } from "@/lib/api/http";
import { asUuidOrThrow } from "@/lib/api/errors";
import { annotateCatalogCandidatesLibraryOwnership } from "@/lib/catalog/annotateCatalogLibraryOwnership";
import { searchCatalogPreviewCached } from "@/lib/catalog/searchCatalogPreview";
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
          key: `catalog:external:${userId}:${ip}`,
          limit: 30,
          windowMs: 60_000,
        });
      },
    },
    async ({ req, user }) => {
      const userId = z.string().uuid().parse((user as { id?: unknown }).id);
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

      try {
        const result = await searchCatalogPreviewCached(parsed.data);
        const candidates = await annotateCatalogCandidatesLibraryOwnership(
          userId,
          result.candidates,
        );
        return NextResponse.json({ ...result, candidates }, { status: 200 });
      } catch {
        return NextResponse.json({ error: "Catalog provider unavailable" }, { status: 502 });
      }
    },
  );
}
