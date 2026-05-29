import type { FitLabel } from '@/lib/types';

const colors: Record<FitLabel, string> = {
  Excellent: 'bg-green-500/15 text-green-300 border-green-500/40',
  Strong: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
  Moderate: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
  Weak: 'bg-red-500/15 text-red-300 border-red-500/40',
};

export function ScoreBadge({ score, label }: { score: number; label: FitLabel }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold ${colors[label]}`}
      title={label}
    >
      {score}/10
    </span>
  );
}
