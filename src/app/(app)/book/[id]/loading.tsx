import type { CSSProperties } from "react";

import { Card } from "@/components/ui/card";

export default function BookDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
        <Card className="shadow-eleven-card overflow-hidden">
          <div
            className="book-skeleton-stagger bg-muted aspect-2/3 w-full"
            style={{ "--book-skeleton-delay": "0ms" } as CSSProperties}
          />
          <div className="space-y-3 p-4">
            <div
              className="book-skeleton-stagger bg-muted h-4 w-24 rounded"
              style={{ "--book-skeleton-delay": "70ms" } as CSSProperties}
            />
            <div
              className="book-skeleton-stagger bg-muted h-2 w-full rounded-full"
              style={{ "--book-skeleton-delay": "120ms" } as CSSProperties}
            />
          </div>
        </Card>
        <div className="space-y-4">
          <div
            className="book-skeleton-stagger bg-muted h-9 w-3/4 rounded-lg"
            style={{ "--book-skeleton-delay": "40ms" } as CSSProperties}
          />
          <div
            className="book-skeleton-stagger bg-muted h-4 w-1/2 rounded"
            style={{ "--book-skeleton-delay": "90ms" } as CSSProperties}
          />
          <div
            className="book-skeleton-stagger bg-muted h-32 w-full rounded-xl"
            style={{ "--book-skeleton-delay": "140ms" } as CSSProperties}
          />
        </div>
      </div>
    </div>
  );
}
