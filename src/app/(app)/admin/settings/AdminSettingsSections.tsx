import type { CSSProperties, ReactNode } from "react";

import { AdminSettingsCopyValue } from "./AdminSettingsCopyValue";

export type AdminSettingsViewModel = {
  appName: string;
  nodeEnv: string | undefined;
  defaultLocale: string | undefined;
  nextAuthUrl: string | undefined;
  oidcConfigured: boolean;
  oidcIssuer: string | undefined;
  storageType: string;
  storagePath: string | undefined;
  s3Bucket: string | undefined;
  s3Endpoint: string | undefined;
  s3Region: string | undefined;
};

function displayOrDash(v: string | undefined): string {
  return v?.trim() ? v : "—";
}

function rowDelayMs(panelBaseMs: number, rowIndex: number): string {
  return `${panelBaseMs + rowIndex * 45}ms`;
}

type ValueRowProps = {
  label: string;
  envKey: string;
  value: string;
  panelBaseMs: number;
  rowIndex: number;
  copyLabel: string;
  monospace?: boolean;
  showCopy?: boolean;
};

function ValueRow({
  label,
  envKey,
  value,
  panelBaseMs,
  rowIndex,
  copyLabel,
  monospace = true,
  showCopy = true,
}: ValueRowProps) {
  return (
    <div
      className="admin-settings-row-enter grid grid-cols-1 gap-1 border-b border-(--eleven-border-subtle) py-3.5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] md:items-start md:gap-6"
      style={
        {
          "--admin-settings-row-delay": rowDelayMs(panelBaseMs, rowIndex),
        } as CSSProperties
      }
    >
      <dt className="min-w-0">
        <span className="text-eleven-muted eleven-body-airy block text-sm">{label}</span>
        <span className="text-eleven-muted/80 mt-0.5 block font-mono text-[11px] tracking-wide uppercase">
          {envKey}
        </span>
      </dt>
      <dd className="flex min-w-0 items-start gap-1 md:justify-end">
        <span
          className={`min-w-0 flex-1 text-right font-medium md:text-left ${monospace ? "font-mono text-xs break-all md:text-right" : "text-sm"}`}
          title={value !== "—" ? value : undefined}
        >
          {value}
        </span>
        {showCopy ? (
          <AdminSettingsCopyValue value={value === "—" ? "" : value} label={copyLabel} className="md:mt-0.5" />
        ) : null}
      </dd>
    </div>
  );
}

type SectionCardProps = {
  title: string;
  description?: string;
  panelDelayMs: number;
  children: ReactNode;
};

function SectionCard({ title, description, panelDelayMs, children }: SectionCardProps) {
  return (
    <section
      className="admin-settings-panel-enter shadow-eleven-card rounded-2xl border border-(--eleven-border-subtle) bg-card p-5 sm:p-6"
      style={{ "--admin-settings-panel-delay": `${panelDelayMs}ms` } as CSSProperties}
    >
      <h3 className="eleven-display-section text-foreground mb-1 text-lg font-light tracking-tight">{title}</h3>
      {description ? (
        <p className="text-eleven-muted eleven-body-airy mb-4 text-sm tracking-wide">{description}</p>
      ) : (
        <div className="mb-4" />
      )}
      <dl className="m-0">{children}</dl>
    </section>
  );
}

export function AdminSettingsSections({ data }: { data: AdminSettingsViewModel }) {
  const appPanel = 100;
  const authPanel = 160;
  const storagePanel = 220;

  const storageType = data.storageType || "local";
  const nextAuthDisplay = displayOrDash(data.nextAuthUrl);
  const localeRaw = data.defaultLocale?.trim();
  const localeDisplay = localeRaw ? localeRaw : "—";

  return (
    <div className="space-y-8">
      <header className="admin-settings-hero-enter space-y-2">
        <h2 className="eleven-display-section text-foreground text-2xl tracking-tight sm:text-3xl">
          Paramètres instance
        </h2>
        <p className="text-eleven-secondary eleven-body-airy max-w-2xl text-sm leading-relaxed sm:text-base">
          Aperçu non sensible de la configuration : les secrets et chaînes complètes de connexion ne sont jamais
          affichés. Pour modifier une valeur, ajustez les variables d&apos;environnement puis redémarrez
          l&apos;application.
        </p>
      </header>

      <div
        className="admin-settings-notice-enter eleven-surface-stone shadow-eleven-warm rounded-2xl border border-(--eleven-border-subtle) p-4 sm:p-5"
        style={{ "--admin-settings-notice-delay": "0.06s" } as CSSProperties}
      >
        <p className="text-eleven-secondary eleven-body-airy text-sm leading-relaxed">
          <span className="text-foreground font-medium">Rappel.</span> Cette page est en lecture seule. Les clés API,
          mots de passe et URL de base de données ne figurent pas ici par design.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:gap-8">
        <SectionCard
          title="Application"
          description="Identité affichée et environnement d’exécution."
          panelDelayMs={appPanel}
        >
          <ValueRow
            label="Nom affiché"
            envKey="APP_NAME"
            value={data.appName}
            panelBaseMs={appPanel}
            rowIndex={0}
            copyLabel="Nom affiché (APP_NAME)"
            monospace={false}
            showCopy={false}
          />
          <ValueRow
            label="Environnement Node"
            envKey="NODE_ENV"
            value={displayOrDash(data.nodeEnv)}
            panelBaseMs={appPanel}
            rowIndex={1}
            copyLabel="NODE_ENV"
            monospace={false}
          />
          <ValueRow
            label="Locale par défaut"
            envKey="DEFAULT_LOCALE"
            value={localeDisplay}
            panelBaseMs={appPanel}
            rowIndex={2}
            copyLabel="DEFAULT_LOCALE"
            monospace={false}
            showCopy={Boolean(localeRaw)}
          />
        </SectionCard>

        <SectionCard
          title="Authentification et URLs"
          description="NextAuth et fournisseur OIDC (aperçu)."
          panelDelayMs={authPanel}
        >
          <ValueRow
            label="URL publique"
            envKey="NEXTAUTH_URL"
            value={nextAuthDisplay}
            panelBaseMs={authPanel}
            rowIndex={0}
            copyLabel="NEXTAUTH_URL"
          />
          <div
            className="admin-settings-row-enter grid grid-cols-1 gap-1 py-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] md:items-start md:gap-6"
            style={{ "--admin-settings-row-delay": rowDelayMs(authPanel, 1) } as CSSProperties}
          >
            <dt className="min-w-0">
              <span className="text-eleven-muted eleven-body-airy block text-sm">OIDC</span>
              <span className="text-eleven-muted/80 mt-0.5 block font-mono text-[11px] tracking-wide uppercase">
                OIDC_ISSUER · OIDC_CLIENT_ID · OIDC_CLIENT_SECRET
              </span>
            </dt>
            <dd className="flex min-w-0 flex-col items-stretch gap-2 md:items-end">
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <span
                  className={
                    data.oidcConfigured
                      ? "inline-flex rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200"
                      : "bg-muted text-eleven-secondary inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                  }
                >
                  {data.oidcConfigured ? "Configuré" : "Désactivé"}
                </span>
              </div>
              {data.oidcConfigured && data.oidcIssuer ? (
                <div className="flex w-full min-w-0 items-start justify-end gap-1">
                  <span className="font-mono text-xs break-all text-right" title={data.oidcIssuer}>
                    {data.oidcIssuer}
                  </span>
                  <AdminSettingsCopyValue value={data.oidcIssuer} label="OIDC issuer" className="shrink-0" />
                </div>
              ) : null}
            </dd>
          </div>
        </SectionCard>

        <SectionCard
          title="Stockage des fichiers"
          description={
            storageType === "local" ? "Fichiers sur disque local." : "Fichiers sur object storage S3-compatible."
          }
          panelDelayMs={storagePanel}
        >
          <ValueRow
            label="Type de stockage"
            envKey="STORAGE_TYPE"
            value={storageType}
            panelBaseMs={storagePanel}
            rowIndex={0}
            copyLabel="STORAGE_TYPE"
            monospace={false}
          />
          {storageType === "local" ? (
            <ValueRow
              label="Répertoire local"
              envKey="STORAGE_PATH"
              value={displayOrDash(data.storagePath)}
              panelBaseMs={storagePanel}
              rowIndex={1}
              copyLabel="STORAGE_PATH"
            />
          ) : (
            <>
              <ValueRow
                label="Bucket"
                envKey="S3_BUCKET"
                value={displayOrDash(data.s3Bucket)}
                panelBaseMs={storagePanel}
                rowIndex={1}
                copyLabel="S3_BUCKET"
              />
              <ValueRow
                label="Endpoint"
                envKey="S3_ENDPOINT"
                value={displayOrDash(data.s3Endpoint)}
                panelBaseMs={storagePanel}
                rowIndex={2}
                copyLabel="S3_ENDPOINT"
              />
              <ValueRow
                label="Région"
                envKey="S3_REGION"
                value={displayOrDash(data.s3Region)}
                panelBaseMs={storagePanel}
                rowIndex={3}
                copyLabel="S3_REGION"
              />
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
