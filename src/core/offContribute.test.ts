import { describe, expect, it } from 'vitest';
import {
  isContributionEligible,
  toOffWriteParams,
  type OffContributionInput,
} from './offContribute';

const base: OffContributionInput = {
  barcode: '5000112637922',
  name: 'Coca-Cola',
  brand: 'Coca-Cola',
  unitType: 'gram',
  kcalPer100g: 42,
  proteinPer100g: 0,
  carbsPer100g: 10.6,
  fatPer100g: 0,
  fiberPer100g: 0,
};

describe('isContributionEligible', () => {
  it('accepts a sane gram product whose macros match kcal (Atwater)', () => {
    expect(isContributionEligible(base)).toBe(true);
  });
  it('rejects a per-unit product (cannot map to OFF per-100g)', () => {
    expect(isContributionEligible({ ...base, unitType: 'unit' })).toBe(false);
  });
  it('rejects a blank name', () => {
    expect(isContributionEligible({ ...base, name: '   ' })).toBe(false);
  });
  it('rejects zero/absent kcal', () => {
    expect(isContributionEligible({ ...base, kcalPer100g: 0 })).toBe(false);
  });
  it('rejects when Atwater is wildly off (decimal slip)', () => {
    expect(isContributionEligible({ ...base, kcalPer100g: 420 })).toBe(false);
  });
  it('rejects all-zero macros (Atwater 0)', () => {
    expect(
      isContributionEligible({
        ...base,
        kcalPer100g: 50,
        proteinPer100g: 0,
        carbsPer100g: 0,
        fatPer100g: 0,
      }),
    ).toBe(false);
  });
  it('accepts a realistic high-fat product within tolerance', () => {
    expect(
      isContributionEligible({
        ...base,
        name: 'Aceite de oliva',
        kcalPer100g: 900,
        proteinPer100g: 0,
        carbsPer100g: 0,
        fatPer100g: 100,
      }),
    ).toBe(true);
  });
});

describe('toOffWriteParams', () => {
  it('maps to OFF write params with nutrition_data_per=100g', () => {
    expect(toOffWriteParams(base)).toEqual({
      code: '5000112637922',
      product_name: 'Coca-Cola',
      brands: 'Coca-Cola',
      nutrition_data_per: '100g',
      'nutriment_energy-kcal': '42',
      nutriment_proteins: '0',
      nutriment_carbohydrates: '10.6',
      nutriment_fat: '0',
      nutriment_fiber: '0',
    });
  });
  it('emits an empty brands string when brand is null', () => {
    expect(toOffWriteParams({ ...base, brand: null }).brands).toBe('');
  });
});
