import { buildSharedSystem, callModel, extractJsonObject, parseJsonLoose } from './client';
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
  const text = await callModel(prompt, { apiKey, system });
  return parseResumeResponse(text);
}
