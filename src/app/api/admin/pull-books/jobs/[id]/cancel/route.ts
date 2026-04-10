import { NextResponse } from "next/server";
import { z } from "zod";

import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp } from "@/lib/api/http";
import { requireAdmin } from "@/lib/auth/rbac";
import { logAdminAudit } from "@/lib/admin/auditLog";
import { requestCancelPullBooksJob } from "@/lib/admin/pullBooksJobs";
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
          key: `admin:pull_books_job_cancel:${adminId}:${ip}`,
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
      const cancelled = await requestCancelPullBooksJob(parsed.data.id);
      if (!cancelled) {
        return NextResponse.json({ error: "Job cannot be cancelled" }, { status: 409 });
      }
      await logAdminAudit({
        action: "pull_books_job_cancel",
        actorId: adminId,
        meta: { jobId: parsed.data.id },
      });
      return NextResponse.json({ status: "cancel_requested" }, { status: 200 });
    },
  );
}
