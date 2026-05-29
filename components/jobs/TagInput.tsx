'use client';

import { useState, type KeyboardEvent } from 'react';

export function TagInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  function commit(raw: string) {
    const value = raw.trim();
    if (!value) return;
    if (values.includes(value)) return;
    onChange([...values, value]);
    setDraft('');
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  function remove(idx: number) {
    onChange(values.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-background px-2 py-2">
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 rounded bg-accent/15 px-2 py-0.5 text-xs text-accent-hover"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-accent-hover/70 hover:text-white"
              aria-label={`Remove ${v}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => commit(draft)}
          placeholder={values.length === 0 ? placeholder : ''}
          className="min-w-[120px] flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 focus:outline-none"
        />
      </div>
    </div>
  );
}
