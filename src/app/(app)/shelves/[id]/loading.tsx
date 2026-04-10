import { Card } from "@/components/ui/card";

export default function ShelfDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-10">
      <div className="flex flex-col gap-4 border-b border-(--eleven-border-subtle) pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className="bg-muted h-14 w-14 shrink-0 animate-pulse rounded-2xl sm:h-16 sm:w-16" />
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-muted h-9 w-48 animate-pulse rounded-lg md:h-10 md:w-64" />
              <div className="bg-muted h-6 w-20 animate-pulse rounded-full" />
            </div>
            <div className="bg-muted h-4 w-full max-w-md animate-pulse rounded-lg" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="bg-muted h-9 w-24 animate-pulse rounded-full" />
          <div className="bg-muted h-9 w-28 animate-pulse rounded-full" />
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="bg-muted/20 border-b border-(--eleven-border-subtle) px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="bg-muted h-6 w-24 animate-pulse rounded-md" />
              <div className="bg-muted h-4 w-40 animate-pulse rounded-md" />
            </div>
            <div className="bg-muted h-10 w-full max-w-xs animate-pulse rounded-xl" />
          </div>
        </div>
        <div className="border-b border-(--eleven-border-subtle) px-4 py-2.5 sm:px-6">
          <div className="bg-muted h-8 w-56 animate-pulse rounded-full" />
        </div>
        <div className="space-y-2.5 p-4 sm:p-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-muted/50 flex h-[4.5rem] animate-pulse gap-3 rounded-2xl border border-(--eleven-border-subtle) p-2 pr-3"
            >
              <div className="bg-muted h-full w-11 shrink-0 rounded-md" />
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-1">
                <div className="bg-muted h-4 max-w-sm rounded md:w-[min(100%,20rem)]" />
                <div className="bg-muted h-3 max-w-xs rounded md:w-[min(100%,14rem)]" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="bg-muted/30 h-12 animate-pulse rounded-2xl border border-(--eleven-border-subtle)" />
    </div>
  );
}
