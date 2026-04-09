import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/rbac";
import { getStorageAdapter } from "@/lib/storage";
import { StorageError } from "@/lib/storage";

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
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
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": file.mimeType || "application/epub+zip",
        "Content-Disposition": `inline; filename=\"${file.filename}\"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (e) {
    if (e instanceof StorageError) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }
}
