import type { Job, RawLinkedInJob } from '@/lib/types';

export function normalizeLinkedInJobs(raw: RawLinkedInJob[]): Job[] {
  return raw
    .filter((j) => j && j.title && j.company && j.jobUrl)
    .map((j, i) => ({
      id: `li-${i}`,
      title: (j.title || '').trim(),
      company: (j.company || '').trim(),
      location: (j.location || 'Remote / Unknown').trim(),
      postedAt: (j.publishedAt || 'Recent').trim(),
      source: 'LinkedIn' as const,
      applyUrl: j.jobUrl!,
      description: (j.description || '').trim(),
    }));
}

export function deduplicateJobs(jobs: Job[]): Job[] {
  const seen = new Set<string>();
  const out: Job[] = [];
  for (const j of jobs) {
    const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...j, id: `li-${out.length}` });
  }
  return out;
}
