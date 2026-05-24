# API reference

ColdReach Intel exposes a single HTTP endpoint. All Anthropic / OpenRouter / Apify calls are server-side so secrets stay on the server.

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
  companies: string[];      // non-empty list of target companies
  count: number;            // integer in [3, 12]
}
```

#### Validation rules

| Field        | Rule                                                                |
| ------------ | ------------------------------------------------------------------- |
| `background` | string, length ≥ 20 after trim                                      |
| `roleType`   | non-empty string                                                    |
| `goal`       | one of `referral`, `advice`, `both`, `coffee`                       |
| `term`       | non-empty string                                                    |
| `companies`  | non-empty array of strings                                          |
| `count`      | integer between `MIN_TARGETS` (3) and `MAX_TARGETS` (12), inclusive |

### Response — `200 OK`

```ts
{
  strategy: string;             // 2-3 sentence overall strategy
  people: Person[];             // length === count
  grounded?: true;              // present only when Apify search succeeded
  apifyWarning?: string;        // present when Apify was configured but failed
}

interface Person {
  name: string;
  company: string;
  role: string;
  why: string;
  hook: string;
  score: number;                // integer 1-10
  tags: string[];               // 2-3 short labels
  linkedin_query: string;       // backup LinkedIn search string
  linkedin_url?: string;        // full profile URL when grounded
  message: string;              // < 120 words, personalized
}
```

### Error responses

| Status | Body                                                                     | When                                                               |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 400    | `{ "error": "<reason>" }`                                                | Validation failed or body was not valid JSON.                      |
| 500    | `{ "error": "...OPENROUTER_API_KEY..." }`                                | Server is missing `OPENROUTER_API_KEY`.                            |
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
