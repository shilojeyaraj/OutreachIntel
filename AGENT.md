# ColdReach Intel — Agent Instructions

## Overview

This is a Next.js web app that uses the Anthropic Claude API to identify the best people for a student to cold-reach on LinkedIn for internship referrals, career advice, or coffee chats at big tech / top AI companies.

The user fills in their background, selects target companies, picks a goal and term, and the app calls Claude to generate 6 ranked outreach targets — each with a LinkedIn search query, relevance score, connection angle, and a ready-to-copy personalized message.

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
│   ├── page.tsx                  # Main UI — form + results
│   ├── layout.tsx                # Root layout
│   └── api/
│       └── outreach/
│           └── route.ts          # Server-side Anthropic API proxy
├── components/
│   ├── PersonCard.tsx            # Individual outreach target card
│   ├── CompanyChips.tsx          # Multi-select company toggle chips
│   ├── StrategyBanner.tsx        # Top-level strategy callout
│   └── LoadingSkeleton.tsx       # Loading state cards
├── lib/
│   ├── types.ts                  # TypeScript interfaces
│   ├── prompt.ts                 # Claude prompt builder
│   └── parseResponse.ts          # Robust JSON parser for Claude output
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
  background: string;       // Student's background summary
  roleType: string;         // e.g. "Machine Learning Engineer Intern"
  goal: "referral" | "advice" | "both" | "coffee";
  term: string;             // e.g. "Fall 2026" | "Winter 2027"
  companies: string[];      // e.g. ["Google / DeepMind", "Meta AI", "OpenAI"]
}
```

### Response body

```ts
{
  strategy: string;
  people: Person[];
}

interface Person {
  name: string;
  company: string;
  role: string;
  why: string;             // Why this person is worth reaching out to
  hook: string;            // Specific connection angle for this student
  score: number;           // 1–10 relevance score
  tags: string[];          // e.g. ["UWaterloo Alum", "Former Intern"]
  linkedin_query: string;  // Exact LinkedIn search string
  message: string;         // Ready-to-send personalized message
}
```

### Error response

```ts
{ error: string }
```

---

## Claude Prompt — `lib/prompt.ts`

The prompt must:

1. Instruct Claude to return **only valid JSON** — no markdown, no backticks, no preamble
2. Provide the exact JSON schema inline
3. **Explicitly ban apostrophes and quotation marks inside string values** — this is the #1 cause of JSON parse errors. Tell Claude to write "I am" not "I'm", "do not" not "don't", etc.
4. Ask for exactly 6 people spread across different companies
5. Prioritize in this order:
   - UWaterloo / Canadian alumni at the company (highest response rate)
   - Former interns who went full-time (1–4 years ago) — they remember recruiting
   - University recruiters / intern program managers
   - MLEs or SWEs on relevant teams (AI infra, LLM, agents)
6. Messages must be under 120 words, specific to the student's actual background (Cohere, LangGraph, PyTorch, NVML/CUDA, hackathon wins)

### Prompt template

```ts
export function buildPrompt(input: OutreachInput): string {
  const goalMap = {
    referral: 'get a referral to apply for an internship',
    advice: 'get insider career advice and recruiting tips',
    both: 'get both a referral and insider recruiting advice',
    coffee: 'set up an informational interview or coffee chat',
  };

  return `You are an expert career coach. Return ONLY a raw JSON object. No markdown. No backticks. No explanation. No trailing commas. The JSON must be 100% valid.

Generate 6 LinkedIn outreach targets for this student:
- Background: ${input.background}
- Target role: ${input.roleType}
- Term: ${input.term}
- Goal: ${goalMap[input.goal]}
- Companies: ${input.companies.join(', ')}

Required JSON schema:
{"strategy":"string","people":[{"name":"string","company":"string","role":"string","why":"string","hook":"string","score":9,"tags":["tag1","tag2"],"linkedin_query":"string","message":"string"}]}

Rules:
- people: exactly 6 entries across different companies from the list
- score: integer 1-10
- tags: 2-3 short labels e.g. "UWaterloo Alum", "Former Intern", "Active Recruiter"
- message: under 120 words, personalized to this student's actual experience

CRITICAL — message field must contain ZERO apostrophes and ZERO quotation marks.
Write "I am" not "I'm". Write "I have" not "I've". Write "do not" not "don't".
Any apostrophe will break JSON.parse and crash the app.`;
}
```

---

## JSON Parser — `lib/parseResponse.ts`

Claude occasionally returns slightly malformed JSON. Use a multi-pass parser:

```ts
export function parseClaudeJSON(raw: string): OutreachResponse {
  // 1. Strip markdown fences
  let text = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

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
```

---

## UI — `app/page.tsx`

### Left sidebar (config panel)

- **Background textarea** — pre-fill with Shilo's CV summary, user can edit
- **Role type select** — ML Engineer Intern, SWE Intern, AI Research Intern, Applied Scientist Intern, ML Infra Intern
- **Goal select** — referral / advice / both / coffee chat
- **Term select** — Fall 2026 / Winter 2027 / Summer 2027
- **Company chips** — multi-select toggle, pre-select: Google/DeepMind, Meta AI, OpenAI, Anthropic, Nvidia
- **Run button** — calls `/api/outreach`, shows loading skeleton, renders results

### Company list (full)

```ts
const COMPANIES = [
  'Google / DeepMind', 'Meta AI', 'OpenAI', 'Anthropic',
  'Microsoft / MSR', 'Amazon / AWS', 'Nvidia', 'Apple',
  'Cohere', 'Hugging Face', 'Mistral AI', 'Shopify',
  'Databricks', 'Scale AI', 'Waymo', 'xAI',
];
```

### Results panel

- Strategy banner at top
- 2-column grid of `PersonCard` components, sorted by score descending
- Each card shows: name, role, company, score badge, why, hook, tags, LinkedIn search query, message with copy button
- Pro tips bar at the bottom

---

## PersonCard Component

Each card must display:

| Field | Display |
|---|---|
| `name` | Large heading |
| `role` | Subtitle in accent color |
| `company` | Small muted label |
| `score` | Large badge top-right (e.g. `9/10`) |
| `why` | Body text — why reach out |
| `hook` | Highlighted callout — connection angle |
| `tags` | Small pill badges (color-coded: green=alum, blue=active/recruiter) |
| `linkedin_query` | Monospace, copy-able search string |
| `message` | Pre-formatted message block with **Copy** button |

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
  if (score >= 9) return 'text-green-600';   // Excellent
  if (score >= 7) return 'text-blue-600';    // Strong
  if (score >= 5) return 'text-yellow-600';  // Moderate
  return 'text-red-500';                      // Weak
}
```

---

## Pro Tips (render at bottom of results)

- Personalize every message — find one specific detail from their actual LinkedIn before sending
- Best send times: Tuesday–Thursday, 8–10am or 6–8pm in their timezone
- Send connection request + note simultaneously (LinkedIn note limit: 300 chars)
- One follow-up after 7 days max — keep it short
- UWaterloo alumni respond at ~3× the rate of cold strangers for Waterloo students
- Former interns (1–3 years out) have the highest referral conversion rate — they remember how they got in

---

## Default Profile (pre-fill for Shilo)

```
2nd year Mechatronics Engineering @ University of Waterloo, pursuing AI specialization.
Currently MLE intern @ Cohere Labs (PyTorch, LoRA, LLM inference optimization) and
ML Engineering Intern @ biotech AI lab (LangGraph multi-agent systems, RAG, pgvector).
Previous founding engineer at FinTech startup (FastAPI, PostgreSQL, WebSockets, RAG pipeline).
Strong in Python, C++, TypeScript, PyTorch, LangChain.
Built GPU Training Autotuner with NVML/CUDA C++ bindings.
Won 2nd place at NexHacks 2026 @ CMU for a real-time Polymarket intelligence Chrome extension.
```

---

## Common Issues & Fixes

| Issue | Fix |
|---|---|
| JSON parse error at position X | Apostrophe in message field — prompt already bans them; parser strips trailing commas as fallback |
| CORS error calling Anthropic | All API calls must go through `/api/outreach` server route, never client-side |
| Empty response | Check `ANTHROPIC_API_KEY` is set in `.env.local` and valid |
| Only 4-5 people returned | Claude occasionally drops entries; add validation: if `people.length < 6`, show what was returned with a "re-run for more" prompt |
| Duplicate companies | Prompt asks to spread across companies; if still duplicated, post-process to flag duplicates |

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
