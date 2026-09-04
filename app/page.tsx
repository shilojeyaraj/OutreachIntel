'use client';

import Link from 'next/link';
import { useState } from 'react';
import { StrategyBanner } from '@/components/StrategyBanner';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { PersonList } from '@/components/PersonList';
import { PRESETS, getPreset, DEFAULT_PRESET_ID } from '@/lib/presets';
import { DEFAULT_TARGETS, MAX_TARGETS, MIN_TARGETS, type OutreachResponse } from '@/lib/types';

const PRO_TIPS = [
  'Personalize every message — find one specific detail from their actual profile before sending.',
  'Best send times: Tuesday–Thursday, 8–10am or 6–8pm in their timezone.',
  'Send the connection request and note together (LinkedIn note limit: 300 chars).',
  'One follow-up after 7 days max — keep it short.',
  'People who made the same switch 1–3 years ago respond at the highest rate — they remember how they did it.',
  'Ask for advice, not a job. Referrals follow a good conversation.',
];

function splitCompanies(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function Page() {
  const [presetId, setPresetId] = useState<string>(DEFAULT_PRESET_ID);
  const initialPreset = getPreset(DEFAULT_PRESET_ID);

  const [persona, setPersona] = useState(initialPreset.defaults.persona);
  const [background, setBackground] = useState(initialPreset.defaults.background);
  const [goal, setGoal] = useState(initialPreset.defaults.goal);
  const [companiesText, setCompaniesText] = useState(initialPreset.defaults.companies.join(', '));
  const [region, setRegion] = useState(initialPreset.defaults.region);
  const [count, setCount] = useState<number>(DEFAULT_TARGETS);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OutreachResponse | null>(null);

  function applyPreset(id: string) {
    setPresetId(id);
    const preset = getPreset(id);
    setPersona(preset.defaults.persona);
    setBackground(preset.defaults.background);
    setGoal(preset.defaults.goal);
    setCompaniesText(preset.defaults.companies.join(', '));
    setRegion(preset.defaults.region);
  }

  async function run() {
    setError(null);
    setResult(null);

    if (persona.trim().length < 10) {
      setError('Describe who you are looking for (at least 10 characters).');
      return;
    }
    if (background.trim().length < 20) {
      setError('Background needs at least 20 characters.');
      return;
    }
    if (goal.trim().length === 0) {
      setError('Add a goal for the outreach.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona,
          background,
          goal,
          companies: splitCompanies(companiesText),
          region: region.trim() || undefined,
          preset: presetId,
          count,
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

  const sortedPeople = result ? [...result.people].sort((a, b) => b.score - a.score) : [];

  return (
    <main className="min-h-screen">
      <header className="border-b border-border bg-surface/50 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-white">ColdReach Intel</h1>
            <p className="text-xs text-slate-400">
              AI-ranked LinkedIn outreach targets for whoever you need to reach
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <Link href="/jobs" className="font-semibold text-accent-hover hover:text-white">
              Job Finder →
            </Link>
            <span>OpenRouter · GPT-4 · Apify Live Search</span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-96">
          <div className="sticky top-6 space-y-5 rounded-xl border border-border bg-surface p-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Preset
              </label>
              <select
                value={presetId}
                onChange={(e) => applyPreset(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none"
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-slate-500">
                Changing the preset refills the fields below — edit them freely afterward.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Looking for
              </label>
              <textarea
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent focus:outline-none"
                placeholder={getPreset(presetId).personaPlaceholder}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                About you
              </label>
              <textarea
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                rows={8}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent focus:outline-none"
                placeholder="Who you are and why you are reaching out…"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Goal
              </label>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent focus:outline-none"
                placeholder="What do you want out of the outreach?"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Focus organizations{' '}
                <span className="text-[10px] normal-case text-slate-500">
                  (optional, comma-separated)
                </span>
              </label>
              <textarea
                value={companiesText}
                onChange={(e) => setCompaniesText(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent focus:outline-none"
                placeholder="Verily, Oscar Health, League… leave blank to cast a wide net"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Region <span className="text-[10px] normal-case text-slate-500">(optional)</span>
              </label>
              <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent focus:outline-none"
                placeholder="e.g. Toronto, Canada"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  How many targets?
                </label>
                <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent-hover">
                  {count}
                </span>
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
                <span>{MIN_TARGETS} (focused)</span>
                <span>{MAX_TARGETS} (broad)</span>
              </div>
            </div>

            <button
              type="button"
              onClick={run}
              disabled={loading}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Generating targets…' : `Find ${count} outreach targets`}
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
                Running live LinkedIn search via Apify and ranking with GPT-4… this can take up to a
                minute.
              </div>
              <LoadingSkeleton />
            </div>
          )}
          {result && (
            <div className="space-y-5">
              <StrategyBanner
                strategy={result.strategy}
                grounded={result.grounded}
                warning={result.apifyWarning}
              />
              <PersonList people={sortedPeople} />
              <ProTips />
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
        Pick a preset or describe who you want to reach, add your background and goal, and we will
        rank specific people to contact on LinkedIn — each with a ready-to-send message.
      </p>
    </div>
  );
}

function ProTips() {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent-hover">
        Pro tips
      </h3>
      <ul className="space-y-2 text-sm text-slate-300">
        {PRO_TIPS.map((tip) => (
          <li key={tip} className="flex gap-2">
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
