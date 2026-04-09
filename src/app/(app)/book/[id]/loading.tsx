import { Card } from "@/components/ui/card";

export default function BookDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
        <Card className="overflow-hidden">
          <div className="bg-muted aspect-2/3 w-full animate-pulse" />
          <div className="space-y-3 p-4">
            <div className="bg-muted h-4 w-24 animate-pulse rounded" />
            <div className="bg-muted h-2 w-full animate-pulse rounded-full" />
          </div>
        </Card>
        <div className="space-y-4">
          <div className="bg-muted h-9 w-3/4 animate-pulse rounded-lg" />
          <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
          <div className="bg-muted h-32 w-full animate-pulse rounded-xl" />
        </div>
      </div>
    </div>
  );
}
