/**
 * Finds real X (Twitter) profile handles for outreach targets via the same
 * Apify Google Search Scraper used for LinkedIn grounding (see lib/apify.ts).
 *
 * No fabrication: a handle is attached only when a result is a real profile URL
 * AND the target's name matches the result. The model never produces handles.
 */

const APIFY_ACTOR = 'apify~google-search-scraper';

// Paths on x.com / twitter.com that are not user profiles.
const RESERVED_X_PATHS = new Set([
  'home',
  'search',
  'hashtag',
  'i',
  'intent',
  'share',
  'messages',
  'explore',
  'notifications',
  'settings',
  'login',
  'signup',
  'about',
  'tos',
  'privacy',
  'status',
  'compose',
  'logout',
  'help',
]);

export interface XHit {
  title: string;
  url: string;
  description: string;
}

export interface XTarget {
  name: string;
  company: string;
}

export interface XSearchOptions {
  resultsPerPerson?: number;
  timeoutMs?: number;
}

export function buildXQuery(name: string, company: string): string {
  return `"${name}" ${company} (site:x.com OR site:twitter.com)`;
}

export function buildXSearchUrl(name: string, company: string): string {
  const q = encodeURIComponent(`${name} ${company}`.trim());
  return `https://x.com/search?q=${q}&f=user`;
}

/** Extract a handle from a real X/Twitter profile URL, or null if it is not one. */
export function parseXHandle(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, '').replace(/^mobile\./, '');
  if (host !== 'x.com' && host !== 'twitter.com') return null;

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length !== 1) return null;

  const handle = segments[0].replace(/^@/, '').toLowerCase();
  if (RESERVED_X_PATHS.has(handle)) return null;
  if (!/^[a-z0-9_]{1,15}$/.test(handle)) return null;
  return handle;
}

/** True when both the first and last name tokens appear in the haystack. */
function nameMatches(name: string, haystack: string): boolean {
  const hay = haystack.toLowerCase();
  const tokens = name
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return false;
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  return hay.includes(first) && hay.includes(last);
}

/**
 * No-fabrication guard: accept the first hit that is a real profile URL AND
 * whose handle/title contains the target's name. Otherwise return null.
 */
export function matchHandleToPerson(
  target: XTarget,
  hits: XHit[],
): { handle: string; url: string } | null {
  for (const hit of hits) {
    const handle = parseXHandle(hit.url);
    if (!handle) continue;
    if (nameMatches(target.name, `${hit.title} ${handle}`)) {
      return { handle, url: `https://x.com/${handle}` };
    }
  }
  return null;
}

/**
 * One batched Apify run: one query per target. Returns the organic hits grouped
 * by target index (item[i] corresponds to targets[i], same as lib/apify.ts).
 */
export async function searchXHandles(
  targets: XTarget[],
  opts: XSearchOptions = {},
): Promise<XHit[][]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('APIFY_API_TOKEN is not set');
  if (targets.length === 0) return [];

  const resultsPerPerson = opts.resultsPerPerson ?? 4;
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const queries = targets.map((t) => buildXQuery(t.name, t.company));

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
        resultsPerPage: resultsPerPerson,
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

  return targets.map((_, idx) => {
    const item = items[idx];
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const organic = Array.isArray(record.organicResults) ? record.organicResults : [];
    const hits: XHit[] = [];
    for (const raw of organic) {
      if (!raw || typeof raw !== 'object') continue;
      const h = raw as Record<string, unknown>;
      const u = typeof h.url === 'string' ? h.url : '';
      const title = typeof h.title === 'string' ? h.title : '';
      const description = typeof h.description === 'string' ? h.description : '';
      if (u) hits.push({ title, url: u, description });
    }
    return hits;
  });
}
