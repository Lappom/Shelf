import { requireAdmin } from "@/lib/auth/rbac";

import { AdminMetadataMergeClient } from "./ui";

export default async function AdminMetadataMergePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Résolution métadonnées (EPUB)</h2>
        <p className="text-muted-foreground text-sm">
          Comparaison source (fichier) vs base vs snapshot, score de confiance, preview et commit
          tracés.
        </p>
      </div>
      <AdminMetadataMergeClient bookId={id} />
    </div>
  );
}
