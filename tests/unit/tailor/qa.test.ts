/** @jest-environment node */
import { buildQAPrompt, parseQAResponse } from '@/lib/tailor/qa';
import type { TailorJob } from '@/lib/tailor/types';

const JOB: TailorJob = { title: 'SWE', company: 'Acme', description: 'code' };

describe('buildQAPrompt', () => {
  it('includes both drafts and the fabrication rule', () => {
    const prompt = buildQAPrompt(JOB, '\\resume tailored', 'Dear Acme');
    expect(prompt).toContain('\\resume tailored');
    expect(prompt).toContain('Dear Acme');
    expect(prompt.toLowerCase()).toContain('fabrication');
  });
});

describe('parseQAResponse', () => {
  it('parses issues and normalizes type/target', () => {
    const raw = JSON.stringify({
      issues: [
        {
          type: 'fabrication',
          target: 'resume',
          quote: 'led team of 50',
          explanation: 'not in resume',
        },
        { type: 'weird', target: 'elsewhere', quote: 'x', explanation: 'y' },
      ],
    });
    const out = parseQAResponse(raw);
    expect(out).toHaveLength(2);
    expect(out[0].type).toBe('fabrication');
    expect(out[0].target).toBe('resume');
    // unknown type/target fall back to safe defaults
    expect(out[1].type).toBe('weak');
    expect(out[1].target).toBe('resume');
  });

  it('returns an empty array when issues is missing or empty', () => {
    expect(parseQAResponse('{"issues":[]}')).toEqual([]);
    expect(parseQAResponse('{}')).toEqual([]);
  });

  it('throws on non-JSON', () => {
    expect(() => parseQAResponse('garbage')).toThrow();
  });
});
