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
