import { z } from "zod";

import { requireUser } from "@/lib/auth/rbac";
import { EpubReaderClient } from "@/components/reader/EpubReaderClient";

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

export default async function ReaderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return <div className="p-6">Livre invalide.</div>;

  const fileUrl = `/api/books/${parsed.data.id}/file`;

  return <EpubReaderClient bookId={parsed.data.id} fileUrl={fileUrl} />;
}
