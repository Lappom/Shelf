"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import {
  filterAdminUsers,
  paginateAdminUsers,
  sortAdminUsers,
  type AdminUserRow,
  type SortField,
} from "./admin-users-list";
import { softDeleteUserAction, updateUserRoleAction } from "./actions";
import { DeleteUserDialog } from "./delete-user-dialog";

const PAGE_SIZES = [25, 50] as const;
const STAGGER_VISIBLE_ROWS = 12;

function parseSortSpec(spec: string): { field: SortField; dir: "asc" | "desc" } {
  const [field, dir] = spec.split(":");
  const f = field as SortField;
  const d = dir === "desc" ? "desc" : "asc";
  if (f === "createdAt" || f === "username" || f === "email" || f === "role") {
    return { field: f, dir: d };
  }
  return { field: "createdAt", dir: "asc" };
}

function roleBadgeClass(role: string): string {
  if (role === "admin") {
    return "bg-foreground/10 text-foreground border-eleven-border-subtle";
  }
  return "bg-muted text-muted-foreground border-eleven-border-subtle";
}

export function AdminUsersClient({
  users,
  currentUserId,
}: {
  users: AdminUserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [sortSpec, setSortSpec] = React.useState("createdAt:asc");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<(typeof PAGE_SIZES)[number]>(25);
  const [pending, setPending] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<AdminUserRow | null>(null);
  const [deleteConfirming, setDeleteConfirming] = React.useState(false);

  const { field: sortField, dir: sortDir } = parseSortSpec(sortSpec);

  const { filteredSorted, totalFiltered, pageItems, totalPages, safePage } = React.useMemo(() => {
    const filtered = filterAdminUsers(users, query);
    const sorted = sortAdminUsers(filtered, sortField, sortDir);
    const { pageItems: slice, totalPages: tp, safePage: sp } = paginateAdminUsers(
      sorted,
      page,
      pageSize,
    );
    return {
      filteredSorted: sorted,
      totalFiltered: sorted.length,
      pageItems: slice,
      totalPages: tp,
      safePage: sp,
    };
  }, [users, query, sortField, sortDir, page, pageSize]);

  React.useEffect(() => {
    setPage(1);
  }, [query, sortSpec, pageSize]);

  React.useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  async function onRoleChange(userId: string, role: "admin" | "reader") {
    setPending(userId);
    setMessage(null);
    const res = await updateUserRoleAction({ userId, role });
    setPending(null);
    if (!res.ok) {
      setMessage(res.error);
      return;
    }
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteConfirming(true);
    setMessage(null);
    const res = await softDeleteUserAction({ userId: deleteTarget.id });
    setDeleteConfirming(false);
    if (!res.ok) {
      setMessage(res.error);
      return;
    }
    setDeleteTarget(null);
    router.refresh();
  }

  const listAnimKey = `${safePage}-${query}-${sortSpec}-${pageSize}`;

  return (
    <div className="space-y-5">
      {message ? (
        <div
          className="border-destructive/30 bg-destructive/10 rounded-2xl border px-4 py-2 text-sm transition-opacity duration-200"
          role="alert"
        >
          {message}
        </div>
      ) : null}

      <div
        className="shelf-item-enter bg-muted/25 border-eleven-border-subtle flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:flex-wrap sm:items-end"
        style={{ "--shelf-enter-delay": "90ms" } as React.CSSProperties}
      >
        <div className="min-w-[min(100%,16rem)] flex-1 space-y-1.5">
          <label htmlFor="admin-users-search" className="text-eleven-muted text-xs font-medium">
            Recherche
          </label>
          <Input
            id="admin-users-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom ou e-mail…"
            className="rounded-eleven-pill h-10"
            aria-label="Filtrer les utilisateurs par nom ou e-mail"
          />
        </div>
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5 sm:max-w-[14rem]">
          <label htmlFor="admin-users-sort" className="text-eleven-muted text-xs font-medium">
            Tri
          </label>
          <select
            id="admin-users-sort"
            value={sortSpec}
            onChange={(e) => setSortSpec(e.target.value)}
            className="border-input bg-background eleven-body-airy focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-xl border px-3 text-[0.94rem] transition-colors outline-none focus-visible:ring-3"
            aria-label="Trier la liste des utilisateurs"
          >
            <option value="createdAt:asc">Date (plus ancien d’abord)</option>
            <option value="createdAt:desc">Date (plus récent d’abord)</option>
            <option value="username:asc">Nom (A → Z)</option>
            <option value="username:desc">Nom (Z → A)</option>
            <option value="email:asc">E-mail (A → Z)</option>
            <option value="email:desc">E-mail (Z → A)</option>
            <option value="role:asc">Rôle (A → Z)</option>
            <option value="role:desc">Rôle (Z → A)</option>
          </select>
        </div>
        <div className="flex min-w-[6rem] flex-col gap-1.5">
          <label htmlFor="admin-users-page-size" className="text-eleven-muted text-xs font-medium">
            Par page
          </label>
          <select
            id="admin-users-page-size"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])}
            className="border-input bg-background eleven-body-airy focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-xl border px-3 text-[0.94rem] transition-colors outline-none focus-visible:ring-3"
            aria-label="Nombre d’utilisateurs par page"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="text-eleven-muted eleven-body-airy pb-1 text-sm sm:ml-auto">
          {totalFiltered === users.length ? (
            <span>
              <span className="text-foreground font-medium">{totalFiltered}</span> compte
              {totalFiltered > 1 ? "s" : ""}
            </span>
          ) : (
            <span>
              <span className="text-foreground font-medium">{totalFiltered}</span> sur{" "}
              {users.length} (filtré)
            </span>
          )}
        </div>
      </div>

      {users.length === 0 ? (
        <EmptyState
          title="Aucun utilisateur"
          description="Il n’y a pas encore de compte actif dans la base."
        />
      ) : filteredSorted.length === 0 ? (
        <EmptyState
          title="Aucun résultat"
          description="Aucun utilisateur ne correspond à cette recherche. Modifiez ou effacez le filtre."
        />
      ) : (
        <>
          <div key={`table-${listAnimKey}`} className="hidden lg:block">
            <div className="shadow-eleven-card overflow-hidden rounded-2xl border border-[var(--eleven-border-subtle)] bg-card">
              <div className="max-h-[min(70vh,42rem)] overflow-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead className="bg-card/95 supports-backdrop-filter:backdrop-blur-xs sticky top-0 z-10 border-b border-[var(--eleven-border-subtle)]">
                    <tr className="text-eleven-muted eleven-body-airy">
                      <th scope="col" className="px-4 py-3 font-medium">
                        Utilisateur
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        E-mail
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Créé le
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Rôle
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((u, index) => (
                      <tr
                        key={u.id}
                        style={
                          index < STAGGER_VISIBLE_ROWS
                            ? ({ "--shelf-enter-delay": `${index * 42}ms` } as React.CSSProperties)
                            : undefined
                        }
                        className={`shelf-item-enter border-eleven-border-subtle border-b transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] last:border-b-0 hover:bg-muted/35 ${
                          u.id === currentUserId ? "bg-muted/55" : ""
                        }`}
                        aria-busy={pending === u.id}
                      >
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-foreground font-medium">{u.username}</span>
                            {u.id === currentUserId ? (
                              <span className="border-eleven-border-subtle text-eleven-muted rounded-full border px-2 py-0.5 text-xs font-medium">
                                Vous
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="text-eleven-secondary px-4 py-3">
                          <span className="line-clamp-2 break-all">{u.email}</span>
                        </td>
                        <td className="text-eleven-muted px-4 py-3 whitespace-nowrap">
                          {new Date(u.createdAt).toLocaleDateString("fr-FR")}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${roleBadgeClass(u.role)}`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {pending === u.id ? (
                              <Loader2Icon
                                className="text-eleven-muted size-4 animate-spin"
                                aria-hidden
                              />
                            ) : null}
                            <select
                              className="border-input bg-background rounded-eleven-pill h-9 max-w-[9rem] border px-3 text-sm transition-colors duration-150"
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
                              className="rounded-eleven-pill text-destructive transition-transform duration-150 active:scale-[0.98]"
                              disabled={pending === u.id || u.id === currentUserId}
                              onClick={() => setDeleteTarget(u)}
                            >
                              Désactiver
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div key={`cards-${listAnimKey}`} className="space-y-2 lg:hidden">
            {pageItems.map((u, index) => (
              <Card
                key={u.id}
                style={
                  index < STAGGER_VISIBLE_ROWS
                    ? ({ "--shelf-enter-delay": `${index * 42}ms` } as React.CSSProperties)
                    : undefined
                }
                className={`shadow-eleven-card shelf-item-enter p-4 transition-shadow duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:shadow-md ${
                  u.id === currentUserId ? "ring-eleven-outline" : ""
                }`}
              >
                <div className="flex flex-col gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate font-medium">{u.username}</div>
                      {u.id === currentUserId ? (
                        <span className="border-eleven-border-subtle text-eleven-muted rounded-full border px-2 py-0.5 text-xs">
                          Vous
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${roleBadgeClass(u.role)}`}
                      >
                        {u.role}
                      </span>
                    </div>
                    <div className="text-eleven-muted truncate text-sm">{u.email}</div>
                    <div className="text-eleven-muted text-xs">
                      Créé le {new Date(u.createdAt).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {pending === u.id ? (
                      <Loader2Icon className="text-eleven-muted size-4 animate-spin" aria-hidden />
                    ) : null}
                    <select
                      className="bg-background border-input rounded-eleven-pill h-9 min-w-[140px] border px-3 text-sm transition-colors duration-150"
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
                      className="rounded-eleven-pill text-destructive transition-transform duration-150 active:scale-[0.98]"
                      disabled={pending === u.id || u.id === currentUserId}
                      onClick={() => setDeleteTarget(u)}
                    >
                      Désactiver
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {totalPages > 1 ? (
            <nav
              className="text-eleven-muted flex flex-col items-stretch gap-3 border-t border-[var(--eleven-border-subtle)] pt-4 text-sm sm:flex-row sm:items-center sm:justify-between"
              aria-label="Pagination des utilisateurs"
            >
              <span className="eleven-body-airy text-center sm:text-left">
                Page <span className="text-foreground font-medium">{safePage}</span> sur{" "}
                <span className="text-foreground font-medium">{totalPages}</span>
              </span>
              <div className="flex justify-center gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-eleven-pill gap-1"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeftIcon className="size-3.5" aria-hidden />
                  Précédent
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-eleven-pill gap-1"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Suivant
                  <ChevronRightIcon className="size-3.5" aria-hidden />
                </Button>
              </div>
            </nav>
          ) : null}
        </>
      )}

      <DeleteUserDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            if (deleteConfirming) return;
            setDeleteTarget(null);
          }
        }}
        user={deleteTarget}
        confirming={deleteConfirming}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="shadow-eleven-card shelf-item-enter rounded-2xl border border-dashed border-[var(--eleven-border-subtle)] bg-muted/15 px-6 py-12 text-center">
      <p className="eleven-display-section text-foreground text-lg">{title}</p>
      <p className="text-eleven-muted eleven-body-airy mt-2 max-w-md text-sm">{description}</p>
    </div>
  );
}
