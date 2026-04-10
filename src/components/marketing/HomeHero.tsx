import type { CSSProperties } from "react";
import Link from "next/link";
import { BookOpenIcon, LockIcon, SearchIcon, SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function HeroBadge() {
  return (
    <div className="marketing-hero-enter bg-background shadow-eleven-button-white inline-flex items-center gap-2 rounded-full border border-(--eleven-border-subtle) px-3 py-1">
      <SparklesIcon className="text-eleven-muted h-3.5 w-3.5" aria-hidden="true" />
      <span className="eleven-body-airy text-eleven-muted text-xs font-medium">
        Self-hosted, lecteur EPUB, recherche rapide
      </span>
    </div>
  );
}

function FakeShelfPanel() {
  return (
    <div
      className="marketing-block-enter shadow-eleven-warm rounded-[24px] border border-(--eleven-border-subtle) bg-(--eleven-stone) p-4 sm:p-6"
      style={{ "--marketing-enter-delay": "0.12s" } as CSSProperties}
    >
      <div className="rounded-2xl bg-white/70 p-3 shadow-[var(--eleven-shadow-inset-border),var(--eleven-shadow-outline)] dark:bg-black/20">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-black/70 dark:bg-white/70" />
            <div className="h-2 w-2 rounded-full bg-black/35 dark:bg-white/35" />
            <div className="h-2 w-2 rounded-full bg-black/20 dark:bg-white/20" />
          </div>
          <div className="eleven-body-airy text-eleven-muted text-[11px] font-medium">
            Bibliothèque
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { t: "Essais", s: "12 livres" },
            { t: "SF", s: "34 livres" },
            { t: "Tech", s: "18 livres" },
            { t: "Notes", s: "5 livres" },
            { t: "À lire", s: "27 livres" },
            { t: "Archives", s: "9 livres" },
          ].map((x) => (
            <div
              key={x.t}
              className="bg-background/80 rounded-2xl border border-(--eleven-border-subtle) p-3 shadow-[var(--eleven-shadow-inset-border),var(--eleven-shadow-soft)]"
            >
              <div className="font-heading eleven-body-airy text-sm font-light">{x.t}</div>
              <div className="eleven-body-airy text-eleven-muted mt-1 text-xs">{x.s}</div>
              <div className="mt-3 h-1.5 w-full rounded-full bg-black/5 dark:bg-white/10">
                <div className="h-1.5 w-[58%] rounded-full bg-black/25 dark:bg-white/25" />
              </div>
            </div>
          ))}
        </div>

        <div className="bg-background/70 mt-4 rounded-2xl border border-(--eleven-border-subtle) p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SearchIcon className="text-eleven-muted h-4 w-4" aria-hidden="true" />
              <div className="eleven-body-airy text-eleven-muted text-xs">
                Rechercher un titre, un auteur, un tag…
              </div>
            </div>
            <div className="rounded-full bg-black px-2.5 py-1 text-[10px] font-medium text-white">
              ⌘K
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomeHero() {
  return (
    <main id="content" className="mx-auto w-full max-w-5xl px-6 pt-14 pb-20 sm:pt-20 sm:pb-24">
      <section className="grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
        <div className="space-y-6">
          <HeroBadge />

          <div className="space-y-4">
            <h1 className="eleven-display-hero text-foreground text-[3rem] leading-[1.08] tracking-[-0.06rem] text-balance sm:text-[3.35rem]">
              <span
                className="marketing-block-enter inline-block"
                style={{ "--marketing-enter-delay": "0.08s" } as CSSProperties}
              >
                La bibliothèque personnelle qui reste légère.
              </span>
            </h1>
            <p
              className="marketing-block-enter eleven-body-airy text-eleven-secondary max-w-prose text-xl leading-[1.6] tracking-[0.18px]"
              style={{ "--marketing-enter-delay": "0.14s" } as CSSProperties}
            >
              Importez vos EPUB, organisez en étagères, lisez sans distraction et retrouvez
              n’importe quel passage grâce à une recherche pensée pour durer.
            </p>
          </div>

          <div
            className="marketing-block-enter flex flex-col gap-3 sm:flex-row sm:items-center"
            style={{ "--marketing-enter-delay": "0.2s" } as CSSProperties}
          >
            <Button asChild variant="blackPill" size="lg">
              <Link href="/register">Créer un compte</Link>
            </Button>
            <Button asChild variant="warmStone" size="warm">
              <Link href="/login">Connexion</Link>
            </Button>
            <div className="text-eleven-muted eleven-body-airy text-xs sm:pl-2">
              OIDC optionnel • sessions JWT • thème système
            </div>
          </div>

          <div className="marketing-features-band" id="features">
            <div className="grid gap-3 sm:grid-cols-3">
              <Card
                className="marketing-feature-card marketing-block-enter shadow-eleven-card"
                style={{ "--marketing-enter-delay": "0.26s" } as CSSProperties}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpenIcon className="text-eleven-muted h-4 w-4" aria-hidden="true" />
                    Reader intégré
                  </CardTitle>
                  <CardDescription className="eleven-body-airy text-eleven-secondary">
                    Plein écran, progression, annotations.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="eleven-body-airy text-eleven-muted text-xs">
                    Un espace de lecture simple, sans chrome inutile.
                  </div>
                </CardContent>
              </Card>

              <Card
                className="marketing-feature-card marketing-block-enter shadow-eleven-card"
                style={{ "--marketing-enter-delay": "0.3s" } as CSSProperties}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <SearchIcon className="text-eleven-muted h-4 w-4" aria-hidden="true" />
                    Recherche rapide
                  </CardTitle>
                  <CardDescription className="eleven-body-airy text-eleven-secondary">
                    Titre, auteur, tags — et plus.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="eleven-body-airy text-eleven-muted text-xs">
                    Pensé pour grandir avec votre collection.
                  </div>
                </CardContent>
              </Card>

              <Card
                className="marketing-feature-card marketing-block-enter shadow-eleven-card"
                style={{ "--marketing-enter-delay": "0.34s" } as CSSProperties}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LockIcon className="text-eleven-muted h-4 w-4" aria-hidden="true" />
                    Contrôle
                  </CardTitle>
                  <CardDescription className="eleven-body-airy text-eleven-secondary">
                    Self-hosted, données chez vous.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="eleven-body-airy text-eleven-muted text-xs">
                    Une app qui privilégie la propriété et la lisibilité.
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <div className="space-y-5 lg:pt-10">
          <FakeShelfPanel />
          <div
            id="workflow"
            className="marketing-block-enter bg-background/70 rounded-2xl border border-(--eleven-border-subtle) p-4 shadow-[var(--eleven-shadow-inset-border),var(--eleven-shadow-soft)]"
            style={{ "--marketing-enter-delay": "0.18s" } as CSSProperties}
          >
            <div className="eleven-body-airy text-eleven-muted text-xs font-medium">Workflow</div>
            <div className="font-heading mt-2 text-[1.15rem] leading-snug font-light">
              Import → étagères → lecture → recherche
            </div>
            <p className="eleven-body-airy text-eleven-secondary mt-2 text-sm leading-relaxed">
              L’essentiel, bien aligné. Pas de bruit, juste un flux constant.
            </p>
          </div>

          <div
            id="privacy"
            className="marketing-block-enter bg-muted/40 rounded-2xl border border-(--eleven-border-subtle) p-4 shadow-[var(--eleven-shadow-inset-border),var(--eleven-shadow-soft)]"
            style={{ "--marketing-enter-delay": "0.24s" } as CSSProperties}
          >
            <div className="eleven-body-airy text-eleven-muted text-xs font-medium">Données</div>
            <p className="eleven-body-airy text-eleven-secondary mt-2 text-sm leading-relaxed">
              Shelf est conçu pour tourner chez vous. Vous gardez la main sur la base et les
              fichiers.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
