'use client';

import { useState } from 'react';
import type { ResumeChange } from '@/lib/tailor/types';

interface Props {
  tailoredLatex: string;
  changes: ResumeChange[];
  error?: string;
}

export default function ResumeOutput({ tailoredLatex, changes, error }: Props) {
  const [copied, setCopied] = useState(false);

  if (!tailoredLatex) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        {error || 'No tailored resume was produced.'}
      </div>
    );
  }

  async function copy() {
    await navigator.clipboard.writeText(tailoredLatex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tailored resume (LaTeX)</h2>
        <button
          type="button"
          onClick={copy}
          className="rounded bg-black px-3 py-1 text-sm text-white hover:bg-gray-800"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-96 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
        {tailoredLatex}
      </pre>
      {changes.length > 0 && (
        <details className="rounded border border-gray-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            What changed &amp; why ({changes.length})
          </summary>
          <ul className="mt-2 space-y-2 text-sm">
            {changes.map((c, i) => (
              <li key={i} className="border-l-2 border-gray-300 pl-2">
                <span className="font-medium">{c.section}:</span> {c.why}
                <div className="text-gray-500">
                  <span className="line-through">{c.before}</span> → {c.after}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
