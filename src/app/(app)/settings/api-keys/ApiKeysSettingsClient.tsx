"use client";

import * as React from "react";

import { createApiKeyAction, listApiKeysAction, revokeApiKeyAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type ScopeOption = { id: string; label: string };

export function ApiKeysSettingsClient({
  initialKeys,
  scopeOptions,
}: {
  initialKeys: KeyRow[];
  scopeOptions: ScopeOption[];
}) {
  const [keys, setKeys] = React.useState<KeyRow[]>(initialKeys);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [newToken, setNewToken] = React.useState<string | null>(null);
  const [restrictScopes, setRestrictScopes] = React.useState(false);
  const [selectedScopes, setSelectedScopes] = React.useState<Set<string>>(() => new Set());

  const refresh = React.useCallback(async () => {
    const res = await listApiKeysAction();
    if (res.ok) setKeys(res.keys as KeyRow[]);
  }, []);

  const toggleScope = (id: string) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onCreate = async () => {
    setError(null);
    if (restrictScopes && selectedScopes.size === 0) {
      setError("Choisissez au moins une portée ou désactivez la restriction.");
      return;
    }
    setBusy(true);
    try {
      const res = await createApiKeyAction({
        name: name.trim() || "MCP",
        scopes: restrictScopes ? Array.from(selectedScopes) : undefined,
      });
      if (!res.ok) {
        setError("Nom ou portées invalides.");
        return;
      }
      setNewToken(res.token);
      setName("");
      setRestrictScopes(false);
      setSelectedScopes(new Set());
      await refresh();
    } catch {
      setError("Échec de la création.");
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (id: string) => {
    if (!confirm("Révoquer cette clé ? Les clients MCP ne pourront plus l’utiliser.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await revokeApiKeyAction({ id });
      if (!res.ok) {
        setError("Révocation impossible.");
        return;
      }
      await refresh();
    } catch {
      setError("Révocation impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-eleven-card border-(--eleven-border-subtle)">
        <CardHeader>
          <CardTitle className="text-lg">Nouvelle clé</CardTitle>
          <CardDescription>
            Préfixe <code className="text-xs">sk_shelf_</code> — copiez le secret une seule fois
            après création.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-eleven-muted text-xs" htmlFor="key-name">
                Nom
              </label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. Cursor, Claude…"
                maxLength={100}
                disabled={busy}
              />
            </div>
            <Button
              type="button"
              onClick={() => void onCreate()}
              disabled={busy}
              className="rounded-eleven-pill"
            >
              Générer
            </Button>
          </div>

          <div className="border-(--eleven-border-subtle) space-y-3 border-t pt-3">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={restrictScopes}
                onChange={(e) => setRestrictScopes(e.target.checked)}
                disabled={busy}
              />
              <span>
                Restreindre les capacités MCP (scopes). Par défaut, la clé a un accès complet.
              </span>
            </label>
            {restrictScopes ? (
              <ul className="grid gap-2 sm:grid-cols-1">
                {scopeOptions.map((opt) => (
                  <li key={opt.id}>
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedScopes.has(opt.id)}
                        onChange={() => toggleScope(opt.id)}
                        disabled={busy}
                      />
                      <span>
                        <span className="font-mono text-xs text-eleven-muted">{opt.id}</span>
                        <br />
                        {opt.label}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <Card className="rounded-eleven-card border-(--eleven-border-subtle)">
        <CardHeader>
          <CardTitle className="text-lg">Clés existantes</CardTitle>
          <CardDescription>Seul un préfixe est stocké pour identification.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {keys.length === 0 ? (
            <p className="text-eleven-muted text-sm">Aucune clé pour l’instant.</p>
          ) : (
            <ul className="divide-y divide-(--eleven-border-subtle)">
              {keys.map((k) => (
                <li
                  key={k.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{k.name}</p>
                    <p className="text-eleven-muted font-mono text-xs">
                      {k.prefix}…
                      {k.revokedAt ? <span className="text-destructive ml-2">révoquée</span> : null}
                    </p>
                    <p className="text-eleven-muted mt-1 text-xs">
                      {k.scopes.length === 0 ? (
                        <span>Portée : accès complet</span>
                      ) : (
                        <span>
                          Portées :{" "}
                          {k.scopes.map((s) => (
                            <code key={s} className="mr-1 text-[10px]">
                              {s}
                            </code>
                          ))}
                        </span>
                      )}
                    </p>
                    <p className="text-eleven-muted text-xs">
                      Créée {new Date(k.createdAt).toLocaleString()}
                      {k.lastUsedAt
                        ? ` · Dernière utilisation ${new Date(k.lastUsedAt).toLocaleString()}`
                        : ""}
                    </p>
                  </div>
                  {!k.revokedAt ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-eleven-pill"
                      disabled={busy}
                      onClick={() => void onRevoke(k.id)}
                    >
                      Révoquer
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={newToken != null} onOpenChange={(o) => !o && setNewToken(null)}>
        <DialogContent className="rounded-eleven-card">
          <DialogHeader>
            <DialogTitle>Copiez votre clé maintenant</DialogTitle>
            <DialogDescription>
              Elle ne sera plus affichée. Utilisez{" "}
              <code className="text-xs">Authorization: Bearer …</code> dans la config MCP.
            </DialogDescription>
          </DialogHeader>
          <pre className="bg-muted max-h-40 overflow-auto rounded-md p-3 text-xs break-all">
            {newToken}
          </pre>
          <DialogFooter>
            <Button type="button" className="rounded-eleven-pill" onClick={() => setNewToken(null)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
