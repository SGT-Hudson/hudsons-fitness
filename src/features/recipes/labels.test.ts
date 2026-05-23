import { describe, it, expect } from 'vitest';
import { recipeLabels, RECIPE_LABEL_THRESHOLDS } from './labels';
import type { Macros, SubMacros } from './macros';

const macros = (over: Partial<Macros>): Macros => ({
  kcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
  ...over,
});

const sub = (
  sugar: { known: number; missing: number },
  sat: { known: number; missing: number },
): SubMacros => ({ sugarG: sugar, satFatG: sat });

const KNOWN0 = { known: 0, missing: 0 };

describe('recipeLabels — goal filters (density / % energy)', () => {
  it('high protein when protein ≥ 30% of energy', () => {
    // 30 g protein × 4 = 120 kcal of 400 = 30% → exactly at threshold
    const l = recipeLabels(macros({ kcal: 400, proteinG: 30 }), sub(KNOWN0, KNOWN0));
    expect(l.goals.highProtein).toBe(true);
    const under = recipeLabels(macros({ kcal: 400, proteinG: 29 }), sub(KNOWN0, KNOWN0));
    expect(under.goals.highProtein).toBe(false);
  });

  it('low carb when carbs ≤ 25% of energy', () => {
    // 25 g carbs × 4 = 100 of 400 = 25% → at threshold (≤)
    expect(recipeLabels(macros({ kcal: 400, carbsG: 25 }), sub(KNOWN0, KNOWN0)).goals.lowCarb).toBe(true);
    expect(recipeLabels(macros({ kcal: 400, carbsG: 26 }), sub(KNOWN0, KNOWN0)).goals.lowCarb).toBe(false);
  });

  it('low fat uses 9 kcal/g, ≤ 30% of energy', () => {
    // fat 13.33 g × 9 ≈ 120 of 400 = 30%
    expect(recipeLabels(macros({ kcal: 400, fatG: 13.3 }), sub(KNOWN0, KNOWN0)).goals.lowFat).toBe(true);
    expect(recipeLabels(macros({ kcal: 400, fatG: 20 }), sub(KNOWN0, KNOWN0)).goals.lowFat).toBe(false);
  });

  it('high fiber when ≥ 6 g per 100 kcal', () => {
    // 400 kcal → /100 = 4 → need ≥ 24 g
    expect(recipeLabels(macros({ kcal: 400, fiberG: 24 }), sub(KNOWN0, KNOWN0)).goals.highFiber).toBe(true);
    expect(recipeLabels(macros({ kcal: 400, fiberG: 20 }), sub(KNOWN0, KNOWN0)).goals.highFiber).toBe(false);
  });
});

describe('recipeLabels — sugar/sat-fat goals require COMPLETE data', () => {
  it('low sugar is null (unknown) when sugar data incomplete', () => {
    const l = recipeLabels(macros({ kcal: 400 }), sub({ known: 2, missing: 1 }, KNOWN0));
    expect(l.goals.lowSugar).toBeNull();
  });
  it('low sugar true when complete and ≤ 10% energy', () => {
    // 10 g sugar × 4 = 40 of 400 = 10%
    const l = recipeLabels(macros({ kcal: 400 }), sub({ known: 10, missing: 0 }, KNOWN0));
    expect(l.goals.lowSugar).toBe(true);
    const over = recipeLabels(macros({ kcal: 400 }), sub({ known: 11, missing: 0 }, KNOWN0));
    expect(over.goals.lowSugar).toBe(false);
  });
  it('low saturated fat true when complete and ≤ 10% energy (9 kcal/g)', () => {
    // sat 4.44 g × 9 ≈ 40 of 400 = 10%
    const l = recipeLabels(macros({ kcal: 400 }), sub(KNOWN0, { known: 4.4, missing: 0 }));
    expect(l.goals.lowSatFat).toBe(true);
  });
});

describe('recipeLabels — warning badges', () => {
  it('high sugar when complete and > 20% energy', () => {
    // 21 g × 4 = 84 of 400 = 21%
    const l = recipeLabels(macros({ kcal: 400 }), sub({ known: 21, missing: 0 }, KNOWN0));
    expect(l.warnings.highSugar).toBe(true);
  });
  it('high sugar null when sugar incomplete', () => {
    const l = recipeLabels(macros({ kcal: 400 }), sub({ known: 30, missing: 2 }, KNOWN0));
    expect(l.warnings.highSugar).toBeNull();
  });
  it('high saturated fat when complete and > 10% energy', () => {
    // sat 5 g × 9 = 45 of 400 = 11.25%
    const l = recipeLabels(macros({ kcal: 400 }), sub(KNOWN0, { known: 5, missing: 0 }));
    expect(l.warnings.highSatFat).toBe(true);
  });
});

describe('recipeLabels — near-zero kcal is excluded from all ratio labels', () => {
  it('returns all false/false (not null) below MIN_KCAL_FOR_RATIO', () => {
    const l = recipeLabels(
      macros({ kcal: RECIPE_LABEL_THRESHOLDS.minKcalForRatio - 1, proteinG: 100 }),
      sub({ known: 0, missing: 0 }, { known: 0, missing: 0 }),
    );
    expect(l.goals.highProtein).toBe(false);
    expect(l.goals.lowCarb).toBe(false);
    expect(l.warnings.highSugar).toBe(false);
  });
});
