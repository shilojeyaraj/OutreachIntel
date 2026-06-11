import { buildSharedSystem, callModel, extractJsonObject, parseJsonLoose } from './client';
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
  const text = await callModel(prompt, { apiKey, system });
  return parseCoverLetterResponse(text);
}
