import { describe, it, expect } from 'vitest';
import {
  computeRecipeMacros,
  rowContribution,
  roundMacro,
  type RecipeRowMacrosInput,
} from './macros';

// Characterization tests for the client-side recipe macro math (D-F1 / R-16).

function row(
  overrides: Partial<RecipeRowMacrosInput> &
    Partial<RecipeRowMacrosInput['ingredient']>,
): RecipeRowMacrosInput {
  return {
    quantity: overrides.quantity ?? 100,
    perServing: overrides.perServing ?? false,
    ingredient: {
      unit_type: overrides.unit_type ?? 'gram',
      kcal_per_unit: overrides.kcal_per_unit ?? 100,
      protein_g_per_unit: overrides.protein_g_per_unit ?? 10,
      carbs_g_per_unit: overrides.carbs_g_per_unit ?? 5,
      fat_g_per_unit: overrides.fat_g_per_unit ?? 2,
      fiber_g_per_unit: overrides.fiber_g_per_unit ?? 1,
    },
  };
}

describe('rowContribution', () => {
  it('divides gram ingredients per 100', () => {
    const c = rowContribution(row({ quantity: 200, unit_type: 'gram' }), 1);
    // factor = 200 / 100 = 2
    expect(c.kcal).toBe(200);
    expect(c.proteinG).toBe(20);
    expect(c.carbsG).toBe(10);
    expect(c.fatG).toBe(4);
    expect(c.fiberG).toBe(2);
  });

  it('treats unit ingredients with divisor 1', () => {
    const c = rowContribution(
      row({ quantity: 3, unit_type: 'unit', kcal_per_unit: 90 }),
      1,
    );
    // factor = 3 / 1 = 3
    expect(c.kcal).toBe(270);
  });

  it('multiplies quantity by servings when perServing is true', () => {
    const c = rowContribution(
      row({ quantity: 50, perServing: true, unit_type: 'gram' }),
      4,
    );
    // total qty = 50 * 4 = 200 ; factor = 2
    expect(c.kcal).toBe(200);
  });

  it('returns zeros for non-finite or non-positive quantity', () => {
    expect(rowContribution(row({ quantity: 0 }), 1)).toEqual({
      kcal: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
    });
    expect(rowContribution(row({ quantity: NaN }), 1).kcal).toBe(0);
    expect(rowContribution(row({ quantity: -5 }), 1).kcal).toBe(0);
  });
});

describe('computeRecipeMacros', () => {
  it('sums rows and divides totals by servings', () => {
    const { total, perServing } = computeRecipeMacros({
      servings: 2,
      rows: [
        row({ quantity: 100, unit_type: 'gram' }), // kcal 100
        row({ quantity: 200, unit_type: 'gram' }), // kcal 200
      ],
    });
    expect(total.kcal).toBe(300);
    expect(perServing.kcal).toBe(150);
    expect(perServing.proteinG).toBe((10 + 20) / 2);
  });

  it('falls back to 1 serving when servings <= 0', () => {
    const { total, perServing } = computeRecipeMacros({
      servings: 0,
      rows: [row({ quantity: 100, unit_type: 'gram' })],
    });
    expect(total.kcal).toBe(100);
    expect(perServing.kcal).toBe(100);
  });

  it('returns zeros for an empty recipe', () => {
    const { total, perServing } = computeRecipeMacros({
      servings: 3,
      rows: [],
    });
    expect(total).toEqual({
      kcal: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
    });
    expect(perServing.kcal).toBe(0);
  });

  it('scales per-serving rows by serving count in totals', () => {
    const { total } = computeRecipeMacros({
      servings: 3,
      rows: [row({ quantity: 10, perServing: true, unit_type: 'gram' })],
    });
    // qty = 10 * 3 = 30 ; factor = 0.3 ; kcal = 100 * 0.3 = 30
    expect(total.kcal).toBeCloseTo(30, 10);
  });
});

describe('roundMacro', () => {
  it('rounds to one decimal place', () => {
    expect(roundMacro(1.24)).toBe(1.2);
    expect(roundMacro(1.25)).toBe(1.3);
    expect(roundMacro(199.999)).toBe(200);
    expect(roundMacro(0)).toBe(0);
  });
});
