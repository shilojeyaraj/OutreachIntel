# X (Twitter) Account Outreach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich `/api/outreach` results so each target carries a real X (Twitter) handle when one can be found (never fabricated), plus a fallback X people-search link otherwise.

**Architecture:** A new `lib/xsearch.ts` module (mirroring `lib/apify.ts`) runs one batched Apify Google-Search pass — one query per person the model already picked — and attaches a handle only after a strict profile-URL + name-match check. The outreach route calls this as a post-LLM enrichment step that can never fail the request. `PersonCard` renders the handle or the fallback link.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Apify `google-search-scraper` actor (already used for LinkedIn), Jest + Testing Library.

---

## File structure

```
lib/xsearch.ts                       # buildXQuery / buildXSearchUrl / parseXHandle / matchHandleToPerson / searchXHandles
lib/types.ts                         # MODIFY: Person gains x_handle?/x_url?/x_query?; OutreachResponse gains xSearchWarning?
app/api/outreach/route.ts            # MODIFY: post-LLM enrichment step
components/PersonCard.tsx            # MODIFY: render X link (handle or fallback)
tests/unit/xsearch.test.ts           # unit tests for the pure helpers + searchXHandles (mocked fetch)
tests/integration/outreach.api.test.ts  # MODIFY: add X-enrichment cases
README.md / .env.local.example       # MODIFY: document X enrichment (no new env var)
```

Convention notes (from the existing codebase):

- `lib/xsearch.ts` mirrors `lib/apify.ts`: same `apify~google-search-scraper` actor, same `run-sync-get-dataset-items` endpoint, `AbortController` timeout, defensive `organicResults` parsing.
- Coverage is scoped to `lib/**` (see `jest.config.js`), so `lib/xsearch.ts` must be well-tested. Route handlers and components are out of the coverage scope (exercised via integration/UI), so no coverage pressure there.
- Tests that construct Web globals (`Response`, `fetch`, `URL`) run under `/** @jest-environment node */` — jsdom does not provide `Response`/`fetch`.

---

## Task 1: Data model

**Files:**

- Modify: `lib/types.ts`

- [ ] **Step 1: Add the X fields to `Person` and the warning to `OutreachResponse`**

In `lib/types.ts`, change the `Person` interface (add three optional fields after `message`) and `OutreachResponse` (add `xSearchWarning`):

```ts
export interface Person {
  name: string;
  company: string;
  role: string;
  why: string;
  hook: string;
  score: number;
  tags: string[];
  linkedin_query: string;
  linkedin_url?: string;
  message: string;
  // X (Twitter) enrichment. x_query is always populated by the route; x_handle
  // and x_url are set only when a real profile is found and the name matches.
  x_handle?: string;
  x_url?: string;
  x_query?: string;
}

export interface OutreachResponse {
  strategy: string;
  people: Person[];
  grounded?: boolean;
  apifyWarning?: string;
  xSearchWarning?: string;
}
```

Leave the rest of the file unchanged.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (the new fields are optional, so existing code still compiles).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat(outreach): add X handle fields to Person and OutreachResponse"
```

---

## Task 2: `lib/xsearch.ts` module

**Files:**

- Create: `lib/xsearch.ts`
- Test: `tests/unit/xsearch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/xsearch.test.ts` (the `@jest-environment node` docblock is required — the `searchXHandles` tests construct `Response`, which jsdom lacks):

```ts
/** @jest-environment node */
import {
  buildXQuery,
  buildXSearchUrl,
  parseXHandle,
  matchHandleToPerson,
  searchXHandles,
  type XHit,
} from '@/lib/xsearch';

describe('buildXQuery', () => {
  it('quotes the name and restricts to X/Twitter', () => {
    const q = buildXQuery('Ada Lovelace', 'OpenAI');
    expect(q).toContain('"Ada Lovelace"');
    expect(q).toContain('OpenAI');
    expect(q).toContain('site:x.com OR site:twitter.com');
  });
});

describe('buildXSearchUrl', () => {
  it('builds an encoded people-search URL', () => {
    expect(buildXSearchUrl('Ada Lovelace', 'OpenAI')).toBe(
      'https://x.com/search?q=Ada%20Lovelace%20OpenAI&f=user',
    );
  });
});

describe('parseXHandle', () => {
  it('accepts real profile URLs and lowercases the handle', () => {
    expect(parseXHandle('https://x.com/jack')).toBe('jack');
    expect(parseXHandle('https://twitter.com/Jack')).toBe('jack');
    expect(parseXHandle('https://www.x.com/AdaL')).toBe('adal');
  });

  it('rejects non-profile and reserved paths', () => {
    expect(parseXHandle('https://x.com/search?q=ada')).toBeNull();
    expect(parseXHandle('https://x.com/jack/status/123')).toBeNull();
    expect(parseXHandle('https://x.com/hashtag/ai')).toBeNull();
    expect(parseXHandle('https://x.com/i/flow/login')).toBeNull();
    expect(parseXHandle('https://x.com/')).toBeNull();
    expect(parseXHandle('https://example.com/jack')).toBeNull();
    expect(parseXHandle('not a url')).toBeNull();
  });

  it('rejects handles that are too long or contain bad characters', () => {
    expect(parseXHandle('https://x.com/this_handle_is_too_long')).toBeNull();
    expect(parseXHandle('https://x.com/bad-handle')).toBeNull();
  });
});

describe('matchHandleToPerson', () => {
  const hits = (rows: Array<[string, string]>): XHit[] =>
    rows.map(([url, title]) => ({ url, title, description: '' }));

  it('attaches when the name matches the result title', () => {
    expect(
      matchHandleToPerson(
        { name: 'Ada Lovelace', company: 'OpenAI' },
        hits([['https://x.com/adalove', 'Ada Lovelace (@adalove) / X']]),
      ),
    ).toEqual({ handle: 'adalove', url: 'https://x.com/adalove' });
  });

  it('matches via the handle when the title is unhelpful', () => {
    expect(
      matchHandleToPerson(
        { name: 'Ada Lovelace', company: 'OpenAI' },
        hits([['https://x.com/ada_lovelace', 'Home / X']]),
      )?.handle,
    ).toBe('ada_lovelace');
  });

  it('rejects a profile that belongs to a different person', () => {
    expect(
      matchHandleToPerson(
        { name: 'Ada Lovelace', company: 'OpenAI' },
        hits([['https://x.com/somebody', 'Charles Babbage (@somebody) / X']]),
      ),
    ).toBeNull();
  });

  it('skips non-profile hits and returns null when nothing matches', () => {
    expect(
      matchHandleToPerson(
        { name: 'Ada Lovelace', company: 'OpenAI' },
        hits([['https://x.com/search?q=ada', 'Search / X']]),
      ),
    ).toBeNull();
  });

  it('returns null for empty hits', () => {
    expect(matchHandleToPerson({ name: 'Ada', company: 'OpenAI' }, [])).toBeNull();
  });
});

describe('searchXHandles', () => {
  const ORIGINAL_ENV = { ...process.env };
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('throws when APIFY_API_TOKEN is not set', async () => {
    delete process.env.APIFY_API_TOKEN;
    await expect(searchXHandles([{ name: 'Ada', company: 'OpenAI' }])).rejects.toThrow(/APIFY/);
  });

  it('returns [] for no targets without calling the network', async () => {
    process.env.APIFY_API_TOKEN = 'tok';
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect(await searchXHandles([])).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('groups organic hits by target index', async () => {
    process.env.APIFY_API_TOKEN = 'tok';
    const dataset = [
      { organicResults: [{ title: 'Ada (@ada) / X', url: 'https://x.com/ada', description: 'd' }] },
      { organicResults: [] },
    ];
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(dataset), { status: 200 }),
      ) as unknown as typeof fetch;

    const out = await searchXHandles([
      { name: 'Ada', company: 'OpenAI' },
      { name: 'Bob', company: 'Stripe' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0][0].url).toBe('https://x.com/ada');
    expect(out[1]).toEqual([]);
  });

  it('throws when Apify returns a non-2xx', async () => {
    process.env.APIFY_API_TOKEN = 'tok';
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('nope', { status: 500 })) as unknown as typeof fetch;
    await expect(searchXHandles([{ name: 'Ada', company: 'OpenAI' }])).rejects.toThrow(
      /Apify returned 500/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/unit/xsearch.test.ts`
Expected: FAIL — cannot find module `@/lib/xsearch`.

- [ ] **Step 3: Implement the module**

Create `lib/xsearch.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/unit/xsearch.test.ts`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add lib/xsearch.ts tests/unit/xsearch.test.ts
git commit -m "feat(outreach): add lib/xsearch X handle discovery module"
```

---

## Task 3: Route enrichment

**Files:**

- Modify: `app/api/outreach/route.ts`
- Test: `tests/integration/outreach.api.test.ts` (extend)

- [ ] **Step 1: Write the failing integration tests**

Append these two cases to `tests/integration/outreach.api.test.ts`, inside the existing `describe('POST /api/outreach', ...)` block (after the last `it(...)`). They set `APIFY_API_TOKEN` and content-route the `fetch` mock by URL/body so the LinkedIn pass, the OpenRouter call, and the X pass each return controlled data:

```ts
// --- X account enrichment ---

const X_MODEL_PAYLOAD = {
  strategy: 'Lead with Waterloo alumni.',
  people: [
    { name: 'Ada Lovelace', company: 'OpenAI', role: 'MLE', message: 'hi' },
    { name: 'Charles Babbage', company: 'OpenAI', role: 'SWE', message: 'hi' },
  ],
};

// Routes a fetch call to the right canned response based on its URL/body.
function mockOutreachPipeline(opts: { xDataset?: unknown; xStatus?: number }) {
  global.fetch = jest.fn().mockImplementation((url: string, init?: { body?: string }) => {
    const u = String(url);
    if (u.includes('openrouter.ai')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              { finish_reason: 'stop', message: { content: JSON.stringify(X_MODEL_PAYLOAD) } },
            ],
          }),
          { status: 200 },
        ),
      );
    }
    // Apify: distinguish the LinkedIn pass from the X pass by the query body.
    const body = init?.body ? JSON.parse(init.body) : {};
    const queries = String(body.queries ?? '');
    if (queries.includes('site:x.com')) {
      return Promise.resolve(
        new Response(JSON.stringify(opts.xDataset ?? []), { status: opts.xStatus ?? 200 }),
      );
    }
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 })); // LinkedIn pass
  }) as unknown as typeof fetch;
}

it('attaches a real X handle on a name match and falls back otherwise', async () => {
  process.env.APIFY_API_TOKEN = 'apify-test-token';
  mockOutreachPipeline({
    xDataset: [
      {
        organicResults: [
          {
            title: 'Ada Lovelace (@adalovelace) / X',
            url: 'https://x.com/adalovelace',
            description: '',
          },
        ],
      },
      { organicResults: [{ title: 'Search / X', url: 'https://x.com/search?q=charles' }] },
    ],
  });

  const res = await POST(buildRequest(VALID_BODY));
  expect(res.status).toBe(200);
  const body = await res.json();

  expect(body.people[0].x_handle).toBe('adalovelace');
  expect(body.people[0].x_url).toBe('https://x.com/adalovelace');
  // No profile match for the second person — only the fallback search link.
  expect(body.people[1].x_handle).toBeUndefined();
  expect(body.people[1].x_url).toBeUndefined();
  expect(body.people[1].x_query).toContain('x.com/search');
});

it('returns 200 with x_query fallbacks and a warning when the X search fails', async () => {
  process.env.APIFY_API_TOKEN = 'apify-test-token';
  mockOutreachPipeline({ xStatus: 500 });

  const res = await POST(buildRequest(VALID_BODY));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.xSearchWarning).toBeTruthy();
  expect(body.people[0].x_handle).toBeUndefined();
  expect(body.people[0].x_query).toContain('x.com/search');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/integration/outreach.api.test.ts`
Expected: FAIL — `x_handle`/`x_query`/`xSearchWarning` are undefined (route not enriched yet).

- [ ] **Step 3: Implement the route enrichment**

In `app/api/outreach/route.ts`, add the import near the other lib imports at the top:

```ts
import { searchXHandles, matchHandleToPerson, buildXSearchUrl } from '@/lib/xsearch';
```

Then replace the existing success block (the part that currently reads):

```ts
  try {
    const parsed = parseModelJSON(content);
    const responseBody: Record<string, unknown> = { ...parsed };
    if (searchResultsBlock) responseBody.grounded = true;
    if (apifyWarning) responseBody.apifyWarning = apifyWarning;
    return NextResponse.json(responseBody);
  } catch (err) {
```

with this enriched version:

```ts
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
          parsed.people.map((p) => ({ name: p.name, company: p.company })),
          { timeoutMs: 30_000 },
        );
        parsed.people.forEach((person, i) => {
          const match = matchHandleToPerson(person, xHits[i] ?? []);
          if (match) {
            person.x_handle = match.handle;
            person.x_url = match.url;
          }
        });
      } catch (xErr) {
        xSearchWarning = xErr instanceof Error ? xErr.message : 'X account search failed';
        console.warn('[outreach] X account search failed, returning fallback links:', xSearchWarning);
      }
    }

    const responseBody: Record<string, unknown> = { ...parsed };
    if (searchResultsBlock) responseBody.grounded = true;
    if (apifyWarning) responseBody.apifyWarning = apifyWarning;
    if (xSearchWarning) responseBody.xSearchWarning = xSearchWarning;
    return NextResponse.json(responseBody);
  } catch (err) {
```

Leave the `catch (err)` body and the rest of the file unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/integration/outreach.api.test.ts`
Expected: PASS — all existing cases plus the two new ones.

- [ ] **Step 5: Commit**

```bash
git add app/api/outreach/route.ts tests/integration/outreach.api.test.ts
git commit -m "feat(outreach): enrich targets with real X handles + fallback links"
```

---

## Task 4: PersonCard UI

**Files:**

- Modify: `components/PersonCard.tsx`

`PersonCard` has no unit test in this repo (it is presentational); verify via typecheck + build in Task 5.

- [ ] **Step 1: Add the X link block**

In `components/PersonCard.tsx`, insert this block immediately AFTER the closing `</div>` of the LinkedIn section (the `<div>` that ends right before the `Message` section's `<div>`), so it sits between the LinkedIn block and the Message block:

```tsx
<div className="flex items-center gap-2 text-[10px]">
  <span className="font-semibold uppercase tracking-wider text-slate-500">X / Twitter</span>
  {person.x_url ? (
    <a
      href={person.x_url}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-accent-hover hover:underline"
    >
      Message on X @{person.x_handle} ↗
    </a>
  ) : person.x_query ? (
    <a
      href={person.x_query}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-slate-400 hover:text-white hover:underline"
    >
      Find on X ↗
    </a>
  ) : (
    <span className="text-slate-600">—</span>
  )}
</div>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/PersonCard.tsx
git commit -m "feat(outreach): show X handle or fallback search link on PersonCard"
```

---

## Task 5: Docs + full verification

**Files:**

- Modify: `README.md`
- Modify: `.env.local.example`

- [ ] **Step 1: Document the feature in README**

In `README.md`, add a bullet to the outreach "How it works" list (after the Apify/LinkedIn step) describing X enrichment. Example wording:

```markdown
- After the model picks targets, a second Apify search looks up each person's real X (Twitter) profile; a handle is attached only on a confident name match, otherwise the card shows a fallback "Find on X" search link. Requires `APIFY_API_TOKEN`.
```

- [ ] **Step 2: Note the env var usage**

In `.env.local.example`, update the `APIFY_API_TOKEN` comment to mention it also powers X account lookup. Change:

```
# Apify API token for live Google/LinkedIn search grounding.
```

to:

```
# Apify API token for live Google search grounding — LinkedIn targets and X (Twitter) handle lookup.
```

No new env var is added.

- [ ] **Step 3: Full verification**

Run: `npm run typecheck`
Expected: PASS.

Run: `npx jest --coverage --coverageReporters=text-summary`
Expected: all suites PASS and the `lib/**` global coverage thresholds (50% branches/functions/lines/statements) still met — `lib/xsearch.ts` is well covered by Task 2's tests.

Run: `npm run build`
Expected: build succeeds; `/api/outreach` still listed.

- [ ] **Step 4: Commit**

```bash
git add README.md .env.local.example
git commit -m "docs(outreach): document X account enrichment"
```

---

## Self-review notes

- **Spec coverage:** discovery via batched Apify search (Task 2 `searchXHandles`), no-fabrication guard (Task 2 `parseXHandle` + `matchHandleToPerson`), fallback X-search link (Task 2 `buildXSearchUrl` + Task 3 always sets `x_query`), data model fields (Task 1), route post-LLM enrichment + never-fail degradation + `xSearchWarning` (Task 3), UI link (Task 4), unit + integration tests (Tasks 2–3), docs (Task 5). All spec sections map to a task.
- **Type consistency:** `XTarget {name, company}` is accepted by `matchHandleToPerson` and `searchXHandles`; `Person` is structurally assignable to `XTarget`, so the route passes `person`/`{name, company}` without conversion. `x_handle`/`x_url`/`x_query` are optional on `Person` (parser does not set them; route sets `x_query` always and `x_handle`/`x_url` on match). `xSearchWarning` defined on `OutreachResponse` (Task 1) and set in the route (Task 3).
- **Coverage scope:** only `lib/xsearch.ts` is coverage-counted (route + component are outside `collectCoverageFrom`); its pure helpers and `searchXHandles` are all unit-tested, so the `lib/**` gate stays green.
- **Deferred (out of scope, per spec):** X-native target discovery, sending DMs, dedicated paid X scraper.

```

```
