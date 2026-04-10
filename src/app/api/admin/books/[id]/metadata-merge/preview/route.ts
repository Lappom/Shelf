import { NextResponse } from "next/server";
import { z } from "zod";

import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp, parseJsonBody } from "@/lib/api/http";
import { asUuidOrThrow } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/rbac";
import {
  loadMetadataMergeBookContext,
  parsePerFieldDecisions,
  previewMetadataMerge,
} from "@/lib/books/metadataMergeResolution";
import { logAdminAudit } from "@/lib/admin/auditLog";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

const BodySchema = z.object({
  decisions: z.array(z.unknown()),
});

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
          key: `admin:metadata_merge_preview:${adminId}:${ip}`,
          limit: 60,
          windowMs: 60_000,
        });
      },
    },
    async ({ req, user }) => {
      const adminId = asUuidOrThrow((user as { id?: unknown }).id);
      const idParsed = ParamsSchema.safeParse(await ctx.params);
      if (!idParsed.success) {
        return NextResponse.json({ error: "Invalid book id" }, { status: 400 });
      }
      const { id } = idParsed.data;
      const body = await parseJsonBody(req);
      const parsed = BodySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }

      const decisions = parsePerFieldDecisions(parsed.data.decisions);
      if (!decisions) {
        return NextResponse.json({ error: "Invalid decisions payload" }, { status: 400 });
      }

      const loaded = await loadMetadataMergeBookContext(id);
      if (!loaded.ok) {
        const status = loaded.error === "Not found" ? 404 : 400;
        return NextResponse.json({ error: loaded.error }, { status });
      }

      const preview = previewMetadataMerge({ ctx: loaded.ctx, decisions });
      if (!preview.ok) {
        return NextResponse.json({ error: preview.error }, { status: 400 });
      }

      await logAdminAudit({
        action: "metadata_merge_preview",
        actorId: adminId,
        meta: { bookId: id, writeback: preview.writeback },
      });

      return NextResponse.json(
        {
          merged: preview.merged,
          writeback: preview.writeback,
          snapshotSyncedAt: loaded.ctx.snapshotSyncedAt,
        },
        { status: 200 },
      );
    },
  );
}
