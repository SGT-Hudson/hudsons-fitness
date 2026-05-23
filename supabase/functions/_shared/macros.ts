// Edge ↔ shared-core bridge (D-F3 / R-17).
//
// This file no longer duplicates the macro/date math — that single
// implementation now lives in the runtime-agnostic camelCase core at
// `src/core/macros.ts` + `src/core/dates.ts`, imported directly here via a
// relative path (Deno resolves relative `.ts` with no alias/transpile/codegen;
// the core has zero browser/Node/Deno-only deps — only `Date` + `Intl`).
//
// The edge keeps a THIN snake_case adapter ONLY at the
// `public.daily_nutrition_history` write boundary (`toSnakeMacros` /
// `EMPTY_SNAKE`). That is the single place column-shaped snake_case is needed
// (D-C4: snake_case reserved for DB rows). Every other edge call site uses the
// camelCase core directly.
//
// `_shared/` remains edge↔edge only; the client↔edge *pure* boundary is this
// shared core, and the client↔edge *stateful* boundary is the DB/RPC (D-C5,
// D-D6). NOTE: the relative depth `../../../src/core/...` assumes this file
// stays at `supabase/functions/_shared/`.

export {
  add,
  scale,
  ingredientMacros,
  recipePerServingMacros,
  computeRecipeMacros,
  roundMacro,
  ZERO_MACROS,
  type Macros,
  type CoreIngredient,
  type CoreRecipeIngredient,
  type CoreRecipe,
  type Numeric,
} from '../../../src/core/macros.ts';

export {
  isoDateInTZ,
  todayInTZ,
  previousDayInTZ,
  mondayOfTodayInTZ,
} from '../../../src/core/dates.ts';

// U-1 sub-macros (sugar + saturated fat) — the same null-aware core the client
// uses, re-exported for the edge. Persisted as known-sum + completeness flag at
// the daily_nutrition_history write boundary (see the snapshot function).
export {
  addSub,
  scaleSub,
  ingredientSub,
  computeRecipeSub,
  isComplete,
  ZERO_SUB,
  type SubMacros,
  type PartialSub,
  type CoreIngredientSub,
  type CoreRecipeSub,
} from '../../../src/core/subMacros.ts';

import type { Macros } from '../../../src/core/macros.ts';

/**
 * Snake_case shape of the macro columns on `public.daily_nutrition_history`
 * (and the `custom_*` log columns). This is the ONLY snake_case macro type in
 * the codebase — it exists solely to map a camelCase core {@link Macros} onto
 * DB columns at the write boundary.
 */
export interface SnakeMacros {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export const EMPTY_SNAKE: SnakeMacros = {
  kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
};

/** camelCase core {@link Macros} → snake_case DB column shape. */
export function toSnakeMacros(m: Macros): SnakeMacros {
  return {
    kcal: m.kcal,
    protein_g: m.proteinG,
    carbs_g: m.carbsG,
    fat_g: m.fatG,
    fiber_g: m.fiberG,
  };
}
