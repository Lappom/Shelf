"use client";

import Link from "next/link";
import * as React from "react";

import { logRecommendationAnalyticsBatchAction } from "@/app/(app)/recommendations/actions";

type RecoSource = "carousel" | "page";

/**
 * Wraps book links from recommendation surfaces: adds ?reco=1 and logs a click server-side.
 */
export function RecoBookLink({
  bookId,
  href,
  className,
  children,
  source,
}: {
  bookId: string;
  href: string;
  className?: string;
  children: React.ReactNode;
  source: RecoSource;
}) {
  const hrefWithReco = href.includes("?") ? `${href}&reco=1` : `${href}?reco=1`;

  return (
    <Link
      href={hrefWithReco}
      className={className}
      onClick={() => {
        void logRecommendationAnalyticsBatchAction({
          items: [{ bookId, event: "click", source }],
        }).catch(() => undefined);
      }}
    >
      {children}
    </Link>
  );
}
