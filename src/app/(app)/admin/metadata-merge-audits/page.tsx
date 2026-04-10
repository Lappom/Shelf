import { requireAdminPage } from "@/lib/auth/rbac";

import { AdminMetadataMergeAuditsClient } from "./ui";

export default async function AdminMetadataMergeAuditsPage() {
  await requireAdminPage();
  return (
    <div className="space-y-6">
      <div className="admin-merge-audits-hero-enter space-y-2">
        <h2 className="eleven-display-section text-2xl text-foreground md:text-3xl">
          Audit résolutions métadonnées
        </h2>
        <p className="eleven-body-airy text-eleven-secondary max-w-2xl text-base">
          Historique des commits manuels (merge EPUB / DB / snapshot).
        </p>
      </div>
      <AdminMetadataMergeAuditsClient />
    </div>
  );
}
