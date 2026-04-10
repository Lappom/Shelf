"use client";

import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";

import {
  dismissRecommendationAction,
  logRecommendationAnalyticsBatchAction,
  markRecommendationsSeenAction,
  refreshRecommendationsAction,
  setRecommendationFeedbackAction,
} from "@/app/(app)/recommendations/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { RecoBookLink } from "./RecoBookLink";
import { primaryReasonText } from "./recoReasons";

/** Interval between automatic slides (infinite loop when ≥ 2 items). */
const RECO_CAROUSEL_AUTOPLAY_MS = 5000;

function getCarouselStepPx(el: HTMLDivElement): number {
  const first = el.children[0] as HTMLElement | undefined;
  if (!first) return 0;
  const styles = window.getComputedStyle(el);
  const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
  return first.getBoundingClientRect().width + gap;
}

export type CarouselRecoItem = {
  bookId: string;
  title: string;
  authors: unknown;
  coverUrl: string | null;
  coverToken: string | null;
  reasons: unknown;
};

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
    .slice(0, 2)
    .join(", ");
}

type Props = {
  initialItems: CarouselRecoItem[];
  className?: string;
};

export function RecommendationsCarousel({ initialItems, className }: Props) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [items, setItems] = React.useState(initialItems);
  const [busy, startTransition] = React.useTransition();
  const [refreshBusy, startRefresh] = React.useTransition();
  const impressionLogged = React.useRef(new Set<string>());

  React.useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  React.useEffect(() => {
    if (items.length === 0) return;
    const ids = items.map((i) => i.bookId);
    void markRecommendationsSeenAction({ bookIds: ids }).catch(() => undefined);
  }, [items]);

  const loopItems = React.useMemo(() => {
    if (items.length < 2) return items;
    return [...items, ...items];
  }, [items]);

  React.useEffect(() => {
    if (items.length === 0) return;
    const newItems = items.filter((i) => !impressionLogged.current.has(i.bookId));
    if (newItems.length === 0) return;
    for (const i of newItems) impressionLogged.current.add(i.bookId);
    void logRecommendationAnalyticsBatchAction({
      items: newItems.map((i) => ({
        bookId: i.bookId,
        event: "impression",
        source: "carousel",
      })),
    }).catch(() => undefined);
  }, [items]);

  React.useEffect(() => {
    if (items.length < 2) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;

    let intervalId: number | undefined;
    let cancelled = false;

    const runTick = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      const el = scrollRef.current;
      if (!el) return;
      const step = getCarouselStepPx(el);
      if (step <= 0) return;
      const setWidth = items.length * step;
      const nextLeft = el.scrollLeft + step;
      if (nextLeft >= setWidth - 0.5) {
        el.scrollTo({ left: nextLeft, behavior: "smooth" });
        let jumped = false;
        const jumpToStart = () => {
          if (jumped || !scrollRef.current) return;
          jumped = true;
          scrollRef.current.scrollTo({ left: 0, behavior: "auto" });
        };
        el.addEventListener("scrollend", jumpToStart, { once: true });
        window.setTimeout(jumpToStart, 520);
      } else {
        el.scrollTo({ left: nextLeft, behavior: "smooth" });
      }
    };

    const start = () => {
      if (intervalId != null) return;
      intervalId = window.setInterval(runTick, RECO_CAROUSEL_AUTOPLAY_MS);
    };
    const stop = () => {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const onVis = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [items.length]);

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(280, el.clientWidth * 0.8), behavior: "smooth" });
  };

  const onDismiss = (bookId: string) => {
    startTransition(async () => {
      const res = await dismissRecommendationAction({ bookId, source: "carousel" });
      if (res.ok) setItems((prev) => prev.filter((x) => x.bookId !== bookId));
    });
  };

  const onFeedback = (bookId: string, kind: "like" | "dislike") => {
    startTransition(async () => {
      const res = await setRecommendationFeedbackAction({ bookId, kind, source: "carousel" });
      if (res.ok) setItems((prev) => prev.filter((x) => x.bookId !== bookId));
    });
  };

  const onRefresh = () => {
    startRefresh(async () => {
      const res = await refreshRecommendationsAction();
      if (res.ok) window.location.reload();
    });
  };

  if (items.length === 0) {
    return (
      <section
        className={cn("library-reco-section space-y-4", className)}
        aria-labelledby="library-reco-heading-empty"
      >
        <div className="relative z-[1] space-y-1.5">
          <p className="library-reco-kicker-enter text-eleven-muted font-[var(--font-sans)] text-[10px] font-medium tracking-[0.22em] uppercase">
            Sélection
          </p>
          <h2
            id="library-reco-heading-empty"
            className="library-reco-title-enter library-hero-display text-foreground text-[1.65rem] leading-tight tracking-[-0.03em] sm:text-[1.85rem]"
          >
            Pour vous
          </h2>
        </div>
        <Card className="library-reco-actions-enter shadow-eleven-card relative z-[1] rounded-2xl border border-border bg-card/80 p-6 backdrop-blur-[2px]">
          <p className="text-eleven-muted eleven-body-airy mb-4 text-sm leading-relaxed">
            Aucune suggestion pour l’instant. Lancez un calcul ou attendez le prochain passage
            automatique.
          </p>
          <Button
            type="button"
            className="rounded-eleven-pill shadow-eleven-warm transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-eleven-button-white motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-eleven-warm"
            disabled={refreshBusy}
            onClick={onRefresh}
          >
            {refreshBusy ? "Calcul…" : "Générer mes suggestions"}
          </Button>
        </Card>
      </section>
    );
  }

  return (
    <section className={cn("library-reco-section space-y-4", className)} aria-labelledby="library-reco-heading">
      <div className="relative z-[1] flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[min(100%,28rem)] space-y-1.5">
          <p className="library-reco-kicker-enter text-eleven-muted font-[var(--font-sans)] text-[10px] font-medium tracking-[0.22em] uppercase">
            Suggestions personnalisées
          </p>
          <h2
            id="library-reco-heading"
            className="library-reco-title-enter library-hero-display text-foreground text-[1.65rem] leading-tight tracking-[-0.03em] sm:text-[1.85rem]"
          >
            Pour vous
          </h2>
        </div>
        <div className="library-reco-actions-enter flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-eleven-pill shadow-eleven-button-white hidden transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] sm:inline-flex hover:-translate-y-0.5 hover:shadow-eleven-card active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            aria-label="Faire défiler vers la gauche"
            onClick={() => scrollBy(-1)}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-eleven-pill shadow-eleven-button-white hidden transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] sm:inline-flex hover:-translate-y-0.5 hover:shadow-eleven-card active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            aria-label="Faire défiler vers la droite"
            onClick={() => scrollBy(1)}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
          <Button
            asChild
            variant="outline"
            className="rounded-eleven-pill shadow-eleven-button-white transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-eleven-card motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <Link href="/recommendations">Voir tout</Link>
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="relative z-[1] grid auto-cols-[min(220px,78vw)] grid-flow-col gap-4 overflow-x-auto scroll-pl-1 pb-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {loopItems.map((item, index) => {
          const reason = primaryReasonText(item.reasons);
          const src = coverSrc(item.bookId, item.coverUrl, item.coverToken);
          const dup = items.length >= 2 && index >= items.length ? 1 : 0;
          return (
            <Card
              key={dup === 0 ? item.bookId : `${item.bookId}-loop`}
              className="library-reco-card-enter shadow-eleven-card group flex min-h-0 min-w-0 snap-start flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:shadow-eleven-button-white motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-eleven-card"
              style={
                {
                  "--library-reco-delay": `${Math.min(index, 14) * 68}ms`,
                } as React.CSSProperties
              }
              aria-hidden={dup === 1 ? true : undefined}
            >
              <RecoBookLink
                bookId={item.bookId}
                href={`/book/${item.bookId}`}
                className="flex min-h-0 min-w-0 flex-1 flex-col focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none"
                source="carousel"
              >
                <div className="bg-muted relative aspect-2/3 w-full shrink-0 overflow-hidden">
                  {src ? (
                    <Image
                      src={src}
                      alt=""
                      fill
                      unoptimized={!item.coverToken}
                      sizes="220px"
                      className="object-cover transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.045] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                  ) : (
                    <div className="text-eleven-muted flex h-full items-center justify-center text-xs">
                      Couverture
                    </div>
                  )}
                </div>
                <div className="flex min-h-0 flex-1 flex-col space-y-1 p-3">
                  <div className="line-clamp-2 text-sm font-medium">{item.title}</div>
                  <div className="text-eleven-muted line-clamp-1 text-xs">
                    {authorsLine(item.authors) || "—"}
                  </div>
                  {reason ? (
                    <p className="text-eleven-muted line-clamp-2 text-[11px] leading-snug">{reason}</p>
                  ) : null}
                </div>
              </RecoBookLink>
              <div className="flex shrink-0 flex-col gap-1 px-3 pb-3 pt-0">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 rounded-xl text-xs transition-[transform,background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100"
                    disabled={busy}
                    aria-label="J’aime cette suggestion"
                    onClick={() => onFeedback(item.bookId, "like")}
                  >
                    <ThumbsUpIcon className="mr-1 h-3.5 w-3.5" />
                    J’aime
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-eleven-muted h-8 flex-1 rounded-xl text-xs transition-[transform,background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100"
                    disabled={busy}
                    aria-label="Moins comme ça"
                    onClick={() => onFeedback(item.bookId, "dislike")}
                  >
                    <ThumbsDownIcon className="mr-1 h-3.5 w-3.5" />
                    Moins
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-eleven-muted hover:text-foreground h-8 w-full rounded-xl text-xs transition-colors duration-200"
                  disabled={busy}
                  data-testid="reco-dismiss"
                  onClick={() => onDismiss(item.bookId)}
                >
                  Pas intéressé
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
