# Resume + Cover Letter Tailor — Design

**Date:** 2026-06-02
**Status:** Approved (brainstorm)
**Author:** Shilo Jeyaraj (with Claude)

## Summary

Add a Writer pipeline that takes a single selected job plus the user's
LaTeX resume and produces (1) a tailored resume as LaTeX text to paste into
Overleaf and (2) a cover letter downloadable as a PDF. A QA/fact-check agent
verifies every tailored claim against the original resume and auto-revises once
before showing results.

This is the first slice of a larger "job search team." The Research/finder
layer already exists (`/api/jobs/search`, `/api/outreach`). This slice adds the
Writer + QA agents on top. Later slices (full end-to-end chaining, stricter
per-claim QA, outreach-message writer) are explicitly out of scope here.

## Definitions

An "agent" in this codebase is a focused Claude API call with a specialized
prompt and a structured-JSON contract, orchestrated server-side — mirroring the
existing `lib/jobs/claude.ts` (`rankWithClaude`). No heavyweight framework.

## Goals

- Tailor a LaTeX resume to one job by rephrasing/reordering/emphasizing content
  that **already exists** in the resume.
- Produce a cover letter as prose, downloadable as PDF (client-side, no LaTeX
  engine, no server infra).
- Guarantee **no fabrication**: never invent employers, titles, dates, metrics,
  or skills. QA independently verifies against the original resume.
- Auto-revise once when QA finds issues, then surface what was caught/fixed and
  anything still unresolved.

## Non-goals (YAGNI)

- Compiling LaTeX → PDF server-side or previewing a rendered resume PDF.
- Parsing uploaded PDF/DOCX resumes (input is pasted LaTeX text).
- End-to-end find→rank→write→QA chaining in one flow.
- Per-claim fan-out QA (possible later upgrade; see Approach B below).
- Persisting results to a database.

## Approach

**Chosen: A — Sequential server-side pipeline.** One API route runs the agents
as specialized Claude calls. The two writers run concurrently (independent);
QA runs over both; one revision pass follows if needed. Consistent with the
codebase, each unit testable in isolation, zero new infrastructure.

Rejected: **B** (per-claim QA verifier) — more robust but many more calls;
treat as a later upgrade to the QA agent. **C** (heavyweight agent framework /
subagents) — overkill for a deployed Next.js app.

## Architecture & file layout

```
lib/tailor/
  resume.ts       # Resume Tailor agent: prompt-builder + parser
  coverLetter.ts  # Cover Letter agent: prompt-builder + parser
  qa.ts           # QA/fact-check agent: prompt-builder + parser
  pipeline.ts     # orchestrates the 4 steps (the "PM agent")
  types.ts        # TailorInput, TailoredResume, CoverLetter, QAReport, TailorResponse
app/api/tailor/route.ts   # POST endpoint: validate input, call pipeline
app/tailor/page.tsx       # UI: job + resume in, results out
components/tailor/
  ResumeOutput.tsx        # LaTeX block + Copy + "what changed & why"
  CoverLetterOutput.tsx   # rendered letter + Download PDF
  QAReportPanel.tsx       # caught/fixed + unresolved flags
tests/unit/tailor/*       # one test file per agent + pipeline
tests/integration/tailor.api.test.ts
```

All Claude calls reuse one shared client helper extending the
`lib/jobs/claude.ts` pattern, sending the shared resume + job description as a
cached prefix (prompt caching) to cut cost/latency across the agents.

## Agent contracts & data flow

```
TailorInput { job{title,company,description}, resumeLatex, tone? }
        |
        +--(parallel)--> Resume Tailor --> { tailoredLatex, changes[]{section,before,after,why} }
        |                Cover Letter  --> { letterText, paragraphs[] }
        |
        v
   QA / fact-check  (sees: original resumeLatex = source of truth, tailoredLatex, letterText, job)
        +--> QAReport { issues[]{ type: "fabrication"|"weak"|"tone"|"offtarget",
                                  target: "resume"|"cover", quote, explanation } }
        |
   any issues? --yes--> one revision pass: offending writer regenerates with QA
        |               notes + verifies fabrications removed
        v
   TailorResponse { tailoredLatex, changes[], letterText, qa{ caught[], fixed[], remaining[] } }
```

### Core invariant — no fabrication

The Resume Tailor and Cover Letter prompts may only rephrase, reorder,
emphasize, or drop content that already exists in `resumeLatex` — never invent
employers, titles, dates, metrics, or skills. QA re-checks this against the
original as the source of truth. Anything QA still flags as fabrication after
the revision pass surfaces in `qa.remaining[]`, so a false claim is never shown
silently.

### Types (shape, not final)

```ts
interface TailorInput {
  job: { title: string; company: string; description: string };
  resumeLatex: string;
  tone?: 'warm' | 'formal' | 'concise';
  anthropicKey?: string;
}
interface ResumeChange {
  section: string;
  before: string;
  after: string;
  why: string;
}
interface TailoredResume {
  tailoredLatex: string;
  changes: ResumeChange[];
}
interface CoverLetter {
  letterText: string;
  paragraphs: string[];
}
type QAIssueType = 'fabrication' | 'weak' | 'tone' | 'offtarget';
interface QAIssue {
  type: QAIssueType;
  target: 'resume' | 'cover';
  quote: string;
  explanation: string;
}
interface QAReport {
  caught: QAIssue[];
  fixed: QAIssue[];
  remaining: QAIssue[];
  unavailable?: boolean;
}
interface TailorResponse {
  tailoredLatex: string;
  changes: ResumeChange[];
  letterText: string;
  qa: QAReport;
  warning?: string;
}
```

Each agent returns structured JSON parsed by its own validator, reusing the
defensive `parseRankingResponse` style already in the repo (fence-stripping,
trailing-comma fixes, schema validation).

## UI & output (`/app/tailor`)

Single page, two-step flow.

**Input:**

- Job: prefilled via a "Tailor for this job" button on each `JobTable` row
  (hands off title/company/description), or pasted manually.
- Resume: textarea for LaTeX source, persisted to `localStorage` so it is
  pasted once.
- Optional tone selector + API key handling (reuse existing pattern).

**Output — three panels:**

1. Tailored resume — LaTeX in a monospace block with **Copy**, plus a
   collapsible "What changed & why" from `changes[]`.
2. Cover letter — rendered prose with **Download PDF** via
   `@react-pdf/renderer` (client-side, real PDF, no server, no LaTeX engine).
3. QA report — caught & fixed, and `qa.remaining[]` (unresolved fabrication
   flags) shown prominently.

## Error handling

Mirrors `/api/jobs/search`:

- Validate job fields present; `resumeLatex` non-empty and looks like LaTeX
  (contains `\begin{document}` or `\documentclass` — warn, do not hard-block).
- Per-agent try/catch with one retry (as in `rankWithClaude`). If Resume Tailor
  fails after retry, return the cover letter plus a resume error (partial
  success); same in reverse.
- If QA fails, return un-QA'd drafts with `qa.unavailable = true` and a warning
  rather than blocking.
- Key/credit/timeout errors (401/forbidden/timeout) mapped to friendly messages,
  reusing the existing mapping.

## Testing

Jest, per repo setup (see memory: Jest+Next pitfalls — `setupFilesAfterEnv`,
fetch spying in jsdom, Web globals need node env).

- Unit: each agent's prompt-builder (asserts no-fabrication constraint + job &
  resume present) and parser (valid JSON, fenced JSON, trailing commas,
  malformed → throws). Pure functions, no network.
- Unit: pipeline with mocked agent calls — parallel writers, QA triggering a
  revision, partial-success paths.
- Integration: `/api/tailor` with a mocked Anthropic client — happy path,
  fabrication-caught-and-revised path, resume-fails-but-cover-succeeds path.

## Open questions / future

- Stricter per-claim QA (Approach B) as an upgrade.
- Matching LaTeX cover-letter output (currently prose→PDF only).
- Handoff wiring from Job Finder rows (nice-to-have for first build).
