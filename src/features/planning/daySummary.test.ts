import { describe, it, expect } from 'vitest';
import { aggregateDayMacros } from './daySummary';
import { ZERO_MACROS, type Macros } from '@/core/macros';

const m = (kcal: number, p = 0, c = 0, f = 0, fib = 0): Macros => ({
  kcal, proteinG: p, carbsG: c, fatG: f, fiberG: fib,
});

describe('aggregateDayMacros', () => {
  it('sums macros per group key', () => {
    const out = aggregateDayMacros([
      { key: 'Mon', macros: m(300, 20) },
      { key: 'Mon', macros: m(200, 10) },
      { key: 'Tue', macros: m(500, 40) },
    ]);
    expect(out.get('Mon')).toEqual(m(500, 30));
    expect(out.get('Tue')).toEqual(m(500, 40));
  });

  it('returns an empty map for no items', () => {
    expect(aggregateDayMacros([]).size).toBe(0);
  });

  it('a key with one zero item totals ZERO_MACROS', () => {
    expect(aggregateDayMacros([{ key: 'X', macros: ZERO_MACROS }]).get('X')).toEqual(ZERO_MACROS);
  });
});
