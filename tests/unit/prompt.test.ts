import { buildPrompt } from '@/lib/prompt';
import type { OutreachInput } from '@/lib/types';

const BASE_INPUT: OutreachInput = {
  background: 'CS student at University of Waterloo, ML focus.',
  roleType: 'Machine Learning Engineer Intern',
  goal: 'referral',
  term: 'Fall 2026',
  companies: ['OpenAI', 'Anthropic'],
  count: 6,
};

describe('buildPrompt', () => {
  it('injects all user-supplied fields into the prompt', () => {
    const out = buildPrompt(BASE_INPUT);
    expect(out).toContain('CS student at University of Waterloo');
    expect(out).toContain('Machine Learning Engineer Intern');
    expect(out).toContain('Fall 2026');
    expect(out).toContain('OpenAI, Anthropic');
    expect(out).toContain('Generate 6 LinkedIn outreach targets');
  });

  it('uses the goal map to translate goal codes to instructions', () => {
    expect(buildPrompt({ ...BASE_INPUT, goal: 'referral' })).toContain('get a referral');
    expect(buildPrompt({ ...BASE_INPUT, goal: 'advice' })).toContain('insider career advice');
    expect(buildPrompt({ ...BASE_INPUT, goal: 'both' })).toContain(
      'both a referral and insider recruiting advice',
    );
    expect(buildPrompt({ ...BASE_INPUT, goal: 'coffee' })).toContain('informational interview');
  });

  it('adds a live search grounding block when searchResults are provided', () => {
    const grounded = buildPrompt(BASE_INPUT, {
      searchResults: '[1] Company: OpenAI\n    LinkedIn: https://www.linkedin.com/in/x',
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
