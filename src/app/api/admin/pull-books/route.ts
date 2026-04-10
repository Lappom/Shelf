import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/rbac";
import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp, parseJsonBody } from "@/lib/api/http";
import { asUuidOrThrow } from "@/lib/api/errors";
import { logAdminAudit } from "@/lib/admin/auditLog";
import { enqueuePullBooksJob } from "@/lib/admin/pullBooksJobs";
import { hashPullBooksQuery } from "@/lib/admin/pullBooksCursor";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const BodySchema = z.object({
  source: z.enum(["openlibrary"]).default("openlibrary"),
  query: z.string().trim().min(1).max(200),
  chunkSize: z.coerce.number().int().min(1).max(50).default(20),
  dryRun: z.boolean().default(false),
  maxAttempts: z.coerce.number().int().min(1).max(5).default(3),
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

      const { source, query, chunkSize, dryRun, maxAttempts } = parsed.data;
      const t0 = Date.now();

      const result = await enqueuePullBooksJob({
        createdById: adminId,
        query,
        chunkSize,
        dryRun,
        maxAttempts,
      });

      const durationMs = Date.now() - t0;
      const qForAudit = query.trim() || null;
      const queryLen = qForAudit ? qForAudit.length : 0;
      const queryHash = qForAudit ? hashPullBooksQuery(qForAudit) : null;

      await logAdminAudit({
        action: "pull_books_job_create",
        actorId: adminId,
        meta: {
          source: "openlibrary",
          requestedSource: source,
          jobId: result.id,
          durationMs,
          dryRun,
          chunkSize,
          maxAttempts,
          queryLen,
          queryHash,
        },
      });

      return NextResponse.json(
        {
          jobId: result.id,
          status: result.status,
        },
        { status: 202 },
      );
    },
  );
}
