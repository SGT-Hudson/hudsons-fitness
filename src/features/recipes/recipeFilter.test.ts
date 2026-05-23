import { describe, it, expect } from 'vitest';
import {
  matchesRecipeFilter,
  normalizeText,
  isRecipeFilterActive,
  EMPTY_RECIPE_FILTER,
  type FilterableRecipe,
} from './recipeFilter';
import type { RecipeLabels } from './labels';

const labels = (over: Partial<RecipeLabels['goals']> = {}): RecipeLabels => ({
  goals: {
    highProtein: false,
    lowCarb: false,
    lowFat: false,
    highFiber: false,
    lowSugar: false,
    lowSatFat: false,
    ...over,
  },
  warnings: { highSugar: false, highSatFat: false },
});

const recipe = (over: Partial<FilterableRecipe>): FilterableRecipe => ({
  name: 'Test',
  mealTypes: [],
  labels: labels(),
  ...over,
});

describe('normalizeText', () => {
  it('strips diacritics + case', () => {
    expect(normalizeText('Purée')).toBe('puree');
    expect(normalizeText('  Pollo ')).toBe('pollo');
  });
});

describe('matchesRecipeFilter', () => {
  it('empty filter matches everything', () => {
    expect(matchesRecipeFilter(recipe({}), EMPTY_RECIPE_FILTER)).toBe(true);
  });

  it('name is accent/case-insensitive substring', () => {
    const r = recipe({ name: 'Pollo al horno' });
    expect(matchesRecipeFilter(r, { ...EMPTY_RECIPE_FILTER, query: 'POLLO' })).toBe(true);
    expect(matchesRecipeFilter(r, { ...EMPTY_RECIPE_FILTER, query: 'pescado' })).toBe(false);
  });

  it('meal types use OR within the facet', () => {
    const r = recipe({ mealTypes: ['dinner'] });
    expect(matchesRecipeFilter(r, { ...EMPTY_RECIPE_FILTER, mealTypes: ['lunch', 'dinner'] })).toBe(true);
    expect(matchesRecipeFilter(r, { ...EMPTY_RECIPE_FILTER, mealTypes: ['breakfast'] })).toBe(false);
  });

  it('goal filters use AND; a true label matches', () => {
    const r = recipe({ labels: labels({ highProtein: true, lowCarb: true }) });
    expect(matchesRecipeFilter(r, { ...EMPTY_RECIPE_FILTER, goals: ['highProtein', 'lowCarb'] })).toBe(true);
    expect(matchesRecipeFilter(r, { ...EMPTY_RECIPE_FILTER, goals: ['highProtein', 'lowFat'] })).toBe(false);
  });

  it('a null goal (incomplete data) does NOT match a low-sugar filter', () => {
    const r = recipe({ labels: { ...labels(), goals: { ...labels().goals, lowSugar: null } } });
    expect(matchesRecipeFilter(r, { ...EMPTY_RECIPE_FILTER, goals: ['lowSugar'] })).toBe(false);
  });

  it('combines facets with AND across categories', () => {
    const r = recipe({ name: 'Pollo', mealTypes: ['dinner'], labels: labels({ highProtein: true }) });
    expect(
      matchesRecipeFilter(r, { query: 'pollo', mealTypes: ['dinner'], goals: ['highProtein'] }),
    ).toBe(true);
    expect(
      matchesRecipeFilter(r, { query: 'pollo', mealTypes: ['breakfast'], goals: ['highProtein'] }),
    ).toBe(false);
  });
});

describe('isRecipeFilterActive', () => {
  it('false for empty, true when any facet set', () => {
    expect(isRecipeFilterActive(EMPTY_RECIPE_FILTER)).toBe(false);
    expect(isRecipeFilterActive({ ...EMPTY_RECIPE_FILTER, goals: ['lowFat'] })).toBe(true);
  });
});
