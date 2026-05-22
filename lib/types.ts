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
}

export interface OutreachResponse {
  strategy: string;
  people: Person[];
  grounded?: boolean;
  apifyWarning?: string;
}

export interface ApiError {
  error: string;
}
