import { runResumeTailor } from './resume';
import { runCoverLetter } from './coverLetter';
import { runQA } from './qa';
import type { CoverLetter, QAIssue, TailoredResume, TailorInput, TailorResponse } from './types';

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
