'use client';

import { useState } from 'react';
import type { ScoredJob } from '@/lib/types';

export function JobDetail({ job }: { job: ScoredJob }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(job.applyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="border-t border-border bg-background/40 px-4 py-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Fit rationale
          </h4>
          <p className="text-sm text-slate-200">{job.rationale || 'No rationale provided.'}</p>
          {job.seniorityNote && (
            <div className="mt-3">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Seniority note
              </h4>
              <p className="text-sm text-slate-300">{job.seniorityNote}</p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {job.strengths.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-green-400">
                Strengths
              </h4>
              <ul className="space-y-1 text-sm text-slate-200">
                {job.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {job.gaps.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-yellow-400">
                Gaps
              </h4>
              <ul className="space-y-1 text-sm text-slate-200">
                {job.gaps.map((g, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" />
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <a
          href={job.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover"
        >
          Apply now →
        </a>
        <button
          type="button"
          onClick={copyLink}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-surface-hover"
        >
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}
