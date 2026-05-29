'use client';

import { useState } from 'react';
import { ScoreBadge } from './ScoreBadge';
import { JobDetail } from './JobDetail';
import type { ScoredJob } from '@/lib/types';

export function JobTable({ jobs }: { jobs: ScoredJob[] }) {
  const [expanded, setExpanded] = useState<string | null>(jobs[0]?.id ?? null);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-[32px_minmax(0,3fr)_minmax(0,2fr)_minmax(0,1.5fr)_100px_80px_70px_60px] gap-2 border-b border-border bg-background/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <div>#</div>
        <div>Role</div>
        <div>Company</div>
        <div>Location</div>
        <div>Posted</div>
        <div>Source</div>
        <div>Fit</div>
        <div className="text-right">Apply</div>
      </div>
      <div>
        {jobs.map((job, i) => {
          const isOpen = expanded === job.id;
          return (
            <div key={job.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : job.id)}
                className={`grid w-full grid-cols-[32px_minmax(0,3fr)_minmax(0,2fr)_minmax(0,1.5fr)_100px_80px_70px_60px] items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                  isOpen ? 'bg-surface-hover' : 'hover:bg-surface-hover/60'
                }`}
              >
                <div className="text-xs text-slate-500">{i + 1}</div>
                <div className="min-w-0 truncate font-medium text-slate-100">{job.title}</div>
                <div className="min-w-0 truncate text-slate-300">{job.company}</div>
                <div className="min-w-0 truncate text-xs text-slate-400">{job.location}</div>
                <div className="truncate text-xs text-slate-500">{job.postedAt}</div>
                <div className="text-xs text-slate-500">{job.source}</div>
                <div>
                  <ScoreBadge score={job.fitScore} label={job.fitLabel} />
                </div>
                <div className="text-right">
                  <a
                    href={job.applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs font-semibold text-accent hover:text-accent-hover"
                  >
                    Open →
                  </a>
                </div>
              </button>
              {isOpen && <JobDetail job={job} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
