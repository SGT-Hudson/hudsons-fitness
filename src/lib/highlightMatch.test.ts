import { describe, it, expect } from 'vitest';
import { findMatchRange } from './highlightMatch';

// Every case here is stated as "the slice the range points at", not as raw
// numbers: the whole contract of `findMatchRange` is that its offsets index the
// ORIGINAL string, so slicing with them is the assertion that matters.
function matched(text: string, query: string): string | null {
  const r = findMatchRange(text, query);
  return r === null ? null : text.slice(r.start, r.end);
}

describe('findMatchRange', () => {
  it('matches at the very start of the string', () => {
    expect(findMatchRange('Pollo pechuga', 'pollo')).toEqual({ start: 0, end: 5 });
    expect(matched('Pollo pechuga', 'pollo')).toBe('Pollo');
  });

  it('matches in the middle of the string', () => {
    expect(findMatchRange('Pollo pechuga', 'pech')).toEqual({ start: 6, end: 10 });
    expect(matched('Pollo pechuga', 'pech')).toBe('pech');
  });

  it('returns null when nothing matches — the caller renders the plain string', () => {
    expect(findMatchRange('Pollo pechuga', 'avena')).toBeNull();
  });

  it('returns null for a blank query', () => {
    expect(findMatchRange('Pollo pechuga', '')).toBeNull();
    expect(findMatchRange('Pollo pechuga', '   ')).toBeNull();
  });

  it('treats regex metacharacters as literal text, and never throws', () => {
    // `new RegExp('(')` throws outright; `.` and `*` would match wildly.
    expect(() => findMatchRange('Aceite (virgen extra)', '(')).not.toThrow();
    expect(matched('Aceite (virgen extra)', '(virgen')).toBe('(virgen');
    expect(matched('Leche 1.5% materia grasa', '1.5')).toBe('1.5');
    expect(matched('Leche 1.5% materia grasa', '1x5')).toBeNull();
    // A lone "." must not match the first character of anything.
    expect(matched('Pollo pechuga', '.')).toBeNull();
    expect(matched('Pollo pechuga', '*')).toBeNull();
    expect(matched('Arroz [integral]', '[integral]')).toBe('[integral]');
  });

  it('ignores case and accents, but highlights the ORIGINAL characters', () => {
    expect(matched('Jamón serrano', 'jamon')).toBe('Jamón');
    expect(matched('Jamón serrano', 'JAMÓN')).toBe('Jamón');
    expect(matched('Plátano', 'ata')).toBe('áta');
    // The accented character sits AFTER the match — the fold must not shift the
    // offsets of what follows it.
    expect(matched('Solomillo de cerdó ibérico', 'iberico')).toBe('ibérico');
    expect(matched('Café con leche', 'con leche')).toBe('con leche');
  });

  it('keeps offsets aligned when the name has leading whitespace', () => {
    // `normalizeText` trims; folding per character must not, or every offset
    // after the leading space would be off by one.
    expect(matched('  Pollo', 'pollo')).toBe('Pollo');
  });

  it('does not split a surrogate pair', () => {
    expect(matched('🥑 Aguacate', 'aguacate')).toBe('Aguacate');
  });

  it('reports the first occurrence when the query appears twice', () => {
    expect(findMatchRange('Pollo con pollo', 'pollo')).toEqual({ start: 0, end: 5 });
  });

  it('trims the query before matching', () => {
    expect(matched('Pollo pechuga', '  pechuga  ')).toBe('pechuga');
  });
});
