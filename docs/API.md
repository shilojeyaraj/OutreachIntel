# API reference

ColdReach Intel exposes a single HTTP endpoint. All Anthropic / OpenRouter / Apify calls are server-side. Keys come from the server environment, or from the request body when the caller supplies their own (`openrouterKey` / `apifyToken`); a body key takes precedence and is used only for that request.

## `POST /api/outreach`

Generate `count` LinkedIn outreach targets for a student.

### Request

`Content-Type: application/json`

```ts
{
  background: string;       // ≥ 20 chars; the student's CV summary
  roleType: string;         // e.g. "Machine Learning Engineer Intern"
  goal: "referral" | "advice" | "both" | "coffee";
  term: string;             // e.g. "Fall 2026"
  companies: string[];      // target companies; ignored when count > 12 (bulk mode)
  count: number;            // integer in [3, 250]
  vertical?: "ai-ml" | "health-tech";  // preset + prompt-priority set; default "ai-ml"
  rankWithAi?: boolean;     // bulk mode only: batch-score + tag every harvested row
  openrouterKey?: string;   // caller's OpenRouter key; overrides server env for this request
  apifyToken?: string;      // caller's Apify token; overrides server env for this request
}
```

#### Two modes, chosen by `count`

- **`count` ≤ 12 — curated.** LLM picks that many people, each with a drafted `message` and `hook`. Optional Apify grounding + X-handle enrichment. Needs an OpenRouter key.
- **`count` > 12 — bulk (Apollo export).** Ignores `companies`; harvests real `linkedin.com/in` results across the vertical's built-in company list + category searches, dedupes by profile URL, returns up to `count` rows with **no** `message`/`hook`. **Requires an Apify token.** OpenRouter key only needed if `rankWithAi` is true.

#### Validation rules

| Field        | Rule                                                                    |
| ------------ | --------------------------------------------------------------------- |
| `background` | string, length ≥ 20 after trim                                        |
| `roleType`   | non-empty string                                                      |
| `goal`       | one of `referral`, `advice`, `both`, `coffee`                         |
| `term`       | non-empty string                                                      |
| `companies`  | non-empty array of strings — **only when `count` ≤ 12**               |
| `count`      | integer between `MIN_TARGETS` (3) and `MAX_TARGETS` (250), inclusive  |
| `rankWithAi` | boolean, if present                                                  |

### Response — `200 OK`

```ts
{
  strategy: string;             // 2-3 sentence summary of what was returned
  people: Person[];
  grounded?: true;              // Apify search / harvest succeeded
  bulk?: true;                  // came from the bulk path (table + CSV, no messages)
  harvested?: number;           // bulk: unique profiles found before truncating to count
  apifyWarning?: string;        // curated: Apify configured but failed
  rankWarning?: string;         // bulk: one or more AI-ranking batches failed
}

interface Person {
  name: string;
  company: string;
  role: string;
  why: string;                  // "" on unranked bulk rows
  score: number;                // integer 1-10 (5 on unranked bulk rows)
  tags: string[];               // [] on unranked bulk rows
  linkedin_query: string;       // backup LinkedIn search string
  linkedin_url?: string;        // full profile URL when grounded
  hook?: string;                // curated path only
  message?: string;             // curated path only — < 120 words, personalized
  snippet?: string;             // bulk path — first line of the search result
}
```

### Error responses

| Status | Body                                                                     | When                                                               |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 400    | `{ "error": "<reason>" }`                                                | Validation failed or body was not valid JSON.                      |
| 400    | `{ "error": "OpenRouter key is required..." }`                           | No key in the request body (`openrouterKey`) or `OPENROUTER_API_KEY` env. |
| 502    | `{ "error": "OpenRouter returned ..." }`                                 | Upstream LLM returned non-2xx.                                     |
| 502    | `{ "error": "Failed to parse model output as JSON: ...", "raw": "..." }` | LLM returned unparsable content; `raw` is truncated to 1000 chars. |

### Example

```bash
curl -X POST http://localhost:3000/api/outreach \
  -H "Content-Type: application/json" \
  -d '{
    "background": "2nd year Mechatronics @ Waterloo, PyTorch and CUDA experience.",
    "roleType": "Machine Learning Engineer Intern",
    "goal": "referral",
    "term": "Fall 2026",
    "companies": ["OpenAI", "Anthropic"],
    "count": 3
  }'
```

## OpenAPI

A formal OpenAPI 3.0 spec is not yet shipped. See the follow-up prompt in this repo's setup history for the suggested scaffold (`openapi.yaml` + Swagger UI via `make docs:serve`).
