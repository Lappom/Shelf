import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { loginAction } from "./actions";
import { oidcSignInAction } from "./oidc-actions";

const errorMessages = {
  invalid: "Email ou mot de passe invalide.",
  auth: "Impossible de se connecter.",
} as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: keyof typeof errorMessages }>;
}) {
  const oidcEnabled = Boolean(
    process.env.OIDC_ISSUER?.trim() && process.env.OIDC_CLIENT_ID?.trim() && process.env.OIDC_CLIENT_SECRET?.trim(),
  );

  const sp = searchParams ? await searchParams : undefined;
  const error = sp?.error ? errorMessages[sp.error] : null;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
        <p className="text-muted-foreground text-sm">Accédez à votre bibliothèque Shelf.</p>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 rounded-xl border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <form action={loginAction} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="password">
            Mot de passe
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <Button className="w-full" type="submit">
          Se connecter
        </Button>
      </form>

      {oidcEnabled ? (
        <form action={oidcSignInAction}>
          <Button className="w-full" type="submit" variant="outline">
            Continuer avec OIDC
          </Button>
        </form>
      ) : null}

      <p className="text-muted-foreground text-sm">
        Pas de compte ?{" "}
        <Link className="text-foreground underline underline-offset-4" href="/register">
          Créer un compte
        </Link>
      </p>
    </div>
  );
}
