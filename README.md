# ColdReach Intel

AI-ranked LinkedIn outreach targets for student internship referrals, advice, or coffee chats.

Two integrations make the output non-generic:
- **Apify Google Search Scraper** runs one `site:linkedin.com/in` query per target company and feeds the real hits to the LLM, so it picks actual people instead of inventing names.
- **OpenRouter** acts as the model gateway, defaulting to `openai/gpt-4o` (swap via `OPENROUTER_MODEL`).

## Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Apify (`apify/google-search-scraper` actor) for grounding
- OpenRouter API → GPT-4 family for ranking + message generation

## Setup

```bash
npm install
cp .env.local.example .env.local
# edit .env.local and paste your OpenRouter key (sk-or-v1-...)
npm run dev
```

Open http://localhost:3000.

## Environment variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `OPENROUTER_API_KEY` | yes | — | Get one at https://openrouter.ai/keys |
| `OPENROUTER_MODEL` | no | `openai/gpt-4o` | Try `openai/gpt-4-turbo` or `openai/gpt-4` |
| `OPENROUTER_SITE_URL` | no | — | Sent as `HTTP-Referer` for OpenRouter attribution |
| `OPENROUTER_SITE_NAME` | no | — | Sent as `X-Title` for OpenRouter attribution |
| `APIFY_API_TOKEN` | recommended | — | Without it the app still works but the model invents names. Get one at https://console.apify.com/account/integrations |

## How it works

1. The browser POSTs the form payload to `/api/outreach`.
2. If `APIFY_API_TOKEN` is set, the route runs `apify/google-search-scraper` synchronously — one targeted Google query per company, filtered to `linkedin.com/in` URLs.
3. The real hits get formatted into a numbered grounding block and injected into the prompt.
4. OpenRouter is called with `response_format: { type: "json_object" }` so GPT-4 must return valid JSON.
5. `lib/parseResponse.ts` strips fences, trailing commas, and control characters before `JSON.parse`.
6. The UI sorts the 6 returned people by score descending, renders cards, and shows a "Grounded" badge when live search succeeded.

## Deployment (Vercel)

```bash
npm i -g vercel
vercel
vercel env add OPENROUTER_API_KEY
vercel --prod
```

The `/api/outreach` route runs as a serverless function — no extra config required.
