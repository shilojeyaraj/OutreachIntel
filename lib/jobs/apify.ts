import { ApifyClient } from 'apify-client';
import type { PostedWithin, RawLinkedInJob } from '@/lib/types';
import { POSTED_WITHIN_TO_TPR } from '@/lib/types';

const ACTOR_ID = 'curious_coder/linkedin-jobs-scraper';

export interface ScrapeOptions {
  queries: string[];
  locations: string[];
  apiKey: string;
  postedWithin?: PostedWithin;
  perUrl?: number;
  timeoutMs?: number;
}

function buildSearchUrls(
  queries: string[],
  locations: string[],
  postedWithin: PostedWithin,
): string[] {
  const tpr = POSTED_WITHIN_TO_TPR[postedWithin];
  return queries.flatMap((q) =>
    locations.map((loc) => {
      const encoded = encodeURIComponent(q.trim());
      const locEncoded = encodeURIComponent(loc.trim());
      return `https://www.linkedin.com/jobs/search/?keywords=${encoded}&location=${locEncoded}&f_TPR=${tpr}&sortBy=DD`;
    }),
  );
}

export async function scrapeLinkedInJobs(opts: ScrapeOptions): Promise<RawLinkedInJob[]> {
  const {
    queries,
    locations,
    apiKey,
    postedWithin = '24h',
    perUrl = 25,
    timeoutMs = 180_000,
  } = opts;

  if (!apiKey) throw new Error('Apify API key is required');
  if (queries.length === 0) throw new Error('At least one role query is required');
  if (locations.length === 0) throw new Error('At least one location is required');

  const client = new ApifyClient({ token: apiKey });
  const urls = buildSearchUrls(queries, locations, postedWithin);

  const run = await client.actor(ACTOR_ID).call(
    {
      urls,
      count: perUrl,
      scrapeCompany: false,
    },
    { waitSecs: Math.ceil(timeoutMs / 1000) },
  );

  if (!run?.defaultDatasetId) {
    throw new Error('Apify run did not produce a dataset');
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return items as unknown as RawLinkedInJob[];
}
