"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";

import {
  clearRecommendationFeedbackAction,
  setRecommendationFeedbackAction,
} from "@/app/(app)/recommendations/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Kind = "like" | "dislike";

type Props = {
  bookId: string;
  initialKind: Kind | null;
  className?: string;
};

export function BookRecoFeedbackPanel({ bookId, initialKind, className }: Props) {
  const router = useRouter();
  const [kind, setKind] = React.useState<Kind | null>(initialKind);
  const [busy, startTransition] = React.useTransition();

  React.useEffect(() => {
    setKind(initialKind);
  }, [initialKind]);

  const run = (fn: () => Promise<{ ok: boolean }>) => {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-eleven-muted text-xs">Suggestions « Pour vous »</div>
      <p className="text-eleven-muted text-[11px] leading-snug">
        Votre avis affinage les recommandations.{" "}
        <Link href="/recommendations" className="underline-offset-2 hover:underline">
          Voir les suggestions
        </Link>
      </p>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          variant={kind === "like" ? "secondary" : "outline"}
          size="sm"
          className="h-8 rounded-xl text-xs"
          disabled={busy}
          aria-pressed={kind === "like"}
          onClick={() => {
            setKind("like");
            run(() => setRecommendationFeedbackAction({ bookId, kind: "like", source: "page" }));
          }}
        >
          <ThumbsUpIcon className="mr-1 size-3.5" />
          J’aime
        </Button>
        <Button
          type="button"
          variant={kind === "dislike" ? "secondary" : "outline"}
          size="sm"
          className="text-eleven-muted h-8 rounded-xl text-xs"
          disabled={busy}
          aria-pressed={kind === "dislike"}
          onClick={() => {
            setKind("dislike");
            run(() => setRecommendationFeedbackAction({ bookId, kind: "dislike", source: "page" }));
          }}
        >
          <ThumbsDownIcon className="mr-1 size-3.5" />
          Moins
        </Button>
        {kind ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-eleven-muted h-8 rounded-xl text-xs"
            disabled={busy}
            onClick={() => {
              setKind(null);
              run(() => clearRecommendationFeedbackAction({ bookId }));
            }}
          >
            Retirer mon avis
          </Button>
        ) : null}
      </div>
    </div>
  );
}
