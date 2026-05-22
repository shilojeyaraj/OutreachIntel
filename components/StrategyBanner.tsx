interface Props {
  strategy: string;
  grounded?: boolean;
  warning?: string;
}

export function StrategyBanner({ strategy, grounded, warning }: Props) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-accent/40 bg-gradient-to-r from-accent/15 via-accent/10 to-transparent p-5">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-hover">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            Strategy
          </div>
          {grounded && (
            <span className="rounded-full border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-green-300">
              ● Grounded · Live LinkedIn search
            </span>
          )}
          {!grounded && !warning && (
            <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-yellow-300">
              ⚠ Ungrounded · Add APIFY_API_TOKEN for real profiles
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-slate-200">{strategy}</p>
      </div>
      {warning && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-200">
          <span className="font-semibold">Apify search skipped:</span> {warning} — results below are
          from general model knowledge, not live search.
        </div>
      )}
    </div>
  );
}
