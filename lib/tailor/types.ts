export type Tone = 'warm' | 'formal' | 'concise';

export interface TailorJob {
  title: string;
  company: string;
  description: string;
}

export interface TailorInput {
  job: TailorJob;
  resumeLatex: string;
  tone?: Tone;
  anthropicKey?: string;
}

export interface ResumeChange {
  section: string;
  before: string;
  after: string;
  why: string;
}

export interface TailoredResume {
  tailoredLatex: string;
  changes: ResumeChange[];
}

export interface CoverLetter {
  letterText: string;
  paragraphs: string[];
}

export type QAIssueType = 'fabrication' | 'weak' | 'tone' | 'offtarget';
export type QATarget = 'resume' | 'cover';

export interface QAIssue {
  type: QAIssueType;
  target: QATarget;
  quote: string;
  explanation: string;
}

export interface QAReport {
  caught: QAIssue[];
  fixed: QAIssue[];
  remaining: QAIssue[];
  unavailable?: boolean;
}

export interface TailorResponse {
  tailoredLatex: string;
  changes: ResumeChange[];
  letterText: string;
  qa: QAReport;
  resumeError?: string;
  coverError?: string;
  warning?: string;
}

export const VALID_TONES: Tone[] = ['warm', 'formal', 'concise'];
