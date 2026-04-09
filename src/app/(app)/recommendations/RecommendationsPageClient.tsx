"use client";

import Image from "next/image";
import Link from "next/link";
import * as React from "react";

import { patchUserPreferencesAction } from "@/app/(app)/actions/userPreferences";
import {
  dismissRecommendationAction,
  listRecommendationsAction,
  refreshRecommendationsAction,
} from "@/app/(app)/recommendations/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  RECO_REASON_FILTER_CODES,
  parseRecoReasons,
  primaryReasonText,
} from "@/components/recommendations/recoReasons";
import type { RecommendationListRow } from "@/lib/recommendations/loadRecommendationsPage";

function coverSrc(bookId: string, coverUrl: string | null, coverToken: string | null) {
  if (!coverUrl) return null;
  if (coverToken) return `/api/books/${bookId}/cover?t=${encodeURIComponent(coverToken)}`;
  return `/api/books/${bookId}/cover`;
}

function authorsLine(authors: unknown): string {
  if (!Array.isArray(authors)) return "";
  return authors
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
}

type Props = {
  initialItems: RecommendationListRow[];
  initialNextCursor: string | null;
  collaborativeEnabled: boolean;
};

export function RecommendationsPageClient({
  initialItems,
  initialNextCursor,
  collaborativeEnabled: initialCollab,
}: Props) {
  const [items, setItems] = React.useState(initialItems);
  const [nextCursor, setNextCursor] = React.useState(initialNextCursor);
  const [reasonFilter, setReasonFilter] = React.useState<string | null>(null);
  const [collab, setCollab] = React.useState(initialCollab);
  const [loading, setLoading] = React.useState(false);
  const [busy, startTransition] = React.useTransition();
  const [refreshBusy, startRefresh] = React.useTransition();

  React.useEffect(() => {
    setItems(initialItems);
    setNextCursor(initialNextCursor);
  }, [initialItems, initialNextCursor]);

  const loadPage = React.useCallback(
    async (opts: { append: boolean; cursor: string | null; code: string | null }) => {
      setLoading(true);
      try {
        const res = await listRecommendationsAction({
          limit: 10,
          cursor: opts.cursor,
          reasonCode: opts.code,
        });
        if (!res.ok) return;
        setItems((prev) => (opts.append ? [...prev, ...res.items] : res.items));
        setNextCursor(res.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const selectReasonFilter = (code: string | null) => {
    setReasonFilter(code);
    void loadPage({ append: false, cursor: null, code });
  };

  const onDismiss = (bookId: string) => {
    startTransition(async () => {
      const res = await dismissRecommendationAction({ bookId });
      if (res.ok) setItems((prev) => prev.filter((x) => x.bookId !== bookId));
    });
  };

  const onCollabToggle = (checked: boolean) => {
    setCollab(checked);
    startTransition(async () => {
      await patchUserPreferencesAction({ recommendationsCollaborativeEnabled: checked });
    });
  };

  const onRefresh = () => {
    startRefresh(async () => {
      const res = await refreshRecommendationsAction();
      if (res.ok) window.location.reload();
    });
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-foreground text-3xl font-light tracking-tight md:text-4xl">
            Pour vous
          </h1>
          <p className="text-eleven-muted eleven-body-airy mt-2 max-w-xl text-sm">
            Suggestions basées sur votre lecture, vos étagères et les habitudes de la bibliothèque.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="rounded-eleven-pill shadow-eleven-button-white w-fit"
          disabled={refreshBusy}
          onClick={onRefresh}
        >
          {refreshBusy ? "Calcul…" : "Recalculer"}
        </Button>
      </div>

      <Card className="shadow-eleven-card rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <div className="text-sm font-medium">Confidentialité</div>
        <label className="text-eleven-muted mt-3 flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={collab}
            onChange={(e) => onCollabToggle(e.target.checked)}
          />
          <span>
            Autoriser les recommandations collaboratives (comparaison anonyme avec d’autres
            lecteurs, minimum 5 livres en commun).
          </span>
        </label>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={reasonFilter == null ? "secondary" : "outline"}
          className="rounded-eleven-pill"
          onClick={() => selectReasonFilter(null)}
        >
          Toutes
        </Button>
        {RECO_REASON_FILTER_CODES.map((r) => (
          <Button
            key={r.code}
            type="button"
            size="sm"
            variant={reasonFilter === r.code ? "secondary" : "outline"}
            className="rounded-eleven-pill"
            onClick={() => selectReasonFilter(r.code)}
          >
            {r.label}
          </Button>
        ))}
      </div>

      {items.length === 0 && !loading ? (
        <Card className="shadow-eleven-card rounded-2xl border border-[#e5e5e5] bg-white p-8 text-center">
          <p className="text-eleven-muted text-sm">Aucun résultat pour ce filtre.</p>
          <Button
            type="button"
            className="rounded-eleven-pill mt-4"
            variant="outline"
            onClick={() => selectReasonFilter(null)}
          >
            Réinitialiser le filtre
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((row) => {
            const src = coverSrc(row.bookId, row.coverUrl, row.coverToken);
            const main = primaryReasonText(row.reasons);
            const codes = parseRecoReasons(row.reasons).map((r) => r.code);
            return (
              <Card
                key={row.bookId}
                className="shadow-eleven-card flex overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white"
              >
                <Link
                  href={`/book/${row.bookId}`}
                  className="bg-muted relative w-28 shrink-0 sm:w-32"
                >
                  {src ? (
                    <Image
                      src={src}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="128px"
                      unoptimized={!row.coverToken}
                    />
                  ) : (
                    <div className="text-eleven-muted flex h-full items-center justify-center p-2 text-center text-[10px]">
                      Pas de couverture
                    </div>
                  )}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col p-4">
                  <Link
                    href={`/book/${row.bookId}`}
                    className="line-clamp-2 font-medium hover:underline"
                  >
                    {row.title}
                  </Link>
                  <div className="text-eleven-muted mt-1 line-clamp-1 text-xs">
                    {authorsLine(row.authors) || "—"}
                  </div>
                  {main ? (
                    <p className="text-eleven-muted mt-2 line-clamp-3 text-xs leading-relaxed">
                      {main}
                    </p>
                  ) : null}
                  {codes.length ? (
                    <div className="text-eleven-muted mt-2 flex flex-wrap gap-1 text-[10px]">
                      {codes.slice(0, 4).map((c) => (
                        <span
                          key={c}
                          className="rounded-full border border-[rgba(0,0,0,0.06)] bg-[#f6f6f6] px-2 py-0.5"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-auto flex justify-end pt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-xl text-xs"
                      disabled={busy}
                      onClick={() => onDismiss(row.bookId)}
                    >
                      Pas intéressé
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            className="rounded-eleven-pill"
            disabled={loading}
            onClick={() => void loadPage({ append: true, cursor: nextCursor, code: reasonFilter })}
          >
            {loading ? "Chargement…" : "Charger plus"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
