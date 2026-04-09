"use server";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth/rbac";
import { resyncBookMetadata, type ResyncResult } from "@/lib/books/metadataSync";

const ResyncSchema = z.object({
  bookId: z.string().uuid(),
});

export async function resyncMetadataAction(
  _prevState: ResyncResult | null,
  formData: FormData,
): Promise<ResyncResult> {
  await requireAdmin();

  const parsed = ResyncSchema.safeParse({
    bookId: String(formData.get("bookId") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, bookId: String(formData.get("bookId") ?? ""), error: "Invalid book id" };
  }

  try {
    return await resyncBookMetadata(parsed.data.bookId);
  } catch (e) {
    return {
      ok: false,
      bookId: parsed.data.bookId,
      error: e instanceof Error ? e.message : "Resync error",
    };
  }
}

