"use server";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth/rbac";
import { resyncBookMetadata, type ResyncResult } from "@/lib/books/metadataSync";
import { logShelfEvent } from "@/lib/observability/structuredLog";

const ResyncSchema = z.object({
  bookId: z.string().uuid(),
});

export async function resyncMetadataAction(
  _prevState: ResyncResult | null,
  formData: FormData,
): Promise<ResyncResult> {
  const admin = await requireAdmin();
  const actorId = String((admin as { id?: unknown }).id ?? "");

  const parsed = ResyncSchema.safeParse({
    bookId: String(formData.get("bookId") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, bookId: String(formData.get("bookId") ?? ""), error: "Invalid book id" };
  }

  const t0 = Date.now();
  try {
    const out = await resyncBookMetadata(parsed.data.bookId);
    logShelfEvent("metadata_resync", {
      ok: out.ok,
      bookId: out.bookId,
      userId: actorId,
      durationMs: Date.now() - t0,
      ...(out.ok ? { writeback: out.writeback } : { error: out.error }),
    });
    return out;
  } catch (e) {
    const err = e instanceof Error ? e.message : "Resync error";
    logShelfEvent("metadata_resync", {
      ok: false,
      bookId: parsed.data.bookId,
      userId: actorId,
      durationMs: Date.now() - t0,
      error: err,
    });
    return {
      ok: false,
      bookId: parsed.data.bookId,
      error: err,
    };
  }
}
