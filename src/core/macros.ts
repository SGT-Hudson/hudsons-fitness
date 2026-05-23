// Shared pure macro core (D-F3 / R-17).
//
// ONE dependency-free, runtime-agnostic, camelCase implementation of the
// macro arithmetic shared by the Vite client and the Deno edge functions.
// It uses ONLY standard JS/TS (no React, no `@/` alias, no Node/Deno-only
// globals). Both runtimes import it directly with no transpile/codegen:
//   - the client via `@/core/macros` (Vite alias / tsc paths),
//   - the edge via a relative path from `supabase/functions/_shared/`.
//
// camelCase is deliberate (D-C4): snake_case is reserved for DB-sourced rows.
// The edge keeps a thin snake_case adapter ONLY at the
// `daily_nutrition_history` write boundary (see `_shared/macros.ts`); every
// other edge call site uses this camelCase core directly.
//
// Numeric inputs accept `number | string` because PostgREST returns numeric
// columns as strings; `Number()` coercion here means both runtimes get
// identical results from the same row shape (the R-16 golden-vector parity
// net asserts this).

export type Numeric = number | string;

/** Computed/derived macro envelope (D-C4). Never a DB row. */
export interface Macros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export const ZERO_MACROS: Macros = {
  kcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
};

/** Per-unit nutrient row as it arrives from `ingredients` (camelCase core view). */
export interface CoreIngredient {
  unitType: string;
  kcalPerUnit: Numeric;
  proteinGPerUnit: Numeric;
  carbsGPerUnit: Numeric;
  fatGPerUnit: Numeric;
  fiberGPerUnit: Numeric | null;
  /** Optional "of which" sub-macros (U-1). `null`/absent = unknown (≠ 0).
   *  Ignored by the primary 5-field arithmetic; consumed only by `subMacros.ts`. */
  sugarGPerUnit?: Numeric | null;
  satFatGPerUnit?: Numeric | null;
}

export interface CoreRecipeIngredient {
  quantity: Numeric;
  perServing: boolean;
  ingredient: CoreIngredient;
}

export interface CoreRecipe {
  servings: Numeric;
  ingredients: CoreRecipeIngredient[];
}

/** Field-wise sum of two macro envelopes. */
export function add(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    proteinG: a.proteinG + b.proteinG,
    carbsG: a.carbsG + b.carbsG,
    fatG: a.fatG + b.fatG,
    fiberG: a.fiberG + b.fiberG,
  };
}

/** Field-wise scalar multiply. */
export function scale(m: Macros, k: number): Macros {
  return {
    kcal: m.kcal * k,
    proteinG: m.proteinG * k,
    carbsG: m.carbsG * k,
    fatG: m.fatG * k,
    fiberG: m.fiberG * k,
  };
}

/** Per-100g ingredients divide by 100; per-unit ingredients divide by 1. */
function divisor(unitType: string): number {
  return unitType === 'unit' ? 1 : 100;
}

/**
 * Macros contributed by `quantity` of a single ingredient. Returns zeros for
 * non-finite or non-positive quantity. `null` fiber is treated as 0.
 */
export function ingredientMacros(ing: CoreIngredient, quantity: number): Macros {
  if (!Number.isFinite(quantity) || quantity <= 0) return ZERO_MACROS;
  const factor = quantity / divisor(ing.unitType);
  return {
    kcal: Number(ing.kcalPerUnit) * factor,
    proteinG: Number(ing.proteinGPerUnit) * factor,
    carbsG: Number(ing.carbsGPerUnit) * factor,
    fatG: Number(ing.fatGPerUnit) * factor,
    fiberG: Number(ing.fiberGPerUnit ?? 0) * factor,
  };
}

/**
 * Total + per-serving macros for a recipe. `per_serving` rows scale with the
 * recipe's `servings` before contributing; `servings <= 0` falls back to 1.
 */
export function computeRecipeMacros(recipe: CoreRecipe): {
  total: Macros;
  perServing: Macros;
} {
  const servings = Number(recipe.servings) > 0 ? Number(recipe.servings) : 1;
  const total = (recipe.ingredients ?? []).reduce<Macros>((acc, ri) => {
    const qty = ri.perServing
      ? Number(ri.quantity) * servings
      : Number(ri.quantity);
    return add(acc, ingredientMacros(ri.ingredient, qty));
  }, ZERO_MACROS);
  return {
    total,
    perServing: scale(total, 1 / servings),
  };
}

/** Per-serving macros only (edge planned/consumed accumulation helper). */
export function recipePerServingMacros(recipe: CoreRecipe): Macros {
  return computeRecipeMacros(recipe).perServing;
}

/** Round a macro value to one decimal place. */
export function roundMacro(n: number): number {
  return Math.round(n * 10) / 10;
}
