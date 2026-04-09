import { Card } from "@/components/ui/card";

export default function ShelfDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
      <div className="space-y-2">
        <div className="bg-muted h-8 w-56 animate-pulse rounded-lg" />
        <div className="bg-muted h-4 w-full max-w-lg animate-pulse rounded-lg" />
      </div>
      <Card className="p-4">
        <div className="bg-muted mb-3 h-6 w-40 animate-pulse rounded" />
        <div className="bg-muted h-20 w-full animate-pulse rounded-xl" />
      </Card>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-muted flex h-14 animate-pulse rounded-xl" />
        ))}
      </div>
    </div>
  );
}
