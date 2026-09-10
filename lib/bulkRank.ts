/**
 * Optional LLM pass for the bulk harvest path. Scores + tags each harvested
 * LinkedIn profile against the student's background, in batches, so a 250-row
 * list never blows the model's output-token ceiling. Any batch that fails is
 * filled with neutral defaults — the request as a whole never fails here.
 */
import type { HarvestedProfile } from './apify';
import { getVertical } from './verticals';
import type { OutreachInput } from './types';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const BATCH = 25;

export interface RankFields {
  score: number;
  tags: string[];
  why: string;
}

export interface BulkRankResult {
  ranked: RankFields[];
  warning?: string;
}

function buildBatchPrompt(
  profiles: HarvestedProfile[],
  input: Pick<OutreachInput, 'background' | 'roleType' | 'goal' | 'vertical'>,
): string {
  const vertical = getVertical(input.vertical);
  const rows = profiles
    .map(
      (p, i) =>
        `[${i}] ${p.name} | ${p.role || '(role unknown)'} | ${p.company || '(company unknown)'} | ${p.snippet.slice(0, 160)}`,
    )
    .join('\n');

  return `You rank LinkedIn profiles as cold-outreach targets for this person:
- Background: ${input.background}
- They want to reach: ${input.roleType} contacts in the ${vertical.label} space
- Goal: ${input.goal}

Prioritize (highest first):
${vertical.promptPriorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}

For EVERY row below return one JSON entry: the row index, a score 1-10 for how
useful this contact is for the goal, 2-3 short tags, and a "why" under 14 words.
Do not skip rows. Do not invent people. Return ONLY:
{"ranked":[{"i":0,"score":7,"tags":["tag","tag"],"why":"short reason"}]}

ROWS:
${rows}

Every string value must contain ZERO apostrophes and ZERO quotation marks.`;
}

async function rankBatch(
  profiles: HarvestedProfile[],
  input: Pick<OutreachInput, 'background' | 'roleType' | 'goal' | 'vertical'>,
  opts: { apiKey: string; model: string; headers: Record<string, string> },
): Promise<RankFields[]> {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: opts.headers,
    body: JSON.stringify({
      model: opts.model,
      messages: [
        {
          role: 'system',
          content:
            'You return a single valid JSON object matching the requested schema exactly. No markdown, no commentary, no apostrophes in string values.',
        },
        { role: 'user', content: buildBatchPrompt(profiles, input) },
      ],
      temperature: 0.2,
      max_tokens: Math.min(6000, 400 + profiles.length * 80),
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
  const completion = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = completion?.choices?.[0]?.message?.content;
  if (!content) throw new Error('empty ranking content');

  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  const parsed = JSON.parse(content.slice(start, end + 1)) as {
    ranked?: { i?: number; score?: unknown; tags?: unknown; why?: unknown }[];
  };
  const rows = Array.isArray(parsed.ranked) ? parsed.ranked : [];

  const out: RankFields[] = profiles.map(() => neutral());
  for (const r of rows) {
    const i = typeof r.i === 'number' ? r.i : -1;
    if (i < 0 || i >= out.length) continue;
    out[i] = {
      score: clampScore(r.score),
      tags: Array.isArray(r.tags) ? r.tags.map(String).slice(0, 4) : [],
      why: typeof r.why === 'string' ? r.why.slice(0, 160) : '',
    };
  }
  return out;
}

export async function rankHarvestedProfiles(
  profiles: HarvestedProfile[],
  input: Pick<OutreachInput, 'background' | 'roleType' | 'goal' | 'vertical'>,
  opts: { apiKey: string; model: string; siteUrl?: string; siteName?: string },
): Promise<BulkRankResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.apiKey}`,
    'Content-Type': 'application/json',
  };
  if (opts.siteUrl) headers['HTTP-Referer'] = opts.siteUrl;
  if (opts.siteName) headers['X-Title'] = opts.siteName;

  const ranked: RankFields[] = [];
  let failures = 0;

  for (let i = 0; i < profiles.length; i += BATCH) {
    const slice = profiles.slice(i, i + BATCH);
    try {
      ranked.push(...(await rankBatch(slice, input, { ...opts, headers })));
    } catch (err) {
      failures += 1;
      console.warn('[bulkRank] batch failed, using neutral scores:', err);
      ranked.push(...slice.map(() => neutral()));
    }
  }

  return {
    ranked,
    warning: failures
      ? `AI ranking failed for ${failures} batch(es); those rows use a neutral score.`
      : undefined,
  };
}

function neutral(): RankFields {
  return { score: 5, tags: [], why: '' };
}

function clampScore(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  if (Number.isNaN(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n)));
}
