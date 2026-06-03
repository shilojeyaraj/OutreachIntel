import Anthropic from '@anthropic-ai/sdk';
import type { TailorJob } from './types';

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// SDK 0.32.1: cache_control lives on Beta types, not on the stable TextBlockParam.
// We use client.beta.messages.create() with betas:['prompt-caching-2024-07-31'] so
// the system array must be typed as BetaTextBlockParam[] (which carries cache_control).
type BetaTextBlockParam = Anthropic.Beta.Messages.BetaTextBlockParam;
type BetaTextBlock = Anthropic.Beta.Messages.BetaTextBlock;

export interface ClaudeCallOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  system?: BetaTextBlockParam[];
}

/**
 * Shared, cacheable context sent as the system prompt for every tailor agent.
 * The original resume + job are identical across the resume/cover/QA calls, so
 * marking them with cache_control lets Anthropic reuse the prefix and cut cost.
 */
export function buildSharedSystem(resumeLatex: string, job: TailorJob): BetaTextBlockParam[] {
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
  const message = await client.beta.messages.create({
    model: opts.model || DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    betas: ['prompt-caching-2024-07-31'],
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content
    .filter((block): block is BetaTextBlock => block.type === 'text')
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
