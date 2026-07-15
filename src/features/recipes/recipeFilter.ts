// U-3 — pure faceted recipe filter. Combine logic (standard faceted search):
//   • within meal-types → OR (recipe matches if it carries ANY selected type)
//   • among goal filters AND across categories (name ∧ meal-type ∧ goals) → AND
//   • a goal whose label is `null` (incomplete sugar/sat-fat data) does NOT match
//
// Operates on the in-memory list the recipes page builds (labels precomputed via
// `recipeLabels`). No DB round trips per keystroke.

import type { RecipeGoalKey, RecipeLabels } from './labels';
import type { RecipeMealType } from './mealTypes';

export interface RecipeFilterState {
  query: string;
  mealTypes: RecipeMealType[];
  goals: RecipeGoalKey[];
}

export interface FilterableRecipe {
  name: string;
  mealTypes: string[];
  labels: RecipeLabels;
}

export const EMPTY_RECIPE_FILTER: RecipeFilterState = {
  query: '',
  mealTypes: [],
  goals: [],
};

/**
 * Lowercase + strip diacritics, WITHOUT trimming — the fold `normalizeText` is
 * built on. Exported for the one caller that cannot afford the trim: the match
 * highlighter folds character by character to keep offsets aligned with the
 * original string, and a `trim()` there would silently eat spaces (and shift
 * every offset after them).
 */
export function foldText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Lowercase + strip diacritics, so "pollo" matches "Pollo" and "purée" "puree". */
export function normalizeText(s: string): string {
  return foldText(s).trim();
}

export function matchesRecipeFilter(recipe: FilterableRecipe, filter: RecipeFilterState): boolean {
  // Name (substring, accent/case-insensitive).
  const q = normalizeText(filter.query);
  if (q !== '' && !normalizeText(recipe.name).includes(q)) return false;

  // Meal types: OR within the facet.
  if (filter.mealTypes.length > 0) {
    const has = filter.mealTypes.some((m) => recipe.mealTypes.includes(m));
    if (!has) return false;
  }

  // Goal filters: AND across; a `null`/`false` goal does not match.
  for (const goal of filter.goals) {
    if (recipe.labels.goals[goal] !== true) return false;
  }

  return true;
}

/** Any facet active? (drives the "no matches" vs "empty library" empty state.) */
export function isRecipeFilterActive(filter: RecipeFilterState): boolean {
  return filter.query.trim() !== '' || filter.mealTypes.length > 0 || filter.goals.length > 0;
}
