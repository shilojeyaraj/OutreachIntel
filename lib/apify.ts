/**
 * Thin client for Apify's Google Search Scraper actor.
 * https://apify.com/apify/google-search-scraper
 *
 * We use it to ground the LLM in real LinkedIn profiles instead of letting
 * the model hallucinate names. One query per target company surfaces a mix
 * of alumni, recruiters, and engineers.
 */

import { getVertical } from './verticals';
import type { VerticalId } from './verticals';

const APIFY_ACTOR = 'apify~google-search-scraper';

export interface SearchHit {
  title: string;
  url: string;
  description: string;
  company: string;
}

export interface SearchOptions {
  background: string;
  companies: string[];
  roleType: string;
  vertical?: VerticalId;
  resultsPerCompany?: number;
  timeoutMs?: number;
  /** Apify token; falls back to APIFY_API_TOKEN when omitted. */
  token?: string;
}

function buildQuery(
  company: string,
  background: string,
  roleType: string,
  verticalRoleHint: string,
): string {
  const cleanCompany = company.replace(/\s*\/\s*/g, ' OR ');
  const universityMatch = background.match(/University of (\w+)/i);
  const university = universityMatch ? universityMatch[0] : 'University of Waterloo';
  const roleHint = roleType.toLowerCase().includes('research')
    ? 'research scientist OR applied scientist OR recruiter'
    : verticalRoleHint;

  return `site:linkedin.com/in (${cleanCompany}) (${university} OR alumni OR ${roleHint})`;
}

export async function searchLinkedInTargets(opts: SearchOptions): Promise<SearchHit[]> {
  const token = opts.token ?? process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error('APIFY_API_TOKEN is not set');
  }

  const resultsPerCompany = opts.resultsPerCompany ?? 8;
  const timeoutMs = opts.timeoutMs ?? 45_000;

  const verticalRoleHint = getVertical(opts.vertical).searchRoleHint;
  const queries = opts.companies.map((c) =>
    buildQuery(c, opts.background, opts.roleType, verticalRoleHint),
  );

  const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(
    token,
  )}&timeout=${Math.floor(timeoutMs / 1000)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        queries: queries.join('\n'),
        resultsPerPage: resultsPerCompany,
        maxPagesPerQuery: 1,
        countryCode: 'us',
        languageCode: 'en',
        mobileResults: false,
        saveHtml: false,
        saveHtmlToKeyValueStore: false,
        includeUnfilteredResults: false,
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Apify returned ${res.status}: ${errText.slice(0, 300)}`);
  }

  const items = (await res.json()) as unknown;
  if (!Array.isArray(items)) {
    throw new Error('Apify dataset response was not an array');
  }

  const hits: SearchHit[] = [];
  items.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const company = opts.companies[idx] ?? opts.companies[0] ?? '';
    const record = item as Record<string, unknown>;
    const organic = Array.isArray(record.organicResults) ? record.organicResults : [];
    organic.forEach((rawHit) => {
      if (!rawHit || typeof rawHit !== 'object') return;
      const hit = rawHit as Record<string, unknown>;
      const url = typeof hit.url === 'string' ? hit.url : '';
      const title = typeof hit.title === 'string' ? hit.title : '';
      const description = typeof hit.description === 'string' ? hit.description : '';
      if (!url.includes('linkedin.com/in')) return;
      hits.push({ title, url, description, company });
    });
  });

  return hits;
}

// --- Bulk harvest (Apollo-export path) -------------------------------------
//
// Instead of picking a handful of people, the bulk path scrapes as many real
// `linkedin.com/in` results as it can across a wide company list, parses a
// name/role/company out of each result title, and dedupes by profile URL.

export interface HarvestQuery {
  /** Full Google query string (already includes `site:linkedin.com/in`). */
  q: string;
  /** Company this query targets, if any — used when the title has no "at X". */
  company?: string;
}

export interface HarvestedProfile {
  name: string;
  role: string;
  company: string;
  linkedin_url: string;
  snippet: string;
}

export interface HarvestOptions {
  queries: HarvestQuery[];
  token?: string;
  resultsPerPage?: number;
  maxPagesPerQuery?: number;
  /** Queries per Apify run. */
  batchSize?: number;
  timeoutMsPerBatch?: number;
  /** How many Apify batch runs to fire at once. */
  concurrency?: number;
}

const TITLE_TAIL_RE =
  /\s*[|\-–—]\s*(LinkedIn|Professional Profile|LinkedIn.*)\s*$/i;
const NAME_OK_RE = /^[\p{L}][\p{L} .'’-]{1,60}$/u;

/** Pull a person out of a LinkedIn SERP hit, or null if the title is unusable. */
export function parseProfileFromHit(
  hit: { title: string; url: string; description: string },
  fallbackCompany = '',
): HarvestedProfile | null {
  const url = normalizeProfileUrl(hit.url);
  if (!url) return null;

  const cleaned = hit.title.replace(TITLE_TAIL_RE, '').trim();
  const parts = cleaned
    .split(/\s+[|\-–—]\s+|\s+·\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const name = parts[0].replace(/\s+/g, ' ').trim();
  if (!NAME_OK_RE.test(name) || name.split(' ').length > 5) return null;

  let role = '';
  let company = fallbackCompany;
  const rest = parts.slice(1);

  if (rest.length >= 2) {
    // "Name - Role - Company"  ->  role is everything between, company is last.
    role = rest.slice(0, -1).join(' - ').trim();
    company = rest[rest.length - 1].trim() || fallbackCompany;
  } else if (rest.length === 1) {
    const atMatch = rest[0].split(/\s+\bat\b\s+/i);
    if (atMatch.length >= 2) {
      role = atMatch[0].trim();
      company = atMatch.slice(1).join(' at ').trim() || fallbackCompany;
    } else {
      role = rest[0].trim();
    }
  }

  return {
    name,
    role: role.slice(0, 120),
    company: company.slice(0, 80),
    linkedin_url: url,
    snippet: hit.description.replace(/\s+/g, ' ').trim().slice(0, 240),
  };
}

function normalizeProfileUrl(raw: string): string | null {
  if (typeof raw !== 'string' || !raw.includes('linkedin.com/in/')) return null;
  try {
    const u = new URL(raw);
    const seg = u.pathname.split('/').filter(Boolean); // ['in', '<slug>', ...]
    if (seg.length < 2 || seg[0] !== 'in' || !seg[1]) return null;
    return `https://www.linkedin.com/in/${seg[1].toLowerCase()}`;
  } catch {
    return null;
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function harvestProfiles(opts: HarvestOptions): Promise<HarvestedProfile[]> {
  const tokenOrUndefined = opts.token ?? process.env.APIFY_API_TOKEN;
  if (!tokenOrUndefined) throw new Error('APIFY_API_TOKEN is not set');
  const token: string = tokenOrUndefined;
  if (opts.queries.length === 0) return [];

  const resultsPerPage = opts.resultsPerPage ?? 20;
  const maxPagesPerQuery = opts.maxPagesPerQuery ?? 1;
  const batchSize = opts.batchSize ?? 20;
  const timeoutMs = opts.timeoutMsPerBatch ?? 90_000;
  const concurrency = opts.concurrency ?? 4;

  const byUrl = new Map<string, HarvestedProfile>();
  const batches = chunk(opts.queries, batchSize);
  const errors: string[] = [];

  async function runBatch(batch: HarvestQuery[]): Promise<void> {
    const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(
      token,
    )}&timeout=${Math.floor(timeoutMs / 1000)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            queries: batch.map((b) => b.q).join('\n'),
            resultsPerPage,
            maxPagesPerQuery,
            countryCode: 'us',
            languageCode: 'en',
            mobileResults: false,
            saveHtml: false,
            saveHtmlToKeyValueStore: false,
            includeUnfilteredResults: false,
          }),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown network error';
        throw new Error(`batch of ${batch.length} queries timed out or failed: ${msg}`);
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Apify returned ${res.status}: ${errText.slice(0, 300)}`);
      }

      const items = (await res.json()) as unknown;
      if (!Array.isArray(items)) return;

      items.forEach((item, idx) => {
        if (!item || typeof item !== 'object') return;
        const fallbackCompany = batch[idx]?.company ?? '';
        const organic = Array.isArray((item as Record<string, unknown>).organicResults)
          ? ((item as Record<string, unknown>).organicResults as unknown[])
          : [];
        for (const raw of organic) {
          if (!raw || typeof raw !== 'object') continue;
          const h = raw as Record<string, unknown>;
          const profile = parseProfileFromHit(
            {
              title: typeof h.title === 'string' ? h.title : '',
              url: typeof h.url === 'string' ? h.url : '',
              description: typeof h.description === 'string' ? h.description : '',
            },
            fallbackCompany,
          );
          if (profile && !byUrl.has(profile.linkedin_url)) {
            byUrl.set(profile.linkedin_url, profile);
          }
        }
      });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }
  }

  // Run batches through a bounded worker pool instead of one-at-a-time, so a
  // large query set (e.g. a wide vertical at a high requested count) doesn't
  // rack up (batch count × per-batch timeout) of sequential wall-clock time
  // and blow past the route's own request timeout.
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < batches.length) {
      const i = nextIndex++;
      await runBatch(batches[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()),
  );

  // A single slow/failed batch shouldn't discard profiles every other batch
  // already found — only bail out if nothing came back at all.
  if (byUrl.size === 0 && errors.length > 0) {
    throw new Error(errors[0]);
  }

  return [...byUrl.values()];
}

/** Build the harvest query set for a vertical: one per company + category nets. */
export function buildHarvestQueries(
  companies: string[],
  categoryTerms: string[],
  roleHint: string,
): HarvestQuery[] {
  const queries: HarvestQuery[] = companies.map((c) => ({
    q: `site:linkedin.com/in "${c}" (${roleHint})`,
    company: c,
  }));
  for (const term of categoryTerms) {
    queries.push({ q: `site:linkedin.com/in "${term}"` });
  }
  return queries;
}

export function formatHitsForPrompt(hits: SearchHit[]): string {
  if (hits.length === 0) return '(no live search results — fall back to general knowledge)';
  return hits
    .map((h, i) => {
      const cleanTitle = h.title.replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
      return `[${i + 1}] Company: ${h.company}\n    Name/Role: ${cleanTitle}\n    LinkedIn: ${h.url}\n    Snippet: ${h.description.replace(/\s+/g, ' ').trim()}`;
    })
    .join('\n\n');
}
