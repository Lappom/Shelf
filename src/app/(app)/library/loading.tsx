import { Card } from "@/components/ui/card";

export default function LibraryLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="bg-muted h-8 w-40 animate-pulse rounded-lg" />
          <div className="bg-muted h-4 w-64 max-w-full animate-pulse rounded-lg" />
        </div>
        <div className="bg-muted h-10 w-full animate-pulse rounded-eleven-pill sm:w-72" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <div className="bg-muted aspect-2/3 w-full animate-pulse" />
            <div className="space-y-2 p-3">
              <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
              <div className="bg-muted h-3 w-3/5 animate-pulse rounded" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
