import Link from "next/link";

import { LogoMark } from "@/components/LogoMark";
import { Button } from "@/components/ui/button";

import { ElevenHeaderMobileMenu } from "./ElevenHeaderMobileMenu";

export function ElevenHeader() {
  return (
    <header className="bg-background/85 sticky top-0 z-40 border-b border-(--eleven-border-subtle) backdrop-blur-md supports-backdrop-filter:bg-background/70">
      <a
        href="#content"
        className="focus:bg-background focus:shadow-eleven-button-white sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:px-3 focus:py-2 focus:text-sm"
      >
        Aller au contenu
      </a>
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-6">
        <Link aria-label="Shelf" className="flex shrink-0 items-center gap-2" href="/">
          <LogoMark className="h-6 w-6" title="" />
          <span className="eleven-body-airy text-sm font-medium">Shelf</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Sections">
          <Button asChild size="sm" variant="ghost" className="rounded-eleven-pill">
            <a href="#features">Fonctionnalités</a>
          </Button>
          <Button asChild size="sm" variant="ghost" className="rounded-eleven-pill">
            <a href="#workflow">Workflow</a>
          </Button>
          <Button asChild size="sm" variant="ghost" className="rounded-eleven-pill">
            <a href="#privacy">Données</a>
          </Button>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="whitePill" size="lg" className="hidden lg:inline-flex">
            <Link href="/register">Créer un compte</Link>
          </Button>
          <Button asChild variant="warmStone" size="warm" className="hidden lg:inline-flex">
            <Link href="/login">Connexion</Link>
          </Button>
          <ElevenHeaderMobileMenu />
        </div>
      </div>
    </header>
  );
}
