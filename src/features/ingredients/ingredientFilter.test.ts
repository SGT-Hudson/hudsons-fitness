import { describe, expect, it } from 'vitest';
import { ingredientSourceVariant } from './ingredientSource';
import {
  countIngredientFacets,
  matchesIngredientFilter,
  type FilterableIngredient,
  type IngredientFilterContext,
} from './ingredientFilter';

function ing(over: Partial<FilterableIngredient> & Pick<FilterableIngredient, 'id'>): FilterableIngredient {
  return {
    name: 'Arroz blanco',
    name_en: 'White rice',
    brand: null,
    is_verified: false,
    unit_type: 'gram',
    source: 'system',
    created_by_user_id: null,
    ...over,
  };
}

const ctx: IngredientFilterContext = { userId: 'u1' };

describe('ingredientSourceVariant', () => {
  it('maps system AND bedca to the base badge', () => {
    expect(ingredientSourceVariant('system')).toBe('base');
    // Before this, `bedca` fell through to "Manual" — a mislabel.
    expect(ingredientSourceVariant('bedca')).toBe('base');
  });
  it('maps manual and openfoodfacts to their own badges', () => {
    expect(ingredientSourceVariant('manual')).toBe('manual');
    expect(ingredientSourceVariant('openfoodfacts')).toBe('off');
  });
  it('falls back to base — never to manual — on an unknown value', () => {
    expect(ingredientSourceVariant('usda')).toBe('base');
  });
});

describe('matchesIngredientFilter', () => {
  const rice = ing({ id: 'a', name: 'Arroz blanco', name_en: 'White rice', brand: 'Hacendado' });

  it('matches the name case- and accent-insensitively', () => {
    expect(matchesIngredientFilter(rice, { query: 'ARROZ', facets: [] }, ctx)).toBe(true);
    expect(matchesIngredientFilter(ing({ id: 'b', name: 'Plátano' }), { query: 'platano', facets: [] }, ctx)).toBe(true);
  });
  it('matches the EN name and the brand', () => {
    expect(matchesIngredientFilter(rice, { query: 'white', facets: [] }, ctx)).toBe(true);
    expect(matchesIngredientFilter(rice, { query: 'hacendado', facets: [] }, ctx)).toBe(true);
    expect(matchesIngredientFilter(rice, { query: 'zzz', facets: [] }, ctx)).toBe(false);
  });
  it('AND-combines the facets', () => {
    const mine = ing({ id: 'x', source: 'manual', created_by_user_id: 'u1', is_verified: false });
    expect(matchesIngredientFilter(mine, { query: '', facets: ['mine'] }, ctx)).toBe(true);
    expect(matchesIngredientFilter(mine, { query: '', facets: ['mine', 'verified'] }, ctx)).toBe(false);
  });
  it('never reads an anonymized (null-owner) row as mine', () => {
    const orphan = ing({ id: 'x', created_by_user_id: null });
    expect(
      matchesIngredientFilter(orphan, { query: '', facets: ['mine'] }, { userId: undefined }),
    ).toBe(false);
  });
});

describe('countIngredientFacets', () => {
  it('counts every chip in one pass over the pool', () => {
    const pool = [
      ing({ id: 'a', is_verified: true }), // base, verified
      ing({ id: 'b', source: 'openfoodfacts', unit_type: 'unit' }),
      ing({ id: 'c', source: 'manual', created_by_user_id: 'u1' }),
      ing({ id: 'd', source: 'bedca', is_verified: true }),
    ];
    expect(countIngredientFacets(pool, ctx)).toEqual({
      verified: 2,
      perUnit: 1,
      base: 2, // the `system` row and the `bedca` one
      mine: 1,
    });
  });
});
