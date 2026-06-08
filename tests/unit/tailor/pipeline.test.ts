import { runTailorPipeline } from '@/lib/tailor/pipeline';
import type { TailorInput } from '@/lib/tailor/types';

jest.mock('@/lib/tailor/resume', () => ({ runResumeTailor: jest.fn() }));
jest.mock('@/lib/tailor/coverLetter', () => ({ runCoverLetter: jest.fn() }));
jest.mock('@/lib/tailor/qa', () => ({ runQA: jest.fn() }));

import { runResumeTailor } from '@/lib/tailor/resume';
import { runCoverLetter } from '@/lib/tailor/coverLetter';
import { runQA } from '@/lib/tailor/qa';

const mockResume = runResumeTailor as jest.Mock;
const mockCover = runCoverLetter as jest.Mock;
const mockQA = runQA as jest.Mock;

const INPUT: TailorInput = {
  job: { title: 'SWE', company: 'Acme', description: 'code' },
  resumeLatex: '\\documentclass{article}\\begin{document}x\\end{document}',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockResume.mockResolvedValue({ tailoredLatex: 'R1', changes: [] });
  mockCover.mockResolvedValue({ letterText: 'L1', paragraphs: ['L1'] });
});

it('returns drafts with empty QA when no issues are found', async () => {
  mockQA.mockResolvedValue([]);
  const out = await runTailorPipeline(INPUT, 'key');
  expect(out.tailoredLatex).toBe('R1');
  expect(out.letterText).toBe('L1');
  expect(out.qa.caught).toEqual([]);
  expect(out.qa.remaining).toEqual([]);
  expect(mockResume).toHaveBeenCalledTimes(1);
  expect(mockQA).toHaveBeenCalledTimes(1);
});

it('revises once and reports fixed vs remaining', async () => {
  const issue = { type: 'fabrication', target: 'resume', quote: 'led 50', explanation: 'no' };
  const stillBad = { type: 'fabrication', target: 'resume', quote: 'phd', explanation: 'no' };
  mockQA.mockResolvedValueOnce([issue]).mockResolvedValueOnce([stillBad]);
  mockResume.mockResolvedValueOnce({ tailoredLatex: 'R1', changes: [] }); // initial
  mockResume.mockResolvedValueOnce({ tailoredLatex: 'R2', changes: [] }); // revision

  const out = await runTailorPipeline(INPUT, 'key');
  expect(out.tailoredLatex).toBe('R2'); // revised draft used
  expect(out.qa.caught).toContainEqual(issue);
  expect(out.qa.remaining).toContainEqual(stillBad);
  expect(out.qa.fixed).toContainEqual(issue); // issue gone after revision => fixed
  expect(mockResume).toHaveBeenCalledTimes(2);
  expect(mockQA).toHaveBeenCalledTimes(2);
});

it('degrades to partial success when the resume writer fails', async () => {
  mockResume.mockRejectedValue(new Error('resume boom'));
  mockResume.mockRejectedValue(new Error('resume boom')); // retry also fails
  mockQA.mockResolvedValue([]);
  const out = await runTailorPipeline(INPUT, 'key');
  expect(out.tailoredLatex).toBe('');
  expect(out.resumeError).toMatch(/resume/i);
  expect(out.letterText).toBe('L1'); // cover still succeeded
});

it('marks QA unavailable when QA keeps failing', async () => {
  mockQA.mockRejectedValue(new Error('qa boom'));
  const out = await runTailorPipeline(INPUT, 'key');
  expect(out.qa.unavailable).toBe(true);
  expect(out.tailoredLatex).toBe('R1'); // drafts still returned
});
