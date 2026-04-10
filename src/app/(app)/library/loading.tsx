import type { CSSProperties } from "react";

import { Card } from "@/components/ui/card";

export default function LibraryLoading() {
  return (
    <div className="space-y-6">
      <div className="library-hero-band flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div className="max-w-xl space-y-3">
          <div
            className="library-skeleton-stagger bg-muted h-9 w-48 max-w-full rounded-lg sm:h-10 sm:w-56"
            style={{ "--library-skeleton-delay": "0ms" } as CSSProperties}
          />
          <div
            className="library-skeleton-stagger bg-muted h-4 w-full max-w-md rounded-lg"
            style={{ "--library-skeleton-delay": "60ms" } as CSSProperties}
          />
        </div>
        <div
          className="library-skeleton-stagger bg-muted rounded-eleven-pill h-9 w-full sm:w-40"
          style={{ "--library-skeleton-delay": "100ms" } as CSSProperties}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <div
              className="library-skeleton-stagger bg-muted aspect-2/3 w-full"
              style={
                { "--library-skeleton-delay": `${Math.min(i, 11) * 45}ms` } as CSSProperties
              }
            />
            <div className="space-y-2 p-3">
              <div
                className="library-skeleton-stagger bg-muted h-4 w-3/4 rounded"
                style={
                  { "--library-skeleton-delay": `${Math.min(i, 11) * 45 + 20}ms` } as CSSProperties
                }
              />
              <div
                className="library-skeleton-stagger bg-muted h-3 w-3/5 rounded"
                style={
                  { "--library-skeleton-delay": `${Math.min(i, 11) * 45 + 35}ms` } as CSSProperties
                }
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
