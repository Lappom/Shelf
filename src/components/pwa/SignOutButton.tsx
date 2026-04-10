"use client";

import * as React from "react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { clearOfflineLocalState } from "@/lib/offline/cleanup";

async function signOutNavigate() {
  try {
    await clearOfflineLocalState();
  } catch {
    /* still sign out */
  }
  // POST with CSRF (GET shows the default confirmation page)
  await signOut({ callbackUrl: "/login" });
}

export function SignOutButton({ className }: { className?: string }) {
  const [busy, setBusy] = React.useState(false);

  return (
    <Button
      variant="outline"
      className={className}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signOutNavigate();
      }}
    >
      Déconnexion
    </Button>
  );
}

/** Use inside DropdownMenu: closes menu then redirects to sign-out. */
export function SignOutDropdownMenuItem() {
  const [busy, setBusy] = React.useState(false);

  return (
    <DropdownMenuItem
      disabled={busy}
      variant="destructive"
      onSelect={(e) => {
        e.preventDefault();
        setBusy(true);
        void signOutNavigate();
      }}
    >
      Déconnexion
    </DropdownMenuItem>
  );
}
