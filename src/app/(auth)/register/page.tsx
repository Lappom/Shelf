import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { registerAction } from "./actions";

const errorMessages = {
  disabled: "Les inscriptions sont désactivées.",
  invalid: "Formulaire invalide.",
  exists: "Email ou username déjà utilisé.",
  auth: "Impossible de créer la session. Essayez de vous connecter.",
} as const;

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: keyof typeof errorMessages }>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const error = sp?.error ? errorMessages[sp.error] : null;
  return (
    <div className="space-y-6">
      <Button asChild className="-ml-1 w-fit rounded-eleven-pill" size="sm" variant="ghost">
        <Link href="/">
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
          <span>Retour</span>
        </Link>
      </Button>

      <div className="space-y-1">
        <div className="text-xs font-medium tracking-wide text-eleven-muted uppercase">Shelf</div>
        <h1 className="eleven-display-section text-3xl">Créer un compte</h1>
        <p className="text-sm text-eleven-secondary">Le premier compte devient administrateur.</p>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 rounded-xl border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <form action={registerAction} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="username">
            Nom d’utilisateur
          </label>
          <Input id="username" name="username" autoComplete="username" required />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="password">
            Mot de passe
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>

        <Button className="w-full rounded-eleven-pill" type="submit">
          Créer le compte
        </Button>
      </form>

      <p className="text-muted-foreground text-sm">
        Déjà un compte ?{" "}
        <Link className="text-foreground underline underline-offset-4" href="/login">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
