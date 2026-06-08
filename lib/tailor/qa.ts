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
