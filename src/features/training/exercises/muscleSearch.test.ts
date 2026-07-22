import { describe, expect, it } from 'vitest';
import {
  normalizeText,
  musclesMatchingQuery,
  aliasMusclesForQuery,
  muscleCodesForQuery,
  MUSCLE_SEARCH_ALIASES,
} from './muscleSearch';
import { MUSCLE_CODES, MUSCLE_GROUPS, codesInGroup } from '@/core/muscles';

describe('normalizeText', () => {
  it('lowercases ASCII', () => {
    expect(normalizeText('Hombros')).toBe('hombros');
  });

  it('strips diacritics (acute accent)', () => {
    expect(normalizeText('glúteos')).toBe('gluteos');
  });

  it('strips multiple diacritics', () => {
    expect(normalizeText('Femorales')).toBe('femorales');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeText('  Core  ')).toBe('core');
  });
});

describe('musclesMatchingQuery', () => {
  const labelByCode: Record<string, string> = {
    shoulders: 'Hombros',
    chest: 'Pecho',
    glutes: 'Glúteos',
    back: 'Espalda',
    quads: 'Cuádriceps',
  };

  it('matches by substring (lowercase query)', () => {
    expect(musclesMatchingQuery('hombro', labelByCode)).toEqual(['shoulders']);
  });

  it('is case-insensitive (uppercase query)', () => {
    expect(musclesMatchingQuery('HOMBRO', labelByCode)).toEqual(['shoulders']);
  });

  it('is accent-insensitive (GLÚT matches Glúteos)', () => {
    expect(musclesMatchingQuery('GLÚT', labelByCode)).toEqual(['glutes']);
  });

  it('matches accent-stripped query against accent-stripped label', () => {
    expect(musclesMatchingQuery('gluteos', labelByCode)).toEqual(['glutes']);
  });

  it('returns empty array for query shorter than 2 chars', () => {
    expect(musclesMatchingQuery('', labelByCode)).toEqual([]);
    expect(musclesMatchingQuery('h', labelByCode)).toEqual([]);
  });

  it('returns empty array when no label matches', () => {
    expect(musclesMatchingQuery('zzzzz', labelByCode)).toEqual([]);
  });

  it('can match multiple muscles', () => {
    // 'os' appears in 'Hombros' (hombros→shoulders) and 'Glúteos' (gluteos→glutes)
    const result = musclesMatchingQuery('os', labelByCode);
    expect(result).toContain('shoulders'); // 'hombros' ends in 'os'
    expect(result).toContain('glutes');    // 'gluteos' ends in 'os'
    expect(result).not.toContain('back');  // 'espalda' has no 'os'
  });
});

describe('MUSCLE_SEARCH_ALIASES', () => {
  it('only maps to real muscle codes', () => {
    const valid = new Set([...MUSCLE_CODES, 'full_body']);
    for (const entry of MUSCLE_SEARCH_ALIASES) {
      for (const code of entry.codes) expect(valid).toContain(code);
    }
  });

  it('has no empty code list and no empty term list', () => {
    for (const entry of MUSCLE_SEARCH_ALIASES) {
      expect(entry.codes.length).toBeGreaterThan(0);
      expect(entry.terms.length).toBeGreaterThan(0);
    }
  });

  it('stores terms already normalized (so matching never depends on casing/accents)', () => {
    for (const entry of MUSCLE_SEARCH_ALIASES) {
      for (const term of entry.terms) expect(term).toBe(normalizeText(term));
    }
  });
});

describe('aliasMusclesForQuery', () => {
  it('maps the English lay term "abs" to the core codes', () => {
    const codes = aliasMusclesForQuery('abs');
    expect(codes).toContain('abs_upper');
    expect(codes).toContain('abs_lower');
  });

  it('maps Spanish slang "cuadris" to quads', () => {
    expect(aliasMusclesForQuery('cuadris')).toContain('quads');
  });

  it('maps a movement pattern ("empuje") to the pushing muscles', () => {
    const codes = aliasMusclesForQuery('empuje');
    expect(codes).toContain('pec_upper');
    expect(codes).toContain('tri_long');
    expect(codes).not.toContain('biceps');
  });

  it('is accent- and case-insensitive', () => {
    expect(aliasMusclesForQuery('TIRÓN')).toEqual(aliasMusclesForQuery('tiron'));
    expect(aliasMusclesForQuery('tiron').length).toBeGreaterThan(0);
  });

  it('matches a prefix of an alias term ("gemel" → gemelos)', () => {
    expect(aliasMusclesForQuery('gemel')).toContain('calves');
  });

  it('ignores queries shorter than 2 chars', () => {
    expect(aliasMusclesForQuery('a')).toEqual([]);
    expect(aliasMusclesForQuery('')).toEqual([]);
  });

  it('returns [] for a query no alias covers', () => {
    expect(aliasMusclesForQuery('zzzzz')).toEqual([]);
  });
});

describe('muscleCodesForQuery', () => {
  const labelByCode: Record<string, string> = {
    quads: 'Cuádriceps',
    calves: 'Gemelos',
    biceps: 'Bíceps',
  };
  const groupLabelByKey: Record<string, string> = {
    legs: 'Piernas',
    arms: 'Brazos',
    chest: 'Pecho',
    back: 'Espalda',
    core: 'Core',
    shoulders: 'Hombros',
  };

  it('expands a group name to every fine code in that group', () => {
    const codes = muscleCodesForQuery('piernas', labelByCode, groupLabelByKey);
    for (const code of codesInGroup('legs')) expect(codes).toContain(code);
  });

  it('still matches fine muscle labels', () => {
    expect(muscleCodesForQuery('cuadri', labelByCode, groupLabelByKey)).toContain('quads');
  });

  it('unions label, group and alias hits without duplicates', () => {
    const codes = muscleCodesForQuery('brazo', labelByCode, groupLabelByKey);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('biceps');
  });

  it('returns [] for a query that matches nothing', () => {
    expect(muscleCodesForQuery('zzzzz', labelByCode, groupLabelByKey)).toEqual([]);
  });

  it('covers every group label defined by the taxonomy', () => {
    for (const g of MUSCLE_GROUPS) {
      const codes = muscleCodesForQuery(groupLabelByKey[g], labelByCode, groupLabelByKey);
      expect(codes.length).toBeGreaterThan(0);
    }
  });
});
