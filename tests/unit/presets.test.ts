import { PRESETS, getPreset } from '@/lib/presets';

describe('PRESETS', () => {
  it('includes the tech-internship, health-tech-pm, and custom presets', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['tech-internship', 'health-tech-pm', 'custom']));
  });

  it('gives every preset the fields the prompt and form depend on', () => {
    for (const p of PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(typeof p.personaPlaceholder).toBe('string');
      expect(typeof p.priorityHints).toBe('string');
      expect(typeof p.searchHints).toBe('string');
      expect(p.defaults).toEqual(
        expect.objectContaining({
          persona: expect.any(String),
          goal: expect.any(String),
          background: expect.any(String),
          region: expect.any(String),
        }),
      );
      expect(Array.isArray(p.defaults.companies)).toBe(true);
    }
  });

  it('keeps the alumni / former-intern priority ladder in the tech-internship preset', () => {
    const tech = getPreset('tech-internship');
    expect(tech.priorityHints.toLowerCase()).toContain('alumni');
    expect(tech.priorityHints.toLowerCase()).toContain('former intern');
    expect(tech.defaults.companies.length).toBeGreaterThan(0);
  });

  it('points the health-tech-pm preset at product roles and founders', () => {
    const htpm = getPreset('health-tech-pm');
    expect(htpm.defaults.persona.toLowerCase()).toContain('product');
    expect(htpm.priorityHints.toLowerCase()).toContain('founder');
    expect(htpm.searchHints.toLowerCase()).toContain('product manager');
    expect(htpm.defaults.companies).toEqual(expect.arrayContaining(['Verily']));
  });
});

describe('getPreset', () => {
  it('returns the requested preset by id', () => {
    expect(getPreset('health-tech-pm').id).toBe('health-tech-pm');
  });

  it('falls back to the custom (no-hints) preset for an unknown id', () => {
    const fallback = getPreset('does-not-exist');
    expect(fallback.id).toBe('custom');
    expect(fallback.priorityHints).toBe('');
    expect(fallback.searchHints).toBe('');
  });

  it('falls back to custom when no id is given', () => {
    expect(getPreset(undefined).id).toBe('custom');
  });
});
