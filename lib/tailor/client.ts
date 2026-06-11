import type { TailorJob } from './types';

// The whole app uses OpenRouter as its model gateway (see app/api/outreach/route.ts).
// The tailor agents go through the same gateway so a single OPENROUTER_API_KEY powers
// every feature. Model is configurable via OPENROUTER_MODEL (default openai/gpt-4o).
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o';

export interface ModelCallOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  /** Shared system context (original resume + job), identical across agent calls. */
  system?: string;
}

/**
 * Shared context sent as the system message for every tailor agent. The original
 * resume + job are identical across the resume/cover/QA calls, so this prefix is
 * reused verbatim (OpenAI-style automatic prompt caching applies on the gateway).
 */
export function buildSharedSystem(resumeLatex: string, job: TailorJob): string {
  return `You are part of a job-application assistant. Below are the two pieces of shared context every step relies on. Treat the ORIGINAL RESUME as the only source of truth about the candidate: never introduce employers, job titles, dates, metrics, technologies, or skills that do not already appear in it.

ORIGINAL RESUME (LaTeX source):
${resumeLatex}

TARGET JOB:
Title: ${job.title}
Company: ${job.company}
Description:
${job.description || '(no description provided)'}`;
}

/** Call the OpenRouter chat-completions API and return the message content text. */
export async function callModel(prompt: string, opts: ModelCallOptions): Promise<string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.apiKey}`,
    'Content-Type': 'application/json',
  };
  if (process.env.OPENROUTER_SITE_URL) {
    headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
  }
  if (process.env.OPENROUTER_SITE_NAME) {
    headers['X-Title'] = process.env.OPENROUTER_SITE_NAME;
  }

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: prompt });

  let upstream: Response;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: opts.model || DEFAULT_MODEL,
        max_tokens: opts.maxTokens ?? 8192,
        messages,
        response_format: { type: 'json_object' },
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown network error';
    throw new Error(`OpenRouter request failed: ${msg}`);
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');
    throw new Error(`OpenRouter returned ${upstream.status}: ${errText.slice(0, 500)}`);
  }

  let completion: {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  try {
    completion = await upstream.json();
  } catch {
    throw new Error('OpenRouter returned invalid JSON envelope');
  }

  const choice = completion?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenRouter returned an empty message');
  }
  if (choice?.finish_reason === 'length') {
    throw new Error(
      'Model output was truncated by max_tokens. Try a shorter resume or job description.',
    );
  }
  return content.trim();
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
