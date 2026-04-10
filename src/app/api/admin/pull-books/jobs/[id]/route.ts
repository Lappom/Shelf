import { NextResponse } from "next/server";
import { z } from "zod";

import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp } from "@/lib/api/http";
import { asUuidOrThrow } from "@/lib/api/errors";
import { logAdminAudit } from "@/lib/admin/auditLog";
import { deletePullBooksJob, getPullBooksJob } from "@/lib/admin/pullBooksJobs";
import { requireAdmin } from "@/lib/auth/rbac";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const ParamsSchema = z.object({ id: z.string().uuid() });

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return runApiRoute(
    req,
    {
      auth: requireAdmin,
      rateLimit: async ({ req, user }) => {
        const ip = getClientIp(req);
        const adminId = String((user as { id?: unknown }).id ?? "unknown");
        await rateLimitOrThrow({
          key: `admin:pull_books_job_detail:${adminId}:${ip}`,
          limit: 180,
          windowMs: 60_000,
        });
      },
    },
    async () => {
      const parsed = ParamsSchema.safeParse(await ctx.params);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });
      }
      const job = await getPullBooksJob(parsed.data.id);
      if (!job) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(
        {
          job: {
            ...job,
            createdAt: job.createdAt.toISOString(),
            updatedAt: job.updatedAt.toISOString(),
            startedAt: job.startedAt?.toISOString() ?? null,
            finishedAt: job.finishedAt?.toISOString() ?? null,
            nextRunAt: job.nextRunAt?.toISOString() ?? null,
            lockedAt: job.lockedAt?.toISOString() ?? null,
            cancelRequestedAt: job.cancelRequestedAt?.toISOString() ?? null,
            items: job.items.map((it) => ({
              ...it,
              createdAt: it.createdAt.toISOString(),
            })),
          },
        },
        { status: 200 },
      );
    },
  );
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return runApiRoute(
    req,
    {
      sameOrigin: true,
      auth: requireAdmin,
      rateLimit: async ({ req, user }) => {
        const ip = getClientIp(req);
        const adminId = String((user as { id?: unknown }).id ?? "unknown");
        await rateLimitOrThrow({
          key: `admin:pull_books_job_delete:${adminId}:${ip}`,
          limit: 60,
          windowMs: 60_000,
        });
      },
    },
    async ({ user }) => {
      const parsed = ParamsSchema.safeParse(await ctx.params);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });
      }
      const adminId = asUuidOrThrow((user as { id?: unknown }).id);
      const out = await deletePullBooksJob(parsed.data.id);
      if (!out.ok) {
        if (out.reason === "not_found") {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        return NextResponse.json(
          { error: "Cannot delete a running job; cancel it first" },
          { status: 409 },
        );
      }
      await logAdminAudit({
        action: "pull_books_job_delete",
        actorId: adminId,
        meta: { jobId: parsed.data.id },
      });
      return NextResponse.json({ deleted: true }, { status: 200 });
    },
  );
}
