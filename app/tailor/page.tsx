'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import ResumeOutput from '@/components/tailor/ResumeOutput';
import QAReportPanel from '@/components/tailor/QAReportPanel';
import type { TailorResponse, Tone } from '@/lib/tailor/types';
import { VALID_TONES } from '@/lib/tailor/types';

// react-pdf cannot run during SSR.
const CoverLetterOutput = dynamic(() => import('@/components/tailor/CoverLetterOutput'), {
  ssr: false,
});

const RESUME_KEY = 'tailor:resumeLatex';

export default function TailorPage() {
  const [resumeLatex, setResumeLatex] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [description, setDescription] = useState('');
  const [tone, setTone] = useState<Tone>('warm');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TailorResponse | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(RESUME_KEY);
    if (saved) setResumeLatex(saved);
  }, []);

  function persistResume(v: string) {
    setResumeLatex(v);
    localStorage.setItem(RESUME_KEY, v);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/tailor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: { title, company, description },
          resumeLatex,
          tone,
          ...(apiKey ? { openrouterKey: apiKey } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'Request failed');
        return;
      }
      setResult(body as TailorResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Tailor resume + cover letter</h1>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <input
            className="rounded border p-2"
            placeholder="Job title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <input
            className="rounded border p-2"
            placeholder="Company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
          />
        </div>
        <textarea
          className="h-28 w-full rounded border p-2"
          placeholder="Job description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <textarea
          className="h-48 w-full rounded border p-2 font-mono text-xs"
          placeholder="Paste your resume LaTeX source here"
          value={resumeLatex}
          onChange={(e) => persistResume(e.target.value)}
          required
        />
        <div className="flex items-center gap-3">
          <select
            className="rounded border p-2"
            value={tone}
            onChange={(e) => setTone(e.target.value as Tone)}
          >
            {VALID_TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            className="flex-1 rounded border p-2"
            placeholder="OpenRouter API key (optional if set on server)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? 'Tailoring…' : 'Tailor'}
        </button>
      </form>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {result.warning && (
            <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
              {result.warning}
            </div>
          )}
          <QAReportPanel qa={result.qa} />
          <ResumeOutput
            tailoredLatex={result.tailoredLatex}
            changes={result.changes}
            error={result.resumeError}
          />
          <CoverLetterOutput
            letterText={result.letterText}
            paragraphs={result.letterText ? result.letterText.split(/\n\s*\n/).filter(Boolean) : []}
            error={result.coverError}
          />
        </div>
      )}
    </main>
  );
}
