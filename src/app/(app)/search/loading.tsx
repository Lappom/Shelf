export default function SearchLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6 flex justify-between gap-3">
        <div className="bg-muted h-8 w-40 animate-pulse rounded-lg motion-reduce:animate-none" />
        <div className="bg-muted h-4 w-24 animate-pulse rounded motion-reduce:animate-none" />
      </div>
      <div className="bg-muted mb-4 h-10 max-w-xl animate-pulse rounded-xl motion-reduce:animate-none" />
      <div className="bg-muted/80 mb-4 h-4 w-28 animate-pulse rounded motion-reduce:animate-none" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3 rounded-xl border border-(--eleven-border-subtle) p-3">
            <div className="bg-muted h-[7.25rem] w-20 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2 py-1">
              <div className="bg-muted h-3.5 max-w-[90%] rounded" />
              <div className="bg-muted h-3 max-w-[50%] rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
