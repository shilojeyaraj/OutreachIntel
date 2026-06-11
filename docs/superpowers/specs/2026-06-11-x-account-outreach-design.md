# X (Twitter) Account Outreach — Design

**Date:** 2026-06-11
**Status:** Approved
**Feature:** Enhance `/api/outreach` to surface real X (Twitter) accounts for each outreach target, because X DM response rates are higher than LinkedIn.

## Goal

For every person the outreach pipeline returns, attach the person's **real** X handle when one can be found, so the user can DM them. Never fabricate a handle. When no confident handle is found, give the user a one-click X search to look manually.

## Core principle: no fabrication

An LLM must never guess an X handle — a wrong handle means DMing a stranger. Handles are discovered the same way LinkedIn profiles already are: from **real search results**, attached only after a strict name-match check. The model is not asked to produce handles.

## Architecture

The existing flow is unchanged in how it finds people:

```
validate → LinkedIn Apify search → LLM picks people[] → respond
```

A **post-LLM enrichment step** is inserted — it only looks up X accounts for the people the model already selected from real LinkedIn hits:

```
... → LLM returns people[] → searchXHandles(people) → attach x_handle/x_url (or x_query fallback) → respond
                             (one batched apify/google-search-scraper run,
                              one query per person)
```

This is enrichment, not a change to discovery. Latency/cost is roughly flat across 3–12 people because all per-person queries run in a single Apify run.

## New module: `lib/xsearch.ts`

One focused module, mirroring `lib/apify.ts` conventions (same actor, same `run-sync-get-dataset-items` endpoint, same defensive parsing).

- `buildXQuery(name, company): string` → `"<name>" <company> (site:x.com OR site:twitter.com)`
- `searchXHandles(people, opts): Promise<XHit[][]>` → fires all per-person queries in **one** `apify/google-search-scraper` run; returns organic hits grouped by person index. Requires `APIFY_API_TOKEN`; own short timeout.
- `parseXHandle(url): string | null` → extracts a handle only from a real **profile** URL (`x.com/<handle>` or `twitter.com/<handle>`). Rejects reserved/non-profile paths: `search`, `status`, `hashtag`, `i`, `intent`, `home`, `share`, `messages`, `explore`, `notifications`, and any multi-segment path. Normalizes a leading `@` and lowercases.
- `matchHandleToPerson(person, hits): { handle: string; url: string } | null` → **the no-fabrication guard.** Walks the person's hits in order; accepts the first hit whose URL yields a valid profile handle **and** where the person's name tokens (first + last, case-insensitive) appear in the result title or the handle. Otherwise returns `null`.
- `buildXSearchUrl(name, company): string` → `https://x.com/search?q=<encoded "name company">&f=user` (the fallback "Find on X" people-search link).

## Data model (`lib/types.ts`, `Person`)

Add three optional fields:

- `x_handle?: string` — set only on a confident match (e.g. `jack`).
- `x_url?: string` — `https://x.com/<handle>`, set only on a confident match.
- `x_query: string` — always set; the prebuilt X people-search URL used by the fallback link.

## Route integration (`app/api/outreach/route.ts`)

After `parseModelJSON` produces `people[]` and before returning:

1. Always compute `x_query` for each person via `buildXSearchUrl`.
2. If `APIFY_API_TOKEN` is set (same gate as LinkedIn grounding), run `searchXHandles(people)`, then for each person apply `matchHandleToPerson`; on a match set `x_handle` + `x_url`.
3. Wrap the whole X pass in try/catch. Any failure (missing token already short-circuits, network error, timeout, malformed Apify response) leaves every person with just `x_query` and sets an optional `xSearchWarning` on the response. **The X pass can never fail the request** — the core outreach result is returned regardless.

`OutreachResponse` gains an optional `xSearchWarning?: string`.

## UI (`components/PersonCard.tsx`)

Next to the existing LinkedIn link, add an X link:

- Real handle found → **"Message on X @<handle>"** linking to `x_url`.
- Otherwise → **"Find on X"** linking to `x_query`.

Presentational only; styled consistently with the existing LinkedIn affordance.

## Error handling / degradation summary

| Condition                                       | Behavior                                                                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| No `APIFY_API_TOKEN`                            | X pass skipped; every person gets `x_query` fallback only. No warning needed (consistent with LinkedIn grounding being off). |
| Apify X run errors / times out / malformed      | Caught; every person gets `x_query` fallback; `xSearchWarning` set. Main response unaffected.                                |
| Hit found but not a profile URL / name mismatch | Treated as no match → `x_query` fallback for that person.                                                                    |
| Confident profile + name match                  | `x_handle` + `x_url` attached.                                                                                               |

## Testing

**Unit (`tests/unit/xsearch.test.ts`):**

- `buildXQuery` includes name, company, and the `site:x.com OR site:twitter.com` filter.
- `parseXHandle`: accepts `x.com/jack` and `twitter.com/Jack` (→ `jack`); rejects `x.com/search?...`, `x.com/jack/status/123`, `x.com/hashtag/foo`, `x.com/i/...`, bare domain.
- `matchHandleToPerson`: attaches on name-token match; rejects when the profile belongs to a different name; returns `null` on empty hits.
- `buildXSearchUrl`: encodes name + company and sets `f=user`.

**Integration (`tests/integration/outreach.api.test.ts`, extend existing):**

- Mock Apify so the LinkedIn pass and the X pass each return a controlled payload, mock the LLM, and assert: a person with a matching X hit gets `x_handle`/`x_url`; a person with no match gets only `x_query`; and an Apify X-pass error still returns 200 with `x_query` fallbacks + `xSearchWarning`.

## Out of scope

- X-native discovery (finding targets who are on X but not surfaced via LinkedIn).
- Sending DMs or any X API write/auth.
- A dedicated paid X-scraper actor — the existing Google-search actor is reused.
