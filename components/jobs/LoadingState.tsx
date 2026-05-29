'use client';

import { useEffect, useState } from 'react';

const STEPS = [
  'Scraping LinkedIn for recent postings via Apify…',
  'Deduplicating jobs and normalizing fields…',
  'Ranking each posting against your CV with Claude (batched)…',
  'Sorting by fit score and preparing results…',
];

export function LoadingState() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const ids: ReturnType<typeof setTimeout>[] = [];
    ids.push(setTimeout(() => setStep(1), 8_000));
    ids.push(setTimeout(() => setStep(2), 16_000));
    ids.push(setTimeout(() => setStep(3), 60_000));
    return () => ids.forEach(clearTimeout);
  }, []);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
      {STEPS.map((s, i) => {
        const state = i < step ? 'done' : i === step ? 'active' : 'pending';
        return (
          <div key={s} className="flex items-start gap-3 text-sm">
            <span
              className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
                state === 'done'
                  ? 'bg-green-500'
                  : state === 'active'
                    ? 'animate-pulse bg-accent'
                    : 'bg-slate-700'
              }`}
            />
            <span
              className={
                state === 'pending'
                  ? 'text-slate-600'
                  : state === 'active'
                    ? 'text-slate-100'
                    : 'text-slate-400'
              }
            >
              {s}
              {state === 'active' && <span className="ml-1 animate-pulse">…</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
