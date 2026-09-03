import { NextResponse } from 'next/server';
import { buildPrompt } from '@/lib/prompt';
import { parseModelJSON } from '@/lib/parseResponse';
import { searchLinkedInTargets, formatHitsForPrompt } from '@/lib/apify';
import { getPreset } from '@/lib/presets';
import { MAX_TARGETS, MIN_TARGETS, type OutreachInput } from '@/lib/types';
import { searchXHandles, matchHandleToPerson, buildXSearchUrl } from '@/lib/xsearch';

export const runtime = 'nodejs';
export const maxDuration = 120;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function POST(req: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Server is missing OPENROUTER_API_KEY. Add it to .env.local and restart.' },
      { status: 500 },
    );
  }

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

  const preset = getPreset(body.preset);
  const companies = Array.isArray(body.companies) ? body.companies : [];

  let searchResultsBlock: string | undefined;
  let apifyWarning: string | undefined;
  if (process.env.APIFY_API_TOKEN) {
    try {
      const hits = await searchLinkedInTargets({
        persona: body.persona,
        background: body.background,
        companies,
        region: body.region,
        searchHints: preset.searchHints,
        resultsPerCompany: 8,
        timeoutMs: 60_000,
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

  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o';
  const prompt = buildPrompt(body, {
    searchResults: searchResultsBlock,
    priorityHints: preset.priorityHints,
  });

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
    if (process.env.APIFY_API_TOKEN) {
      try {
        const xHits = await searchXHandles(
          parsed.people.map((p: { name: string; company: string }) => ({
            name: p.name,
            company: p.company,
          })),
          { timeoutMs: 30_000 },
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

function validateInput(input: Partial<OutreachInput> | null | undefined): string | null {
  if (!input || typeof input !== 'object') return 'Body must be an object';
  if (typeof input.persona !== 'string' || input.persona.trim().length < 10) {
    return 'persona must be a string of at least 10 characters describing who to find';
  }
  if (typeof input.background !== 'string' || input.background.trim().length < 20) {
    return 'background must be a string of at least 20 characters';
  }
  if (typeof input.goal !== 'string' || !input.goal.trim()) {
    return 'goal is required';
  }
  if (input.companies !== undefined && !Array.isArray(input.companies)) {
    return 'companies must be an array when provided';
  }
  if (Array.isArray(input.companies) && input.companies.some((c) => typeof c !== 'string')) {
    return 'companies must be an array of strings';
  }
  if (input.region !== undefined && typeof input.region !== 'string') {
    return 'region must be a string when provided';
  }
  if (input.preset !== undefined && typeof input.preset !== 'string') {
    return 'preset must be a string when provided';
  }
  const count = Number(input.count);
  if (!Number.isInteger(count) || count < MIN_TARGETS || count > MAX_TARGETS) {
    return `count must be an integer between ${MIN_TARGETS} and ${MAX_TARGETS}`;
  }
  return null;
}
