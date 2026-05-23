import { describe, expect, it } from 'vitest';
import { amountFor, buildRow, type FoodEntry, type SRFood } from './build-seed';

const food: SRFood = {
  fdcId: 168878,
  foodNutrients: [
    { nutrient: { number: '208' }, amount: 130 },
    { nutrient: { number: '203' }, amount: 2.69 },
    { nutrient: { number: '205' }, amount: 28.17 },
    { nutrient: { number: '204' }, amount: 0.28 },
    { nutrient: { number: '291' }, amount: 0.4 },
    { nutrient: { number: '606' }, amount: 0.077 },
    // no sugars (269) — must serialize as null, not 0 (U-1)
  ],
};
const entry: FoodEntry = { query: 'rice white long-grain raw', fdc_id: 168878, name_es: 'Arroz blanco', name_en: 'White rice', category: 'grains' };

describe('amountFor', () => {
  it('returns the rounded amount for a present nutrient', () => {
    expect(amountFor(food, '203')).toBe(2.69);
  });
  it('returns null for an absent nutrient', () => {
    expect(amountFor(food, '269')).toBeNull();
  });
});

describe('buildRow', () => {
  it('emits a VALUES tuple with null for absent sub-macros and escaped quotes', () => {
    expect(buildRow(entry, food)).toBe(
      "      ('Arroz blanco', 'White rice', 'gram', 130, 2.69, 28.17, 0.28, 0.4, null, 0.08, true, null, 'system')",
    );
  });
  it('throws when energy is missing', () => {
    expect(() => buildRow(entry, { fdcId: 1, foodNutrients: [] })).toThrow(/no energy/);
  });
});
