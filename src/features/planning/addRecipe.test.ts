import { describe, it, expect } from 'vitest';
import { projectDay } from './addRecipe';
import { ZERO_MACROS, type Macros } from '@/features/recipes/macros';

const m = (kcal: number, p: number, c: number, f: number): Macros => ({
  kcal, proteinG: p, carbsG: c, fatG: f, fiberG: 0,
});

describe('projectDay', () => {
  it('adds servings × per-serving macros to the day', () => {
    const r = projectDay({ dayTotals: m(1500, 100, 150, 40), perServing: m(400, 30, 45, 10), servings: 2 });
    expect(r.added).toEqual(m(800, 60, 90, 20));
    expect(r.projected.kcal).toBe(2300);
    expect(r.projected.proteinG).toBe(160);
    expect(r.base.kcal).toBe(1500);
  });

  it('takes the edited entry out of the base so it is not double-counted', () => {
    // The day already contains this entry at 1 serving; the user re-opens it and picks 2.
    const r = projectDay({
      dayTotals: m(1900, 130, 195, 50),
      perServing: m(400, 30, 45, 10),
      servings: 2,
      replacing: m(400, 30, 45, 10),
    });
    expect(r.base).toEqual(m(1500, 100, 150, 40));
    expect(r.projected.kcal).toBe(2300); // 1500 + 800, NOT 1900 + 800
  });

  it('handles half servings', () => {
    const r = projectDay({ dayTotals: ZERO_MACROS, perServing: m(400, 30, 45, 10), servings: 0.5 });
    expect(r.added.kcal).toBe(200);
    expect(r.added.proteinG).toBe(15);
  });

  it('treats zero servings as no contribution', () => {
    const r = projectDay({ dayTotals: m(1500, 100, 150, 40), perServing: m(400, 30, 45, 10), servings: 0 });
    expect(r.added).toEqual(ZERO_MACROS);
    expect(r.projected).toEqual(m(1500, 100, 150, 40));
  });
});
