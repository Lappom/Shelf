import { requireAdminPage } from "@/lib/auth/rbac";

import { AdminMetadataMergeAuditsClient } from "./ui";

export default async function AdminMetadataMergeAuditsPage() {
  await requireAdminPage();
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Audit résolutions métadonnées</h2>
        <p className="text-muted-foreground text-sm">
          Historique des commits manuels (merge EPUB / DB / snapshot).
        </p>
      </div>
      <AdminMetadataMergeAuditsClient />
    </div>
  );
}
