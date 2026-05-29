'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { JobTable } from '@/components/jobs/JobTable';
import { LoadingState } from '@/components/jobs/LoadingState';
import { TagInput } from '@/components/jobs/TagInput';
import type { JobSearchResponse, PostedWithin } from '@/lib/types';

const DEFAULT_QUERIES = [
  'Machine Learning Engineer Intern',
  'ML Engineer Intern',
  'AI Engineer Intern',
  'LLM Engineer Intern',
  'Software Engineer Intern AI',
  'Backend Engineer Intern AI',
  'ML Infrastructure Intern',
  'Applied AI Intern',
];

const DEFAULT_LOCATIONS = [
  'Canada',
  'Toronto, Ontario',
  'San Francisco, CA',
  'New York, NY',
  'Seattle, WA',
  'Remote',
];

const DEFAULT_CV = `2nd year Mechatronics Engineering @ University of Waterloo, AI specialization, expected grad April 2029.

EXPERIENCE:
- MLE Intern @ Cohere Labs (Jan 2026-present): PyTorch, LoRA, JitRL, LLM inference optimization, 4-bit quantization, RAG on LLaMA 3.1 8B, reduced hallucination false positives 40%, cut memory footprint 60%
- ML Engineering Intern @ biotech AI lab (May 2026-present): LangGraph multi-agent orchestration, 6-agent router, 3-tier hierarchical memory with Postgres + pgvector, Langfuse tracing, PubMed/ClinicalTrials retrieval
- Founding Software Engineer @ Friedmann AI FinTech (Sept-Dec 2025): Pub/Sub + WebSockets event system, LLM orchestration pipeline refactor (40% latency reduction), PostgreSQL 10x query speedup, RAG over 100k+ doc chunks, OAuth 2.0 (Zoom/Google/Microsoft)

SKILLS: Python, C/C++, TypeScript, JavaScript, SQL, Java, Bash
ML/AI: PyTorch, CUDA, NVML, torch.profiler, TensorFlow, OpenCV, LangChain, LangGraph, pgvector, OpenAI API, Vertex AI
Frameworks: FastAPI, React, Next.js, Node.js, Celery, Pandas, NumPy, ROS 2, Tailwind CSS
Infrastructure: Docker, PostgreSQL, Redis, Supabase, Git, Linux, WebSockets, MongoDB, AWS, BigQuery, Cloud Run

PROJECTS:
- Brain Battle: Next.js 15, real-time multiplayer study platform, WebSocket sync, 20 concurrent users, Stripe, pgvector
- GPU Training Autotuner: C++/pybind11, NVML, torch.profiler, FastAPI, Celery, Redis, targeting 30%+ GPU overhead reduction
- Proof (2nd place NexHacks 2026 @ CMU): Polymarket Chrome extension, real-time market intelligence, Dijkstra + BPR traffic simulation on 95k node graph`;

const POSTED_OPTIONS: { value: PostedWithin; label: string }[] = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

export default function JobsPage() {
  const [cvSummary, setCvSummary] = useState(DEFAULT_CV);
  const [roles, setRoles] = useState<string[]>(DEFAULT_QUERIES);
  const [locations, setLocations] = useState<string[]>(DEFAULT_LOCATIONS);
  const [postedWithin, setPostedWithin] = useState<PostedWithin>('24h');
  const [minFitScore, setMinFitScore] = useState(6);
  const [apifyKey, setApifyKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JobSearchResponse | null>(null);

  async function run() {
    setError(null);
    setResult(null);

    if (cvSummary.trim().length < 20) {
      setError('CV summary needs at least 20 characters.');
      return;
    }
    if (roles.length === 0) {
      setError('Add at least one role query.');
      return;
    }
    if (locations.length === 0) {
      setError('Add at least one location.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/jobs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roles,
          locations,
          cvSummary,
          postedWithin,
          minFitScore,
          ...(apifyKey ? { apifyKey } : {}),
          ...(anthropicKey ? { anthropicKey } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `Request failed with status ${res.status}`);
        return;
      }
      setResult(data as JobSearchResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const visibleJobs = useMemo(
    () => (result ? result.jobs.filter((j) => j.fitScore >= minFitScore) : []),
    [result, minFitScore],
  );

  return (
    <main className="min-h-screen">
      <header className="border-b border-border bg-surface/50 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-white">Job Finder</h1>
            <p className="text-xs text-slate-400">
              Recent LinkedIn internship postings ranked against your CV
            </p>
          </div>
          <Link href="/" className="text-xs font-semibold text-slate-400 hover:text-accent-hover">
            ← ColdReach Intel
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-96">
          <div className="sticky top-6 space-y-5 rounded-xl border border-border bg-surface p-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                CV summary
              </label>
              <textarea
                value={cvSummary}
                onChange={(e) => setCvSummary(e.target.value)}
                rows={10}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-accent focus:outline-none"
                placeholder="Paste your CV summary here…"
              />
            </div>

            <TagInput
              label="Role queries"
              values={roles}
              onChange={setRoles}
              placeholder="Add a role and press Enter"
            />

            <TagInput
              label="Locations"
              values={locations}
              onChange={setLocations}
              placeholder="Add a location and press Enter"
            />

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Posted within
              </label>
              <select
                value={postedWithin}
                onChange={(e) => setPostedWithin(e.target.value as PostedWithin)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none"
              >
                {POSTED_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Minimum fit score
                </label>
                <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent-hover">
                  {minFitScore}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={minFitScore}
                onChange={(e) => setMinFitScore(parseInt(e.target.value, 10))}
                className="w-full accent-accent"
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                <span>1 (show all)</span>
                <span>10 (only excellent)</span>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Apify API key (optional if env set)
                </label>
                <input
                  type="password"
                  value={apifyKey}
                  onChange={(e) => setApifyKey(e.target.value)}
                  placeholder="apify_api_…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Anthropic API key (optional if env set)
                </label>
                <input
                  type="password"
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-accent focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-slate-600">
                Keys stay in memory only — never stored or sent anywhere besides this app.
              </p>
            </div>

            <button
              type="button"
              onClick={run}
              disabled={loading}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Searching…' : 'Find matching jobs'}
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
          {loading && <LoadingState />}
          {result && !loading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface/60 px-4 py-2 text-xs text-slate-400">
                <span>
                  Scraped <span className="font-semibold text-slate-200">{result.total}</span> jobs
                  · <span className="font-semibold text-slate-200">{result.returned}</span> matched
                  your filter · Showing{' '}
                  <span className="font-semibold text-slate-200">{visibleJobs.length}</span>
                </span>
                {result.warning && <span className="text-yellow-400">{result.warning}</span>}
              </div>
              {visibleJobs.length === 0 ? <NoMatches /> : <JobTable jobs={visibleJobs} />}
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
      <div className="mb-2 text-3xl">🔎</div>
      <h2 className="mb-1 text-lg font-semibold text-white">Ready to search</h2>
      <p className="max-w-sm text-sm text-slate-400">
        Tweak the role queries and locations on the left, then click <em>Find matching jobs</em>.
        Apify pulls recent postings from LinkedIn and Claude ranks each one against your CV.
      </p>
    </div>
  );
}

function NoMatches() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface/40 p-6 text-sm text-slate-400">
      <p className="mb-2 font-semibold text-slate-200">No jobs cleared the minimum fit score.</p>
      <p>
        Try lowering the slider, broadening role titles, adding <em>Remote</em> as a location, or
        widening the <em>Posted within</em> window.
      </p>
    </div>
  );
}
