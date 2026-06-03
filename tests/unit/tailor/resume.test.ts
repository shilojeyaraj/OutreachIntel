/**
 * @jest-environment node
 */
import { buildResumeTailorPrompt, parseResumeResponse } from '@/lib/tailor/resume';
import type { TailorJob } from '@/lib/tailor/types';

const JOB: TailorJob = {
  title: 'ML Engineer Intern',
  company: 'Anthropic',
  description: 'Work on LLM systems and inference.',
};

describe('buildResumeTailorPrompt', () => {
  it('includes the job title and forbids fabrication', () => {
    const prompt = buildResumeTailorPrompt(JOB, 'concise');
    expect(prompt).toContain('ML Engineer Intern');
    expect(prompt.toLowerCase()).toMatch(/do not (invent|add|fabricate)/);
    expect(prompt.toLowerCase()).toContain('concise');
  });

  it('asks for the tailoredLatex and changes fields', () => {
    const prompt = buildResumeTailorPrompt(JOB);
    expect(prompt).toContain('tailoredLatex');
    expect(prompt).toContain('changes');
  });
});

describe('parseResumeResponse', () => {
  it('parses a valid JSON object', () => {
    const raw = JSON.stringify({
      tailoredLatex: '\\documentclass{article}',
      changes: [{ section: 'Skills', before: 'a', after: 'b', why: 'match' }],
    });
    const out = parseResumeResponse(raw);
    expect(out.tailoredLatex).toContain('documentclass');
    expect(out.changes).toHaveLength(1);
    expect(out.changes[0].section).toBe('Skills');
  });

  it('parses JSON wrapped in markdown fences with trailing commas', () => {
    const raw = '```json\n{"tailoredLatex":"x","changes":[],}\n```';
    const out = parseResumeResponse(raw);
    expect(out.tailoredLatex).toBe('x');
    expect(out.changes).toEqual([]);
  });

  it('defaults changes to an empty array when missing', () => {
    const out = parseResumeResponse('{"tailoredLatex":"x"}');
    expect(out.changes).toEqual([]);
  });

  it('throws when no JSON object is present', () => {
    expect(() => parseResumeResponse('no json here')).toThrow();
  });
});
