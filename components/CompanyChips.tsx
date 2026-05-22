'use client';

interface Props {
  options: readonly string[];
  selected: string[];
  onToggle: (company: string) => void;
}

export function CompanyChips({ options, selected, onToggle }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((company) => {
        const active = selected.includes(company);
        return (
          <button
            key={company}
            type="button"
            onClick={() => onToggle(company)}
            className={[
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'border-accent bg-accent/20 text-accent-hover'
                : 'border-border bg-surface text-slate-300 hover:border-accent/60 hover:text-white',
            ].join(' ')}
          >
            {company}
          </button>
        );
      })}
    </div>
  );
}
