import type { CSSProperties } from "react";
import Link from "next/link";
import { z } from "zod";

import { requireUserPage } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@/components/pwa/SignOutButton";

function roleLabel(role: string): string {
  if (role === "admin") return "Administrateur";
  return "Lecteur";
}

function initials(username: string): string {
  const t = username.trim();
  if (!t) return "?";
  const parts = t.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

export default async function ProfilePage() {
  const sessionUser = await requireUserPage();
  const userId = z.string().uuid().parse(sessionUser.id);

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      username: true,
      email: true,
      role: true,
      avatarUrl: true,
      createdAt: true,
      oidcProvider: true,
    },
  });

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <p className="eleven-body-airy text-eleven-muted text-center">Compte introuvable.</p>
      </div>
    );
  }

  const created = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
  }).format(user.createdAt);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="profile-hero-enter mb-10">
        <h1 className="eleven-display-section text-foreground text-3xl sm:text-4xl">Profil</h1>
        <p className="eleven-body-airy text-eleven-muted mt-2 max-w-xl text-base">
          Vos informations de compte et raccourcis vers les préférences.
        </p>
      </header>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div
          className="profile-panel-enter profile-card-lift flex shrink-0 flex-col items-center gap-4 lg:w-52"
          style={{ "--profile-enter-delay": "0.08s" } as CSSProperties}
        >
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary user avatar URLs (no remotePatterns)
            <img
              src={user.avatarUrl}
              alt=""
              width={120}
              height={120}
              className="shadow-eleven-card h-[120px] w-[120px] rounded-full object-cover ring-1 ring-(--eleven-border-subtle)"
            />
          ) : (
            <div
              className="shadow-eleven-card flex h-[120px] w-[120px] items-center justify-center rounded-full bg-(--eleven-stone) text-2xl font-medium tracking-tight ring-1 ring-black/5 dark:ring-white/10"
              aria-hidden
            >
              {initials(user.username)}
            </div>
          )}
          <p className="eleven-body-airy text-center text-sm font-medium">{user.username}</p>
        </div>

        <div className="min-w-0 flex-1 space-y-6">
          <Card
            className="profile-panel-enter profile-card-lift border border-(--eleven-border-subtle)"
            style={{ "--profile-enter-delay": "0.12s" } as CSSProperties}
          >
            <CardHeader>
              <CardTitle className="eleven-display-section text-xl font-light">Identité</CardTitle>
              <CardDescription className="eleven-body-airy">
                Informations associées à votre compte Shelf.
              </CardDescription>
            </CardHeader>
            <CardContent className="eleven-body-airy space-y-4 text-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="text-eleven-muted w-32 shrink-0">Nom d&apos;utilisateur</span>
                <span className="text-foreground font-medium">{user.username}</span>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="text-eleven-muted w-32 shrink-0">Email</span>
                <span className="text-foreground font-medium break-all">{user.email}</span>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="text-eleven-muted w-32 shrink-0">Rôle</span>
                <span className="text-foreground font-medium">{roleLabel(user.role)}</span>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="text-eleven-muted w-32 shrink-0">Inscription</span>
                <span className="text-foreground font-medium">{created}</span>
              </div>
              {user.oidcProvider ? (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                  <span className="text-eleven-muted w-32 shrink-0">Connexion</span>
                  <span className="text-foreground font-medium">OIDC ({user.oidcProvider})</span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card
            className="profile-panel-enter profile-card-lift border border-(--eleven-border-subtle)"
            style={{ "--profile-enter-delay": "0.2s" } as CSSProperties}
          >
            <CardHeader>
              <CardTitle className="eleven-display-section text-xl font-light">
                Raccourcis
              </CardTitle>
              <CardDescription className="eleven-body-airy">
                Recommandations et intégrations.
              </CardDescription>
            </CardHeader>
            <CardContent className="profile-actions flex flex-wrap gap-3">
              <Button asChild variant="warmStone" size="warm" className="rounded-eleven-pill">
                <Link href="/recommendations">Pour vous</Link>
              </Button>
              <Button asChild variant="whitePill" size="lg" className="rounded-eleven-pill">
                <Link href="/settings/api-keys">Clés API / MCP</Link>
              </Button>
            </CardContent>
          </Card>

          <Card
            className="profile-panel-enter profile-card-lift border border-(--eleven-border-subtle)"
            style={{ "--profile-enter-delay": "0.28s" } as CSSProperties}
          >
            <CardHeader>
              <CardTitle className="eleven-display-section text-xl font-light">Session</CardTitle>
              <CardDescription className="eleven-body-airy">
                Quitter votre compte sur cet appareil.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SignOutButton className="rounded-eleven-pill" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
