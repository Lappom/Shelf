import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp } from "@/lib/api/http";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return runApiRoute(
    req,
    {
      sameOrigin: true,
      auth: requireAdmin,
      rateLimit: async ({ req, user }) => {
        const ip = getClientIp(req);
        const adminId = (user as { id?: string } | null)?.id ?? "unknown";
        await rateLimitOrThrow({
          key: `books:soft_delete:${adminId}:${ip}`,
          limit: 30,
          windowMs: 60_000,
        });
      },
    },
    async () => {
      const params = await ctx.params;
      const parsed = ParamsSchema.safeParse(params);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid book id" }, { status: 400 });
      }

      const book = await prisma.book.findFirst({
        where: { id: parsed.data.id },
        select: { id: true, deletedAt: true },
      });
      if (!book) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      if (!book.deletedAt) {
        await prisma.book.update({
          where: { id: book.id },
          data: { deletedAt: new Date() },
          select: { id: true },
        });
      }

      return NextResponse.json({ ok: true }, { status: 200 });
    },
  );
}
