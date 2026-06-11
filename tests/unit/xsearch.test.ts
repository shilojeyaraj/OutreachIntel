/** @jest-environment node */
import {
  buildXQuery,
  buildXSearchUrl,
  parseXHandle,
  matchHandleToPerson,
  searchXHandles,
  type XHit,
} from '@/lib/xsearch';

describe('buildXQuery', () => {
  it('quotes the name and restricts to X/Twitter', () => {
    const q = buildXQuery('Ada Lovelace', 'OpenAI');
    expect(q).toContain('"Ada Lovelace"');
    expect(q).toContain('OpenAI');
    expect(q).toContain('site:x.com OR site:twitter.com');
  });
});

describe('buildXSearchUrl', () => {
  it('builds an encoded people-search URL', () => {
    expect(buildXSearchUrl('Ada Lovelace', 'OpenAI')).toBe(
      'https://x.com/search?q=Ada%20Lovelace%20OpenAI&f=user',
    );
  });
});

describe('parseXHandle', () => {
  it('accepts real profile URLs and lowercases the handle', () => {
    expect(parseXHandle('https://x.com/jack')).toBe('jack');
    expect(parseXHandle('https://twitter.com/Jack')).toBe('jack');
    expect(parseXHandle('https://www.x.com/AdaL')).toBe('adal');
  });

  it('rejects non-profile and reserved paths', () => {
    expect(parseXHandle('https://x.com/search?q=ada')).toBeNull();
    expect(parseXHandle('https://x.com/jack/status/123')).toBeNull();
    expect(parseXHandle('https://x.com/hashtag/ai')).toBeNull();
    expect(parseXHandle('https://x.com/i/flow/login')).toBeNull();
    expect(parseXHandle('https://x.com/')).toBeNull();
    expect(parseXHandle('https://example.com/jack')).toBeNull();
    expect(parseXHandle('not a url')).toBeNull();
  });

  it('rejects handles that are too long or contain bad characters', () => {
    expect(parseXHandle('https://x.com/this_handle_is_too_long')).toBeNull();
    expect(parseXHandle('https://x.com/bad-handle')).toBeNull();
  });
});

describe('matchHandleToPerson', () => {
  const hits = (rows: Array<[string, string]>): XHit[] =>
    rows.map(([url, title]) => ({ url, title, description: '' }));

  it('attaches when the name matches the result title', () => {
    expect(
      matchHandleToPerson(
        { name: 'Ada Lovelace', company: 'OpenAI' },
        hits([['https://x.com/adalove', 'Ada Lovelace (@adalove) / X']]),
      ),
    ).toEqual({ handle: 'adalove', url: 'https://x.com/adalove' });
  });

  it('matches via the handle when the title is unhelpful', () => {
    expect(
      matchHandleToPerson(
        { name: 'Ada Lovelace', company: 'OpenAI' },
        hits([['https://x.com/ada_lovelace', 'Home / X']]),
      )?.handle,
    ).toBe('ada_lovelace');
  });

  it('rejects a profile that belongs to a different person', () => {
    expect(
      matchHandleToPerson(
        { name: 'Ada Lovelace', company: 'OpenAI' },
        hits([['https://x.com/somebody', 'Charles Babbage (@somebody) / X']]),
      ),
    ).toBeNull();
  });

  it('skips non-profile hits and returns null when nothing matches', () => {
    expect(
      matchHandleToPerson(
        { name: 'Ada Lovelace', company: 'OpenAI' },
        hits([['https://x.com/search?q=ada', 'Search / X']]),
      ),
    ).toBeNull();
  });

  it('returns null for empty hits', () => {
    expect(matchHandleToPerson({ name: 'Ada', company: 'OpenAI' }, [])).toBeNull();
  });
});

describe('searchXHandles', () => {
  const ORIGINAL_ENV = { ...process.env };
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('throws when APIFY_API_TOKEN is not set', async () => {
    delete process.env.APIFY_API_TOKEN;
    await expect(searchXHandles([{ name: 'Ada', company: 'OpenAI' }])).rejects.toThrow(/APIFY/);
  });

  it('returns [] for no targets without calling the network', async () => {
    process.env.APIFY_API_TOKEN = 'tok';
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect(await searchXHandles([])).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('groups organic hits by target index', async () => {
    process.env.APIFY_API_TOKEN = 'tok';
    const dataset = [
      { organicResults: [{ title: 'Ada (@ada) / X', url: 'https://x.com/ada', description: 'd' }] },
      { organicResults: [] },
    ];
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(dataset), { status: 200 }),
      ) as unknown as typeof fetch;

    const out = await searchXHandles([
      { name: 'Ada', company: 'OpenAI' },
      { name: 'Bob', company: 'Stripe' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0][0].url).toBe('https://x.com/ada');
    expect(out[1]).toEqual([]);
  });

  it('throws when Apify returns a non-2xx', async () => {
    process.env.APIFY_API_TOKEN = 'tok';
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('nope', { status: 500 })) as unknown as typeof fetch;
    await expect(searchXHandles([{ name: 'Ada', company: 'OpenAI' }])).rejects.toThrow(
      /Apify returned 500/,
    );
  });
});
