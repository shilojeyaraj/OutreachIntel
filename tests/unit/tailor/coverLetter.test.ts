/** @jest-environment node */
import { buildCoverLetterPrompt, parseCoverLetterResponse } from '@/lib/tailor/coverLetter';
import type { TailorJob } from '@/lib/tailor/types';

const JOB: TailorJob = {
  title: 'Backend Engineer',
  company: 'Stripe',
  description: 'Build payment APIs.',
};

describe('buildCoverLetterPrompt', () => {
  it('names the company and forbids fabrication', () => {
    const prompt = buildCoverLetterPrompt(JOB, 'warm');
    expect(prompt).toContain('Stripe');
    expect(prompt.toLowerCase()).toMatch(/do not (invent|add|fabricate)/);
    expect(prompt.toLowerCase()).toContain('warm');
  });

  it('asks for letterText and paragraphs', () => {
    const prompt = buildCoverLetterPrompt(JOB);
    expect(prompt).toContain('letterText');
    expect(prompt).toContain('paragraphs');
  });
});

describe('parseCoverLetterResponse', () => {
  it('parses a valid object and derives paragraphs when omitted', () => {
    const raw = JSON.stringify({ letterText: 'Para one.\n\nPara two.' });
    const out = parseCoverLetterResponse(raw);
    expect(out.letterText).toContain('Para one.');
    expect(out.paragraphs).toHaveLength(2);
  });

  it('uses provided paragraphs when present', () => {
    const raw = JSON.stringify({ letterText: 'x', paragraphs: ['a', 'b', 'c'] });
    const out = parseCoverLetterResponse(raw);
    expect(out.paragraphs).toEqual(['a', 'b', 'c']);
  });

  it('throws when letterText is missing', () => {
    expect(() => parseCoverLetterResponse('{"paragraphs":[]}')).toThrow();
  });
});
