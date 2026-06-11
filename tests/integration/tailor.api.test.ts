/**
 * @jest-environment node
 *
 * Route imports next/server, which needs Web globals — run under node env.
 * OpenRouter's `fetch` is replaced with a mock so no network calls happen.
 */
import { POST } from '@/app/api/tailor/route';

const RESUME = '\\documentclass{article}\\begin{document}Experience: Built APIs.\\end{document}';
const VALID_BODY = {
  job: { title: 'Backend Engineer', company: 'Stripe', description: 'Build payment APIs.' },
  resumeLatex: RESUME,
  openrouterKey: 'test-key',
};

function buildRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/tailor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Wrap a model payload in the OpenRouter chat-completion envelope. */
function envelope(payload: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
    }),
    { status: 200 },
  );
}

/**
 * Route the mock by which agent is calling, so the test is independent of the
 * order the concurrent writers happen to fire in.
 */
function mockOpenRouter() {
  global.fetch = jest.fn().mockImplementation((_url: string, init: { body: string }) => {
    const reqBody = JSON.parse(init.body) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMsg = reqBody.messages.find((m) => m.role === 'user')?.content ?? '';
    let payload: unknown;
    if (userMsg.includes('fact-checker')) {
      payload = { issues: [] };
    } else if (userMsg.includes('Write a cover letter')) {
      payload = { letterText: 'Dear Stripe', paragraphs: ['Dear Stripe'] };
    } else {
      payload = { tailoredLatex: 'TAILORED', changes: [] };
    }
    return Promise.resolve(envelope(payload));
  }) as unknown as typeof fetch;
}

const ORIGINAL_ENV = { ...process.env };
const originalFetch = global.fetch;

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = 'test-key';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

it('returns 400 when resumeLatex is too short', async () => {
  const res = await POST(buildRequest({ ...VALID_BODY, resumeLatex: 'x' }));
  expect(res.status).toBe(400);
});

it('returns 400 when the OpenRouter key is missing', async () => {
  delete process.env.OPENROUTER_API_KEY;
  const { openrouterKey, ...noKey } = VALID_BODY;
  const res = await POST(buildRequest(noKey));
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/openrouter/i);
});

it('returns tailored output on the happy path', async () => {
  mockOpenRouter();

  const res = await POST(buildRequest(VALID_BODY));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.tailoredLatex).toBe('TAILORED');
  expect(body.letterText).toBe('Dear Stripe');
  expect(body.qa.caught).toEqual([]);
});
