'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CompanyChips } from '@/components/CompanyChips';
import { StrategyBanner } from '@/components/StrategyBanner';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { PersonCard } from '@/components/PersonCard';
import {
  DEFAULT_TARGETS,
  MAX_TARGETS,
  MIN_TARGETS,
  type Goal,
  type OutreachResponse,
} from '@/lib/types';

const COMPANIES = [
  'Google / DeepMind',
  'Meta AI',
  'OpenAI',
  'Anthropic',
  'Microsoft / MSR',
  'Amazon / AWS',
  'Nvidia',
  'Apple',
  'Cohere',
  'Hugging Face',
  'Mistral AI',
  'Shopify',
  'Databricks',
  'Scale AI',
  'Waymo',
  'xAI',
] as const;

const DEFAULT_COMPANIES = ['Google / DeepMind', 'Meta AI', 'OpenAI', 'Anthropic', 'Nvidia'];

const ROLE_TYPES = [
  'Machine Learning Engineer Intern',
  'Software Engineer Intern',
  'AI Research Intern',
  'Applied Scientist Intern',
  'ML Infrastructure Intern',
];

const GOALS: { value: Goal; label: string }[] = [
  { value: 'referral', label: 'Referral for an internship' },
  { value: 'advice', label: 'Insider career advice' },
  { value: 'both', label: 'Both referral and advice' },
  { value: 'coffee', label: 'Coffee chat / informational' },
];

const TERMS = ['Fall 2026', 'Winter 2027', 'Summer 2027'];

const DEFAULT_BACKGROUND = `2nd year Mechatronics Engineering @ University of Waterloo, pursuing AI specialization.
Currently MLE intern @ Cohere Labs (PyTorch, LoRA, LLM inference optimization) and ML Engineering Intern @ biotech AI lab (LangGraph multi-agent systems, RAG, pgvector).
Previous founding engineer at FinTech startup (FastAPI, PostgreSQL, WebSockets, RAG pipeline).
Strong in Python, C++, TypeScript, PyTorch, LangChain.
Built GPU Training Autotuner with NVML/CUDA C++ bindings.
Won 2nd place at NexHacks 2026 @ CMU for a real-time Polymarket intelligence Chrome extension.`;

const PRO_TIPS = [
  'Personalize every message — find one specific detail from their actual LinkedIn before sending.',
  'Best send times: Tuesday–Thursday, 8–10am or 6–8pm in their timezone.',
  'Send connection request + note simultaneously (LinkedIn note limit: 300 chars).',
  'One follow-up after 7 days max — keep it short.',
  'UWaterloo alumni respond at ~3× the rate of cold strangers for Waterloo students.',
  'Former interns (1–3 years out) have the highest referral conversion rate — they remember how they got in.',
];

export default function Page() {
  const [background, setBackground] = useState(DEFAULT_BACKGROUND);
  const [roleType, setRoleType] = useState(ROLE_TYPES[0]);
  const [goal, setGoal] = useState<Goal>('both');
  const [term, setTerm] = useState(TERMS[0]);
  const [companies, setCompanies] = useState<string[]>(DEFAULT_COMPANIES);
  const [count, setCount] = useState<number>(DEFAULT_TARGETS);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OutreachResponse | null>(null);

  function toggleCompany(c: string) {
    setCompanies((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function run() {
    setError(null);
    setResult(null);

    if (companies.length === 0) {
      setError('Pick at least one target company.');
      return;
    }
    if (background.trim().length < 20) {
      setError('Background needs at least 20 characters.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ background, roleType, goal, term, companies, count }),
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
              AI-ranked LinkedIn outreach targets for student internship hunts
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
                {ROLE_TYPES.map((r) => (
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
                <span className="text-[10px] text-slate-500">{companies.length} selected</span>
              </div>
              <CompanyChips options={COMPANIES} selected={companies} onToggle={toggleCompany} />
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
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {sortedPeople.map((person, i) => (
                  <PersonCard key={`${person.name}-${i}`} person={person} index={i} />
                ))}
              </div>
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
        Fill in your background, pick target companies, and we will rank 6 specific people to reach
        out to on LinkedIn — each with a ready-to-send message.
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
