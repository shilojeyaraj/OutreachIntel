import Anthropic from '@anthropic-ai/sdk';
import type { FitLabel, Job, RankingResult } from '@/lib/types';

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const CONTROL_CHAR_RE = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');

export function buildRankingPrompt(jobs: Job[], cvSummary: string): string {
  const jobList = jobs
    .map(
      (j, i) =>
        `${i + 1}. "${j.title}" at ${j.company} (${j.location})\n   Description snippet: ${(j.description || '(no description provided)').slice(0, 600)}`,
    )
    .join('\n\n');

  return `You are an expert technical recruiter and ATS specialist. Analyze each job against this candidate CV and score the fit.

CANDIDATE CV SUMMARY:
${cvSummary}

JOBS TO ANALYZE:
${jobList}

Return ONLY a raw JSON array. No markdown. No backticks. No explanation. No trailing commas. 100% valid JSON.

Schema: [{"index":1,"fitScore":8,"fitLabel":"Strong","rationale":"2-3 sentence explanation","strengths":["strength1","strength2"],"gaps":["gap1"],"seniorityNote":"brief seniority assessment"}]

fitLabel must be exactly one of: Excellent, Strong, Moderate, Weak.

Scoring:
- 9-10 Excellent: skills align almost perfectly, right seniority, strong ATS keyword match
- 7-8  Strong:    most requirements met, minor gaps only
- 5-6  Moderate:  some relevant skills but notable gaps
- 1-4  Weak:      significant mismatch

Rules:
- Be strict. Do not inflate scores.
- Do not assume skills not explicitly in the CV.
- Seniority: candidate is a strong junior or early-mid intern. Penalize roles requiring 3 or more years of experience.
- Prefer roles in ML engineering, LLM systems, AI infra, backend or full-stack with AI focus.
- Penalize pure data science, pure research without engineering, hardware-only roles.
- If a description is missing or empty, rank on title and company alone and mention limited info in the rationale.
- CRITICAL: every string value must contain zero apostrophes and zero quotation marks. Use "do not" not the contraction. Rephrase everything.

Return the array with exactly ${jobs.length} entries, one per job, in the same order as listed above.`;
}

export function parseRankingResponse(raw: string): RankingResult[] {
  let text = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1) {
    throw new Error('No JSON array found in ranking response');
  }
  let jsonStr = text.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1');

  const attempts: Array<(s: string) => string> = [
    (s) => s,
    (s) =>
      s.replace(CONTROL_CHAR_RE, (c) => {
        if (c === '\n') return '\\n';
        if (c === '\r') return '\\r';
        if (c === '\t') return '\\t';
        return ' ';
      }),
  ];

  let lastErr: unknown;
  for (const fix of attempts) {
    try {
      const parsed = JSON.parse(fix(jsonStr));
      return validateRanking(parsed);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Unable to parse ranking JSON');
}

function validateRanking(data: unknown): RankingResult[] {
  if (!Array.isArray(data)) throw new Error('Ranking response is not an array');
  return data.map((item, i) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Ranking entry ${i} is not an object`);
    }
    const r = item as Record<string, unknown>;
    return {
      index: Number(r.index ?? i + 1),
      fitScore: clampScore(r.fitScore),
      fitLabel: normalizeLabel(r.fitLabel, clampScore(r.fitScore)),
      rationale: String(r.rationale ?? ''),
      strengths: Array.isArray(r.strengths) ? r.strengths.map(String) : [],
      gaps: Array.isArray(r.gaps) ? r.gaps.map(String) : [],
      seniorityNote: String(r.seniorityNote ?? ''),
    };
  });
}

function clampScore(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? '0'), 10);
  if (Number.isNaN(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function normalizeLabel(raw: unknown, score: number): FitLabel {
  const s = String(raw ?? '').toLowerCase();
  if (s.startsWith('exc')) return 'Excellent';
  if (s.startsWith('str')) return 'Strong';
  if (s.startsWith('mod')) return 'Moderate';
  if (s.startsWith('wea')) return 'Weak';
  if (score >= 9) return 'Excellent';
  if (score >= 7) return 'Strong';
  if (score >= 5) return 'Moderate';
  return 'Weak';
}

export interface RankOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export async function rankWithClaude(prompt: string, opts: RankOptions): Promise<RankingResult[]> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const message = await client.messages.create({
    model: opts.model || DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('Claude returned an empty message');
  return parseRankingResponse(text);
}
