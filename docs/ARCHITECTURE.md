# Architecture

High-level overview of how ColdReach Intel turns a student profile into ranked LinkedIn outreach targets.

## System diagram

```
┌──────────────┐    POST /api/outreach    ┌────────────────────────┐
│   Browser    │ ───────────────────────▶ │  Next.js Route Handler │
│  (app/page)  │                          │  app/api/outreach      │
└──────────────┘                          └──────────┬─────────────┘
                                                     │
                                  ┌──────────────────┼──────────────────┐
                                  ▼                                     ▼
                       ┌───────────────────┐               ┌─────────────────────┐
                       │  Apify Google     │               │  OpenRouter         │
                       │  Search Scraper   │               │  (GPT-4o by default)│
                       │  apify/google-... │               │                     │
                       └─────────┬─────────┘               └──────────┬──────────┘
                                 │                                    │
                                 ▼                                    ▼
                       ┌────────────────────────────────────────────────┐
                       │ lib/parseResponse.parseModelJSON               │
                       │  - strip fences  - escape inner quotes         │
                       │  - clamp scores  - normalize linkedin_urls     │
                       └────────────────────────────────────────────────┘
                                            │
                                            ▼
                                 ┌───────────────────────┐
                                 │  Strategy + Person[]  │
                                 │  rendered in PersonCard│
                                 └───────────────────────┘
```

> Replace the ASCII above with a real diagram (Mermaid, Excalidraw) when the architecture stabilizes.

## Modules

| Path                          | Responsibility                                                           |
| ----------------------------- | ------------------------------------------------------------------------ |
| `app/page.tsx`                | Client UI — form, results grid, copy-to-clipboard.                       |
| `app/api/outreach/route.ts`   | Server route. Validates input, orchestrates Apify + OpenRouter, parses.  |
| `lib/types.ts`                | Shared type definitions (`OutreachInput`, `Person`, `OutreachResponse`). |
| `lib/prompt.ts`               | Builds the LLM prompt. Branches on whether grounding hits are present.   |
| `lib/parseResponse.ts`        | Robust multi-pass JSON parser for model output.                          |
| `lib/apify.ts`                | Thin client for the Apify Google Search Scraper actor.                   |
| `components/PersonCard.tsx`   | Single-target card with score, tags, message, copy buttons.              |
| `components/CompanyChips.tsx` | Multi-select chip group for target companies.                            |

## Data flow

1. **Form submit** in `app/page.tsx` POSTs an `OutreachInput` payload.
2. **Validation** in the route rejects malformed inputs early (status 400).
3. **Apify search** (if `APIFY_API_TOKEN` is set) runs one `site:linkedin.com/in` query per company. Failures are caught and reported as a non-fatal `apifyWarning`.
4. **Prompt assembly** in `buildPrompt` inlines a numbered grounding block when hits exist.
5. **OpenRouter call** with `response_format: { type: 'json_object' }` and a tightened system prompt.
6. **Multi-pass parser** handles the most common GPT failure modes: markdown fences, trailing commas, unescaped inner quotes, control chars.
7. **Response shape** is `{ strategy, people, grounded?, apifyWarning? }`. UI sorts `people` by score descending.

## Failure modes & mitigations

| Failure                               | Mitigation                                                              |
| ------------------------------------- | ----------------------------------------------------------------------- |
| Model returns markdown-wrapped JSON   | Parser strips ` ```json ` fences before `JSON.parse`.                   |
| Trailing comma in array               | Regex pass removes `,\s*([}\]])`.                                       |
| Unescaped quotes inside string values | Char-by-char walk re-escapes embedded `"` (`escapeInnerQuotes`).        |
| Apify hits unreachable                | Wrapped in try/catch; ungrounded prompt is sent and `apifyWarning` set. |
| `finish_reason === 'length'`          | Route returns 502 with a clear "raise max_tokens" hint.                 |

## Runtime

- **Node runtime** (`export const runtime = 'nodejs'`) for the API route — `fetch` is global, no extra deps.
- **`maxDuration = 120`** because grounded runs can take 30–60s end to end.
- **Vercel** is the target deploy target; nothing prevents self-hosting via `next start`.
