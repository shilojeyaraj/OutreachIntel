export function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-20 animate-pulse rounded-xl bg-surface" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
          >
            <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-surface-hover" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-40 animate-pulse rounded bg-surface-hover" />
              <div className="h-2.5 w-28 animate-pulse rounded bg-surface-hover" />
            </div>
            <div className="h-6 w-8 shrink-0 animate-pulse rounded-md bg-surface-hover" />
          </div>
        ))}
      </div>
    </div>
  );
}
