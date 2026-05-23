import { describe, it, expect } from 'vitest';
import {
  ZERO_SUB,
  ingredientSub,
  addSub,
  scaleSub,
  isComplete,
  computeRecipeSub,
  type CoreIngredientSub,
} from './subMacros';

const gramIng = (sugar: number | null, sat: number | null): CoreIngredientSub => ({
  unitType: 'gram',
  sugarGPerUnit: sugar,
  satFatGPerUnit: sat,
});

describe('ingredientSub', () => {
  it('known value scales per 100g', () => {
    const r = ingredientSub(gramIng(10, 4), 200); // 200g → ×2
    expect(r.sugarG).toEqual({ known: 20, missing: 0 });
    expect(r.satFatG).toEqual({ known: 8, missing: 0 });
  });

  it('null is unknown (missing 1), NOT zero', () => {
    const r = ingredientSub(gramIng(null, 4), 100);
    expect(r.sugarG).toEqual({ known: 0, missing: 1 });
    expect(r.satFatG).toEqual({ known: 4, missing: 0 });
  });

  it('per-unit ingredient divides by 1', () => {
    const r = ingredientSub({ unitType: 'unit', sugarGPerUnit: 3, satFatGPerUnit: null }, 2);
    expect(r.sugarG).toEqual({ known: 6, missing: 0 });
    expect(r.satFatG).toEqual({ known: 0, missing: 1 });
  });

  it('non-positive quantity yields ZERO_SUB', () => {
    expect(ingredientSub(gramIng(10, 4), 0)).toEqual(ZERO_SUB);
  });
});

describe('addSub', () => {
  it('sums known and missing field-wise', () => {
    const a = ingredientSub(gramIng(10, null), 100); // sugar known 10, sat missing 1
    const b = ingredientSub(gramIng(null, 5), 100); // sugar missing 1, sat known 5
    const s = addSub(a, b);
    expect(s.sugarG).toEqual({ known: 10, missing: 1 });
    expect(s.satFatG).toEqual({ known: 5, missing: 1 });
  });
});

describe('scaleSub', () => {
  it('scales known, leaves missing untouched', () => {
    const a = ingredientSub(gramIng(10, null), 100); // sugar {10,0}, sat {0,1}
    const s = scaleSub(a, 0.5);
    expect(s.sugarG).toEqual({ known: 5, missing: 0 });
    expect(s.satFatG).toEqual({ known: 0, missing: 1 });
  });
});

describe('isComplete', () => {
  it('true only when missing === 0', () => {
    expect(isComplete({ known: 5, missing: 0 })).toBe(true);
    expect(isComplete({ known: 5, missing: 2 })).toBe(false);
  });
});

describe('computeRecipeSub', () => {
  it('totals then per-serving over servings', () => {
    const r = computeRecipeSub({
      servings: 2,
      ingredients: [
        { quantity: 100, perServing: false, ingredient: gramIng(10, 4) },
        { quantity: 100, perServing: false, ingredient: gramIng(null, 2) },
      ],
    });
    expect(r.total.sugarG).toEqual({ known: 10, missing: 1 });
    expect(r.total.satFatG).toEqual({ known: 6, missing: 0 });
    expect(r.perServing.sugarG).toEqual({ known: 5, missing: 1 });
    expect(r.perServing.satFatG).toEqual({ known: 3, missing: 0 });
  });
});
