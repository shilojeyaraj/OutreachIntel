# ColdReach Intel — Agent Instructions

## Overview

This is a Next.js web app that uses an LLM (via OpenRouter) to identify the best people to cold-reach on LinkedIn for any networking goal — internship referrals, breaking into a new field (e.g. health tech product management), advice, or coffee chats.

The user picks a **preset** (or Custom), then edits freeform fields: **who they are looking for** (`persona`), **about them** (`background`), their **goal**, optional **focus organizations** and **region**, and how many targets. The app optionally grounds the search in real LinkedIn profiles via Apify, then calls the model to generate N ranked outreach targets — each with a LinkedIn search query / URL, relevance score, connection angle, and a ready-to-copy personalized message. Results render as an expandable ranked list.

### Presets — `lib/presets.ts`

Each preset pre-fills the form and supplies two hint strings the server injects:

- `priorityHints` → a `PRIORITY GUIDANCE` block in the prompt (who to rank highest)
- `searchHints` → extra keywords OR-ed into the Apify LinkedIn query

Presets: `tech-internship` (alumni / former-intern / recruiter ladder), `health-tech-pm` (product leaders, founders, recent switchers, PM recruiters), `custom` (no hints; also the fallback for an unknown id). `getPreset(id)` returns the match or `custom`.

---

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **AI:** Anthropic Claude API (`claude-sonnet-4-20250514`)
- **API route:** `/api/outreach` (POST) — proxies the Anthropic call server-side to avoid CORS and keep the API key secret

---

## Project Structure

```
coldreach-intel/
├── app/
│   ├── page.tsx                  # Main UI — preset + freeform form + results
│   ├── layout.tsx                # Root layout
│   └── api/
│       └── outreach/
│           └── route.ts          # Server route: Apify grounding + OpenRouter proxy
├── components/
│   ├── PersonList.tsx            # Expandable ranked list of targets
│   ├── PersonDetails.tsx         # Expanded row body (was PersonCard)
│   ├── StrategyBanner.tsx        # Top-level strategy callout
│   └── LoadingSkeleton.tsx       # Loading state rows
├── lib/
│   ├── types.ts                  # TypeScript interfaces
│   ├── presets.ts                # Search presets + priority/search hints
│   ├── prompt.ts                 # Model prompt builder
│   ├── apify.ts                  # Live LinkedIn search (persona/org queries)
│   ├── xsearch.ts                # X-handle discovery + fallback links
│   └── parseResponse.ts          # Robust JSON parser for model output
├── .env.local                    # ANTHROPIC_API_KEY (never commit)
├── AGENT.md                      # This file
└── README.md
```

---

## Environment Variables

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

Never expose this key client-side. All Anthropic calls must go through the `/api/outreach` server route.

---

## API Route — `/api/outreach` (POST)

### Request body

```ts
{
  persona: string;      // Who to find (>= 10 chars). Replaces old roleType.
  background: string;   // Who the requester is / why reaching out (>= 20 chars)
  goal: string;         // Free text. Replaces the old goal enum + term.
  companies?: string[]; // Optional focus orgs. [] / omitted = wide net.
  region?: string;      // Optional geographic focus
  preset?: string;      // Preset id (lib/presets.ts); drives prompt/search hints
  count: number;        // MIN_TARGETS..MAX_TARGETS
}
```

### Response body

```ts
{
  strategy: string;
  people: Person[];
  grounded?: boolean;       // true when Apify LinkedIn search ran
  apifyWarning?: string;    // Apify search failed; results are ungrounded
  xSearchWarning?: string;  // X-handle enrichment failed; x_query fallbacks only
}

interface Person {
  name: string;
  company: string;         // current employer, or own company for a founder
  role: string;
  why: string;             // Why this person is worth contacting
  hook: string;            // Concrete connection angle to the requester
  score: number;           // 1–10 relevance score
  tags: string[];          // e.g. ["Founder", "Recent Switcher", "UWaterloo Alum"]
  linkedin_query: string;  // Backup LinkedIn people-search string
  linkedin_url?: string;   // Verified profile URL when grounding found one
  message: string;         // Ready-to-send personalized message
  x_handle?: string;       // Set only on a confident name match
  x_url?: string;
  x_query?: string;        // Always set — fallback X people-search URL
}
```

### Error response

```ts
{
  error: string;
}
```

---

## Prompt — `lib/prompt.ts`

`buildPrompt(input: OutreachInput, opts?: { searchResults?: string; priorityHints?: string })`.

The prompt:

1. Instructs the model to return **only valid JSON** — no markdown, no backticks, no preamble
2. Provides the exact JSON schema inline
3. **Bans apostrophes and quotation marks inside string values** — the #1 cause of JSON parse errors. "I am" not "I'm", "do not" not "don't", etc.
4. Asks for exactly `count` people spread across DIFFERENT organizations (≤ `max(2, ceil(count/2))` per org)
5. Injects the freeform fields: `Looking for` (persona), `About the requester` (background), `Goal`, `Focus organizations` (or a "no specific organizations" note when empty), and an optional `Region focus` line
6. Adds a `PRIORITY GUIDANCE:` block **only** when `opts.priorityHints` is non-empty (supplied by the preset)
7. Adds a `LIVE LINKEDIN SEARCH RESULTS` grounding block when `opts.searchResults` is set, and switches the `linkedin_url` rule between "copy VERBATIM from results" and "use an empty string"
8. Messages must be under 120 words, specific to the requester's actual background

---

## JSON Parser — `lib/parseResponse.ts`

Claude occasionally returns slightly malformed JSON. Use a multi-pass parser:

````ts
export function parseClaudeJSON(raw: string): OutreachResponse {
  // 1. Strip markdown fences
  let text = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  // 2. Extract outermost JSON object
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');
  let jsonStr = text.slice(start, end + 1);

  // 3. Fix trailing commas (most common Claude formatting issue)
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

  // 4. First parse attempt
  try {
    return JSON.parse(jsonStr);
  } catch {
    // 5. Sanitize unescaped control characters and retry
    jsonStr = jsonStr.replace(/[\u0000-\u001F\u007F]/g, (c) => {
      if (c === '\n') return '\\n';
      if (c === '\r') return '\\r';
      if (c === '\t') return '\\t';
      return ' ';
    });
    return JSON.parse(jsonStr); // throws if still broken — let caller handle
  }
}
````

---

## UI — `app/page.tsx`

### Left sidebar (config panel)

- **Preset select** — `tech-internship` / `health-tech-pm` / `custom`. Changing it refills every field below from `preset.defaults` (a note says so).
- **Looking for textarea** (`persona`) — placeholder is `preset.personaPlaceholder`
- **About you textarea** (`background`) — pre-filled from the preset
- **Goal text input** (`goal`) — free text
- **Focus organizations textarea** (`companies`) — optional, comma/newline separated → `string[]`; blank = wide net
- **Region text input** (`region`) — optional
- **Count slider** — `MIN_TARGETS`..`MAX_TARGETS`
- **Run button** — calls `/api/outreach`, shows loading skeleton, renders results

Preset default org lists and backgrounds live in `lib/presets.ts`, not `app/page.tsx`.

### Results panel

- Strategy banner at top
- `PersonList` — an expandable ranked `<ol>`, sorted by score descending
- Pro tips bar at the bottom

---

## PersonList / PersonDetails Components

`PersonList` renders one `<li>` per person: a clickable header button showing rank, `name`,
`role · company`, and a score badge, plus a truncated `why` line while collapsed. Expanding a
row mounts `PersonDetails` for that person.

`PersonDetails` (formerly `PersonCard`) is the expanded body only — no name/score header:

| Field                             | Display                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `tags`                            | Small pill badges (color-coded: green=alum, blue=hiring/recruiter, purple=founder/switcher/intern) |
| `why`                             | Body text — why reach out                                                                          |
| `hook`                            | Highlighted callout — connection angle                                                             |
| `linkedin_url` / `linkedin_query` | Verified profile link when present, else a people-search URL; monospace, copy-able                 |
| `x_url` / `x_handle` / `x_query`  | "Message on X" when a handle matched, else "Find on X" search link                                 |
| `message`                         | Pre-formatted message block with **Copy** button                                                   |

---

## Copy Button Behavior

```ts
async function handleCopy(text: string, id: string) {
  await navigator.clipboard.writeText(text);
  // Show "✓ Copied" for 2 seconds then revert
}
```

---

## Scoring Logic (for UI color coding)

```ts
function getScoreColor(score: number): string {
  if (score >= 9) return 'text-green-600'; // Excellent
  if (score >= 7) return 'text-blue-600'; // Strong
  if (score >= 5) return 'text-yellow-600'; // Moderate
  return 'text-red-500'; // Weak
}
```

---

## Pro Tips (render at bottom of results)

Defined in `app/page.tsx` as `PRO_TIPS`. Currently: personalize every message; best send times
Tue–Thu 8–10am / 6–8pm; send the connection request + note together; one follow-up after 7 days
max; people who made the same switch 1–3 years ago respond most; ask for advice, not a job.

---

## Preset backgrounds (pre-fill)

Each preset in `lib/presets.ts` ships a `defaults.background`. The `tech-internship` and
`health-tech-pm` presets both use Shilo's profile, framed for that path. Update them there.

---

## Common Issues & Fixes

| Issue                          | Fix                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| JSON parse error at position X | Apostrophe in message field — prompt already bans them; parser strips trailing commas as fallback                                 |
| CORS error calling Anthropic   | All API calls must go through `/api/outreach` server route, never client-side                                                     |
| Empty response                 | Check `ANTHROPIC_API_KEY` is set in `.env.local` and valid                                                                        |
| Only 4-5 people returned       | Claude occasionally drops entries; add validation: if `people.length < 6`, show what was returned with a "re-run for more" prompt |
| Duplicate companies            | Prompt asks to spread across companies; if still duplicated, post-process to flag duplicates                                      |

---

## Getting Started

```bash
# 1. Clone and install
git clone https://github.com/shilojeyaraj/coldreach-intel
cd coldreach-intel
npm install

# 2. Add your API key
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > .env.local

# 3. Run dev server
npm run dev

# 4. Open http://localhost:3000
```

---

## Deployment (Vercel)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Add env var in Vercel dashboard or via CLI
vercel env add ANTHROPIC_API_KEY
```

The `/api/outreach` route runs as a Vercel serverless function — no additional config needed.
