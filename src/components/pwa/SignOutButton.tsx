"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { clearOfflineLocalState } from "@/lib/offline/cleanup";

export function SignOutButton() {
  const [busy, setBusy] = React.useState(false);

  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        (async () => {
          await clearOfflineLocalState();
          window.location.href = "/api/auth/signout";
        })().catch(() => {
          window.location.href = "/api/auth/signout";
        });
      }}
    >
      Déconnexion
    </Button>
  );
}

