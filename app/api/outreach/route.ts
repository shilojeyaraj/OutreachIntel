import { NextResponse } from 'next/server';
import { buildPrompt } from '@/lib/prompt';
import { parseModelJSON } from '@/lib/parseResponse';
import {
  searchLinkedInTargets,
  formatHitsForPrompt,
  harvestProfiles,
  buildHarvestQueries,
  type HarvestedProfile,
} from '@/lib/apify';
import {
  MAX_TARGETS,
  MIN_TARGETS,
  SINGLE_SHOT_MAX,
  type OutreachInput,
  type Person,
} from '@/lib/types';
import { getVertical } from '@/lib/verticals';
import { rankHarvestedProfiles } from '@/lib/bulkRank';
import { searchXHandles, matchHandleToPerson, buildXSearchUrl } from '@/lib/xsearch';

export const runtime = 'nodejs';
export const maxDuration = 300;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function POST(req: Request) {
  let body: OutreachInput;
  try {
    body = (await req.json()) as OutreachInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validationError = validateInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const apiKey = body.openrouterKey || process.env.OPENROUTER_API_KEY;
  const apifyToken = body.apifyToken || process.env.APIFY_API_TOKEN;
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o';

  // Bulk (Apollo-export) path: harvest a wide list of real profiles, no
  // per-person messages, optional batched AI ranking, returned for CSV export.
  if (body.count > SINGLE_SHOT_MAX) {
    return runBulk(body, { apiKey, apifyToken, model });
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: 'OpenRouter key is required. Paste it into the form or set OPENROUTER_API_KEY.' },
      { status: 400 },
    );
  }

  let searchResultsBlock: string | undefined;
  let apifyWarning: string | undefined;
  if (apifyToken) {
    try {
      const hits = await searchLinkedInTargets({
        background: body.background,
        companies: body.companies,
        roleType: body.roleType,
        vertical: body.vertical,
        resultsPerCompany: 8,
        timeoutMs: 60_000,
        token: apifyToken,
      });
      searchResultsBlock = formatHitsForPrompt(hits);
    } catch (err) {
      apifyWarning = err instanceof Error ? err.message : 'Unknown Apify error';
      console.warn(
        '[outreach] Apify search failed, falling back to ungrounded prompt:',
        apifyWarning,
      );
    }
  }

  const prompt = buildPrompt(body, { searchResults: searchResultsBlock });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (process.env.OPENROUTER_SITE_URL) {
    headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
  }
  if (process.env.OPENROUTER_SITE_NAME) {
    headers['X-Title'] = process.env.OPENROUTER_SITE_NAME;
  }

  let upstream: Response;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are an expert career coach. You always return a single valid JSON object that matches the requested schema exactly. Never include markdown fences, commentary, or apostrophes inside string values. When live LinkedIn search results are provided, you MUST pick real people from that list rather than inventing names.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.6,
        max_tokens: Math.min(12000, 1200 + body.count * 700),
        response_format: { type: 'json_object' },
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown network error';
    return NextResponse.json({ error: `OpenRouter request failed: ${msg}` }, { status: 502 });
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');
    return NextResponse.json(
      { error: `OpenRouter returned ${upstream.status}: ${errText.slice(0, 500)}` },
      { status: 502 },
    );
  }

  let completion: any;
  try {
    completion = await upstream.json();
  } catch {
    return NextResponse.json(
      { error: 'OpenRouter returned invalid JSON envelope' },
      { status: 502 },
    );
  }

  const content: string | undefined = completion?.choices?.[0]?.message?.content;
  const finishReason: string | undefined = completion?.choices?.[0]?.finish_reason;
  if (!content || typeof content !== 'string') {
    return NextResponse.json(
      { error: 'OpenRouter response did not contain a message content string' },
      { status: 502 },
    );
  }
  if (finishReason === 'length') {
    return NextResponse.json(
      {
        error:
          'Model output was truncated by max_tokens. Try a smaller target count, or raise max_tokens in app/api/outreach/route.ts.',
      },
      { status: 502 },
    );
  }

  try {
    const parsed = parseModelJSON(content);

    // Every target gets a fallback X people-search link.
    for (const person of parsed.people) {
      person.x_query = buildXSearchUrl(person.name, person.company);
    }

    // Enrich with real handles when Apify is available (same gate as LinkedIn
    // grounding). This pass can never fail the request — on any error every
    // target simply keeps its x_query fallback.
    let xSearchWarning: string | undefined;
    if (apifyToken) {
      try {
        const xHits = await searchXHandles(
          parsed.people.map((p: { name: string; company: string }) => ({
            name: p.name,
            company: p.company,
          })),
          { timeoutMs: 30_000, token: apifyToken },
        );
        parsed.people.forEach(
          (
            person: { name: string; company: string; x_handle?: string; x_url?: string },
            i: number,
          ) => {
            const match = matchHandleToPerson(person, xHits[i] ?? []);
            if (match) {
              person.x_handle = match.handle;
              person.x_url = match.url;
            }
          },
        );
      } catch (xErr) {
        xSearchWarning = xErr instanceof Error ? xErr.message : 'X account search failed';
        console.warn(
          '[outreach] X account search failed, returning fallback links:',
          xSearchWarning,
        );
      }
    }

    const responseBody: Record<string, unknown> = { ...parsed };
    if (searchResultsBlock) responseBody.grounded = true;
    if (apifyWarning) responseBody.apifyWarning = apifyWarning;
    if (xSearchWarning) responseBody.xSearchWarning = xSearchWarning;
    return NextResponse.json(responseBody);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown parse error';
    return NextResponse.json(
      { error: `Failed to parse model output as JSON: ${msg}`, raw: content.slice(0, 1000) },
      { status: 502 },
    );
  }
}

async function runBulk(
  body: OutreachInput,
  keys: { apiKey?: string; apifyToken?: string; model: string },
): Promise<Response> {
  if (!keys.apifyToken) {
    return NextResponse.json(
      {
        error:
          'Bulk mode needs an Apify token — that is what finds real profiles. Paste one into the form or set APIFY_API_TOKEN.',
      },
      { status: 400 },
    );
  }
  if (body.rankWithAi && !keys.apiKey) {
    return NextResponse.json(
      { error: 'AI ranking is on but no OpenRouter key was provided. Add one or turn ranking off.' },
      { status: 400 },
    );
  }

  const vertical = getVertical(body.vertical);
  // Scale the company fan-out to the requested size so a 30-row ask does not
  // fire 90+ Apify queries.
  const companyCount =
    body.count <= 60
      ? 30
      : body.count <= 150
        ? 55
        : vertical.bulkCompanies.length;
  const queries = buildHarvestQueries(
    vertical.bulkCompanies.slice(0, companyCount),
    vertical.bulkCategoryTerms,
    vertical.searchRoleHint,
  );

  let harvested: HarvestedProfile[];
  try {
    harvested = await harvestProfiles({
      queries,
      token: keys.apifyToken,
      resultsPerPage: 20,
      maxPagesPerQuery: body.count > 120 ? 2 : 1,
      timeoutMsPerBatch: 90_000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown Apify error';
    const lower = msg.toLowerCase();
    if (lower.includes('401') || lower.includes('forbidden') || lower.includes('invalid token')) {
      return NextResponse.json({ error: 'Apify token invalid or out of credits.' }, { status: 502 });
    }
    return NextResponse.json({ error: `Apify harvest failed: ${msg}` }, { status: 502 });
  }

  if (harvested.length === 0) {
    return NextResponse.json(
      { error: 'Live search returned no usable LinkedIn profiles. Try again in a minute.' },
      { status: 404 },
    );
  }

  let people: Person[] = harvested.map((h) => ({
    name: h.name,
    company: h.company,
    role: h.role,
    why: '',
    score: 5,
    tags: [],
    linkedin_query: `${h.name} ${h.company}`.trim(),
    linkedin_url: h.linkedin_url,
    snippet: h.snippet,
  }));

  let rankWarning: string | undefined;
  if (body.rankWithAi && keys.apiKey) {
    const { ranked, warning } = await rankHarvestedProfiles(harvested, body, {
      apiKey: keys.apiKey,
      model: keys.model,
      siteUrl: process.env.OPENROUTER_SITE_URL,
      siteName: process.env.OPENROUTER_SITE_NAME,
    });
    rankWarning = warning;
    people = people.map((p, i) => ({
      ...p,
      score: ranked[i]?.score ?? 5,
      tags: ranked[i]?.tags ?? [],
      why: ranked[i]?.why ?? '',
    }));
    people.sort((a, b) => b.score - a.score);
  }

  const trimmed = people.slice(0, body.count);
  const strategy = body.rankWithAi
    ? `Harvested ${harvested.length} real LinkedIn profiles across ${vertical.label} companies, AI-ranked, top ${trimmed.length} shown. Export as CSV for Apollo.`
    : `Harvested ${harvested.length} real LinkedIn profiles across ${vertical.label} companies, first ${trimmed.length} shown (unranked). Export as CSV for Apollo.`;

  return NextResponse.json({
    strategy,
    people: trimmed,
    grounded: true,
    bulk: true,
    harvested: harvested.length,
    ...(rankWarning ? { rankWarning } : {}),
  });
}

function validateInput(input: Partial<OutreachInput> | null | undefined): string | null {
  if (!input || typeof input !== 'object') return 'Body must be an object';
  if (typeof input.background !== 'string' || input.background.trim().length < 20) {
    return 'background must be a string of at least 20 characters';
  }
  if (typeof input.roleType !== 'string' || !input.roleType.trim()) {
    return 'roleType is required';
  }
  if (!['referral', 'advice', 'both', 'coffee'].includes(input.goal as string)) {
    return 'goal must be one of: referral, advice, both, coffee';
  }
  if (typeof input.term !== 'string' || !input.term.trim()) {
    return 'term is required';
  }
  const count = Number(input.count);
  // Bulk mode ignores the company filter, so an empty list is fine there.
  if (
    count <= SINGLE_SHOT_MAX &&
    (!Array.isArray(input.companies) || input.companies.length === 0)
  ) {
    return 'companies must be a non-empty array';
  }
  if (!Number.isInteger(count) || count < MIN_TARGETS || count > MAX_TARGETS) {
    return `count must be an integer between ${MIN_TARGETS} and ${MAX_TARGETS}`;
  }
  if (input.vertical !== undefined && !['ai-ml', 'health-tech'].includes(input.vertical)) {
    return 'vertical must be one of: ai-ml, health-tech';
  }
  if (input.rankWithAi !== undefined && typeof input.rankWithAi !== 'boolean') {
    return 'rankWithAi must be a boolean';
  }
  return null;
}
