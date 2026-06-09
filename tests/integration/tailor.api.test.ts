/**
 * @jest-environment node
 *
 * Route imports next/server, which needs Web globals — run under node env.
 * The Anthropic SDK is mocked so no network calls happen.
 */
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
    beta: { messages: { create: mockCreate } },
  })),
);

import { POST } from '@/app/api/tailor/route';

const RESUME = '\\documentclass{article}\\begin{document}Experience: Built APIs.\\end{document}';
const VALID_BODY = {
  job: { title: 'Backend Engineer', company: 'Stripe', description: 'Build payment APIs.' },
  resumeLatex: RESUME,
  anthropicKey: 'test-key',
};

function buildRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/tailor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function reply(obj: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

const ORIGINAL_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.clearAllMocks();
});

it('returns 400 when resumeLatex is too short', async () => {
  const res = await POST(buildRequest({ ...VALID_BODY, resumeLatex: 'x' }));
  expect(res.status).toBe(400);
});

it('returns 400 when the anthropic key is missing', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const { anthropicKey, ...noKey } = VALID_BODY;
  const res = await POST(buildRequest(noKey));
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/anthropic/i);
});

it('returns tailored output on the happy path', async () => {
  // calls in order: resume, cover, QA (no issues)
  mockCreate
    .mockResolvedValueOnce(reply({ tailoredLatex: 'TAILORED', changes: [] }))
    .mockResolvedValueOnce(reply({ letterText: 'Dear Stripe', paragraphs: ['Dear Stripe'] }))
    .mockResolvedValueOnce(reply({ issues: [] }));

  const res = await POST(buildRequest(VALID_BODY));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.tailoredLatex).toBe('TAILORED');
  expect(body.letterText).toBe('Dear Stripe');
  expect(body.qa.caught).toEqual([]);
});
