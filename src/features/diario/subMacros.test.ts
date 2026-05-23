import { describe, it, expect } from 'vitest';
import { computeMealLogSub, sumSub } from './macros';
import type { MealLogWithJoins } from './api';

// Minimal log shapes — only the fields the sub-macro path reads.
const ingLog = (sugar: number | null, sat: number | null, qty: number): MealLogWithJoins =>
  ({
    ingredient_id: 'i',
    ingredient: { unit_type: 'gram', sugar_g_per_unit: sugar, saturated_fat_g_per_unit: sat },
    quantity: qty,
  }) as unknown as MealLogWithJoins;

const customLog = (sugar: number | null, sat: number | null): MealLogWithJoins =>
  ({ custom_name: 'x', custom_sugar_g: sugar, custom_saturated_fat_g: sat }) as unknown as MealLogWithJoins;

describe('computeMealLogSub', () => {
  it('ingredient log: known scales per 100g, null is unknown', () => {
    const r = computeMealLogSub(ingLog(10, null, 200)); // 200g → ×2
    expect(r.sugarG).toEqual({ known: 20, missing: 0 });
    expect(r.satFatG).toEqual({ known: 0, missing: 1 });
  });

  it('custom log: null = unknown (missing 1), number = known', () => {
    const r = computeMealLogSub(customLog(null, 2));
    expect(r.sugarG).toEqual({ known: 0, missing: 1 });
    expect(r.satFatG).toEqual({ known: 2, missing: 0 });
  });
});

describe('sumSub', () => {
  it('aggregates known + missing across logs', () => {
    const s = sumSub([computeMealLogSub(ingLog(10, null, 100)), computeMealLogSub(customLog(null, 2))]);
    expect(s.sugarG).toEqual({ known: 10, missing: 1 });
    expect(s.satFatG).toEqual({ known: 2, missing: 1 });
  });
});
