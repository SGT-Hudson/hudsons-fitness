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
import {
  computeRecipeSub as coreComputeRecipeSub,
  type SubMacros,
} from '@/core/subMacros';

export type { Macros } from '@/core/macros';
export type { SubMacros } from '@/core/subMacros';

export interface RecipeRowMacrosInput {
  ingredient: Pick<
    Ingredient,
    | 'unit_type'
    | 'kcal_per_unit'
    | 'protein_g_per_unit'
    | 'carbs_g_per_unit'
    | 'fat_g_per_unit'
    | 'fiber_g_per_unit'
  > & {
    // U-1 sub-macros: optional so the primary macro path / existing callers
    // don't have to supply them; consumed only by computeRecipeSub.
    sugar_g_per_unit?: number | null;
    saturated_fat_g_per_unit?: number | null;
  };
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

// Per-serving + total sugar/saturated-fat (U-1). Parallel to computeRecipeMacros,
// delegating to the separate null-aware sub-macro core. `sugar_g_per_unit` /
// `saturated_fat_g_per_unit` may be absent on partially-typed callers → `null`.
export function computeRecipeSub(opts: {
  servings: number;
  rows: RecipeRowMacrosInput[];
}): { total: SubMacros; perServing: SubMacros } {
  return coreComputeRecipeSub({
    servings: opts.servings,
    ingredients: opts.rows.map((r) => ({
      quantity: r.quantity,
      perServing: r.perServing,
      ingredient: {
        unitType: r.ingredient.unit_type,
        sugarGPerUnit: r.ingredient.sugar_g_per_unit ?? null,
        satFatGPerUnit: r.ingredient.saturated_fat_g_per_unit ?? null,
      },
    })),
  });
}

export function roundMacro(n: number): number {
  return coreRoundMacro(n);
}

// Re-exported core arithmetic for callers that build totals directly.
export { add, scale, ZERO_MACROS };
