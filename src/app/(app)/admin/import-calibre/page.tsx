import { requireAdmin } from "@/lib/auth/rbac";
import { ImportCalibreClient } from "./ui";

export default async function AdminImportCalibrePage() {
  await requireAdmin();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Admin — Import Calibre</h1>
        <p className="text-muted-foreground text-sm">
          Importe une bibliothèque Calibre via <span className="font-mono">metadata.db</span> + un
          chemin racine monté côté serveur.
        </p>
      </div>

      <ImportCalibreClient />
    </div>
  );
}
