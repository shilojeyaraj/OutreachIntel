/**
 * Thin client for Apify's Google Search Scraper actor.
 * https://apify.com/apify/google-search-scraper
 *
 * We use it to ground the LLM in real LinkedIn profiles instead of letting
 * the model hallucinate names. One query per target company surfaces a mix
 * of alumni, recruiters, and engineers.
 */

const APIFY_ACTOR = 'apify~google-search-scraper';

export interface SearchHit {
  title: string;
  url: string;
  description: string;
  /** Label for the hit: the target org, or the persona when no orgs were given. */
  company: string;
}

export interface SearchOptions {
  /** Free text describing who to find. */
  persona: string;
  /** Requester background — used only to nudge queries, never required. */
  background: string;
  /** Organizations to focus on. Empty means run a single persona-wide query. */
  companies: string[];
  /** Optional geographic focus appended to every query. */
  region?: string;
  /** Preset-supplied keyword group OR-ed into every query. */
  searchHints?: string;
  resultsPerCompany?: number;
  timeoutMs?: number;
}

/** Collapse persona free text into a bare keyword group safe for a search query. */
function personaKeywords(persona: string): string {
  const cleaned = persona.replace(/["()]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : 'professional';
}

function coreTerms(opts: SearchOptions): string {
  return opts.searchHints?.trim() || personaKeywords(opts.persona);
}

function regionSuffix(opts: SearchOptions): string {
  return opts.region && opts.region.trim() ? ` ${opts.region.trim()}` : '';
}

function buildOrgQuery(org: string, opts: SearchOptions): string {
  const cleanOrg = org.replace(/\s*\/\s*/g, ' OR ');
  return `site:linkedin.com/in (${cleanOrg}) (${coreTerms(opts)})${regionSuffix(opts)}`;
}

function buildPersonaQuery(opts: SearchOptions): string {
  return `site:linkedin.com/in (${coreTerms(opts)})${regionSuffix(opts)}`;
}

export async function searchLinkedInTargets(opts: SearchOptions): Promise<SearchHit[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error('APIFY_API_TOKEN is not set');
  }

  const resultsPerCompany = opts.resultsPerCompany ?? 8;
  const timeoutMs = opts.timeoutMs ?? 45_000;

  const targets = opts.companies.filter((c) => c.trim().length > 0);
  const queries =
    targets.length > 0 ? targets.map((c) => buildOrgQuery(c, opts)) : [buildPersonaQuery(opts)];
  const labels = targets.length > 0 ? targets : [opts.persona];

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
    const company = labels[idx] ?? labels[0] ?? '';
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

export function formatHitsForPrompt(hits: SearchHit[]): string {
  if (hits.length === 0) return '(no live search results — fall back to general knowledge)';
  return hits
    .map((h, i) => {
      const cleanTitle = h.title.replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
      return `[${i + 1}] Company: ${h.company}\n    Name/Role: ${cleanTitle}\n    LinkedIn: ${h.url}\n    Snippet: ${h.description.replace(/\s+/g, ' ').trim()}`;
    })
    .join('\n\n');
}
