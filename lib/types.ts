export type Goal = 'referral' | 'advice' | 'both' | 'coffee';

export type { VerticalId } from './verticals';

export interface OutreachInput {
  background: string;
  roleType: string;
  goal: Goal;
  term: string;
  companies: string[];
  count: number;
  // Which outreach vertical the presets + prompt priorities come from.
  // Defaults to 'ai-ml' when omitted (see lib/verticals.ts).
  vertical?: import('./verticals').VerticalId;
  // When true (only meaningful for bulk requests) each harvested profile is
  // scored + tagged by the LLM in batches. Off = raw harvested list, faster.
  rankWithAi?: boolean;
  // Optional per-request keys pasted into the UI. When absent the route falls
  // back to the server environment (OPENROUTER_API_KEY / APIFY_API_TOKEN).
  openrouterKey?: string;
  apifyToken?: string;
}

export const MIN_TARGETS = 3;
/** Largest list the bulk (Apollo-export) path will return. */
export const MAX_TARGETS = 250;
/** Above this the route switches from the curated single-shot path to bulk. */
export const SINGLE_SHOT_MAX = 12;
export const DEFAULT_TARGETS = 6;
export const DEFAULT_BULK_TARGETS = 60;

export interface Person {
  name: string;
  company: string;
  role: string;
  why: string;
  score: number;
  tags: string[];
  linkedin_query: string;
  linkedin_url?: string;
  // Present only on the curated (<= SINGLE_SHOT_MAX) path. Bulk rows omit them.
  hook?: string;
  message?: string;
  // First line of the LinkedIn search snippet — bulk rows keep this for context.
  snippet?: string;
  // X (Twitter) enrichment. x_query is always populated by the route; x_handle
  // and x_url are set only when a real profile is found and the name matches.
  x_handle?: string;
  x_url?: string;
  x_query?: string;
}

export interface OutreachResponse {
  strategy: string;
  people: Person[];
  grounded?: boolean;
  /** True when this came from the bulk harvest path (table + CSV, no messages). */
  bulk?: boolean;
  /** Bulk: how many unique profiles were harvested before truncating to count. */
  harvested?: number;
  apifyWarning?: string;
  xSearchWarning?: string;
  rankWarning?: string;
}

export interface ApiError {
  error: string;
}

// --- Job Finder (/jobs) ---

export type JobSource = 'LinkedIn';
export type FitLabel = 'Excellent' | 'Strong' | 'Moderate' | 'Weak';
export type PostedWithin = '24h' | '7d' | '30d';

export interface RawLinkedInJob {
  title?: string;
  company?: string;
  location?: string;
  publishedAt?: string;
  jobUrl?: string;
  description?: string;
  employmentType?: string;
  seniorityLevel?: string;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  postedAt: string;
  source: JobSource;
  applyUrl: string;
  description: string;
}

export interface RankingResult {
  index: number;
  fitScore: number;
  fitLabel: FitLabel;
  rationale: string;
  strengths: string[];
  gaps: string[];
  seniorityNote: string;
}

export type ScoredJob = Job & Omit<RankingResult, 'index'>;

export interface JobSearchInput {
  roles: string[];
  locations: string[];
  cvSummary: string;
  postedWithin?: PostedWithin;
  minFitScore?: number;
  apifyKey?: string;
  anthropicKey?: string;
}

export interface JobSearchResponse {
  jobs: ScoredJob[];
  total: number;
  returned: number;
  rankingFailed?: boolean;
  warning?: string;
}

export const POSTED_WITHIN_TO_TPR: Record<PostedWithin, string> = {
  '24h': 'r86400',
  '7d': 'r604800',
  '30d': 'r2592000',
};
