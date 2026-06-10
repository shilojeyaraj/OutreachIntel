'use client';

import type { QAReport } from '@/lib/tailor/types';

export default function QAReportPanel({ qa }: { qa: QAReport }) {
  if (qa.unavailable) {
    return (
      <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
        QA check was unavailable. Review the drafts manually before sending.
      </div>
    );
  }
  return (
    <section className="space-y-2 text-sm">
      <h2 className="text-lg font-semibold">QA report</h2>
      {qa.remaining.length > 0 && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-red-700">
          <p className="font-medium">⚠ Unresolved — review before sending:</p>
          <ul className="mt-1 list-disc pl-5">
            {qa.remaining.map((i, k) => (
              <li key={k}>
                <span className="font-medium">[{i.type}]</span> {i.explanation} —{' '}
                <span className="italic">&ldquo;{i.quote}&rdquo;</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {qa.fixed.length > 0 && (
        <div className="rounded border border-green-300 bg-green-50 p-3 text-green-700">
          <p className="font-medium">✓ Caught &amp; fixed ({qa.fixed.length}):</p>
          <ul className="mt-1 list-disc pl-5">
            {qa.fixed.map((i, k) => (
              <li key={k}>
                <span className="font-medium">[{i.type}]</span> {i.explanation}
              </li>
            ))}
          </ul>
        </div>
      )}
      {qa.remaining.length === 0 && qa.fixed.length === 0 && (
        <p className="text-green-700">✓ No issues found.</p>
      )}
    </section>
  );
}
