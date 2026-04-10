import { requireAdminPage } from "@/lib/auth/rbac";

import { AdminPullBooksClient } from "./ui";

export default async function AdminPullBooksPage() {
  await requireAdminPage();

  return (
    <div className="space-y-8">
      <div className="pull-books-hero-enter space-y-2">
        <h2 className="eleven-display-section text-foreground text-2xl sm:text-3xl">
          Pull catalogue (Open Library)
        </h2>
        <p className="text-eleven-secondary eleven-body-airy max-w-2xl text-sm leading-relaxed sm:text-base">
          Importe des fiches livres{" "}
          <span className="text-foreground font-medium">sans fichier</span> depuis Open Library, via
          des jobs asynchrones chunkés, idempotents, annulables et rejouables.
        </p>
      </div>
      <AdminPullBooksClient />
    </div>
  );
}
