import { describe, it, expect } from 'vitest';
import { templateWeekDates, dayOfWeekFor, templateDayTotals } from './templateWeek';
import { ZERO_MACROS, type Macros } from '@/features/recipes/macros';

describe('templateWeekDates', () => {
  it('returns the 7 ISO dates of the reference Monday-based week, index = day_of_week', () => {
    // 2026-07-08 is a Wednesday; its week runs Mon 2026-07-06 .. Sun 2026-07-12.
    const dates = templateWeekDates(new Date('2026-07-08T12:00:00'));
    expect(dates).toEqual([
      '2026-07-06',
      '2026-07-07',
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
    ]);
  });

  it('is stable no matter which day of the week the reference falls on', () => {
    const fromMonday = templateWeekDates(new Date('2026-07-06T00:00:00'));
    const fromSunday = templateWeekDates(new Date('2026-07-12T23:00:00'));
    expect(fromMonday).toEqual(fromSunday);
  });
});

describe('dayOfWeekFor', () => {
  it('round-trips with templateWeekDates for every day of the week', () => {
    const weekDates = templateWeekDates(new Date('2026-07-08T12:00:00'));
    weekDates.forEach((iso, i) => {
      expect(dayOfWeekFor(iso, weekDates)).toBe(i);
    });
  });
});

describe('templateDayTotals', () => {
  const recipeMacros = new Map<string, Macros>([
    ['chicken-rice', { kcal: 500, proteinG: 40, carbsG: 60, fatG: 10, fiberG: 5 }],
  ]);

  it('contributes zero, not NaN, for a slot whose recipe is not loaded yet', () => {
    const totals = templateDayTotals(
      [{ day_of_week: 0, recipe_id: 'not-yet-loaded', servings: 2 }],
      recipeMacros,
    );
    expect(totals.get(0)).toEqual(ZERO_MACROS);
    expect(Number.isNaN(totals.get(0)?.kcal)).toBe(false);
  });

  it('scales per-serving macros by servings', () => {
    const totals = templateDayTotals(
      [{ day_of_week: 1, recipe_id: 'chicken-rice', servings: 2 }],
      recipeMacros,
    );
    expect(totals.get(1)).toEqual({ kcal: 1000, proteinG: 80, carbsG: 120, fatG: 20, fiberG: 10 });
  });

  it('sums several slots on the same day', () => {
    const totals = templateDayTotals(
      [
        { day_of_week: 2, recipe_id: 'chicken-rice', servings: 1 },
        { day_of_week: 2, recipe_id: 'chicken-rice', servings: 1 },
      ],
      recipeMacros,
    );
    expect(totals.get(2)).toEqual({ kcal: 1000, proteinG: 80, carbsG: 120, fatG: 20, fiberG: 10 });
  });

  it('leaves days with no slots absent from the map', () => {
    const totals = templateDayTotals(
      [{ day_of_week: 3, recipe_id: 'chicken-rice', servings: 1 }],
      recipeMacros,
    );
    expect(totals.has(0)).toBe(false);
    expect(totals.get(0)).toBeUndefined();
  });
});
