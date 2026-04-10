import { requireAdminPage } from "@/lib/auth/rbac";
import { getAppNameFromEnv, pickServerEnvVars } from "@/lib/env/server";
import { Card } from "@/components/ui/card";

export default async function AdminSettingsPage() {
  await requireAdminPage();

  const env = pickServerEnvVars(process.env);
  const appName = getAppNameFromEnv(process.env);
  const storageType = env.STORAGE_TYPE ?? "local";
  const oidcConfigured = Boolean(
    env.OIDC_ISSUER?.trim() && env.OIDC_CLIENT_ID?.trim() && env.OIDC_CLIENT_SECRET?.trim(),
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="eleven-display-section text-xl">Paramètres instance</h2>
        <p className="text-eleven-muted text-sm">
          Aperçu non sensible de la configuration (les secrets ne sont jamais affichés). Modifier
          les valeurs via les variables d’environnement et redémarrer l’application.
        </p>
      </div>
      <Card className="shadow-eleven-card space-y-3 p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2 border-b border-(--eleven-border-subtle) pb-2">
          <span className="text-eleven-muted">Nom affiché (APP_NAME)</span>
          <span className="font-medium">{appName}</span>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-b border-(--eleven-border-subtle) pb-2">
          <span className="text-eleven-muted">URL publique (NEXTAUTH_URL)</span>
          <span className="max-w-[min(100%,20rem)] truncate font-mono text-xs">
            {env.NEXTAUTH_URL ?? "—"}
          </span>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-b border-(--eleven-border-subtle) pb-2">
          <span className="text-eleven-muted">Stockage (STORAGE_TYPE)</span>
          <span className="font-medium">{storageType}</span>
        </div>
        {storageType === "local" ? (
          <div className="flex flex-wrap justify-between gap-2 border-b border-(--eleven-border-subtle) pb-2">
            <span className="text-eleven-muted">Répertoire local (STORAGE_PATH)</span>
            <span className="max-w-[min(100%,24rem)] truncate font-mono text-xs">
              {env.STORAGE_PATH ?? "—"}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap justify-between gap-2 border-b border-(--eleven-border-subtle) pb-2">
            <span className="text-eleven-muted">Bucket S3 (S3_BUCKET)</span>
            <span className="max-w-[min(100%,20rem)] truncate font-mono text-xs">
              {env.S3_BUCKET ?? "—"}
            </span>
          </div>
        )}
        <div className="flex flex-wrap justify-between gap-2 pb-1">
          <span className="text-eleven-muted">OIDC</span>
          <span className="font-medium">{oidcConfigured ? "configuré" : "désactivé"}</span>
        </div>
        {oidcConfigured ? (
          <div className="text-eleven-muted pl-0 text-xs">
            Issuer : <span className="font-mono">{env.OIDC_ISSUER}</span>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
