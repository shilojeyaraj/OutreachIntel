import type { Person } from './types';

/** RFC-4180-ish quoting: wrap in quotes and double any inner quotes. */
function cell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

const COLUMNS: { header: string; get: (p: Person) => unknown }[] = [
  { header: 'name', get: (p) => p.name },
  { header: 'title', get: (p) => p.role },
  { header: 'company', get: (p) => p.company },
  { header: 'linkedin_url', get: (p) => p.linkedin_url ?? '' },
  { header: 'score', get: (p) => p.score },
  { header: 'tags', get: (p) => p.tags.join('; ') },
  { header: 'why', get: (p) => p.why ?? '' },
  { header: 'snippet', get: (p) => p.snippet ?? '' },
];

/** Build a CSV string from people rows (header + one line each). */
export function peopleToCsv(people: Person[]): string {
  const lines = [COLUMNS.map((c) => cell(c.header)).join(',')];
  for (const p of people) {
    lines.push(COLUMNS.map((c) => cell(c.get(p))).join(','));
  }
  return lines.join('\r\n');
}
