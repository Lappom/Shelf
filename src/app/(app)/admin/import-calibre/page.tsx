import { requireAdminPage } from "@/lib/auth/rbac";
import { ImportCalibreClient } from "./ui";

export default async function AdminImportCalibrePage() {
  await requireAdminPage();

  return (
    <div className="space-y-8">
      <div className="admin-import-hero-enter space-y-2">
        <h2 className="eleven-display-section text-3xl text-foreground">Import Calibre</h2>
        <p className="text-eleven-secondary eleven-body-airy max-w-2xl text-base leading-relaxed">
          Importe une bibliothèque Calibre via{" "}
          <span className="font-mono text-sm text-foreground">metadata.db</span> et un chemin racine
          monté côté serveur.
        </p>
      </div>
      <ImportCalibreClient />
    </div>
  );
}
