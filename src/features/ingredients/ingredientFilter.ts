// Pure faceted filter for the Ingredientes list (R-33 wave 6). The page holds
// the pool in memory (one query) and filters/counts here — so a chip's count is
// a real number, not an extra round trip per chip.
//
// Facets AND-combine (verificadas + por unidad = verified unit-priced rows).
// The text query is OR'd across name / name_en / brand, accent- and
// case-insensitively, reusing the recipes' `normalizeText` rather than a second
// copy of it.

import { normalizeText } from '@/features/recipes/recipeFilter';
import { ingredientSourceVariant } from './ingredientSource';

export const INGREDIENT_FACETS = ['verified', 'perUnit', 'base', 'mine'] as const;
export type IngredientFacet = (typeof INGREDIENT_FACETS)[number];

/** The shape the filter needs — `Ingredient` (Tables<'ingredients'>) satisfies it. */
export interface FilterableIngredient {
  id: string;
  name: string;
  name_en: string | null;
  brand: string | null;
  is_verified: boolean;
  unit_type: string;
  source: string;
  created_by_user_id: string | null;
}

export interface IngredientFilterContext {
  userId: string | null | undefined;
}

export interface IngredientFilterState {
  query: string;
  facets: IngredientFacet[];
}

export const EMPTY_INGREDIENT_FILTER: IngredientFilterState = { query: '', facets: [] };

export function matchesIngredientFacet(
  ing: FilterableIngredient,
  facet: IngredientFacet,
  ctx: IngredientFilterContext,
): boolean {
  switch (facet) {
    case 'verified':
      return ing.is_verified;
    case 'perUnit':
      return ing.unit_type === 'unit';
    case 'base':
      return ingredientSourceVariant(ing.source) === 'base';
    case 'mine':
      // An anonymized pool row (R-25 drops ownership to the sentinel) is
      // nobody's — `null === undefined` must never read as "mine".
      return ctx.userId != null && ing.created_by_user_id === ctx.userId;
  }
}

export function matchesIngredientQuery(ing: FilterableIngredient, query: string): boolean {
  const q = normalizeText(query);
  if (q === '') return true;
  return [ing.name, ing.name_en, ing.brand].some(
    (field) => field != null && normalizeText(field).includes(q),
  );
}

export function matchesIngredientFilter(
  ing: FilterableIngredient,
  filter: IngredientFilterState,
  ctx: IngredientFilterContext,
): boolean {
  return (
    matchesIngredientQuery(ing, filter.query) &&
    filter.facets.every((f) => matchesIngredientFacet(ing, f, ctx))
  );
}

export function isIngredientFilterActive(filter: IngredientFilterState): boolean {
  return filter.query.trim() !== '' || filter.facets.length > 0;
}

/**
 * One pass over the pool → every chip's count. Counts are **unconditional**
 * (over the whole pool, not the currently-filtered view), so a chip's number
 * never moves under the user's finger as they toggle its neighbours — the same
 * contract Recetas' "Todas / Favoritas" chips ship.
 */
export function countIngredientFacets(
  all: readonly FilterableIngredient[],
  ctx: IngredientFilterContext,
): Record<IngredientFacet, number> {
  const counts: Record<IngredientFacet, number> = {
    verified: 0,
    perUnit: 0,
    base: 0,
    mine: 0,
  };
  for (const ing of all) {
    for (const facet of INGREDIENT_FACETS) {
      if (matchesIngredientFacet(ing, facet, ctx)) counts[facet] += 1;
    }
  }
  return counts;
}
