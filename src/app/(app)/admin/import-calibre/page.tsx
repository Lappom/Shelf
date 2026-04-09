import { requireAdmin } from "@/lib/auth/rbac";
import { ImportCalibreClient } from "./ui";

export default async function AdminImportCalibrePage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Import Calibre</h2>
        <p className="text-muted-foreground text-sm">
          Importe une bibliothèque Calibre via <span className="font-mono">metadata.db</span> + un
          chemin racine monté côté serveur.
        </p>
      </div>
      <ImportCalibreClient />
    </div>
  );
}
