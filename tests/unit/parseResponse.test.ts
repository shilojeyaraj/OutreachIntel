import { parseModelJSON } from '@/lib/parseResponse';

const VALID_PAYLOAD = {
  strategy: 'Test strategy',
  people: [
    {
      name: 'Ada Lovelace',
      company: 'OpenAI',
      role: 'Recruiter',
      why: 'Active on intern hiring',
      hook: 'Both UWaterloo grads',
      score: 9,
      tags: ['UWaterloo Alum', 'Active Recruiter'],
      linkedin_query: 'Ada Lovelace OpenAI Waterloo',
      linkedin_url: 'https://www.linkedin.com/in/adalovelace',
      message: 'Hi Ada, I am a 2nd year student...',
    },
  ],
};

describe('parseModelJSON', () => {
  it('parses a clean JSON object', () => {
    const out = parseModelJSON(JSON.stringify(VALID_PAYLOAD));
    expect(out.strategy).toBe('Test strategy');
    expect(out.people).toHaveLength(1);
    expect(out.people[0].name).toBe('Ada Lovelace');
  });

  it('strips ```json fences before parsing', () => {
    const wrapped = '```json\n' + JSON.stringify(VALID_PAYLOAD) + '\n```';
    const out = parseModelJSON(wrapped);
    expect(out.people[0].company).toBe('OpenAI');
  });

  it('removes trailing commas before closing brackets', () => {
    // Trailing comma after the last people entry — common GPT slip-up.
    const malformed = `{"strategy":"s","people":[{"name":"A","company":"X","role":"r","why":"w","hook":"h","score":5,"tags":[],"linkedin_query":"q","message":"m"},]}`;
    const out = parseModelJSON(malformed);
    expect(out.people).toHaveLength(1);
  });

  it('throws when no JSON object is present', () => {
    expect(() => parseModelJSON('totally not json')).toThrow(/No JSON object found/);
  });

  it('clamps score to the 1-10 range and rounds', () => {
    const overflow = {
      ...VALID_PAYLOAD,
      people: [{ ...VALID_PAYLOAD.people[0], score: 42 }],
    };
    const underflow = {
      ...VALID_PAYLOAD,
      people: [{ ...VALID_PAYLOAD.people[0], score: -3 }],
    };
    const decimal = {
      ...VALID_PAYLOAD,
      people: [{ ...VALID_PAYLOAD.people[0], score: 7.6 }],
    };

    expect(parseModelJSON(JSON.stringify(overflow)).people[0].score).toBe(10);
    expect(parseModelJSON(JSON.stringify(underflow)).people[0].score).toBe(1);
    expect(parseModelJSON(JSON.stringify(decimal)).people[0].score).toBe(8);
  });

  it('defaults score to 5 when missing or NaN', () => {
    const missing = {
      ...VALID_PAYLOAD,
      people: [{ ...VALID_PAYLOAD.people[0], score: 'banana' }],
    };
    expect(parseModelJSON(JSON.stringify(missing)).people[0].score).toBe(5);
  });

  it('normalizes various linkedin_url shapes to full URLs', () => {
    const shapes = [
      'adalovelace', // bare handle
      '/in/adalovelace', // path
      'linkedin.com/in/adalovelace', // no scheme
      'https://www.linkedin.com/in/adalovelace', // full URL
    ];

    shapes.forEach((raw) => {
      const payload = {
        ...VALID_PAYLOAD,
        people: [{ ...VALID_PAYLOAD.people[0], linkedin_url: raw }],
      };
      const parsed = parseModelJSON(JSON.stringify(payload));
      expect(parsed.people[0].linkedin_url).toMatch(/linkedin\.com\/in\/adalovelace/);
    });
  });
});
