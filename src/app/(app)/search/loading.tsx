import { Card } from "@/components/ui/card";

export default function SearchLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
      <div className="space-y-2">
        <div className="bg-muted h-8 w-48 animate-pulse rounded-lg" />
        <div className="bg-muted h-4 w-full max-w-md animate-pulse rounded-lg" />
      </div>
      <Card className="p-4">
        <div className="bg-muted mb-4 h-10 w-full animate-pulse rounded-xl" />
        <div className="grid gap-3 md:grid-cols-3">
          <div className="bg-muted h-24 animate-pulse rounded-xl" />
          <div className="bg-muted h-24 animate-pulse rounded-xl" />
          <div className="bg-muted h-24 animate-pulse rounded-xl" />
        </div>
      </Card>
      <div className="grid gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="bg-muted mb-2 h-5 w-2/3 animate-pulse rounded" />
            <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
          </Card>
        ))}
      </div>
    </div>
  );
}
