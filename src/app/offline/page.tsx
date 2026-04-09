import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <div className="mx-auto w-full max-w-lg p-6">
      <div className="rounded-2xl border p-6">
        <div className="text-sm font-medium">Vous êtes hors ligne</div>
        <p className="text-muted-foreground mt-2 text-sm">
          Certaines fonctionnalités nécessitent une connexion. Si vous aviez déjà ouvert un livre,
          il peut être disponible hors-ligne.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/library">Retour à la bibliothèque</Link>
          </Button>
          <Button asChild>
            <Link href="/reader/00000000-0000-0000-0000-000000000000">Ouvrir le reader</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
