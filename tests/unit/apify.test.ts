/**
 * @jest-environment node
 *
 * The Apify client uses the Web `Response` global (Node 18+). jsdom doesn't
 * polyfill it, so this file opts into the node environment.
 */
import { formatHitsForPrompt, searchLinkedInTargets, type SearchHit } from '@/lib/apify';

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
        persona: 'health tech product managers',
        background: 'b',
        companies: ['Verily'],
      }),
    ).rejects.toThrow(/APIFY_API_TOKEN/);
  });

  it('filters to linkedin.com/in URLs and labels hits with the target org', async () => {
    process.env.APIFY_API_TOKEN = 'test-token';

    const fakeDataset = [
      {
        organicResults: [
          { title: 'Real Person', url: 'https://www.linkedin.com/in/realperson', description: 'd' },
          {
            title: 'Company page',
            url: 'https://www.linkedin.com/company/verily',
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
      persona: 'health tech product managers and founders',
      background: 'University of Waterloo, moving into health tech PM',
      companies: ['Verily'],
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].url).toBe('https://www.linkedin.com/in/realperson');
    expect(hits[0].company).toBe('Verily');
  });

  it('builds a persona-driven query when no companies are given', async () => {
    process.env.APIFY_API_TOKEN = 'test-token';

    let sentBody: { queries?: string } = {};
    global.fetch = jest.fn().mockImplementation((_url: string, init?: { body?: string }) => {
      sentBody = init?.body ? JSON.parse(init.body) : {};
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              organicResults: [
                {
                  title: 'PM Person',
                  url: 'https://www.linkedin.com/in/pmperson',
                  description: 'd',
                },
              ],
            },
          ]),
          { status: 200 },
        ),
      );
    }) as unknown as typeof fetch;

    const hits = await searchLinkedInTargets({
      persona: 'health tech product managers and founders',
      background: 'moving into health tech PM',
      companies: [],
      searchHints: '"product manager" OR founder',
    });

    expect(sentBody.queries).toContain('site:linkedin.com/in');
    expect(sentBody.queries).toContain('product manager');
    expect(hits).toHaveLength(1);
    expect(hits[0].url).toBe('https://www.linkedin.com/in/pmperson');
  });
});
