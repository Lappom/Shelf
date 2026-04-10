"use client";

import Image from "next/image";
import * as React from "react";
import { ChevronDownIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";

import { patchUserPreferencesAction } from "@/app/(app)/actions/userPreferences";
import {
  dismissRecommendationAction,
  listRecommendationsAction,
  logRecommendationAnalyticsBatchAction,
  refreshRecommendationsAction,
  setRecommendationFeedbackAction,
} from "@/app/(app)/recommendations/actions";
import { RecoBookLink } from "@/components/recommendations/RecoBookLink";
import {
  RECO_REASON_FILTER_CODES,
  parseRecoReasons,
  primaryReasonText,
} from "@/components/recommendations/recoReasons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RecommendationListRow } from "@/lib/recommendations/loadRecommendationsPage";

const REASON_CODE_TO_LABEL: Record<string, string> = Object.fromEntries(
  RECO_REASON_FILTER_CODES.map((r) => [r.code, r.label]),
);

const RECO_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function reasonBadgeLabel(code: string): string {
  return REASON_CODE_TO_LABEL[code] ?? code;
}

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

function RecommendationCardSkeleton() {
  return (
    <Card className="shadow-eleven-card bg-card grid grid-cols-[7rem_minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl border border-[#e5e5e5] py-0 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <div className="bg-muted min-h-0 min-w-0 animate-pulse" aria-hidden />
      <div className="flex min-h-0 min-w-0 flex-col gap-2 p-4">
        <div className="bg-muted h-4 w-4/5 max-w-[14rem] animate-pulse rounded-md" />
        <div className="bg-muted h-3 w-1/2 animate-pulse rounded-md" />
        <div className="bg-muted mt-1 h-3 w-full animate-pulse rounded-md" />
        <div className="bg-muted h-3 w-11/12 animate-pulse rounded-md" />
        <div className="mt-auto flex gap-2 pt-2">
          <div className="bg-muted h-10 w-20 animate-pulse rounded-xl sm:h-8" />
          <div className="bg-muted h-10 w-20 animate-pulse rounded-xl sm:h-8" />
        </div>
      </div>
    </Card>
  );
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
  const [isAppending, setIsAppending] = React.useState(false);
  const [busy, startTransition] = React.useTransition();
  const [refreshBusy, startRefresh] = React.useTransition();
  const impressionLogged = React.useRef(new Set<string>());

  React.useEffect(() => {
    setItems(initialItems);
    setNextCursor(initialNextCursor);
  }, [initialItems, initialNextCursor]);

  React.useEffect(() => {
    if (items.length === 0) return;
    const newItems = items.filter((i) => !impressionLogged.current.has(i.bookId));
    if (newItems.length === 0) return;
    for (const i of newItems) impressionLogged.current.add(i.bookId);
    void logRecommendationAnalyticsBatchAction({
      items: newItems.map((i) => ({
        bookId: i.bookId,
        event: "impression",
        source: "page",
      })),
    }).catch(() => undefined);
  }, [items]);

  const loadPage = React.useCallback(
    async (opts: { append: boolean; cursor: string | null; code: string | null }) => {
      setLoading(true);
      setIsAppending(opts.append);
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
        setIsAppending(false);
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
      const res = await dismissRecommendationAction({ bookId, source: "page" });
      if (res.ok) setItems((prev) => prev.filter((x) => x.bookId !== bookId));
    });
  };

  const onFeedback = (bookId: string, kind: "like" | "dislike") => {
    startTransition(async () => {
      const res = await setRecommendationFeedbackAction({ bookId, kind, source: "page" });
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

  const showReplaceSkeletons = loading && !isAppending && items.length === 0;
  const listDimmed = loading && !isAppending && items.length > 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10 md:space-y-8">
      <header className="shelf-hero-enter flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            id="reco-heading"
            className="eleven-display-section text-foreground text-[2rem] font-light tracking-tight md:text-4xl"
          >
            Pour vous
          </h1>
          <p className="text-eleven-muted eleven-body-airy mt-2 max-w-xl text-base leading-relaxed">
            Suggestions basées sur votre lecture, vos étagères et les habitudes de la bibliothèque.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="rounded-eleven-pill shadow-eleven-button-white h-11 w-fit transition-[box-shadow,transform] duration-200 motion-safe:hover:-translate-y-px motion-safe:hover:shadow-md sm:h-10"
          style={{ transitionTimingFunction: RECO_EASE }}
          disabled={refreshBusy}
          onClick={onRefresh}
        >
          {refreshBusy ? "Calcul…" : "Recalculer"}
        </Button>
      </header>

      <details className="group shadow-eleven-card bg-card open:shadow-eleven-button-white rounded-2xl border border-(--eleven-border-subtle)">
        <summary className="eleven-body-airy flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3.5 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
            <span className="font-heading text-base font-light tracking-tight">
              Confidentialité
            </span>
            <span className="text-eleven-muted text-xs font-normal">
              Signaux collaboratifs, retours et mesure d’usage
            </span>
          </span>
          <ChevronDownIcon className="text-eleven-muted size-4 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="shelf-details-body border-t border-(--eleven-border-subtle) px-4 py-4">
          <label className="text-eleven-muted flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="border-input text-primary mt-1 size-4 shrink-0 rounded border"
              checked={collab}
              onChange={(e) => onCollabToggle(e.target.checked)}
            />
            <span>
              Autoriser les recommandations collaboratives (comparaison anonyme avec d’autres
              lecteurs, minimum 5 livres en commun).
            </span>
          </label>
          <p className="text-eleven-muted mt-3 text-xs leading-relaxed">
            Vos « J’aime », « Moins » et « Pas intéressé » sont enregistrés pour affiner les scores.
            Les signaux collaboratifs n’exposent jamais d’identité de lecteur ; les statistiques
            d’usage (impressions, clics) servent uniquement à mesurer la qualité des suggestions.
            Pour plus de détails, consultez la spécification produit du projet (section
            confidentialité).
          </p>
        </div>
      </details>

      <div
        className="bg-background/80 supports-backdrop-filter:bg-background/70 sticky top-14 z-30 -mx-6 border-b border-(--eleven-border-subtle) px-6 py-3 backdrop-blur-md"
        role="toolbar"
        aria-label="Filtrer les suggestions"
      >
        <div className="scrollbar-none flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Button
            type="button"
            size="sm"
            variant={reasonFilter == null ? "secondary" : "outline"}
            className={cn(
              "rounded-eleven-pill shrink-0 snap-start transition-[box-shadow,transform,opacity] duration-200 motion-safe:hover:-translate-y-px",
              reasonFilter == null && "ring-eleven-outline",
            )}
            style={{ transitionTimingFunction: RECO_EASE }}
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
              className={cn(
                "rounded-eleven-pill shrink-0 snap-start transition-[box-shadow,transform,opacity] duration-200 motion-safe:hover:-translate-y-px",
                reasonFilter === r.code && "ring-eleven-outline",
              )}
              style={{ transitionTimingFunction: RECO_EASE }}
              onClick={() => selectReasonFilter(r.code)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      <section
        aria-labelledby="reco-heading"
        aria-busy={loading}
        aria-live="polite"
        className="space-y-4"
      >
        {items.length === 0 && !loading ? (
          <Card className="shadow-eleven-card bg-card rounded-2xl border border-[#e5e5e5] p-8 text-center">
            <p className="text-eleven-muted text-sm">Aucun résultat pour ce filtre.</p>
            <Button
              type="button"
              className="rounded-eleven-pill mt-4 transition-[box-shadow,transform] duration-200 motion-safe:hover:-translate-y-px"
              style={{ transitionTimingFunction: RECO_EASE }}
              variant="outline"
              onClick={() => selectReasonFilter(null)}
            >
              Réinitialiser le filtre
            </Button>
          </Card>
        ) : null}

        {showReplaceSkeletons ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <RecommendationCardSkeleton />
            <RecommendationCardSkeleton />
            <RecommendationCardSkeleton />
          </div>
        ) : null}

        {items.length > 0 || (loading && !showReplaceSkeletons) ? (
          <div
            className={cn(
              "grid gap-4 sm:grid-cols-2",
              listDimmed && "pointer-events-none opacity-55 transition-opacity duration-200",
            )}
          >
            {items.map((row, index) => {
              const src = coverSrc(row.bookId, row.coverUrl, row.coverToken);
              const main = primaryReasonText(row.reasons);
              const codes = parseRecoReasons(row.reasons).map((r) => r.code);
              const enterDelay = Math.min(index, 10) * 80;
              return (
                <Card
                  key={row.bookId}
                  className={cn(
                    "shadow-eleven-card bg-card grid grid-cols-[7rem_minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl border border-[#e5e5e5] py-0 sm:grid-cols-[8rem_minmax(0,1fr)]",
                    "shelf-item-enter transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    "hover:shadow-eleven-button-white hover:-translate-y-0.5",
                    "motion-reduce:hover:shadow-eleven-card motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                  )}
                  style={{ "--shelf-enter-delay": `${enterDelay}ms` } as React.CSSProperties}
                >
                  <RecoBookLink
                    bookId={row.bookId}
                    href={`/book/${row.bookId}`}
                    className="bg-muted relative block min-h-0 min-w-0 overflow-hidden"
                    source="page"
                  >
                    {src ? (
                      <Image
                        src={src}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 112px, 128px"
                        unoptimized={!row.coverToken}
                      />
                    ) : (
                      <div className="text-eleven-muted absolute inset-0 flex items-center justify-center p-2 text-center text-[10px]">
                        Pas de couverture
                      </div>
                    )}
                  </RecoBookLink>
                  <div className="flex min-h-0 min-w-0 flex-col p-4">
                    {main ? (
                      <p className="text-eleven-secondary eleven-body-airy line-clamp-2 text-sm leading-relaxed">
                        {main}
                      </p>
                    ) : null}
                    <RecoBookLink
                      bookId={row.bookId}
                      href={`/book/${row.bookId}`}
                      className={cn("line-clamp-2 font-medium hover:underline", main ? "mt-2" : "")}
                      source="page"
                    >
                      {row.title}
                    </RecoBookLink>
                    <div className="text-eleven-muted mt-1 line-clamp-1 text-xs">
                      {authorsLine(row.authors) || "—"}
                    </div>
                    {codes.length ? (
                      <div className="text-eleven-muted mt-2 flex flex-wrap gap-1.5 text-[11px] leading-tight">
                        {codes.slice(0, 4).map((c) => (
                          <span
                            key={c}
                            className="rounded-full border border-[rgba(0,0,0,0.06)] bg-[#f6f6f6] px-2 py-0.5 dark:border-white/10 dark:bg-white/10"
                          >
                            {reasonBadgeLabel(c)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-auto flex flex-col gap-2 pt-3 sm:flex-row sm:flex-wrap sm:justify-start">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-10 rounded-xl text-xs transition-[box-shadow,transform] duration-200 motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 sm:h-8 sm:min-h-8"
                        style={{ transitionTimingFunction: RECO_EASE }}
                        disabled={busy}
                        aria-label="J’aime cette suggestion"
                        onClick={() => onFeedback(row.bookId, "like")}
                      >
                        <ThumbsUpIcon className="mr-1 h-3.5 w-3.5" />
                        J’aime
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-eleven-muted min-h-10 rounded-xl text-xs transition-[box-shadow,transform] duration-200 motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 sm:h-8 sm:min-h-8"
                        style={{ transitionTimingFunction: RECO_EASE }}
                        disabled={busy}
                        aria-label="Moins comme ça"
                        onClick={() => onFeedback(row.bookId, "dislike")}
                      >
                        <ThumbsDownIcon className="mr-1 h-3.5 w-3.5" />
                        Moins
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-10 rounded-xl text-xs transition-[box-shadow,transform] duration-200 motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 sm:h-8 sm:min-h-8"
                        style={{ transitionTimingFunction: RECO_EASE }}
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
            {isAppending && loading ? (
              <>
                <RecommendationCardSkeleton />
                <RecommendationCardSkeleton />
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      {nextCursor ? (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-eleven-pill min-h-11 transition-[box-shadow,transform] duration-200 motion-safe:hover:-translate-y-px sm:min-h-10"
            style={{ transitionTimingFunction: RECO_EASE }}
            disabled={loading}
            onClick={() => void loadPage({ append: true, cursor: nextCursor, code: reasonFilter })}
          >
            {loading && isAppending ? "Chargement…" : "Charger plus"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
