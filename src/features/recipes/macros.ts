// Client-facing recipe-macro API. The arithmetic now lives in the shared
// pure core (`@/core/macros`, D-F3 / R-17) so the client and the Deno edge
// functions compute identical results from one implementation. This module
// keeps the existing public surface (`Macros`, `RecipeRowMacrosInput`,
// `rowContribution`, `computeRecipeMacros`, `roundMacro`) unchanged so the
// 14+ call sites across the app keep working with no churn.

import type { Ingredient } from '@/features/ingredients/api';
import {
  add,
  computeRecipeMacros as coreComputeRecipeMacros,
  ingredientMacros as coreIngredientMacros,
  roundMacro as coreRoundMacro,
  scale,
  ZERO_MACROS,
  type CoreIngredient,
  type Macros,
} from '@/core/macros';

export type { Macros } from '@/core/macros';

export interface RecipeRowMacrosInput {
  ingredient: Pick<
    Ingredient,
    | 'unit_type'
    | 'kcal_per_unit'
    | 'protein_g_per_unit'
    | 'carbs_g_per_unit'
    | 'fat_g_per_unit'
    | 'fiber_g_per_unit'
  >;
  quantity: number;
  perServing: boolean;
}

function toCoreIngredient(
  ing: RecipeRowMacrosInput['ingredient'],
): CoreIngredient {
  return {
    unitType: ing.unit_type,
    kcalPerUnit: ing.kcal_per_unit,
    proteinGPerUnit: ing.protein_g_per_unit,
    carbsGPerUnit: ing.carbs_g_per_unit,
    fatGPerUnit: ing.fat_g_per_unit,
    fiberGPerUnit: ing.fiber_g_per_unit,
  };
}

export function rowContribution(
  row: RecipeRowMacrosInput,
  servings: number,
): Macros {
  if (!Number.isFinite(row.quantity) || row.quantity <= 0) return ZERO_MACROS;
  const qty = row.perServing ? row.quantity * servings : row.quantity;
  return coreIngredientMacros(toCoreIngredient(row.ingredient), qty);
}

export function computeRecipeMacros(opts: {
  servings: number;
  rows: RecipeRowMacrosInput[];
}): { total: Macros; perServing: Macros } {
  return coreComputeRecipeMacros({
    servings: opts.servings,
    ingredients: opts.rows.map((r) => ({
      quantity: r.quantity,
      perServing: r.perServing,
      ingredient: toCoreIngredient(r.ingredient),
    })),
  });
}

export function roundMacro(n: number): number {
  return coreRoundMacro(n);
}

// Re-exported core arithmetic for callers that build totals directly.
export { add, scale, ZERO_MACROS };
