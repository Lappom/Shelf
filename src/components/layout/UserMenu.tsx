"use client";

import * as React from "react";
import Link from "next/link";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { patchUserPreferencesAction } from "@/app/(app)/actions/userPreferences";
import { SignOutDropdownMenuItem } from "@/components/pwa/SignOutButton";
import { useTheme, type ThemePreference } from "@/components/theme/ThemeProvider";

type Props = { email: string | null };

export function UserMenu({ email }: Props) {
  const { theme, setTheme } = useTheme();
  const [busy, startTransition] = React.useTransition();

  const onThemeChange = (t: ThemePreference) => {
    setTheme(t);
    startTransition(async () => {
      const res = await patchUserPreferencesAction({ theme: t });
      if (!res.ok) {
        // Revert to system on failure to avoid locking user.
        setTheme("system");
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-eleven-pill eleven-body-airy"
          disabled={busy}
        >
          {email ?? "Compte"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-eleven-muted text-xs">Préférences</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(v) => onThemeChange(v as ThemePreference)}
        >
          <DropdownMenuRadioItem value="light" className="gap-2">
            <SunIcon className="h-4 w-4" />
            Clair
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="gap-2">
            <MoonIcon className="h-4 w-4" />
            Sombre
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className="gap-2">
            <MonitorIcon className="h-4 w-4" />
            Système
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">Profil</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/recommendations">Pour vous</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/api-keys">Clés API / MCP</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <SignOutDropdownMenuItem />
        {busy ? (
          <p className="text-eleven-muted px-2 py-1 text-center text-xs">Mise à jour du thème…</p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
