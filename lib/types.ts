export type Goal = 'referral' | 'advice' | 'both' | 'coffee';

export interface OutreachInput {
  background: string;
  roleType: string;
  goal: Goal;
  term: string;
  companies: string[];
  count: number;
}

export const MIN_TARGETS = 3;
export const MAX_TARGETS = 12;
export const DEFAULT_TARGETS = 6;

export interface Person {
  name: string;
  company: string;
  role: string;
  why: string;
  hook: string;
  score: number;
  tags: string[];
  linkedin_query: string;
  linkedin_url?: string;
  message: string;
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
  apifyWarning?: string;
  xSearchWarning?: string;
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
