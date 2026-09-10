import { peopleToCsv } from '@/lib/csv';
import type { Person } from '@/lib/types';

function person(overrides: Partial<Person> = {}): Person {
  return {
    name: 'Jane Doe',
    company: 'Verily',
    role: 'Product Manager',
    why: '',
    score: 5,
    tags: [],
    linkedin_query: 'Jane Doe Verily',
    linkedin_url: 'https://www.linkedin.com/in/janedoe',
    ...overrides,
  };
}

describe('peopleToCsv', () => {
  it('emits a header row followed by one row per person', () => {
    const csv = peopleToCsv([person(), person({ name: 'Bob Roe' })]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(
      '"name","title","company","linkedin_url","score","tags","why","snippet"',
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"Jane Doe"');
    expect(lines[2]).toContain('"Bob Roe"');
  });

  it('escapes embedded quotes by doubling them', () => {
    const csv = peopleToCsv([person({ role: 'The "Best" PM' })]);
    expect(csv).toContain('"The ""Best"" PM"');
  });

  it('joins tags with a semicolon and never emits a bare comma break', () => {
    const csv = peopleToCsv([person({ tags: ['Founder', 'Ex-Epic'] })]);
    expect(csv).toContain('"Founder; Ex-Epic"');
  });

  it('renders a missing linkedin_url as an empty quoted cell', () => {
    const csv = peopleToCsv([person({ linkedin_url: undefined })]);
    expect(csv.split('\r\n')[1]).toContain('"Verily","",');
  });
});
