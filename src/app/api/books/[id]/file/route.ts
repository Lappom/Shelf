import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/rbac";
import { getStorageAdapter } from "@/lib/storage";
import { StorageError } from "@/lib/storage";
import { handleCorsPreflight, addCorsHeaders } from "@/lib/security/cors";
import { assertSameOriginFromHeaders } from "@/lib/security/origin";

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  assertSameOriginFromHeaders({
    origin: req.headers.get("origin"),
    host: req.headers.get("host"),
  });

  await requireUser();
  const params = await ctx.params;
  const parsed = ParamsSchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid book id" }, { status: 400 });

  const book = await prisma.book.findFirst({
    where: { id: parsed.data.id, deletedAt: null },
    select: {
      id: true,
      format: true,
      files: {
        select: { storagePath: true, filename: true, mimeType: true },
        take: 1,
      },
    },
  });

  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (book.format !== "epub") return NextResponse.json({ error: "Not an EPUB" }, { status: 400 });

  const file = book.files[0];
  if (!file) return NextResponse.json({ error: "File missing" }, { status: 404 });

  const adapter = getStorageAdapter();
  try {
    // For simplicity we buffer for now; reader integration will stream later.
    const buf = await adapter.download(file.storagePath);
    return addCorsHeaders(
      new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": file.mimeType || "application/epub+zip",
          "Content-Disposition": `inline; filename=\"${file.filename}\"`,
          "Cache-Control": "private, max-age=0, no-store",
        },
      }),
      req,
    );
  } catch (e) {
    if (e instanceof StorageError) {
      return addCorsHeaders(NextResponse.json({ error: e.message }, { status: 500 }), req);
    }
    return addCorsHeaders(NextResponse.json({ error: "Storage error" }, { status: 500 }), req);
  }
}
