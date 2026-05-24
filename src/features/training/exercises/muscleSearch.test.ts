import { describe, expect, it } from 'vitest';
import { normalizeText, musclesMatchingQuery } from './muscleSearch';

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
