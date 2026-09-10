/**
 * @jest-environment node
 *
 * The Apify client uses the Web `Response` global (Node 18+). jsdom doesn't
 * polyfill it, so this file opts into the node environment.
 */
import {
  buildHarvestQueries,
  formatHitsForPrompt,
  parseProfileFromHit,
  searchLinkedInTargets,
  type SearchHit,
} from '@/lib/apify';

describe('formatHitsForPrompt', () => {
  it('returns a fallback string when there are no hits', () => {
    expect(formatHitsForPrompt([])).toMatch(/no live search results/i);
  });

  it('numbers each hit and strips the "| LinkedIn" suffix from titles', () => {
    const hits: SearchHit[] = [
      {
        title: 'Ada Lovelace - Recruiter at OpenAI | LinkedIn',
        url: 'https://www.linkedin.com/in/adalovelace',
        description: 'University of Waterloo  alumni\n recruiter.',
        company: 'OpenAI',
      },
    ];
    const out = formatHitsForPrompt(hits);
    expect(out).toContain('[1] Company: OpenAI');
    expect(out).toContain('Ada Lovelace - Recruiter at OpenAI');
    expect(out).not.toContain('| LinkedIn');
    // Description whitespace is collapsed so the prompt stays compact.
    expect(out).toContain('University of Waterloo alumni recruiter.');
  });
});

describe('parseProfileFromHit', () => {
  it('splits "Name - Role - Company | LinkedIn" into fields', () => {
    const p = parseProfileFromHit({
      title: 'Jane Doe - Senior Product Manager - Verily | LinkedIn',
      url: 'https://www.linkedin.com/in/janedoe',
      description: 'Building clinical tools.',
    });
    expect(p).toEqual({
      name: 'Jane Doe',
      role: 'Senior Product Manager',
      company: 'Verily',
      linkedin_url: 'https://www.linkedin.com/in/janedoe',
      snippet: 'Building clinical tools.',
    });
  });

  it('handles "Name – Role at Company" and normalizes the profile URL', () => {
    const p = parseProfileFromHit(
      {
        title: 'John Smith – Product Lead at Epic Systems | LinkedIn',
        url: 'https://linkedin.com/in/JohnSmith/?originalSubdomain=ca',
        description: '',
      },
      'fallback co',
    );
    expect(p?.name).toBe('John Smith');
    expect(p?.role).toBe('Product Lead');
    expect(p?.company).toBe('Epic Systems');
    expect(p?.linkedin_url).toBe('https://www.linkedin.com/in/johnsmith');
  });

  it('uses the fallback company when the title has no company', () => {
    const p = parseProfileFromHit(
      { title: 'Amy Lin | LinkedIn', url: 'https://www.linkedin.com/in/amylin', description: '' },
      'Tempus',
    );
    expect(p?.name).toBe('Amy Lin');
    expect(p?.company).toBe('Tempus');
  });

  it('rejects non-profile URLs and junk titles', () => {
    expect(
      parseProfileFromHit({
        title: 'Product Manager jobs | LinkedIn',
        url: 'https://www.linkedin.com/jobs/product-manager',
        description: '',
      }),
    ).toBeNull();
    expect(
      parseProfileFromHit({
        title: '10 tips for PMs in 2026',
        url: 'https://www.linkedin.com/in/someone',
        description: '',
      }),
    ).toBeNull();
  });
});

describe('buildHarvestQueries', () => {
  it('makes one company-tagged query each plus a category net per term', () => {
    const qs = buildHarvestQueries(['Epic', 'Verily'], ['digital health pm'], 'product manager');
    expect(qs).toHaveLength(3);
    expect(qs[0]).toEqual({
      q: 'site:linkedin.com/in "Epic" (product manager)',
      company: 'Epic',
    });
    expect(qs[2].company).toBeUndefined();
    expect(qs[2].q).toContain('"digital health pm"');
  });
});

describe('searchLinkedInTargets', () => {
  const ORIGINAL_TOKEN = process.env.APIFY_API_TOKEN;

  const originalFetch = global.fetch;

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) {
      delete process.env.APIFY_API_TOKEN;
    } else {
      process.env.APIFY_API_TOKEN = ORIGINAL_TOKEN;
    }
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('throws when APIFY_API_TOKEN is not set', async () => {
    delete process.env.APIFY_API_TOKEN;
    await expect(
      searchLinkedInTargets({
        background: 'b',
        companies: ['OpenAI'],
        roleType: 'MLE Intern',
      }),
    ).rejects.toThrow(/APIFY_API_TOKEN/);
  });

  it('filters to linkedin.com/in URLs in organicResults', async () => {
    process.env.APIFY_API_TOKEN = 'test-token';

    const fakeDataset = [
      {
        organicResults: [
          { title: 'Real Person', url: 'https://www.linkedin.com/in/realperson', description: 'd' },
          {
            title: 'Company page',
            url: 'https://www.linkedin.com/company/openai',
            description: 'd',
          },
          { title: 'Blog post', url: 'https://example.com/blog', description: 'd' },
        ],
      },
    ];

    // jest.spyOn cannot wrap `fetch` in jsdom (it's a non-configurable
    // undici binding) — assign a mock directly instead.
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(fakeDataset), { status: 200 }),
      ) as unknown as typeof fetch;

    const hits = await searchLinkedInTargets({
      background: 'University of Waterloo CS',
      companies: ['OpenAI'],
      roleType: 'ML Engineer Intern',
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].url).toBe('https://www.linkedin.com/in/realperson');
    expect(hits[0].company).toBe('OpenAI');
  });
});
