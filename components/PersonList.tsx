'use client';

import { useState } from 'react';
import type { Person } from '@/lib/types';
import { PersonDetails } from '@/components/PersonDetails';

interface Props {
  people: Person[];
}

function getScoreColor(score: number): string {
  if (score >= 9) return 'text-green-400 border-green-500/40 bg-green-500/10';
  if (score >= 7) return 'text-blue-400 border-blue-500/40 bg-blue-500/10';
  if (score >= 5) return 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10';
  return 'text-red-400 border-red-500/40 bg-red-500/10';
}

function PersonRow({ person, index }: { person: Person; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover"
      >
        <span className="w-5 shrink-0 text-xs font-semibold text-slate-500">{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{person.name}</span>
          <span className="block truncate text-xs text-slate-400">
            {person.role}
            {person.company ? ` · ${person.company}` : ''}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-bold ${getScoreColor(person.score)}`}
        >
          {person.score}
        </span>
        <span className="shrink-0 text-xs text-slate-500">{open ? '▲' : '▼'}</span>
      </button>

      {!open && person.why && (
        <p className="truncate px-4 pb-3 text-xs text-slate-500">{person.why}</p>
      )}

      {open && <PersonDetails person={person} />}
    </li>
  );
}

export function PersonList({ people }: Props) {
  return (
    <ol className="space-y-2">
      {people.map((person, i) => (
        <PersonRow key={`${person.name}-${i}`} person={person} index={i} />
      ))}
    </ol>
  );
}
