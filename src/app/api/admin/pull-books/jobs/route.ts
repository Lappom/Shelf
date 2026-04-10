import { NextResponse } from "next/server";
import { z } from "zod";

import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp } from "@/lib/api/http";
import { requireAdmin } from "@/lib/auth/rbac";
import { listPullBooksJobs, triggerPullBooksWorker } from "@/lib/admin/pullBooksJobs";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request) {
  return runApiRoute(
    req,
    {
      auth: requireAdmin,
      rateLimit: async ({ req, user }) => {
        const ip = getClientIp(req);
        const adminId = String((user as { id?: unknown }).id ?? "unknown");
        await rateLimitOrThrow({
          key: `admin:pull_books_jobs:${adminId}:${ip}`,
          limit: 120,
          windowMs: 60_000,
        });
      },
    },
    async ({ req }) => {
      const url = new URL(req.url);
      const parsed = QuerySchema.safeParse({
        limit: url.searchParams.get("limit") ?? undefined,
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid query" }, { status: 400 });
      }
      // Kick the worker when listing jobs to improve crash recovery.
      await triggerPullBooksWorker();
      const jobs = await listPullBooksJobs(parsed.data.limit);
      return NextResponse.json(
        {
          jobs: jobs.map((j) => ({
            ...j,
            createdAt: j.createdAt.toISOString(),
            updatedAt: j.updatedAt.toISOString(),
            startedAt: j.startedAt?.toISOString() ?? null,
            finishedAt: j.finishedAt?.toISOString() ?? null,
            cancelRequestedAt: j.cancelRequestedAt?.toISOString() ?? null,
          })),
        },
        { status: 200 },
      );
    },
  );
}
