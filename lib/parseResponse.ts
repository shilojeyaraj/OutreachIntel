import type { OutreachResponse, Person } from './types';

const CONTROL_CHAR_RE = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');

export function parseModelJSON(raw: string): OutreachResponse {
  let text = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('No JSON object found in model response');
  }
  let jsonStr = text.slice(start, end + 1);

  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

  const attempts: Array<(s: string) => string> = [
    (s) => s,
    (s) => s.replace(CONTROL_CHAR_RE, (c) => {
      if (c === '\n') return '\\n';
      if (c === '\r') return '\\r';
      if (c === '\t') return '\\t';
      return ' ';
    }),
    (s) => escapeInnerQuotes(s),
    (s) => escapeInnerQuotes(s.replace(CONTROL_CHAR_RE, ' ')),
  ];

  let lastError: unknown;
  for (const fix of attempts) {
    try {
      const candidate = fix(jsonStr);
      const parsed = JSON.parse(candidate);
      return validateResponse(parsed);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Unable to parse model output as JSON');
}

/**
 * Walk the string character by character. Track whether we are inside a
 * string. When we see a `"` while inside a string, peek the next
 * non-whitespace char — if it is a structural JSON char (`,` `:` `}` `]`)
 * the quote is legitimately closing the string. Otherwise it is an
 * embedded literal quote the model failed to escape, and we replace it
 * with `\"`. This is the #1 cause of late-array parse errors when the
 * model writes things like `message: "she said "hi""`.
 */
function escapeInnerQuotes(input: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (escape) {
      out += c;
      escape = false;
      continue;
    }
    if (c === '\\') {
      out += c;
      escape = true;
      continue;
    }
    if (c === '"') {
      if (!inString) {
        out += c;
        inString = true;
        continue;
      }
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) j++;
      const next = input[j];
      if (next === ',' || next === ':' || next === '}' || next === ']' || next === undefined) {
        out += c;
        inString = false;
      } else {
        out += '\\"';
      }
      continue;
    }
    out += c;
  }
  return out;
}

function validateResponse(data: unknown): OutreachResponse {
  if (!data || typeof data !== 'object') {
    throw new Error('Model response is not an object');
  }
  const obj = data as Record<string, unknown>;

  if (typeof obj.strategy !== 'string') {
    throw new Error('Model response missing "strategy" string');
  }
  if (!Array.isArray(obj.people)) {
    throw new Error('Model response missing "people" array');
  }

  const people: Person[] = obj.people.map((p, i) => {
    if (!p || typeof p !== 'object') {
      throw new Error(`people[${i}] is not an object`);
    }
    const person = p as Record<string, unknown>;
    return {
      name: String(person.name ?? ''),
      company: String(person.company ?? ''),
      role: String(person.role ?? ''),
      why: String(person.why ?? ''),
      hook: String(person.hook ?? ''),
      score: clampScore(person.score),
      tags: Array.isArray(person.tags) ? person.tags.map(String) : [],
      linkedin_query: String(person.linkedin_query ?? ''),
      linkedin_url: normalizeLinkedInUrl(person.linkedin_url),
      message: String(person.message ?? ''),
    };
  });

  return { strategy: obj.strategy, people };
}

function normalizeLinkedInUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('linkedin.com/')) return `https://www.${trimmed}`;
  if (trimmed.startsWith('/in/')) return `https://www.linkedin.com${trimmed}`;
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return `https://www.linkedin.com/in/${trimmed}`;
  return undefined;
}

function clampScore(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? '0'), 10);
  if (Number.isNaN(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n)));
}
