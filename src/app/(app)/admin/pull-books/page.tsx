import { requireAdmin } from "@/lib/auth/rbac";

import { AdminPullBooksClient } from "./ui";

export default async function AdminPullBooksPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Pull catalogue (Open Library)</h2>
        <p className="text-muted-foreground text-sm">
          Importe des fiches livres <span className="font-medium">sans fichier</span> depuis Open
          Library, via des jobs asynchrones chunkés, idempotents, annulables et rejouables.
        </p>
      </div>
      <AdminPullBooksClient />
    </div>
  );
}
