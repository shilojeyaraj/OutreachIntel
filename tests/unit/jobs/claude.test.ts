/** @jest-environment node */
// claude.ts imports @anthropic-ai/sdk, which touches `fetch` at import time;
// jsdom lacks it, so this suite runs under the node environment.
import { buildRankingPrompt, parseRankingResponse } from '@/lib/jobs/claude';
import type { Job } from '@/lib/types';

const JOB: Job = {
  id: '1',
  title: 'ML Engineer Intern',
  company: 'Anthropic',
  location: 'Remote',
  postedAt: '2026-06-01',
  source: 'LinkedIn',
  applyUrl: 'https://example.com/job/1',
  description: 'Work on LLM systems.',
};

describe('buildRankingPrompt', () => {
  it('includes the job, the schema, and the exact job count', () => {
    const prompt = buildRankingPrompt([JOB], 'Strong junior, PyTorch.');
    expect(prompt).toContain('ML Engineer Intern');
    expect(prompt).toContain('Anthropic');
    expect(prompt).toContain('fitScore');
    expect(prompt).toContain('exactly 1 entries');
  });

  it('falls back to a placeholder when a description is missing', () => {
    const prompt = buildRankingPrompt([{ ...JOB, description: '' }], 'cv');
    expect(prompt).toContain('(no description provided)');
  });
});

describe('parseRankingResponse', () => {
  it('parses a clean JSON array', () => {
    const raw = JSON.stringify([
      {
        index: 1,
        fitScore: 8,
        fitLabel: 'Strong',
        rationale: 'good',
        strengths: ['a'],
        gaps: ['b'],
        seniorityNote: 'mid',
      },
    ]);
    const out = parseRankingResponse(raw);
    expect(out).toHaveLength(1);
    expect(out[0].fitLabel).toBe('Strong');
    expect(out[0].strengths).toEqual(['a']);
  });

  it('strips markdown fences and trailing commas', () => {
    const raw = '```json\n[{"index":1,"fitScore":9,"fitLabel":"Excellent","rationale":"x",}]\n```';
    const out = parseRankingResponse(raw);
    expect(out[0].fitLabel).toBe('Excellent');
  });

  it('normalizes each fitLabel prefix', () => {
    const raw = JSON.stringify([
      { fitScore: 10, fitLabel: 'Excellent works' },
      { fitScore: 8, fitLabel: 'strong fit' },
      { fitScore: 6, fitLabel: 'Moderate-ish' },
      { fitScore: 2, fitLabel: 'weak match' },
    ]);
    const out = parseRankingResponse(raw);
    expect(out.map((r) => r.fitLabel)).toEqual(['Excellent', 'Strong', 'Moderate', 'Weak']);
  });

  it('derives fitLabel from the score when the label is unknown', () => {
    const raw = JSON.stringify([
      { fitScore: 9, fitLabel: '???' },
      { fitScore: 7, fitLabel: '' },
      { fitScore: 5, fitLabel: '' },
      { fitScore: 3, fitLabel: '' },
    ]);
    const out = parseRankingResponse(raw);
    expect(out.map((r) => r.fitLabel)).toEqual(['Excellent', 'Strong', 'Moderate', 'Weak']);
  });

  it('clamps out-of-range and non-numeric scores', () => {
    const raw = JSON.stringify([
      { fitScore: 99, fitLabel: 'Strong' },
      { fitScore: -4, fitLabel: 'Weak' },
      { fitScore: 'not a number', fitLabel: 'Moderate' },
    ]);
    const out = parseRankingResponse(raw);
    expect(out[0].fitScore).toBe(10);
    expect(out[1].fitScore).toBe(1);
    expect(out[2].fitScore).toBe(5); // NaN falls back to 5
  });

  it('defaults missing array fields to empty arrays', () => {
    const out = parseRankingResponse('[{"fitScore":6,"fitLabel":"Moderate"}]');
    expect(out[0].strengths).toEqual([]);
    expect(out[0].gaps).toEqual([]);
  });

  it('throws when no JSON array is present', () => {
    expect(() => parseRankingResponse('no array here')).toThrow();
  });

  it('throws when an entry is not an object', () => {
    expect(() => parseRankingResponse('[1, 2]')).toThrow();
  });
});
