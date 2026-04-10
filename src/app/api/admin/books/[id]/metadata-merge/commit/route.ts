import { NextResponse } from "next/server";
import { z } from "zod";

import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp, parseJsonBody } from "@/lib/api/http";
import { asUuidOrThrow } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/rbac";
import { commitMetadataMerge, parsePerFieldDecisions } from "@/lib/books/metadataMergeResolution";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

const BodySchema = z.object({
  decisions: z.array(z.unknown()),
  expectedSnapshotSyncedAtIso: z.string().min(1).max(40).optional(),
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
          key: `admin:metadata_merge_commit:${adminId}:${ip}`,
          limit: 30,
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

      const result = await commitMetadataMerge({
        bookId: id,
        actorId: adminId,
        decisions,
        expectedSnapshotSyncedAtIso: parsed.data.expectedSnapshotSyncedAtIso ?? null,
      });

      if (!result.ok) {
        const stale = result.error.includes("Snapshot changed");
        return NextResponse.json({ error: result.error }, { status: stale ? 409 : 400 });
      }

      return NextResponse.json(
        {
          writeback: result.writeback,
          oldContentHash: result.oldContentHash,
          newContentHash: result.newContentHash,
          merged: result.merged,
        },
        { status: 200 },
      );
    },
  );
}
