export function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-20 animate-pulse rounded-xl bg-surface" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border bg-surface p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-5 w-40 animate-pulse rounded bg-surface-hover" />
                <div className="h-3 w-28 animate-pulse rounded bg-surface-hover" />
              </div>
              <div className="h-10 w-12 animate-pulse rounded-lg bg-surface-hover" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full animate-pulse rounded bg-surface-hover" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-surface-hover" />
              <div className="h-3 w-4/6 animate-pulse rounded bg-surface-hover" />
            </div>
            <div className="h-24 animate-pulse rounded bg-surface-hover" />
          </div>
        ))}
      </div>
    </div>
  );
}
