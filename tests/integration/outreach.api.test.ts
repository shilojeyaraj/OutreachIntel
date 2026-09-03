/**
 * @jest-environment node
 *
 * Integration test stub for POST /api/outreach.
 *
 * The route handler imports `next/server`, which constructs Web `Request`
 * objects at module load. jsdom doesn't expose those globals, so this file
 * runs under the node environment where Node 18+ provides them natively.
 *
 * Apify is disabled by leaving APIFY_API_TOKEN unset; OpenRouter's `fetch`
 * is replaced with a mock so no network calls happen.
 */
import { POST } from '@/app/api/outreach/route';

const VALID_BODY = {
  persona: 'Health tech product managers, product leaders, and founders',
  background:
    '2nd year Mechatronics Engineering at University of Waterloo, moving toward health tech PM. ML internships and a FinTech founding-engineer role.',
  goal: 'Get advice on breaking into health tech product management and a referral where it fits',
  companies: ['Verily', 'Oscar Health'],
  count: 3,
};

function buildRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/outreach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/outreach', () => {
  const ORIGINAL_ENV = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    delete process.env.APIFY_API_TOKEN;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns 400 when background is too short', async () => {
    const res = await POST(buildRequest({ ...VALID_BODY, background: 'too short' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/background/i);
  });

  it('returns 400 when persona is too short', async () => {
    const res = await POST(buildRequest({ ...VALID_BODY, persona: 'PMs' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/persona/i);
  });

  it('accepts an empty companies list', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify({ strategy: 's', people: [] }) },
            },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const res = await POST(buildRequest({ ...VALID_BODY, companies: [] }));
    expect(res.status).toBe(200);
  });

  it('returns 500 when OPENROUTER_API_KEY is missing', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const res = await POST(buildRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/OPENROUTER_API_KEY/);
  });

  it('returns parsed payload when OpenRouter responds with valid JSON', async () => {
    const modelPayload = {
      strategy: 'Lead with Waterloo alumni.',
      people: [
        {
          name: 'Ada Lovelace',
          company: 'OpenAI',
          role: 'Recruiter',
          why: 'Active intern recruiter',
          hook: 'Both Waterloo grads',
          score: 9,
          tags: ['UWaterloo Alum'],
          linkedin_query: 'Ada Lovelace OpenAI',
          linkedin_url: 'https://www.linkedin.com/in/ada',
          message: 'Hi Ada, I am a 2nd year student at Waterloo...',
        },
      ],
    };

    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(modelPayload) } }],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const res = await POST(buildRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.strategy).toBe('Lead with Waterloo alumni.');
    expect(body.people).toHaveLength(1);
    expect(body.people[0].name).toBe('Ada Lovelace');
    // grounded flag is only set when Apify ran — here it should be absent.
    expect(body.grounded).toBeUndefined();
  });

  // TODO: cover OpenRouter 5xx propagation, finish_reason=length truncation,
  // malformed JSON in `message.content`, and the APIFY_API_TOKEN happy path.

  // --- X account enrichment ---

  const X_MODEL_PAYLOAD = {
    strategy: 'Lead with Waterloo alumni.',
    people: [
      { name: 'Ada Lovelace', company: 'OpenAI', role: 'MLE', message: 'hi' },
      { name: 'Charles Babbage', company: 'OpenAI', role: 'SWE', message: 'hi' },
    ],
  };

  // Routes a fetch call to the right canned response based on its URL/body.
  function mockOutreachPipeline(opts: { xDataset?: unknown; xStatus?: number }) {
    global.fetch = jest.fn().mockImplementation((url: string, init?: { body?: string }) => {
      const u = String(url);
      if (u.includes('openrouter.ai')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [
                { finish_reason: 'stop', message: { content: JSON.stringify(X_MODEL_PAYLOAD) } },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      // Apify: distinguish the LinkedIn pass from the X pass by the query body.
      const body = init?.body ? JSON.parse(init.body) : {};
      const queries = String(body.queries ?? '');
      if (queries.includes('site:x.com')) {
        return Promise.resolve(
          new Response(JSON.stringify(opts.xDataset ?? []), { status: opts.xStatus ?? 200 }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 })); // LinkedIn pass
    }) as unknown as typeof fetch;
  }

  it('attaches a real X handle on a name match and falls back otherwise', async () => {
    process.env.APIFY_API_TOKEN = 'apify-test-token';
    mockOutreachPipeline({
      xDataset: [
        {
          organicResults: [
            {
              title: 'Ada Lovelace (@adalovelace) / X',
              url: 'https://x.com/adalovelace',
              description: '',
            },
          ],
        },
        { organicResults: [{ title: 'Search / X', url: 'https://x.com/search?q=charles' }] },
      ],
    });

    const res = await POST(buildRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.people[0].x_handle).toBe('adalovelace');
    expect(body.people[0].x_url).toBe('https://x.com/adalovelace');
    // No profile match for the second person — only the fallback search link.
    expect(body.people[1].x_handle).toBeUndefined();
    expect(body.people[1].x_url).toBeUndefined();
    expect(body.people[1].x_query).toContain('x.com/search');
  });

  it('returns 200 with x_query fallbacks and a warning when the X search fails', async () => {
    process.env.APIFY_API_TOKEN = 'apify-test-token';
    mockOutreachPipeline({ xStatus: 500 });

    const res = await POST(buildRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.xSearchWarning).toBeTruthy();
    expect(body.people[0].x_handle).toBeUndefined();
    expect(body.people[0].x_query).toContain('x.com/search');
  });
});
