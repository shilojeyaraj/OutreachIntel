import { NextResponse } from 'next/server';
import { scrapeLinkedInJobs } from '@/lib/jobs/apify';
import { deduplicateJobs, normalizeLinkedInJobs } from '@/lib/jobs/parseJobs';
import { buildRankingPrompt, rankWithClaude } from '@/lib/jobs/claude';
import type { JobSearchInput, JobSearchResponse, PostedWithin, ScoredJob } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const BATCH = 10;
const BATCH_GAP_MS = 500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function validate(input: Partial<JobSearchInput> | null | undefined): string | null {
  if (!input || typeof input !== 'object') return 'Body must be an object';
  if (!Array.isArray(input.roles) || input.roles.length === 0) {
    return 'roles must be a non-empty array of strings';
  }
  if (!Array.isArray(input.locations) || input.locations.length === 0) {
    return 'locations must be a non-empty array of strings';
  }
  if (typeof input.cvSummary !== 'string' || input.cvSummary.trim().length < 20) {
    return 'cvSummary must be a string of at least 20 characters';
  }
  if (input.postedWithin && !['24h', '7d', '30d'].includes(input.postedWithin)) {
    return 'postedWithin must be one of: 24h, 7d, 30d';
  }
  if (
    input.minFitScore !== undefined &&
    (typeof input.minFitScore !== 'number' || input.minFitScore < 1 || input.minFitScore > 10)
  ) {
    return 'minFitScore must be a number between 1 and 10';
  }
  return null;
}

export async function POST(req: Request) {
  let body: JobSearchInput;
  try {
    body = (await req.json()) as JobSearchInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validationError = validate(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const apifyKey = body.apifyKey || process.env.APIFY_API_KEY || process.env.APIFY_API_TOKEN;
  const anthropicKey = body.anthropicKey || process.env.ANTHROPIC_API_KEY;
  if (!apifyKey) {
    return NextResponse.json(
      { error: 'Apify key is required. Provide it in the form or set APIFY_API_KEY.' },
      { status: 400 },
    );
  }
  if (!anthropicKey) {
    return NextResponse.json(
      { error: 'Anthropic key is required. Provide it in the form or set ANTHROPIC_API_KEY.' },
      { status: 400 },
    );
  }

  const postedWithin: PostedWithin = body.postedWithin || '24h';
  const minFitScore = body.minFitScore ?? 6;

  let rawJobs;
  try {
    rawJobs = await scrapeLinkedInJobs({
      queries: body.roles,
      locations: body.locations,
      apiKey: apifyKey,
      postedWithin,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown Apify error';
    const lower = msg.toLowerCase();
    if (lower.includes('401') || lower.includes('forbidden') || lower.includes('invalid token')) {
      return NextResponse.json(
        { error: 'Apify key invalid or out of credits. Get a free key at apify.com' },
        { status: 502 },
      );
    }
    if (lower.includes('timeout') || lower.includes('aborted')) {
      return NextResponse.json(
        { error: 'LinkedIn scrape timed out. Try fewer role queries or locations.' },
        { status: 504 },
      );
    }
    return NextResponse.json({ error: `Apify scrape failed: ${msg}` }, { status: 502 });
  }

  const jobs = deduplicateJobs(normalizeLinkedInJobs(rawJobs));
  if (jobs.length === 0) {
    return NextResponse.json(
      {
        error: `No jobs found in the last ${postedWithin} for these queries. Try different role titles or widen the time window.`,
      },
      { status: 404 },
    );
  }

  const ranked: ScoredJob[] = [];
  let rankingFailed = false;
  let warning: string | undefined;

  for (let i = 0; i < jobs.length; i += BATCH) {
    const batch = jobs.slice(i, i + BATCH);
    const prompt = buildRankingPrompt(batch, body.cvSummary);

    let scores;
    try {
      scores = await rankWithClaude(prompt, { apiKey: anthropicKey });
    } catch (err) {
      try {
        scores = await rankWithClaude(prompt, { apiKey: anthropicKey });
      } catch (err2) {
        const msg = err2 instanceof Error ? err2.message : 'Unknown Claude error';
        rankingFailed = true;
        warning = `Ranking failed for one or more batches (${msg.slice(0, 200)}). Showing unranked results for those jobs.`;
        batch.forEach((job) => {
          ranked.push({
            ...job,
            fitScore: 0,
            fitLabel: 'Moderate',
            rationale: 'Ranking unavailable for this job.',
            strengths: [],
            gaps: [],
            seniorityNote: '',
          });
        });
        await sleep(BATCH_GAP_MS);
        continue;
      }
    }

    scores.forEach((s, j) => {
      const job = batch[j];
      if (!job) return;
      if (s.fitScore < minFitScore) return;
      ranked.push({
        ...job,
        fitScore: s.fitScore,
        fitLabel: s.fitLabel,
        rationale: s.rationale,
        strengths: s.strengths,
        gaps: s.gaps,
        seniorityNote: s.seniorityNote,
      });
    });

    if (i + BATCH < jobs.length) await sleep(BATCH_GAP_MS);
  }

  ranked.sort((a, b) => b.fitScore - a.fitScore);

  const response: JobSearchResponse = {
    jobs: ranked,
    total: jobs.length,
    returned: ranked.length,
    ...(rankingFailed ? { rankingFailed: true } : {}),
    ...(warning ? { warning } : {}),
  };
  return NextResponse.json(response);
}
