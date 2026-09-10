'use client';

import type { Person } from '@/lib/types';

interface Props {
  people: Person[];
  ranked: boolean;
}

export function BulkTable({ people, ranked }: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wider text-slate-500">
            <th className="px-3 py-2 font-semibold">#</th>
            <th className="px-3 py-2 font-semibold">Name</th>
            <th className="px-3 py-2 font-semibold">Title</th>
            <th className="px-3 py-2 font-semibold">Company</th>
            {ranked && <th className="px-3 py-2 font-semibold">Score</th>}
            <th className="px-3 py-2 font-semibold">LinkedIn</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p, i) => (
            <tr
              key={`${p.linkedin_url ?? p.name}-${i}`}
              className="border-b border-border/60 last:border-0 hover:bg-surface/60"
            >
              <td className="px-3 py-2 text-slate-500">{i + 1}</td>
              <td className="px-3 py-2 font-medium text-white">{p.name || '—'}</td>
              <td className="max-w-[220px] truncate px-3 py-2 text-slate-300" title={p.role}>
                {p.role || '—'}
              </td>
              <td className="px-3 py-2 text-slate-300">{p.company || '—'}</td>
              {ranked && (
                <td className="px-3 py-2">
                  <span
                    className={
                      p.score >= 8
                        ? 'text-green-400'
                        : p.score >= 6
                          ? 'text-blue-400'
                          : 'text-slate-400'
                    }
                  >
                    {p.score}
                  </span>
                </td>
              )}
              <td className="px-3 py-2">
                {p.linkedin_url ? (
                  <a
                    href={p.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-hover hover:underline"
                  >
                    Open ↗
                  </a>
                ) : (
                  <span className="text-slate-600">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
