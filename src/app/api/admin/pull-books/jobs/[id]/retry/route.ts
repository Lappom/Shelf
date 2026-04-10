import { NextResponse } from "next/server";
import { z } from "zod";

import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp } from "@/lib/api/http";
import { requireAdmin } from "@/lib/auth/rbac";
import { logAdminAudit } from "@/lib/admin/auditLog";
import { retryPullBooksJob } from "@/lib/admin/pullBooksJobs";
import { asUuidOrThrow } from "@/lib/api/errors";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const ParamsSchema = z.object({ id: z.string().uuid() });

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return runApiRoute(
    req,
    {
      sameOrigin: true,
      auth: requireAdmin,
      rateLimit: async ({ req, user }) => {
        const ip = getClientIp(req);
        const adminId = String((user as { id?: unknown }).id ?? "unknown");
        await rateLimitOrThrow({
          key: `admin:pull_books_job_retry:${adminId}:${ip}`,
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
      const retried = await retryPullBooksJob(parsed.data.id);
      if (!retried) {
        return NextResponse.json({ error: "Job cannot be retried" }, { status: 409 });
      }
      await logAdminAudit({
        action: "pull_books_job_retry",
        actorId: adminId,
        meta: { jobId: parsed.data.id },
      });
      return NextResponse.json({ status: "queued" }, { status: 200 });
    },
  );
}
