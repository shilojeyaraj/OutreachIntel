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
  background:
    '2nd year Mechatronics Engineering at University of Waterloo, ML focus, PyTorch and CUDA experience.',
  roleType: 'Machine Learning Engineer Intern',
  goal: 'referral',
  term: 'Fall 2026',
  companies: ['OpenAI', 'Anthropic'],
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
});
