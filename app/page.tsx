'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CompanyChips } from '@/components/CompanyChips';
import { StrategyBanner } from '@/components/StrategyBanner';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { PersonCard } from '@/components/PersonCard';
import { BulkTable } from '@/components/BulkTable';
import { useStoredKey } from '@/lib/useStoredKey';
import { peopleToCsv } from '@/lib/csv';
import { DEFAULT_VERTICAL, VERTICALS, getVertical, type VerticalId } from '@/lib/verticals';
import {
  DEFAULT_TARGETS,
  MAX_TARGETS,
  MIN_TARGETS,
  SINGLE_SHOT_MAX,
  type Goal,
  type OutreachResponse,
} from '@/lib/types';

const GOALS: { value: Goal; label: string }[] = [
  { value: 'referral', label: 'Referral for an internship' },
  { value: 'advice', label: 'Insider career advice' },
  { value: 'both', label: 'Both referral and advice' },
  { value: 'coffee', label: 'Coffee chat / informational' },
];

const TERMS = ['Fall 2026', 'Winter 2027', 'Summer 2027'];

const VERTICAL_IDS = Object.keys(VERTICALS) as VerticalId[];

/** True when `text` is still one of the verticals' untouched default blurbs. */
function isPristineBackground(text: string): boolean {
  return VERTICAL_IDS.some((id) => VERTICALS[id].defaultBackground === text);
}

export default function Page() {
  const [vertical, setVertical] = useState<VerticalId>(DEFAULT_VERTICAL);
  const v = getVertical(vertical);

  const [background, setBackground] = useState(v.defaultBackground);
  const [roleType, setRoleType] = useState(v.roleTypes[0]);
  const [goal, setGoal] = useState<Goal>('both');
  const [term, setTerm] = useState(TERMS[0]);
  const [companies, setCompanies] = useState<string[]>(v.defaultCompanies);
  const [count, setCount] = useState<number>(DEFAULT_TARGETS);
  const [rankWithAi, setRankWithAi] = useState(false);

  const bulkMode = count > SINGLE_SHOT_MAX;

  function switchVertical(id: VerticalId) {
    if (id === vertical) return;
    const next = getVertical(id);
    setVertical(id);
    setCompanies(next.defaultCompanies);
    setRoleType(next.roleTypes[0]);
    // Only overwrite the background if the user has not typed their own.
    setBackground((prev) => (isPristineBackground(prev) ? next.defaultBackground : prev));
  }

  const [openrouterKey, setOpenrouterKey, clearOpenrouterKey] = useStoredKey(
    'coldreach:openrouterKey',
  );
  const [apifyToken, setApifyToken, clearApifyToken] = useStoredKey('coldreach:apifyToken');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OutreachResponse | null>(null);

  function toggleCompany(c: string) {
    setCompanies((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function run() {
    setError(null);
    setResult(null);

    if (!bulkMode && companies.length === 0) {
      setError('Pick at least one target company.');
      return;
    }
    if (background.trim().length < 20) {
      setError('Background needs at least 20 characters.');
      return;
    }
    if (bulkMode && !apifyToken) {
      setError('Bulk mode needs an Apify token (paste it below) — that is what finds real people.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          background,
          roleType,
          goal,
          term,
          companies: bulkMode ? [] : companies,
          count,
          vertical,
          ...(bulkMode ? { rankWithAi } : {}),
          ...(openrouterKey ? { openrouterKey } : {}),
          ...(apifyToken ? { apifyToken } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `Request failed with status ${res.status}`);
        return;
      }
      setResult(data as OutreachResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const displayPeople = result
    ? result.bulk
      ? result.people
      : [...result.people].sort((a, b) => b.score - a.score)
    : [];
  const bulkRanked = Boolean(result?.bulk && result.people.some((p) => p.why || p.tags.length));

  function downloadCsv() {
    if (!result) return;
    const blob = new Blob([peopleToCsv(result.people)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `outreach-${vertical}-${result.people.length}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-border bg-surface/50 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-white">ColdReach Intel</h1>
            <p className="text-xs text-slate-400">
              AI-ranked LinkedIn outreach targets for student internship hunts
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <div className="flex rounded-lg border border-border bg-background p-0.5">
              {VERTICAL_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => switchVertical(id)}
                  className={[
                    'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                    id === vertical
                      ? 'bg-accent text-white'
                      : 'text-slate-400 hover:text-white',
                  ].join(' ')}
                >
                  {VERTICALS[id].label}
                </button>
              ))}
            </div>
            <Link href="/jobs" className="font-semibold text-accent-hover hover:text-white">
              Job Finder →
            </Link>
            <span className="hidden lg:inline">{v.tagline}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-96">
          <div className="sticky top-6 space-y-5 rounded-xl border border-border bg-surface p-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Your background
              </label>
              <textarea
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                rows={9}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent focus:outline-none"
                placeholder="Paste your CV summary here…"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Role type
              </label>
              <select
                value={roleType}
                onChange={(e) => setRoleType(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none"
              >
                {v.roleTypes.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Goal
                </label>
                <select
                  value={goal}
                  onChange={(e) => setGoal(e.target.value as Goal)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none"
                >
                  {GOALS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Term
                </label>
                <select
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none"
                >
                  {TERMS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Target companies
                </label>
                {!bulkMode && (
                  <span className="text-[10px] text-slate-500">{companies.length} selected</span>
                )}
              </div>
              {bulkMode ? (
                <p className="rounded-lg border border-dashed border-border bg-background/60 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
                  Bulk mode ignores the company filter — it sweeps every {v.label} company on the
                  built-in list ({v.bulkCompanies.length}) plus broad category searches.
                </p>
              ) : (
                <CompanyChips
                  options={v.companies}
                  selected={companies}
                  onToggle={toggleCompany}
                />
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  How many targets?
                </label>
                <input
                  type="number"
                  min={MIN_TARGETS}
                  max={MAX_TARGETS}
                  value={count}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (Number.isNaN(n)) return;
                    setCount(Math.max(MIN_TARGETS, Math.min(MAX_TARGETS, n)));
                  }}
                  className="w-16 rounded-md border border-border bg-background px-2 py-0.5 text-right text-xs font-semibold text-accent-hover focus:border-accent focus:outline-none"
                />
              </div>
              <input
                type="range"
                min={MIN_TARGETS}
                max={MAX_TARGETS}
                step={1}
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value, 10))}
                className="w-full accent-accent"
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                <span>{MIN_TARGETS}</span>
                <span>{SINGLE_SHOT_MAX} · curated ↑ / bulk ↓</span>
                <span>{MAX_TARGETS}</span>
              </div>
              {bulkMode && (
                <div className="mt-3 space-y-2 rounded-lg border border-accent/30 bg-accent/5 p-3">
                  <p className="text-[11px] leading-relaxed text-accent-hover">
                    Bulk list mode: real LinkedIn profiles from live search, no drafted messages.
                    Export CSV and hand it to Apollo.
                  </p>
                  <label className="flex items-center gap-2 text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={rankWithAi}
                      onChange={(e) => setRankWithAi(e.target.checked)}
                      className="accent-accent"
                    />
                    AI rank &amp; tag each profile (slower, uses OpenRouter)
                  </label>
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    OpenRouter API key
                  </label>
                  {openrouterKey && (
                    <button
                      type="button"
                      onClick={clearOpenrouterKey}
                      className="text-[10px] font-semibold text-slate-500 hover:text-red-400"
                    >
                      clear
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  autoComplete="off"
                  value={openrouterKey}
                  onChange={(e) => setOpenrouterKey(e.target.value.trim())}
                  placeholder="sk-or-v1-…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Apify token{' '}
                    <span className="normal-case text-slate-600">
                      {bulkMode ? '(required for bulk)' : '(optional)'}
                    </span>
                  </label>
                  {apifyToken && (
                    <button
                      type="button"
                      onClick={clearApifyToken}
                      className="text-[10px] font-semibold text-slate-500 hover:text-red-400"
                    >
                      clear
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  autoComplete="off"
                  value={apifyToken}
                  onChange={(e) => setApifyToken(e.target.value.trim())}
                  placeholder="apify_api_…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-accent focus:outline-none"
                />
              </div>
              <p className="text-[10px] leading-relaxed text-slate-600">
                Saved in this browser only (localStorage). Sent to this app&apos;s server per request
                to call OpenRouter / Apify — never logged or shared. Leave blank to use the
                server&apos;s own keys if configured.
              </p>
            </div>

            <button
              type="button"
              onClick={run}
              disabled={loading}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? bulkMode
                  ? 'Harvesting profiles…'
                  : 'Generating targets…'
                : bulkMode
                  ? `Harvest ${count} profiles`
                  : `Find ${count} outreach targets`}
            </button>

            {error && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          {!loading && !result && !error && <EmptyState />}
          {loading && (
            <div className="space-y-3">
              <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-2 text-xs text-accent-hover">
                {bulkMode
                  ? `Sweeping LinkedIn across ${v.bulkCompanies.length} ${v.label} companies via Apify${
                      rankWithAi ? ' and AI-ranking in batches' : ''
                    }… bulk runs can take a few minutes.`
                  : 'Running live LinkedIn search via Apify and ranking with GPT-4… this can take up to a minute.'}
              </div>
              <LoadingSkeleton />
            </div>
          )}
          {result && (
            <div className="space-y-5">
              <StrategyBanner
                strategy={result.strategy}
                grounded={result.grounded}
                warning={result.apifyWarning || result.rankWarning}
              />
              {result.bulk ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface/60 px-4 py-2 text-xs text-slate-400">
                    <span>
                      Showing{' '}
                      <span className="font-semibold text-slate-200">{result.people.length}</span> of{' '}
                      <span className="font-semibold text-slate-200">{result.harvested ?? '—'}</span>{' '}
                      harvested profiles
                      {bulkRanked ? ' · AI-ranked' : ' · unranked (harvest order)'}
                    </span>
                    <button
                      type="button"
                      onClick={downloadCsv}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover"
                    >
                      ↓ Download CSV
                    </button>
                  </div>
                  <BulkTable people={displayPeople} ranked={bulkRanked} />
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {displayPeople.map((person, i) => (
                      <PersonCard key={`${person.name}-${i}`} person={person} index={i} />
                    ))}
                  </div>
                  <ProTips tips={v.proTips} />
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="flex h-96 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/40 text-center">
      <div className="mb-2 text-3xl">🎯</div>
      <h2 className="mb-1 text-lg font-semibold text-white">Ready when you are</h2>
      <p className="max-w-sm text-sm text-slate-400">
        Fill in your background and run it. Up to 12 targets = curated people with ready-to-send
        messages. Set it higher for bulk mode — a big CSV of real profiles for Apollo.
      </p>
    </div>
  );
}

function ProTips({ tips }: { tips: string[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent-hover">
        Pro tips
      </h3>
      <ul className="space-y-2 text-sm text-slate-300">
        {tips.map((tip) => (
          <li key={tip} className="flex gap-2">
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
