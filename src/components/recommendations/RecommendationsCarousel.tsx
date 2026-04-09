"use client";

import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import {
  dismissRecommendationAction,
  markRecommendationsSeenAction,
  refreshRecommendationsAction,
} from "@/app/(app)/recommendations/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { primaryReasonText } from "./recoReasons";

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

  React.useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  React.useEffect(() => {
    if (items.length === 0) return;
    const ids = items.map((i) => i.bookId);
    void markRecommendationsSeenAction({ bookIds: ids }).catch(() => undefined);
  }, [items]);

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(280, el.clientWidth * 0.8), behavior: "smooth" });
  };

  const onDismiss = (bookId: string) => {
    startTransition(async () => {
      const res = await dismissRecommendationAction({ bookId });
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
      <section className={cn("space-y-3", className)}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-foreground text-2xl font-light tracking-tight md:text-3xl">
            Pour vous
          </h2>
        </div>
        <Card className="shadow-eleven-card rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <p className="text-eleven-muted eleven-body-airy mb-4 text-sm">
            Aucune suggestion pour l’instant. Lancez un calcul ou attendez le prochain passage
            automatique.
          </p>
          <Button
            type="button"
            className="rounded-eleven-pill shadow-eleven-warm"
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
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-display text-foreground text-2xl font-light tracking-tight md:text-3xl">
          Pour vous
        </h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-eleven-pill shadow-eleven-button-white hidden sm:inline-flex"
            aria-label="Faire défiler vers la gauche"
            onClick={() => scrollBy(-1)}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-eleven-pill shadow-eleven-button-white hidden sm:inline-flex"
            aria-label="Faire défiler vers la droite"
            onClick={() => scrollBy(1)}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
          <Button
            asChild
            variant="outline"
            className="rounded-eleven-pill shadow-eleven-button-white"
          >
            <Link href="/recommendations">Voir tout</Link>
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => {
          const reason = primaryReasonText(item.reasons);
          const src = coverSrc(item.bookId, item.coverUrl, item.coverToken);
          return (
            <Card
              key={item.bookId}
              className="shadow-eleven-card w-[min(220px,78vw)] shrink-0 snap-start overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white"
            >
              <Link href={`/book/${item.bookId}`} className="block">
                <div className="bg-muted relative aspect-2/3 w-full">
                  {src ? (
                    <Image
                      src={src}
                      alt=""
                      fill
                      unoptimized={!item.coverToken}
                      sizes="220px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="text-eleven-muted flex h-full items-center justify-center text-xs">
                      Couverture
                    </div>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <div className="line-clamp-2 text-sm font-medium">{item.title}</div>
                  <div className="text-eleven-muted line-clamp-1 text-xs">
                    {authorsLine(item.authors) || "—"}
                  </div>
                  {reason ? (
                    <p className="text-eleven-muted line-clamp-2 text-[11px] leading-snug">
                      {reason}
                    </p>
                  ) : null}
                </div>
              </Link>
              <div className="px-3 pb-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-eleven-muted hover:text-foreground h-8 w-full rounded-xl text-xs"
                  disabled={busy}
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
