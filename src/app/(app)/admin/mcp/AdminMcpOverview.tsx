import type { CSSProperties } from "react";
import Link from "next/link";

import { AdminSettingsCopyValue } from "../settings/AdminSettingsCopyValue";
import { Button } from "@/components/ui/button";
import { ALL_MCP_SCOPES, MCP_SCOPE_LABELS_FR } from "@/lib/mcp/scopes";

export type AdminMcpOverviewProps = {
  mcpEndpointUrl: string | null;
  rateLimitPerMinute: number;
};

function rowDelayMs(panelBaseMs: number, rowIndex: number): string {
  return `${panelBaseMs + rowIndex * 42}ms`;
}

/** Minimal SVG motif: nodes + path suggesting an API bridge (monochrome, warm undertone). */
function McpHeroMotif({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 320 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M8 24h72M240 24h72M92 24c12 0 20-10 32-10s20 10 32 10 20-10 32-10 20 10 32 10"
        className="stroke-foreground/12"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <circle cx="8" cy="24" r="3.5" className="fill-foreground/25" />
      <circle cx="312" cy="24" r="3.5" className="fill-foreground/25" />
      <circle cx="104" cy="24" r="2" className="fill-foreground/18" />
      <circle cx="160" cy="14" r="2" className="fill-foreground/18" />
      <circle cx="216" cy="24" r="2" className="fill-foreground/18" />
    </svg>
  );
}

type PanelProps = {
  title: string;
  description?: string;
  panelDelayMs: number;
  children: React.ReactNode;
  className?: string;
};

function Panel({ title, description, panelDelayMs, children, className }: PanelProps) {
  return (
    <section
      className={`admin-settings-panel-enter shadow-eleven-card bg-card rounded-2xl border border-(--eleven-border-subtle) p-5 transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:p-6 ${className ?? ""} hover:shadow-eleven-warm hover:-translate-y-px motion-reduce:hover:translate-y-0`}
      style={{ "--admin-settings-panel-delay": `${panelDelayMs}ms` } as CSSProperties}
    >
      <h3 className="eleven-display-section text-foreground mb-1 text-lg font-light tracking-tight">
        {title}
      </h3>
      {description ? (
        <p className="text-eleven-muted eleven-body-airy mb-4 text-sm tracking-wide">
          {description}
        </p>
      ) : (
        <div className="mb-4" />
      )}
      {children}
    </section>
  );
}

export function AdminMcpOverview({ mcpEndpointUrl, rateLimitPerMinute }: AdminMcpOverviewProps) {
  const panelEndpoint = 120;
  const panelLimits = 200;
  const panelScopes = 280;
  const panelClient = 360;

  const endpointDisplay = mcpEndpointUrl ?? "—";
  const cursorConfigSnippet = mcpEndpointUrl
    ? JSON.stringify(
        {
          mcpServers: {
            shelf: {
              url: mcpEndpointUrl,
              headers: { Authorization: "Bearer sk_shelf_…" },
            },
          },
        },
        null,
        2,
      )
    : "";

  return (
    <div className="space-y-8">
      <header className="admin-settings-hero-enter space-y-4">
        <McpHeroMotif className="h-10 w-full max-w-md opacity-90" />
        <div className="space-y-2">
          <h2 className="eleven-display-section text-foreground text-2xl tracking-tight sm:text-3xl">
            Serveur MCP
          </h2>
          <p className="text-eleven-secondary eleven-body-airy max-w-2xl text-sm leading-relaxed sm:text-base">
            Point d&apos;accès Model Context Protocol pour les clients IA : tools, ressources et
            prompts autour de la bibliothèque. L&apos;authentification se fait par clé API
            utilisateur (<span className="font-mono text-xs">Authorization: Bearer</span>
            ).
          </p>
        </div>
      </header>

      <div
        className="admin-settings-notice-enter eleven-surface-stone shadow-eleven-warm rounded-2xl border border-(--eleven-border-subtle) p-4 sm:p-5"
        style={{ "--admin-settings-notice-delay": "0.05s" } as CSSProperties}
      >
        <p className="text-eleven-secondary eleven-body-airy text-sm leading-relaxed">
          <span className="text-foreground font-medium">Sécurité.</span> Ne commitez jamais de clé
          secrète. Révoquez une clé compromise depuis les paramètres utilisateur. Les journaux
          d&apos;audit enregistrent les appels d&apos;outils MCP par clé.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <Panel
          title="URL du endpoint"
          description="Même origine que NEXTAUTH_URL : chemin fixe /api/mcp."
          panelDelayMs={panelEndpoint}
        >
          <div
            className="admin-settings-row-enter flex flex-col gap-2 border-b border-(--eleven-border-subtle) pb-4"
            style={
              {
                "--admin-settings-row-delay": rowDelayMs(panelEndpoint, 0),
              } as CSSProperties
            }
          >
            <span className="text-eleven-muted eleven-body-airy text-xs tracking-wide uppercase">
              Streamable HTTP
            </span>
            <div className="flex min-w-0 items-start gap-1">
              <code className="text-foreground font-mono text-xs leading-relaxed break-all sm:text-sm">
                {endpointDisplay}
              </code>
              {mcpEndpointUrl ? (
                <AdminSettingsCopyValue
                  value={mcpEndpointUrl}
                  label="URL MCP"
                  className="shrink-0"
                />
              ) : null}
            </div>
            {!mcpEndpointUrl ? (
              <p className="text-eleven-muted text-xs tracking-wide">
                Définissez <span className="font-mono">NEXTAUTH_URL</span> pour afficher l&apos;URL
                publique complète.
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel
          title="Limites et transport"
          description="Comportement par défaut côté instance ; surcharge possible via variable d’environnement."
          panelDelayMs={panelLimits}
        >
          <dl className="m-0 space-y-0">
            <div
              className="admin-settings-row-enter grid grid-cols-1 gap-1 border-b border-(--eleven-border-subtle) py-3.5 first:pt-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center"
              style={
                {
                  "--admin-settings-row-delay": rowDelayMs(panelLimits, 0),
                } as CSSProperties
              }
            >
              <dt className="text-eleven-muted eleven-body-airy text-sm">
                Requêtes HTTP / minute / clé
              </dt>
              <dd className="font-mono text-sm font-medium md:text-right">{rateLimitPerMinute}</dd>
            </div>
            <div
              className="admin-settings-row-enter grid grid-cols-1 gap-1 py-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center"
              style={
                {
                  "--admin-settings-row-delay": rowDelayMs(panelLimits, 1),
                } as CSSProperties
              }
            >
              <dt className="text-eleven-muted eleven-body-airy text-sm">Variable</dt>
              <dd className="font-mono text-xs break-all md:text-right">
                MCP_RATE_LIMIT_PER_MINUTE
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel
          title="Portées (scopes)"
          description="Clés restreintes : chaque outil exige les scopes correspondants. Sans restriction, la clé hérite de l’accès complet."
          panelDelayMs={panelScopes}
          className="lg:col-span-2"
        >
          <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
            {ALL_MCP_SCOPES.map((scope, i) => (
              <li
                key={scope}
                className="admin-settings-row-enter bg-background/60 rounded-xl border border-(--eleven-border-subtle) px-3 py-2.5"
                style={
                  {
                    "--admin-settings-row-delay": rowDelayMs(panelScopes, i),
                  } as CSSProperties
                }
              >
                <code className="text-foreground/90 font-mono text-[11px]">{scope}</code>
                <p className="text-eleven-secondary eleven-body-airy mt-1 text-xs leading-snug tracking-wide">
                  {MCP_SCOPE_LABELS_FR[scope]}
                </p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Clients compatibles"
          description="Exemple de configuration (remplacez le token par une clé créée dans l’app)."
          panelDelayMs={panelClient}
          className="lg:col-span-2"
        >
          <div
            className="admin-settings-row-enter space-y-3"
            style={
              {
                "--admin-settings-row-delay": rowDelayMs(panelClient, 0),
              } as CSSProperties
            }
          >
            {cursorConfigSnippet ? (
              <div className="bg-muted/30 relative rounded-xl border border-(--eleven-border-subtle) p-4 pr-12">
                <pre className="text-foreground/90 overflow-x-auto font-mono text-[11px] leading-relaxed whitespace-pre sm:text-xs">
                  {cursorConfigSnippet}
                </pre>
                <div className="absolute top-2 right-2">
                  <AdminSettingsCopyValue value={cursorConfigSnippet} label="Exemple JSON MCP" />
                </div>
              </div>
            ) : (
              <p className="text-eleven-muted text-sm">
                Configurez NEXTAUTH_URL pour générer l’exemple.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild className="rounded-eleven-pill" size="sm">
                <Link href="/settings/api-keys">Créer ou gérer les clés API</Link>
              </Button>
              <span className="text-eleven-muted text-xs tracking-wide">
                Réservé aux utilisateurs connectés — même compte admin.
              </span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
