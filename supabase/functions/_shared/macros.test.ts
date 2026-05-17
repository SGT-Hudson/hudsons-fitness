import { describe, it, expect } from 'vitest';
import {
  add,
  scale,
  ingredientMacros,
  recipePerServingMacros,
  isoDateInTZ,
  previousDayInTZ,
  mondayOfTodayInTZ,
  ZERO,
  type IngredientRow,
  type RecipeRow,
} from './macros';

// Characterization tests for the edge _shared pure core (D-F1 / R-16,
// D-F3 parity net). The module is dependency-free TS (only Intl) so it
// imports and runs unchanged under Vitest/Node.

const ing: IngredientRow = {
  unit_type: 'gram',
  kcal_per_unit: 100,
  protein_g_per_unit: 10,
  carbs_g_per_unit: 5,
  fat_g_per_unit: 2,
  fiber_g_per_unit: 1,
};

describe('add', () => {
  it('sums two macro totals field-wise', () => {
    expect(
      add(
        { kcal: 1, protein_g: 2, carbs_g: 3, fat_g: 4, fiber_g: 5 },
        { kcal: 10, protein_g: 20, carbs_g: 30, fat_g: 40, fiber_g: 50 },
      ),
    ).toEqual({ kcal: 11, protein_g: 22, carbs_g: 33, fat_g: 44, fiber_g: 55 });
  });
});

describe('scale', () => {
  it('multiplies every field by k', () => {
    expect(
      scale({ kcal: 1, protein_g: 2, carbs_g: 3, fat_g: 4, fiber_g: 5 }, 3),
    ).toEqual({ kcal: 3, protein_g: 6, carbs_g: 9, fat_g: 12, fiber_g: 15 });
  });
});

describe('ingredientMacros', () => {
  it('divides gram ingredients per 100', () => {
    expect(ingredientMacros(ing, 200)).toEqual({
      kcal: 200,
      protein_g: 20,
      carbs_g: 10,
      fat_g: 4,
      fiber_g: 2,
    });
  });

  it('uses divisor 1 for unit ingredients', () => {
    expect(ingredientMacros({ ...ing, unit_type: 'unit' }, 3).kcal).toBe(300);
  });

  it('coerces string nutrient values to numbers', () => {
    const strIng: IngredientRow = {
      unit_type: 'gram',
      kcal_per_unit: '100',
      protein_g_per_unit: '10',
      carbs_g_per_unit: '5',
      fat_g_per_unit: '2',
      fiber_g_per_unit: '1',
    };
    expect(ingredientMacros(strIng, 100).kcal).toBe(100);
  });

  it('treats null fiber as 0', () => {
    expect(ingredientMacros({ ...ing, fiber_g_per_unit: null }, 100).fiber_g).toBe(0);
  });

  it('returns ZERO for non-finite or non-positive quantity', () => {
    expect(ingredientMacros(ing, 0)).toEqual(ZERO);
    expect(ingredientMacros(ing, -1)).toEqual(ZERO);
    expect(ingredientMacros(ing, NaN)).toEqual(ZERO);
  });
});

describe('recipePerServingMacros', () => {
  it('sums ingredients then divides by servings', () => {
    const recipe: RecipeRow = {
      servings: 2,
      recipe_ingredients: [
        { quantity: 100, per_serving: false, ingredient: ing },
        { quantity: 100, per_serving: false, ingredient: ing },
      ],
    };
    // total kcal = 200 ; per serving = 100
    expect(recipePerServingMacros(recipe).kcal).toBe(100);
  });

  it('scales per_serving rows by servings before summing', () => {
    const recipe: RecipeRow = {
      servings: 3,
      recipe_ingredients: [
        { quantity: 10, per_serving: true, ingredient: ing },
      ],
    };
    // qty = 10 * 3 = 30 ; kcal total = 30 ; per serving = 10
    expect(recipePerServingMacros(recipe).kcal).toBeCloseTo(10, 10);
  });

  it('falls back to 1 serving when servings <= 0 and tolerates missing rows', () => {
    const recipe = { servings: 0 } as unknown as RecipeRow;
    expect(recipePerServingMacros(recipe)).toEqual(ZERO);
  });
});

describe('isoDateInTZ', () => {
  it('formats a UTC instant in Europe/Madrid', () => {
    // 2026-05-17T22:30:00Z is 2026-05-18 00:30 CEST (UTC+2)
    expect(isoDateInTZ(new Date('2026-05-17T22:30:00Z'))).toBe('2026-05-18');
  });

  it('respects the DST offset boundary', () => {
    // Winter: 2026-01-15T23:30:00Z is still 2026-01-16 00:30 CET (UTC+1)
    expect(isoDateInTZ(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16');
  });

  it('honors an explicit timezone argument', () => {
    expect(
      isoDateInTZ(new Date('2026-05-17T22:30:00Z'), 'UTC'),
    ).toBe('2026-05-17');
  });
});

describe('previousDayInTZ', () => {
  it('is exactly one calendar day before today in Madrid', () => {
    const today = isoDateInTZ(new Date(), 'Europe/Madrid');
    const [y, m, d] = today.split('-').map(Number);
    const expected = new Date(Date.UTC(y, m - 1, d) - 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(previousDayInTZ()).toBe(expected);
  });
});

describe('mondayOfTodayInTZ', () => {
  it('returns an ISO date that is a Monday on or before today', () => {
    const monday = mondayOfTodayInTZ();
    expect(monday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dow = new Date(`${monday}T00:00:00Z`).getUTCDay();
    expect(dow).toBe(1); // Monday
  });

  it('is within the previous 6 days of today (Madrid)', () => {
    const today = isoDateInTZ(new Date(), 'Europe/Madrid');
    const [y, m, d] = today.split('-').map(Number);
    const todayUtc = Date.UTC(y, m - 1, d);
    const monday = mondayOfTodayInTZ();
    const [my, mm, md] = monday.split('-').map(Number);
    const mondayUtc = Date.UTC(my, mm - 1, md);
    const diffDays = (todayUtc - mondayUtc) / 86_400_000;
    expect(diffDays).toBeGreaterThanOrEqual(0);
    expect(diffDays).toBeLessThanOrEqual(6);
  });
});
