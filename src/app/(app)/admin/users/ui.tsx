"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { softDeleteUserAction, updateUserRoleAction } from "./actions";

type Row = {
  id: string;
  email: string;
  username: string;
  role: string;
  createdAt: string;
};

export function AdminUsersClient({
  users,
  currentUserId,
}: {
  users: Row[];
  currentUserId: string;
}) {
  const [pending, setPending] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  async function onRoleChange(userId: string, role: "admin" | "reader") {
    setPending(userId);
    setMessage(null);
    const res = await updateUserRoleAction({ userId, role });
    setPending(null);
    if (!res.ok) setMessage(res.error);
  }

  async function onDelete(userId: string) {
    if (!window.confirm("Désactiver ce compte ? L’utilisateur ne pourra plus se connecter.")) {
      return;
    }
    setPending(userId);
    setMessage(null);
    const res = await softDeleteUserAction({ userId });
    setPending(null);
    if (!res.ok) setMessage(res.error);
  }

  return (
    <div className="space-y-3">
      {message ? (
        <div className="border-destructive/30 bg-destructive/10 rounded-2xl border px-4 py-2 text-sm">
          {message}
        </div>
      ) : null}
      <div className="space-y-2">
        {users.map((u) => (
          <Card key={u.id} className="shadow-eleven-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-0.5">
                <div className="truncate font-medium">{u.username}</div>
                <div className="text-eleven-muted truncate text-sm">{u.email}</div>
                <div className="text-eleven-muted text-xs">
                  Créé le {new Date(u.createdAt).toLocaleDateString("fr-FR")}
                  {u.id === currentUserId ? " · Vous" : ""}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="bg-background border-input h-9 w-[140px] rounded-eleven-pill border px-3 text-sm"
                  value={u.role}
                  disabled={pending === u.id}
                  onChange={(e) => onRoleChange(u.id, e.target.value as "admin" | "reader")}
                  aria-label={`Rôle pour ${u.username}`}
                >
                  <option value="reader">reader</option>
                  <option value="admin">admin</option>
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-eleven-pill text-destructive"
                  disabled={pending === u.id || u.id === currentUserId}
                  onClick={() => onDelete(u.id)}
                >
                  Désactiver
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
