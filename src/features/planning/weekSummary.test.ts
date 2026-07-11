import { describe, it, expect } from 'vitest';
import { weekAverages, isoWeekNumber, mealLabelKey } from './weekSummary';
import { ZERO_MACROS, type Macros } from '@/features/recipes/macros';

const m = (kcal: number, proteinG: number): Macros => ({
  ...ZERO_MACROS,
  kcal,
  proteinG,
});

describe('weekAverages', () => {
  it('averages over the 7 days it is given, including empty ones', () => {
    const days = [m(2100, 150), m(2300, 170), ZERO_MACROS, ZERO_MACROS, ZERO_MACROS, ZERO_MACROS, ZERO_MACROS];
    const r = weekAverages(days);
    expect(r.avgKcal).toBe(629); // round(4400 / 7)
    expect(r.avgProteinG).toBe(46); // round(320 / 7)
    expect(r.proteinPct).toBeNull();
    expect(r.kcalDelta).toBeNull();
  });

  it('derives protein % and kcal delta against the targets', () => {
    const days = Array.from({ length: 7 }, () => m(2240, 166));
    const r = weekAverages(days, { kcal: 2180, proteinG: 168, carbsG: 245, fatG: 68, fiberG: 30 });
    expect(r.avgKcal).toBe(2240);
    expect(r.kcalDelta).toBe(60);
    expect(r.proteinPct).toBe(99); // round(166 / 168 * 100)
  });

  it('returns zeros for an empty week rather than NaN', () => {
    const r = weekAverages([]);
    expect(r.avgKcal).toBe(0);
    expect(r.avgProteinG).toBe(0);
  });

  it('guards a zero protein target (no division by zero)', () => {
    const r = weekAverages([m(2000, 100)], { kcal: 2000, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 });
    expect(r.proteinPct).toBeNull();
  });
});

describe('isoWeekNumber', () => {
  it('returns the ISO week of a Monday', () => {
    expect(isoWeekNumber('2026-05-25')).toBe(22);
  });
});

describe('mealLabelKey', () => {
  it('names the first four meals', () => {
    expect(mealLabelKey(0)).toEqual({ key: 'planner.mealName.0' });
    expect(mealLabelKey(3)).toEqual({ key: 'planner.mealName.3' });
  });

  it('falls back to a numbered label beyond the fourth', () => {
    expect(mealLabelKey(4)).toEqual({ key: 'planner.mealNameN', params: { n: 5 } });
  });
});
