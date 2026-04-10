import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/rbac";
import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp, parseJsonBody } from "@/lib/api/http";
import { asUuidOrThrow } from "@/lib/api/errors";
import { logAdminAudit } from "@/lib/admin/auditLog";
import { executeAdminPullBooks } from "@/lib/admin/pullBooks";
import { hashPullBooksQuery } from "@/lib/admin/pullBooksCursor";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const BodySchema = z
  .object({
    source: z.enum(["openlibrary"]).default("openlibrary"),
    query: z.string().trim().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.union([z.string().min(1), z.null()]).optional(),
    dryRun: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    const hasCursor = data.cursor != null && data.cursor.length > 0;
    const hasQuery = Boolean(data.query && data.query.length > 0);
    if (!hasCursor && (!data.query || data.query.length < 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "query is required when cursor is absent",
        path: ["query"],
      });
    }
    if (hasCursor && hasQuery) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "query must be omitted when cursor is provided",
        path: ["query"],
      });
    }
  });

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function POST(req: Request) {
  return runApiRoute(
    req,
    {
      sameOrigin: true,
      auth: requireAdmin,
      rateLimit: async ({ req, user }) => {
        const ip = getClientIp(req);
        const adminId = String((user as { id?: unknown }).id ?? "unknown");
        await rateLimitOrThrow({
          key: `admin:pull_books:${adminId}:${ip}`,
          limit: 18,
          windowMs: 60_000,
        });
      },
    },
    async ({ req, user }) => {
      const adminId = asUuidOrThrow((user as { id?: unknown }).id);
      const body = await parseJsonBody(req);
      const parsed = BodySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }

      const { source, query, limit, cursor, dryRun } = parsed.data;
      const t0 = Date.now();

      let result;
      try {
        result = await executeAdminPullBooks({
          adminUserId: adminId,
          query: query ?? "",
          limit,
          cursor: cursor ?? undefined,
          dryRun,
        });
      } catch (e) {
        if (
          e instanceof Error &&
          (e.message === "INVALID_CURSOR" || e.message === "QUERY_REQUIRED")
        ) {
          throw e;
        }
        return NextResponse.json(
          {
            // Do not expose upstream/internal error details.
            error: "Open Library unavailable",
          },
          { status: 502 },
        );
      }

      const durationMs = Date.now() - t0;
      const qForAudit = cursor && cursor.length > 0 ? null : (query ?? "").trim() || null;
      const queryLen = qForAudit ? qForAudit.length : 0;
      const queryHash = qForAudit ? hashPullBooksQuery(qForAudit) : null;

      await logAdminAudit({
        action: "pull_books",
        actorId: adminId,
        meta: {
          source: "openlibrary",
          requestedSource: source,
          created: result.created,
          skipped: result.skipped,
          durationMs,
          dryRun,
          queryLen,
          queryHash,
          hadCursor: Boolean(cursor && cursor.length > 0),
        },
      });

      return NextResponse.json(
        {
          created: result.created,
          skipped: result.skipped,
          nextCursor: result.nextCursor,
          items: result.items,
        },
        { status: 200 },
      );
    },
  );
}
