import { buildPrompt } from '@/lib/prompt';
import type { OutreachInput } from '@/lib/types';

const BASE_INPUT: OutreachInput = {
  persona: 'Health tech product managers and founders',
  background: 'Mechatronics student at University of Waterloo moving toward health tech PM.',
  goal: 'Get advice on breaking into health tech product management',
  companies: ['Verily', 'Oscar Health'],
  region: 'Toronto, Canada',
  count: 6,
};

describe('buildPrompt', () => {
  it('injects all user-supplied fields into the prompt', () => {
    const out = buildPrompt(BASE_INPUT);
    expect(out).toContain('Health tech product managers and founders');
    expect(out).toContain('University of Waterloo moving toward health tech PM');
    expect(out).toContain('Get advice on breaking into health tech product management');
    expect(out).toContain('Verily, Oscar Health');
    expect(out).toContain('Toronto, Canada');
    expect(out).toContain('Generate 6 LinkedIn outreach targets');
  });

  it('omits the region line when no region is given', () => {
    const out = buildPrompt({ ...BASE_INPUT, region: undefined });
    expect(out).not.toMatch(/Region focus:/i);
  });

  it('notes when no focus organizations are given', () => {
    const out = buildPrompt({ ...BASE_INPUT, companies: [] });
    expect(out).toContain('no specific organizations');
  });

  it('includes a priority guidance block only when priorityHints are provided', () => {
    const withHints = buildPrompt(BASE_INPUT, { priorityHints: 'Rank founders first.' });
    expect(withHints).toContain('PRIORITY GUIDANCE');
    expect(withHints).toContain('Rank founders first.');

    const withoutHints = buildPrompt(BASE_INPUT);
    expect(withoutHints).not.toContain('PRIORITY GUIDANCE');
  });

  it('adds a live search grounding block when searchResults are provided', () => {
    const grounded = buildPrompt(BASE_INPUT, {
      searchResults: '[1] Company: Verily\n    LinkedIn: https://www.linkedin.com/in/x',
    });
    expect(grounded).toContain('LIVE LINKEDIN SEARCH RESULTS');
    expect(grounded).toContain('linkedin.com/in/x');
    // The grounded variant must instruct the model to copy URLs verbatim.
    expect(grounded).toContain('VERBATIM');
  });

  it('falls back to "no verified URLs" guidance when searchResults are absent', () => {
    const ungrounded = buildPrompt(BASE_INPUT);
    expect(ungrounded).not.toContain('LIVE LINKEDIN SEARCH RESULTS');
    expect(ungrounded).toContain('empty string');
  });
});
