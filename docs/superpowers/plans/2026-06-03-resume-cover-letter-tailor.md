# Resume + Cover Letter Tailor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Writer + QA pipeline that tailors a LaTeX resume to one job (output: LaTeX text for Overleaf) and writes a cover letter (output: downloadable PDF), with a fact-check agent that auto-revises once.

**Architecture:** A new `lib/tailor/` module holds three "agents" — each a focused Claude API call with a prompt-builder + defensive JSON parser + a `run*` function — plus a `pipeline.ts` orchestrator. The two writer agents run concurrently; the QA agent reviews both against the original resume (source of truth) and triggers one revision pass. A `POST /api/tailor` route wraps the pipeline; an `/app/tailor` page renders inputs and three output panels. Mirrors the existing `lib/jobs/` + `app/api/jobs/search` patterns exactly.

**Tech Stack:** Next.js 14 (App Router), TypeScript, `@anthropic-ai/sdk` (already a dep), Jest + Testing Library, `@react-pdf/renderer` (new dep, client-side PDF only).

---

## File structure

```
lib/tailor/
  types.ts          # all shared types for the slice
  client.ts         # callClaudeText() + buildSharedSystem() (cached resume+job prefix)
  resume.ts         # buildResumeTailorPrompt / parseResumeResponse / runResumeTailor
  coverLetter.ts    # buildCoverLetterPrompt / parseCoverLetterResponse / runCoverLetter
  qa.ts             # buildQAPrompt / parseQAResponse / runQA
  pipeline.ts       # runTailorPipeline() — orchestrates writers, QA, revision, partial success
app/api/tailor/route.ts          # POST endpoint: validate + call pipeline
app/tailor/page.tsx              # client page: inputs + results
app/tailor/layout.tsx            # metadata wrapper (mirrors app/jobs/layout.tsx)
components/tailor/
  ResumeOutput.tsx               # LaTeX block + Copy + "what changed"
  CoverLetterOutput.tsx          # letter render + Download PDF (react-pdf, dynamic import)
  QAReportPanel.tsx              # caught / fixed / remaining
tests/unit/tailor/resume.test.ts
tests/unit/tailor/coverLetter.test.ts
tests/unit/tailor/qa.test.ts
tests/unit/tailor/pipeline.test.ts
tests/integration/tailor.api.test.ts
```

Convention notes (from the existing codebase):

- Parsers follow the `parseRankingResponse` style in `lib/jobs/claude.ts`: strip ` ```json ` fences, slice from first `{`/`[` to last `}`/`]`, drop trailing commas, then `JSON.parse` with a fallback that escapes control chars.
- The route follows `app/api/jobs/search/route.ts`: `export const runtime = 'nodejs'`, `maxDuration = 300`, validate → friendly error mapping → call lib → `NextResponse.json`.
- Model default: `process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'`.

---

## Task 1: Dependency + shared types

**Files:**

- Modify: `package.json` (add `@react-pdf/renderer`)
- Create: `lib/tailor/types.ts`

- [ ] **Step 1: Install the PDF dependency**

Run:

```bash
npm install @react-pdf/renderer@^4.0.0
```

Expected: `package.json` dependencies gain `"@react-pdf/renderer"`, install exits 0.

- [ ] **Step 2: Create the shared types**

Create `lib/tailor/types.ts`:

```ts
export type Tone = 'warm' | 'formal' | 'concise';

export interface TailorJob {
  title: string;
  company: string;
  description: string;
}

export interface TailorInput {
  job: TailorJob;
  resumeLatex: string;
  tone?: Tone;
  anthropicKey?: string;
}

export interface ResumeChange {
  section: string;
  before: string;
  after: string;
  why: string;
}

export interface TailoredResume {
  tailoredLatex: string;
  changes: ResumeChange[];
}

export interface CoverLetter {
  letterText: string;
  paragraphs: string[];
}

export type QAIssueType = 'fabrication' | 'weak' | 'tone' | 'offtarget';
export type QATarget = 'resume' | 'cover';

export interface QAIssue {
  type: QAIssueType;
  target: QATarget;
  quote: string;
  explanation: string;
}

export interface QAReport {
  caught: QAIssue[];
  fixed: QAIssue[];
  remaining: QAIssue[];
  unavailable?: boolean;
}

export interface TailorResponse {
  tailoredLatex: string;
  changes: ResumeChange[];
  letterText: string;
  qa: QAReport;
  resumeError?: string;
  coverError?: string;
  warning?: string;
}

export const VALID_TONES: Tone[] = ['warm', 'formal', 'concise'];
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/tailor/types.ts
git commit -m "feat(tailor): add types and react-pdf dependency"
```

---

## Task 2: Shared Claude client helper

**Files:**

- Create: `lib/tailor/client.ts`
- Test: covered indirectly via Task 6 integration test (no separate unit test — thin SDK wrapper)

- [ ] **Step 1: Implement the client helper**

Create `lib/tailor/client.ts`:

````ts
import Anthropic from '@anthropic-ai/sdk';
import type { TailorJob } from './types';

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

export interface ClaudeCallOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  system?: Anthropic.Messages.TextBlockParam[];
}

/**
 * Shared, cacheable context sent as the system prompt for every tailor agent.
 * The original resume + job are identical across the resume/cover/QA calls, so
 * marking them with cache_control lets Anthropic reuse the prefix and cut cost.
 */
export function buildSharedSystem(
  resumeLatex: string,
  job: TailorJob,
): Anthropic.Messages.TextBlockParam[] {
  const context = `You are part of a job-application assistant. Below are the two pieces of shared context every step relies on. Treat the ORIGINAL RESUME as the only source of truth about the candidate: never introduce employers, job titles, dates, metrics, technologies, or skills that do not already appear in it.

ORIGINAL RESUME (LaTeX source):
${resumeLatex}

TARGET JOB:
Title: ${job.title}
Company: ${job.company}
Description:
${job.description || '(no description provided)'}`;

  return [{ type: 'text', text: context, cache_control: { type: 'ephemeral' } }];
}

export async function callClaudeText(prompt: string, opts: ClaudeCallOptions): Promise<string> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const message = await client.messages.create({
    model: opts.model || DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('Claude returned an empty message');
  return text;
}

/** Shared defensive JSON-object extractor (mirrors lib/jobs/claude.ts style). */
export function extractJsonObject(raw: string): string {
  const text = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');
  return text.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1');
}

const CONTROL_CHAR_RE = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');

/** Parse JSON with a control-char-escaping fallback. */
export function parseJsonLoose<T>(jsonStr: string): T {
  const attempts: Array<(s: string) => string> = [
    (s) => s,
    (s) =>
      s.replace(CONTROL_CHAR_RE, (c) => {
        if (c === '\n') return '\\n';
        if (c === '\r') return '\\r';
        if (c === '\t') return '\\t';
        return ' ';
      }),
  ];
  let lastErr: unknown;
  for (const fix of attempts) {
    try {
      return JSON.parse(fix(jsonStr)) as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Unable to parse JSON');
}
````

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/tailor/client.ts
git commit -m "feat(tailor): add shared Claude client with cached context"
```

---

## Task 3: Resume Tailor agent

**Files:**

- Create: `lib/tailor/resume.ts`
- Test: `tests/unit/tailor/resume.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tailor/resume.test.ts`:

````ts
import { buildResumeTailorPrompt, parseResumeResponse } from '@/lib/tailor/resume';
import type { TailorJob } from '@/lib/tailor/types';

const JOB: TailorJob = {
  title: 'ML Engineer Intern',
  company: 'Anthropic',
  description: 'Work on LLM systems and inference.',
};

describe('buildResumeTailorPrompt', () => {
  it('includes the job title and forbids fabrication', () => {
    const prompt = buildResumeTailorPrompt(JOB, 'concise');
    expect(prompt).toContain('ML Engineer Intern');
    expect(prompt.toLowerCase()).toMatch(/do not (invent|add|fabricate)/);
    expect(prompt.toLowerCase()).toContain('concise');
  });

  it('asks for the tailoredLatex and changes fields', () => {
    const prompt = buildResumeTailorPrompt(JOB);
    expect(prompt).toContain('tailoredLatex');
    expect(prompt).toContain('changes');
  });
});

describe('parseResumeResponse', () => {
  it('parses a valid JSON object', () => {
    const raw = JSON.stringify({
      tailoredLatex: '\\documentclass{article}',
      changes: [{ section: 'Skills', before: 'a', after: 'b', why: 'match' }],
    });
    const out = parseResumeResponse(raw);
    expect(out.tailoredLatex).toContain('documentclass');
    expect(out.changes).toHaveLength(1);
    expect(out.changes[0].section).toBe('Skills');
  });

  it('parses JSON wrapped in markdown fences with trailing commas', () => {
    const raw = '```json\n{"tailoredLatex":"x","changes":[],}\n```';
    const out = parseResumeResponse(raw);
    expect(out.tailoredLatex).toBe('x');
    expect(out.changes).toEqual([]);
  });

  it('defaults changes to an empty array when missing', () => {
    const out = parseResumeResponse('{"tailoredLatex":"x"}');
    expect(out.changes).toEqual([]);
  });

  it('throws when no JSON object is present', () => {
    expect(() => parseResumeResponse('no json here')).toThrow();
  });
});
````

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tailor/resume.test.ts`
Expected: FAIL — cannot find module `@/lib/tailor/resume`.

- [ ] **Step 3: Implement the agent**

Create `lib/tailor/resume.ts`:

```ts
import { buildSharedSystem, callClaudeText, extractJsonObject, parseJsonLoose } from './client';
import type { ResumeChange, TailoredResume, TailorInput, TailorJob, Tone } from './types';

export function buildResumeTailorPrompt(job: TailorJob, tone?: Tone): string {
  const toneLine = tone ? `Tone for any rewritten prose: ${tone}.` : '';
  return `Tailor the ORIGINAL RESUME (in the shared context) to the TARGET JOB "${job.title}" at ${job.company}.

You may ONLY rephrase, reorder, emphasize, or drop content that already exists in the original resume. Do not invent or add employers, titles, dates, metrics, technologies, or skills. Keep the LaTeX structure, document class, and custom commands intact — edit the content inside them, not the formatting. ${toneLine}

Return ONLY a raw JSON object. No markdown, no backticks, no commentary, no trailing commas.

Schema: {"tailoredLatex":"<the full edited LaTeX source>","changes":[{"section":"<resume section>","before":"<original text>","after":"<edited text>","why":"<why this helps for the job>"}]}

Include one changes entry per meaningful edit. If you change nothing in a section, do not list it.`;
}

export function parseResumeResponse(raw: string): TailoredResume {
  const obj = parseJsonLoose<Record<string, unknown>>(extractJsonObject(raw));
  const tailoredLatex = typeof obj.tailoredLatex === 'string' ? obj.tailoredLatex : '';
  if (!tailoredLatex.trim()) throw new Error('Resume response missing tailoredLatex');
  const changes: ResumeChange[] = Array.isArray(obj.changes)
    ? obj.changes.map((c) => {
        const r = (c ?? {}) as Record<string, unknown>;
        return {
          section: String(r.section ?? ''),
          before: String(r.before ?? ''),
          after: String(r.after ?? ''),
          why: String(r.why ?? ''),
        };
      })
    : [];
  return { tailoredLatex, changes };
}

export async function runResumeTailor(
  input: TailorInput,
  apiKey: string,
  revisionNote?: string,
): Promise<TailoredResume> {
  const system = buildSharedSystem(input.resumeLatex, input.job);
  let prompt = buildResumeTailorPrompt(input.job, input.tone);
  if (revisionNote) {
    prompt += `\n\nA reviewer flagged problems with your previous draft. Fix these and re-verify nothing is fabricated:\n${revisionNote}`;
  }
  const text = await callClaudeText(prompt, { apiKey, system });
  return parseResumeResponse(text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/tailor/resume.test.ts`
Expected: PASS (6 assertions across 6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tailor/resume.ts tests/unit/tailor/resume.test.ts
git commit -m "feat(tailor): add resume tailor agent"
```

---

## Task 4: Cover Letter agent

**Files:**

- Create: `lib/tailor/coverLetter.ts`
- Test: `tests/unit/tailor/coverLetter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tailor/coverLetter.test.ts`:

```ts
import { buildCoverLetterPrompt, parseCoverLetterResponse } from '@/lib/tailor/coverLetter';
import type { TailorJob } from '@/lib/tailor/types';

const JOB: TailorJob = {
  title: 'Backend Engineer',
  company: 'Stripe',
  description: 'Build payment APIs.',
};

describe('buildCoverLetterPrompt', () => {
  it('names the company and forbids fabrication', () => {
    const prompt = buildCoverLetterPrompt(JOB, 'warm');
    expect(prompt).toContain('Stripe');
    expect(prompt.toLowerCase()).toMatch(/do not (invent|add|fabricate)/);
    expect(prompt.toLowerCase()).toContain('warm');
  });

  it('asks for letterText and paragraphs', () => {
    const prompt = buildCoverLetterPrompt(JOB);
    expect(prompt).toContain('letterText');
    expect(prompt).toContain('paragraphs');
  });
});

describe('parseCoverLetterResponse', () => {
  it('parses a valid object and derives paragraphs when omitted', () => {
    const raw = JSON.stringify({ letterText: 'Para one.\n\nPara two.' });
    const out = parseCoverLetterResponse(raw);
    expect(out.letterText).toContain('Para one.');
    expect(out.paragraphs).toHaveLength(2);
  });

  it('uses provided paragraphs when present', () => {
    const raw = JSON.stringify({ letterText: 'x', paragraphs: ['a', 'b', 'c'] });
    const out = parseCoverLetterResponse(raw);
    expect(out.paragraphs).toEqual(['a', 'b', 'c']);
  });

  it('throws when letterText is missing', () => {
    expect(() => parseCoverLetterResponse('{"paragraphs":[]}')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tailor/coverLetter.test.ts`
Expected: FAIL — cannot find module `@/lib/tailor/coverLetter`.

- [ ] **Step 3: Implement the agent**

Create `lib/tailor/coverLetter.ts`:

```ts
import { buildSharedSystem, callClaudeText, extractJsonObject, parseJsonLoose } from './client';
import type { CoverLetter, TailorInput, TailorJob, Tone } from './types';

export function buildCoverLetterPrompt(job: TailorJob, tone?: Tone): string {
  const toneLine = tone ? `Tone: ${tone}.` : 'Tone: warm but professional.';
  return `Write a cover letter for the candidate (see ORIGINAL RESUME in shared context) applying to "${job.title}" at ${job.company}.

Use only experience, projects, and skills that appear in the original resume. Do not invent or add facts, employers, metrics, or skills the resume does not contain. Three to four short paragraphs. ${toneLine}

Return ONLY a raw JSON object. No markdown, no backticks, no commentary, no trailing commas.

Schema: {"letterText":"<full letter with blank lines between paragraphs>","paragraphs":["<paragraph 1>","<paragraph 2>"]}`;
}

export function parseCoverLetterResponse(raw: string): CoverLetter {
  const obj = parseJsonLoose<Record<string, unknown>>(extractJsonObject(raw));
  const letterText = typeof obj.letterText === 'string' ? obj.letterText : '';
  if (!letterText.trim()) throw new Error('Cover letter response missing letterText');
  const paragraphs = Array.isArray(obj.paragraphs)
    ? obj.paragraphs.map(String).filter((p) => p.trim().length > 0)
    : letterText
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
  return { letterText, paragraphs };
}

export async function runCoverLetter(
  input: TailorInput,
  apiKey: string,
  revisionNote?: string,
): Promise<CoverLetter> {
  const system = buildSharedSystem(input.resumeLatex, input.job);
  let prompt = buildCoverLetterPrompt(input.job, input.tone);
  if (revisionNote) {
    prompt += `\n\nA reviewer flagged problems with your previous draft. Fix these and re-verify nothing is fabricated:\n${revisionNote}`;
  }
  const text = await callClaudeText(prompt, { apiKey, system });
  return parseCoverLetterResponse(text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/tailor/coverLetter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/tailor/coverLetter.ts tests/unit/tailor/coverLetter.test.ts
git commit -m "feat(tailor): add cover letter agent"
```

---

## Task 5: QA / fact-check agent

**Files:**

- Create: `lib/tailor/qa.ts`
- Test: `tests/unit/tailor/qa.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tailor/qa.test.ts`:

```ts
import { buildQAPrompt, parseQAResponse } from '@/lib/tailor/qa';
import type { TailorJob } from '@/lib/tailor/types';

const JOB: TailorJob = { title: 'SWE', company: 'Acme', description: 'code' };

describe('buildQAPrompt', () => {
  it('includes both drafts and the fabrication rule', () => {
    const prompt = buildQAPrompt(JOB, '\\resume tailored', 'Dear Acme');
    expect(prompt).toContain('\\resume tailored');
    expect(prompt).toContain('Dear Acme');
    expect(prompt.toLowerCase()).toContain('fabrication');
  });
});

describe('parseQAResponse', () => {
  it('parses issues and normalizes type/target', () => {
    const raw = JSON.stringify({
      issues: [
        {
          type: 'fabrication',
          target: 'resume',
          quote: 'led team of 50',
          explanation: 'not in resume',
        },
        { type: 'weird', target: 'elsewhere', quote: 'x', explanation: 'y' },
      ],
    });
    const out = parseQAResponse(raw);
    expect(out).toHaveLength(2);
    expect(out[0].type).toBe('fabrication');
    expect(out[0].target).toBe('resume');
    // unknown type/target fall back to safe defaults
    expect(out[1].type).toBe('weak');
    expect(out[1].target).toBe('resume');
  });

  it('returns an empty array when issues is missing or empty', () => {
    expect(parseQAResponse('{"issues":[]}')).toEqual([]);
    expect(parseQAResponse('{}')).toEqual([]);
  });

  it('throws on non-JSON', () => {
    expect(() => parseQAResponse('garbage')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tailor/qa.test.ts`
Expected: FAIL — cannot find module `@/lib/tailor/qa`.

- [ ] **Step 3: Implement the agent**

Create `lib/tailor/qa.ts`:

```ts
import { buildSharedSystem, callClaudeText, extractJsonObject, parseJsonLoose } from './client';
import type { QAIssue, QAIssueType, QATarget, TailorInput, TailorJob } from './types';

const ISSUE_TYPES: QAIssueType[] = ['fabrication', 'weak', 'tone', 'offtarget'];

export function buildQAPrompt(job: TailorJob, tailoredLatex: string, letterText: string): string {
  return `You are a strict fact-checker and editor. Compare the two drafts below against the ORIGINAL RESUME (shared context), which is the only source of truth.

Your top priority is catching fabrication: any employer, title, date, metric, technology, or skill in a draft that is NOT supported by the original resume. Also flag weak phrasing, wrong tone, and content that is off-target for "${job.title}" at ${job.company}.

TAILORED RESUME (LaTeX):
${tailoredLatex}

COVER LETTER:
${letterText}

Return ONLY a raw JSON object. No markdown, no backticks, no commentary, no trailing commas.

Schema: {"issues":[{"type":"fabrication|weak|tone|offtarget","target":"resume|cover","quote":"<exact offending text>","explanation":"<what is wrong>"}]}

If there are no issues, return {"issues":[]}.`;
}

function normalizeType(raw: unknown): QAIssueType {
  const s = String(raw ?? '').toLowerCase();
  return (ISSUE_TYPES.find((t) => s.startsWith(t.slice(0, 4))) ?? 'weak') as QAIssueType;
}

function normalizeTarget(raw: unknown): QATarget {
  return String(raw ?? '')
    .toLowerCase()
    .startsWith('cov')
    ? 'cover'
    : 'resume';
}

export function parseQAResponse(raw: string): QAIssue[] {
  const obj = parseJsonLoose<Record<string, unknown>>(extractJsonObject(raw));
  if (!Array.isArray(obj.issues)) return [];
  return obj.issues.map((i) => {
    const r = (i ?? {}) as Record<string, unknown>;
    return {
      type: normalizeType(r.type),
      target: normalizeTarget(r.target),
      quote: String(r.quote ?? ''),
      explanation: String(r.explanation ?? ''),
    };
  });
}

export async function runQA(
  input: TailorInput,
  tailoredLatex: string,
  letterText: string,
  apiKey: string,
): Promise<QAIssue[]> {
  const system = buildSharedSystem(input.resumeLatex, input.job);
  const prompt = buildQAPrompt(input.job, tailoredLatex, letterText);
  const text = await callClaudeText(prompt, { apiKey, system });
  return parseQAResponse(text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/tailor/qa.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/tailor/qa.ts tests/unit/tailor/qa.test.ts
git commit -m "feat(tailor): add QA fact-check agent"
```

---

## Task 6: Pipeline orchestrator

**Files:**

- Create: `lib/tailor/pipeline.ts`
- Test: `tests/unit/tailor/pipeline.test.ts`

The pipeline runs the two writers concurrently, runs QA, and — if QA found issues — does ONE revision pass on whichever target(s) had issues, then re-runs QA once to classify fixed vs. remaining. Writer failures degrade to partial success; QA failure degrades to `unavailable`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tailor/pipeline.test.ts`:

```ts
import { runTailorPipeline } from '@/lib/tailor/pipeline';
import type { TailorInput } from '@/lib/tailor/types';

jest.mock('@/lib/tailor/resume', () => ({ runResumeTailor: jest.fn() }));
jest.mock('@/lib/tailor/coverLetter', () => ({ runCoverLetter: jest.fn() }));
jest.mock('@/lib/tailor/qa', () => ({ runQA: jest.fn() }));

import { runResumeTailor } from '@/lib/tailor/resume';
import { runCoverLetter } from '@/lib/tailor/coverLetter';
import { runQA } from '@/lib/tailor/qa';

const mockResume = runResumeTailor as jest.Mock;
const mockCover = runCoverLetter as jest.Mock;
const mockQA = runQA as jest.Mock;

const INPUT: TailorInput = {
  job: { title: 'SWE', company: 'Acme', description: 'code' },
  resumeLatex: '\\documentclass{article}\\begin{document}x\\end{document}',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockResume.mockResolvedValue({ tailoredLatex: 'R1', changes: [] });
  mockCover.mockResolvedValue({ letterText: 'L1', paragraphs: ['L1'] });
});

it('returns drafts with empty QA when no issues are found', async () => {
  mockQA.mockResolvedValue([]);
  const out = await runTailorPipeline(INPUT, 'key');
  expect(out.tailoredLatex).toBe('R1');
  expect(out.letterText).toBe('L1');
  expect(out.qa.caught).toEqual([]);
  expect(out.qa.remaining).toEqual([]);
  expect(mockResume).toHaveBeenCalledTimes(1);
  expect(mockQA).toHaveBeenCalledTimes(1);
});

it('revises once and reports fixed vs remaining', async () => {
  const issue = { type: 'fabrication', target: 'resume', quote: 'led 50', explanation: 'no' };
  const stillBad = { type: 'fabrication', target: 'resume', quote: 'phd', explanation: 'no' };
  mockQA.mockResolvedValueOnce([issue]).mockResolvedValueOnce([stillBad]);
  mockResume.mockResolvedValueOnce({ tailoredLatex: 'R1', changes: [] }); // initial
  mockResume.mockResolvedValueOnce({ tailoredLatex: 'R2', changes: [] }); // revision

  const out = await runTailorPipeline(INPUT, 'key');
  expect(out.tailoredLatex).toBe('R2'); // revised draft used
  expect(out.qa.caught).toContainEqual(issue);
  expect(out.qa.remaining).toContainEqual(stillBad);
  expect(out.qa.fixed).toContainEqual(issue); // issue gone after revision => fixed
  expect(mockResume).toHaveBeenCalledTimes(2);
  expect(mockQA).toHaveBeenCalledTimes(2);
});

it('degrades to partial success when the resume writer fails', async () => {
  mockResume.mockRejectedValue(new Error('resume boom'));
  mockResume.mockRejectedValue(new Error('resume boom')); // retry also fails
  mockQA.mockResolvedValue([]);
  const out = await runTailorPipeline(INPUT, 'key');
  expect(out.tailoredLatex).toBe('');
  expect(out.resumeError).toMatch(/resume/i);
  expect(out.letterText).toBe('L1'); // cover still succeeded
});

it('marks QA unavailable when QA keeps failing', async () => {
  mockQA.mockRejectedValue(new Error('qa boom'));
  const out = await runTailorPipeline(INPUT, 'key');
  expect(out.qa.unavailable).toBe(true);
  expect(out.tailoredLatex).toBe('R1'); // drafts still returned
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tailor/pipeline.test.ts`
Expected: FAIL — cannot find module `@/lib/tailor/pipeline`.

- [ ] **Step 3: Implement the pipeline**

Create `lib/tailor/pipeline.ts`:

```ts
import { runResumeTailor } from './resume';
import { runCoverLetter } from './coverLetter';
import { runQA } from './qa';
import type {
  CoverLetter,
  QAIssue,
  QAReport,
  TailoredResume,
  TailorInput,
  TailorResponse,
} from './types';

/** Run an async fn once, retrying a single time on failure (mirrors rankWithClaude). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

function issueKey(i: QAIssue): string {
  return `${i.target}|${i.type}|${i.quote}`;
}

function noteFor(issues: QAIssue[]): string {
  return issues.map((i) => `- [${i.type}] "${i.quote}" — ${i.explanation}`).join('\n');
}

export async function runTailorPipeline(
  input: TailorInput,
  apiKey: string,
): Promise<TailorResponse> {
  // 1. Writers run concurrently; each degrades independently to partial success.
  const [resumeResult, coverResult] = await Promise.all([
    withRetry(() => runResumeTailor(input, apiKey)).then(
      (r): { ok: true; value: TailoredResume } => ({ ok: true, value: r }),
      (e): { ok: false; error: Error } => ({ ok: false, error: e }),
    ),
    withRetry(() => runCoverLetter(input, apiKey)).then(
      (c): { ok: true; value: CoverLetter } => ({ ok: true, value: c }),
      (e): { ok: false; error: Error } => ({ ok: false, error: e }),
    ),
  ]);

  let tailoredLatex = resumeResult.ok ? resumeResult.value.tailoredLatex : '';
  let changes = resumeResult.ok ? resumeResult.value.changes : [];
  let letterText = coverResult.ok ? coverResult.value.letterText : '';
  const resumeError = resumeResult.ok
    ? undefined
    : 'Resume tailoring failed. Showing other results.';
  const coverError = coverResult.ok
    ? undefined
    : 'Cover letter generation failed. Showing other results.';

  const base: TailorResponse = {
    tailoredLatex,
    changes,
    letterText,
    qa: { caught: [], fixed: [], remaining: [] },
    ...(resumeError ? { resumeError } : {}),
    ...(coverError ? { coverError } : {}),
  };

  // Nothing to QA if both writers failed.
  if (!resumeResult.ok && !coverResult.ok) {
    return { ...base, warning: 'Both writers failed. Try again.' };
  }

  // 2. QA pass.
  let caught: QAIssue[];
  try {
    caught = await withRetry(() => runQA(input, tailoredLatex, letterText, apiKey));
  } catch {
    return { ...base, qa: { caught: [], fixed: [], remaining: [], unavailable: true } };
  }

  if (caught.length === 0) {
    return base;
  }

  // 3. One revision pass on whichever target(s) had issues.
  const resumeIssues = caught.filter((i) => i.target === 'resume');
  const coverIssues = caught.filter((i) => i.target === 'cover');

  if (resumeIssues.length > 0 && resumeResult.ok) {
    try {
      const revised = await withRetry(() => runResumeTailor(input, apiKey, noteFor(resumeIssues)));
      tailoredLatex = revised.tailoredLatex;
      changes = revised.changes;
    } catch {
      /* keep original draft */
    }
  }
  if (coverIssues.length > 0 && coverResult.ok) {
    try {
      const revised = await withRetry(() => runCoverLetter(input, apiKey, noteFor(coverIssues)));
      letterText = revised.letterText;
    } catch {
      /* keep original draft */
    }
  }

  // 4. Re-run QA once to classify fixed vs. remaining.
  let remaining: QAIssue[] = caught;
  try {
    remaining = await withRetry(() => runQA(input, tailoredLatex, letterText, apiKey));
  } catch {
    /* if re-check fails, treat all original issues as still remaining */
  }

  const remainingKeys = new Set(remaining.map(issueKey));
  const fixed = caught.filter((i) => !remainingKeys.has(issueKey(i)));

  return {
    tailoredLatex,
    changes,
    letterText,
    qa: { caught, fixed, remaining },
    ...(resumeError ? { resumeError } : {}),
    ...(coverError ? { coverError } : {}),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/tailor/pipeline.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tailor/pipeline.ts tests/unit/tailor/pipeline.test.ts
git commit -m "feat(tailor): add pipeline orchestrator with revision loop"
```

---

## Task 7: API route

**Files:**

- Create: `app/api/tailor/route.ts`
- Test: `tests/integration/tailor.api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/tailor.api.test.ts`:

```ts
/**
 * @jest-environment node
 *
 * Route imports next/server, which needs Web globals — run under node env.
 * The Anthropic SDK is mocked so no network calls happen.
 */
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
);

import { POST } from '@/app/api/tailor/route';

const RESUME = '\\documentclass{article}\\begin{document}Experience: Built APIs.\\end{document}';
const VALID_BODY = {
  job: { title: 'Backend Engineer', company: 'Stripe', description: 'Build payment APIs.' },
  resumeLatex: RESUME,
  anthropicKey: 'test-key',
};

function buildRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/tailor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function reply(obj: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

const ORIGINAL_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.clearAllMocks();
});

it('returns 400 when resumeLatex is too short', async () => {
  const res = await POST(buildRequest({ ...VALID_BODY, resumeLatex: 'x' }));
  expect(res.status).toBe(400);
});

it('returns 400 when the anthropic key is missing', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const { anthropicKey, ...noKey } = VALID_BODY;
  const res = await POST(buildRequest(noKey));
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/anthropic/i);
});

it('returns tailored output on the happy path', async () => {
  // calls in order: resume, cover, QA (no issues)
  mockCreate
    .mockResolvedValueOnce(reply({ tailoredLatex: 'TAILORED', changes: [] }))
    .mockResolvedValueOnce(reply({ letterText: 'Dear Stripe', paragraphs: ['Dear Stripe'] }))
    .mockResolvedValueOnce(reply({ issues: [] }));

  const res = await POST(buildRequest(VALID_BODY));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.tailoredLatex).toBe('TAILORED');
  expect(body.letterText).toBe('Dear Stripe');
  expect(body.qa.caught).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/tailor.api.test.ts`
Expected: FAIL — cannot find module `@/app/api/tailor/route`.

- [ ] **Step 3: Implement the route**

Create `app/api/tailor/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { runTailorPipeline } from '@/lib/tailor/pipeline';
import { VALID_TONES } from '@/lib/tailor/types';
import type { TailorInput } from '@/lib/tailor/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

function validate(input: Partial<TailorInput> | null | undefined): string | null {
  if (!input || typeof input !== 'object') return 'Body must be an object';
  const job = input.job;
  if (!job || typeof job !== 'object') return 'job is required';
  if (typeof job.title !== 'string' || job.title.trim().length === 0) {
    return 'job.title is required';
  }
  if (typeof job.company !== 'string' || job.company.trim().length === 0) {
    return 'job.company is required';
  }
  if (typeof input.resumeLatex !== 'string' || input.resumeLatex.trim().length < 20) {
    return 'resumeLatex must be a string of at least 20 characters';
  }
  if (input.tone && !VALID_TONES.includes(input.tone)) {
    return `tone must be one of: ${VALID_TONES.join(', ')}`;
  }
  return null;
}

export async function POST(req: Request) {
  let body: TailorInput;
  try {
    body = (await req.json()) as TailorInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validationError = validate(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const anthropicKey = body.anthropicKey || process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { error: 'Anthropic key is required. Provide it in the form or set ANTHROPIC_API_KEY.' },
      { status: 400 },
    );
  }

  // Warn (do not block) if it does not look like LaTeX.
  const looksLatex = /\\(begin\{document\}|documentclass)/.test(body.resumeLatex);

  try {
    const result = await runTailorPipeline(body, anthropicKey);
    if (!looksLatex && !result.warning) {
      result.warning =
        'Resume did not look like LaTeX (no \\documentclass or \\begin{document}). Tailored output may be off.';
    }
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const lower = msg.toLowerCase();
    if (lower.includes('401') || lower.includes('forbidden') || lower.includes('authentication')) {
      return NextResponse.json(
        { error: 'Anthropic key invalid or out of credits.' },
        { status: 502 },
      );
    }
    if (lower.includes('timeout') || lower.includes('aborted')) {
      return NextResponse.json(
        { error: 'Tailoring timed out. Try a shorter resume or job description.' },
        { status: 504 },
      );
    }
    return NextResponse.json({ error: `Tailoring failed: ${msg}` }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/tailor.api.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/tailor/route.ts tests/integration/tailor.api.test.ts
git commit -m "feat(tailor): add POST /api/tailor route"
```

---

## Task 8: Output components

**Files:**

- Create: `components/tailor/ResumeOutput.tsx`
- Create: `components/tailor/QAReportPanel.tsx`
- Create: `components/tailor/CoverLetterOutput.tsx`
- Test: `tests/unit/tailor/ResumeOutput.test.tsx`

Only `ResumeOutput` gets a unit test (it holds the Copy logic worth testing). `CoverLetterOutput` wraps `@react-pdf/renderer` via dynamic import (`ssr: false`) — its PDF binary is not unit-tested; we only assert the letter text renders. `QAReportPanel` is presentational.

- [ ] **Step 1: Write the failing test for ResumeOutput**

Create `tests/unit/tailor/ResumeOutput.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResumeOutput from '@/components/tailor/ResumeOutput';

it('shows the LaTeX and copies it on click', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });

  render(
    <ResumeOutput
      tailoredLatex="\\documentclass{article}"
      changes={[{ section: 'Skills', before: 'a', after: 'b', why: 'match job' }]}
    />,
  );

  expect(screen.getByText(/documentclass/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /copy/i }));
  expect(writeText).toHaveBeenCalledWith('\\documentclass{article}');
  expect(screen.getByText(/match job/)).toBeInTheDocument();
});

it('renders an empty-state message when there is no resume', () => {
  render(<ResumeOutput tailoredLatex="" changes={[]} error="Resume tailoring failed." />);
  expect(screen.getByText(/resume tailoring failed/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tailor/ResumeOutput.test.tsx`
Expected: FAIL — cannot find module `@/components/tailor/ResumeOutput`.

- [ ] **Step 3: Implement ResumeOutput**

Create `components/tailor/ResumeOutput.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { ResumeChange } from '@/lib/tailor/types';

interface Props {
  tailoredLatex: string;
  changes: ResumeChange[];
  error?: string;
}

export default function ResumeOutput({ tailoredLatex, changes, error }: Props) {
  const [copied, setCopied] = useState(false);

  if (!tailoredLatex) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        {error || 'No tailored resume was produced.'}
      </div>
    );
  }

  async function copy() {
    await navigator.clipboard.writeText(tailoredLatex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tailored resume (LaTeX)</h2>
        <button
          type="button"
          onClick={copy}
          className="rounded bg-black px-3 py-1 text-sm text-white hover:bg-gray-800"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-96 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
        {tailoredLatex}
      </pre>
      {changes.length > 0 && (
        <details className="rounded border border-gray-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            What changed &amp; why ({changes.length})
          </summary>
          <ul className="mt-2 space-y-2 text-sm">
            {changes.map((c, i) => (
              <li key={i} className="border-l-2 border-gray-300 pl-2">
                <span className="font-medium">{c.section}:</span> {c.why}
                <div className="text-gray-500">
                  <span className="line-through">{c.before}</span> → {c.after}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/tailor/ResumeOutput.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement QAReportPanel (no test — presentational)**

Create `components/tailor/QAReportPanel.tsx`:

```tsx
'use client';

import type { QAReport } from '@/lib/tailor/types';

export default function QAReportPanel({ qa }: { qa: QAReport }) {
  if (qa.unavailable) {
    return (
      <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
        QA check was unavailable. Review the drafts manually before sending.
      </div>
    );
  }
  return (
    <section className="space-y-2 text-sm">
      <h2 className="text-lg font-semibold">QA report</h2>
      {qa.remaining.length > 0 && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-red-700">
          <p className="font-medium">⚠ Unresolved — review before sending:</p>
          <ul className="mt-1 list-disc pl-5">
            {qa.remaining.map((i, k) => (
              <li key={k}>
                <span className="font-medium">[{i.type}]</span> {i.explanation} —{' '}
                <span className="italic">&ldquo;{i.quote}&rdquo;</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {qa.fixed.length > 0 && (
        <div className="rounded border border-green-300 bg-green-50 p-3 text-green-700">
          <p className="font-medium">✓ Caught &amp; fixed ({qa.fixed.length}):</p>
          <ul className="mt-1 list-disc pl-5">
            {qa.fixed.map((i, k) => (
              <li key={k}>
                <span className="font-medium">[{i.type}]</span> {i.explanation}
              </li>
            ))}
          </ul>
        </div>
      )}
      {qa.remaining.length === 0 && qa.fixed.length === 0 && (
        <p className="text-green-700">✓ No issues found.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Implement CoverLetterOutput (no unit test — wraps react-pdf)**

Create `components/tailor/CoverLetterOutput.tsx`:

```tsx
'use client';

import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

interface Props {
  letterText: string;
  paragraphs: string[];
  error?: string;
}

const styles = StyleSheet.create({
  page: { padding: 56, fontSize: 11, lineHeight: 1.5, fontFamily: 'Helvetica' },
  para: { marginBottom: 12 },
});

function LetterDoc({ paragraphs }: { paragraphs: string[] }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {paragraphs.map((p, i) => (
          <View key={i} style={styles.para}>
            <Text>{p}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export default function CoverLetterOutput({ letterText, paragraphs, error }: Props) {
  if (!letterText) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        {error || 'No cover letter was produced.'}
      </div>
    );
  }

  async function download() {
    const blob = await pdf(<LetterDoc paragraphs={paragraphs} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cover-letter.pdf';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cover letter</h2>
        <button
          type="button"
          onClick={download}
          className="rounded bg-black px-3 py-1 text-sm text-white hover:bg-gray-800"
        >
          Download PDF
        </button>
      </div>
      <div className="space-y-3 rounded border border-gray-200 p-4 text-sm">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Typecheck + run all tailor tests**

Run: `npm run typecheck && npm test -- tests/unit/tailor`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/tailor tests/unit/tailor/ResumeOutput.test.tsx
git commit -m "feat(tailor): add output components (resume, cover letter PDF, QA)"
```

---

## Task 9: Tailor page

**Files:**

- Create: `app/tailor/layout.tsx`
- Create: `app/tailor/page.tsx`

Page is a client component that holds form state, POSTs to `/api/tailor`, and renders the three output components. `CoverLetterOutput` must be loaded with `next/dynamic` (`ssr: false`) because `@react-pdf/renderer` does not run during SSR.

- [ ] **Step 1: Create the layout**

Create `app/tailor/layout.tsx` (mirrors `app/jobs/layout.tsx`):

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tailor resume + cover letter',
  description: 'Tailor your LaTeX resume to a job and generate a cover letter.',
};

export default function TailorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Step 2: Create the page**

Create `app/tailor/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import ResumeOutput from '@/components/tailor/ResumeOutput';
import QAReportPanel from '@/components/tailor/QAReportPanel';
import type { TailorResponse, Tone } from '@/lib/tailor/types';
import { VALID_TONES } from '@/lib/tailor/types';

// react-pdf cannot run during SSR.
const CoverLetterOutput = dynamic(() => import('@/components/tailor/CoverLetterOutput'), {
  ssr: false,
});

const RESUME_KEY = 'tailor:resumeLatex';

export default function TailorPage() {
  const [resumeLatex, setResumeLatex] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [description, setDescription] = useState('');
  const [tone, setTone] = useState<Tone>('warm');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TailorResponse | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(RESUME_KEY);
    if (saved) setResumeLatex(saved);
  }, []);

  function persistResume(v: string) {
    setResumeLatex(v);
    localStorage.setItem(RESUME_KEY, v);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/tailor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: { title, company, description },
          resumeLatex,
          tone,
          ...(apiKey ? { anthropicKey: apiKey } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'Request failed');
        return;
      }
      setResult(body as TailorResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Tailor resume + cover letter</h1>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <input
            className="rounded border p-2"
            placeholder="Job title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <input
            className="rounded border p-2"
            placeholder="Company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
          />
        </div>
        <textarea
          className="h-28 w-full rounded border p-2"
          placeholder="Job description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <textarea
          className="h-48 w-full rounded border p-2 font-mono text-xs"
          placeholder="Paste your resume LaTeX source here"
          value={resumeLatex}
          onChange={(e) => persistResume(e.target.value)}
          required
        />
        <div className="flex items-center gap-3">
          <select
            className="rounded border p-2"
            value={tone}
            onChange={(e) => setTone(e.target.value as Tone)}
          >
            {VALID_TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            className="flex-1 rounded border p-2"
            placeholder="Anthropic API key (optional if set on server)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? 'Tailoring…' : 'Tailor'}
        </button>
      </form>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {result.warning && (
            <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
              {result.warning}
            </div>
          )}
          <QAReportPanel qa={result.qa} />
          <ResumeOutput
            tailoredLatex={result.tailoredLatex}
            changes={result.changes}
            error={result.resumeError}
          />
          <CoverLetterOutput
            letterText={result.letterText}
            paragraphs={result.letterText ? result.letterText.split(/\n\s*\n/).filter(Boolean) : []}
            error={result.coverError}
          />
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Typecheck + build + full test run**

Run: `npm run typecheck && npm run build && npm test`
Expected: typecheck PASS, build succeeds, all tests PASS.

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, open http://localhost:3000/tailor, paste a small LaTeX resume + a job, set `ANTHROPIC_API_KEY` in `.env.local` (or paste the key), click Tailor. Confirm: tailored LaTeX appears with a Copy button, cover letter renders with a working Download PDF, QA panel shows.

- [ ] **Step 5: Commit**

```bash
git add app/tailor
git commit -m "feat(tailor): add /tailor page wiring inputs to output panels"
```

---

## Task 10: Docs + env

**Files:**

- Modify: `README.md`
- Modify: `.env.local.example`

- [ ] **Step 1: Document the feature in README**

Add a "Resume + Cover Letter Tailor (`/tailor`)" section to `README.md` describing: paste a job + your LaTeX resume → tailored LaTeX (copy to Overleaf) + cover letter PDF + QA fact-check. Note it needs `ANTHROPIC_API_KEY`.

- [ ] **Step 2: Ensure the env var is documented**

Confirm `.env.local.example` lists `ANTHROPIC_API_KEY` (Job Finder already uses it). Add it if missing, with a comment that `/tailor` and `/jobs` both use it.

- [ ] **Step 3: Commit**

```bash
git add README.md .env.local.example
git commit -m "docs(tailor): document /tailor in README and env example"
```

---

## Self-review notes

- **Spec coverage:** resume tailor (Task 3), cover letter (Task 4), QA fact-check + auto-revise loop (Tasks 5–6), no-fabrication invariant (prompts in Tasks 3–5 + QA re-check in Task 6), LaTeX output + Copy (Task 8), cover letter PDF download (Task 8), QA report with `remaining` surfaced (Task 8), `localStorage` resume persistence (Task 9), partial-success + QA-unavailable degradation (Tasks 6–7), friendly error mapping (Task 7). All spec sections map to a task.
- **Type consistency:** `TailorInput`, `TailoredResume`, `CoverLetter`, `QAIssue`, `QAReport`, `TailorResponse`, `ResumeChange`, `Tone`/`VALID_TONES` defined once in Task 1 and reused verbatim; `runResumeTailor`/`runCoverLetter`/`runQA`/`runTailorPipeline` signatures match between definition and call sites; `buildSharedSystem`/`callClaudeText`/`extractJsonObject`/`parseJsonLoose` defined in Task 2 and used in Tasks 3–5.
- **Deferred from spec (noted, not built):** the "Tailor for this job" handoff button on Job Finder rows is listed in the spec's "future" section — intentionally out of this plan's scope to keep it shippable.
