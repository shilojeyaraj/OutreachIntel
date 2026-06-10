# ColdReach Intel

[![CI](https://github.com/shilojeyaraj/OutreachIntel/actions/workflows/ci.yml/badge.svg)](https://github.com/shilojeyaraj/OutreachIntel/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![Code style: Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://prettier.io)

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

| Var                    | Required    | Default         | Notes                                                                                                                 |
| ---------------------- | ----------- | --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`   | yes         | —               | Get one at https://openrouter.ai/keys                                                                                 |
| `OPENROUTER_MODEL`     | no          | `openai/gpt-4o` | Try `openai/gpt-4-turbo` or `openai/gpt-4`                                                                            |
| `OPENROUTER_SITE_URL`  | no          | —               | Sent as `HTTP-Referer` for OpenRouter attribution                                                                     |
| `OPENROUTER_SITE_NAME` | no          | —               | Sent as `X-Title` for OpenRouter attribution                                                                          |
| `APIFY_API_TOKEN`      | recommended | —               | Without it the app still works but the model invents names. Get one at https://console.apify.com/account/integrations |

## Features

### Job Finder (`/jobs`)

Paste a job posting URL and your CV text — the app fetches the posting, scores it against your background using Claude, and returns a ranked fit summary with suggested talking points.

Requires `ANTHROPIC_API_KEY` (set in `.env.local`).

### Resume + Cover Letter Tailor (`/tailor`)

Paste a target job (title, company, description) and your resume's LaTeX source — the agent tailors the resume to the role and writes a matching cover letter.

- **Resume output:** tailored LaTeX you copy directly into your editor (e.g. Overleaf). There is no server-side LaTeX compilation.
- **Cover letter output:** a downloadable PDF generated in the browser from the drafted text.
- **QA fact-check:** a built-in pass compares both drafts against your original resume (the source of truth), auto-revises once, and flags anything it could not resolve. The system never invents employers, titles, dates, metrics, or skills not present in your resume.
- Requires `ANTHROPIC_API_KEY` (same key as `/jobs`; set in `.env.local` or paste directly into the form).

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

## Development

```bash
make install        # install dependencies
make test           # run unit + integration tests
make test-coverage  # run tests with coverage report
make lint           # ESLint
make format         # Prettier --write
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the PR process and Conventional Commits format, and [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for a system overview.

## License

[MIT](./LICENSE) © Shilo Jeyaraj
