'use client';

import { useState } from 'react';
import type { Person } from '@/lib/types';

interface Props {
  person: Person;
}

function getTagColor(tag: string): string {
  const lower = tag.toLowerCase();
  if (lower.includes('alum') || lower.includes('waterloo') || lower.includes('canad')) {
    return 'bg-green-500/15 text-green-300 border-green-500/30';
  }
  if (lower.includes('recruit') || lower.includes('active') || lower.includes('hiring')) {
    return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
  }
  if (
    lower.includes('intern') ||
    lower.includes('new grad') ||
    lower.includes('switcher') ||
    lower.includes('founder')
  ) {
    return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
  }
  return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
}

/** The expanded body of a PersonList row: tags, why, hook, links, and message. */
export function PersonDetails({ person }: Props) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  async function copy(text: string, field: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // ignore clipboard failures
    }
  }

  const hasDirectUrl = Boolean(person.linkedin_url);
  const linkedinSearchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(person.linkedin_query)}`;
  const primaryUrl = hasDirectUrl ? person.linkedin_url! : linkedinSearchUrl;

  return (
    <div className="flex flex-col gap-4 border-t border-border px-5 py-4">
      {person.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {person.tags.map((tag) => (
            <span
              key={tag}
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getTagColor(tag)}`}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Why
        </div>
        <p className="text-sm leading-relaxed text-slate-300">{person.why}</p>
      </div>

      <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-accent-hover">
          Hook
        </div>
        <p className="text-sm leading-relaxed text-slate-200">{person.hook}</p>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {hasDirectUrl ? 'LinkedIn profile' : 'LinkedIn search'}
            {hasDirectUrl && (
              <span className="rounded-full border border-green-500/40 bg-green-500/10 px-1.5 py-0.5 text-[8px] tracking-normal text-green-300">
                verified
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a
              href={primaryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-medium text-accent-hover hover:underline"
            >
              Open profile ↗
            </a>
            <button
              type="button"
              onClick={() => copy(primaryUrl, 'url')}
              className="text-[10px] font-medium text-slate-400 hover:text-white"
            >
              {copiedField === 'url' ? '✓ Copied' : 'Copy URL'}
            </button>
          </div>
        </div>
        <code className="block break-all rounded bg-background px-2 py-1.5 font-mono text-[11px] text-slate-300">
          {primaryUrl}
        </code>
        {hasDirectUrl && person.linkedin_query && (
          <div className="mt-1 text-[10px] text-slate-500">
            Backup search: <code className="font-mono text-slate-400">{person.linkedin_query}</code>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-[10px]">
        <span className="font-semibold uppercase tracking-wider text-slate-500">X / Twitter</span>
        {person.x_url ? (
          <a
            href={person.x_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent-hover hover:underline"
          >
            Message on X @{person.x_handle} ↗
          </a>
        ) : person.x_query ? (
          <a
            href={person.x_query}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-400 hover:text-white hover:underline"
          >
            Find on X ↗
          </a>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Message
          </div>
          <button
            type="button"
            onClick={() => copy(person.message, 'message')}
            className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
              copiedField === 'message'
                ? 'border-green-500/40 bg-green-500/10 text-green-300'
                : 'border-border bg-surface-hover text-slate-300 hover:border-accent hover:text-white'
            }`}
          >
            {copiedField === 'message' ? '✓ Copied' : 'Copy message'}
          </button>
        </div>
        <p className="whitespace-pre-wrap rounded-lg border border-border bg-background px-3 py-2.5 text-sm leading-relaxed text-slate-200">
          {person.message}
        </p>
      </div>
    </div>
  );
}
