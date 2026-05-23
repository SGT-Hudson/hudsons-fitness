// Pure null/partial-aware sub-macro aggregation (U-1).
//
// Sugar and saturated fat are OPTIONAL "of which" sub-components (sugar ⊂ carbs,
// sat-fat ⊂ fat). They are informational and never add calories. This module is
// deliberately SEPARATE from the 5-field `Macros` core (`macros.ts`) so that the
// parity-tested primary arithmetic carries zero new risk and all the "unknown"
// (`null` ≠ 0) complexity is quarantined here.
//
// Same rules as `macros.ts`: dependency-free, runtime-agnostic, camelCase;
// imported directly by the Vite client and the Deno edge.

// Numeric is re-declared locally (rather than imported from `./macros`) so this
// module has NO intra-core relative import: the client resolves `@/core/*` via
// alias (no extension) while Deno's strict `deno check` requires a `.ts`
// extension on relative imports — a local type alias sidesteps that conflict.
// Identical to `macros.ts`'s `Numeric`; the R-16 golden-vector parity net guards
// against drift. PostgREST returns numeric columns as strings, hence `| string`.
type Numeric = number | string;

/** One optional sub-macro carried through aggregation. */
export interface PartialSub {
  known: number; // sum of contributions that HAD a value
  missing: number; // count of leaf contributions with NO value
}

export interface SubMacros {
  sugarG: PartialSub;
  satFatG: PartialSub;
}

/** Sub-macro view of an ingredient row. */
export interface CoreIngredientSub {
  unitType: string;
  sugarGPerUnit?: Numeric | null;
  satFatGPerUnit?: Numeric | null;
}

export interface CoreRecipeIngredientSub {
  quantity: Numeric;
  perServing: boolean;
  ingredient: CoreIngredientSub;
}

export interface CoreRecipeSub {
  servings: Numeric;
  ingredients: CoreRecipeIngredientSub[];
}

export const ZERO_SUB: SubMacros = {
  sugarG: { known: 0, missing: 0 },
  satFatG: { known: 0, missing: 0 },
};

function divisor(unitType: string): number {
  return unitType === 'unit' ? 1 : 100;
}

function field(value: Numeric | null | undefined, factor: number): PartialSub {
  if (value === null || value === undefined) return { known: 0, missing: 1 };
  return { known: Number(value) * factor, missing: 0 };
}

/** Sub-macros contributed by `quantity` of one ingredient. */
export function ingredientSub(ing: CoreIngredientSub, quantity: number): SubMacros {
  if (!Number.isFinite(quantity) || quantity <= 0) return ZERO_SUB;
  const factor = quantity / divisor(ing.unitType);
  return {
    sugarG: field(ing.sugarGPerUnit, factor),
    satFatG: field(ing.satFatGPerUnit, factor),
  };
}

function addPartial(a: PartialSub, b: PartialSub): PartialSub {
  return { known: a.known + b.known, missing: a.missing + b.missing };
}

export function addSub(a: SubMacros, b: SubMacros): SubMacros {
  return {
    sugarG: addPartial(a.sugarG, b.sugarG),
    satFatG: addPartial(a.satFatG, b.satFatG),
  };
}

/** Scale `known` only; `missing` is a count of unknown lines, scale-invariant. */
export function scaleSub(s: SubMacros, k: number): SubMacros {
  return {
    sugarG: { known: s.sugarG.known * k, missing: s.sugarG.missing },
    satFatG: { known: s.satFatG.known * k, missing: s.satFatG.missing },
  };
}

export function isComplete(p: PartialSub): boolean {
  return p.missing === 0;
}

/** Total + per-serving sub-macros for a recipe (mirrors `computeRecipeMacros`). */
export function computeRecipeSub(recipe: CoreRecipeSub): {
  total: SubMacros;
  perServing: SubMacros;
} {
  const servings = Number(recipe.servings) > 0 ? Number(recipe.servings) : 1;
  const total = (recipe.ingredients ?? []).reduce<SubMacros>((acc, ri) => {
    const qty = ri.perServing ? Number(ri.quantity) * servings : Number(ri.quantity);
    return addSub(acc, ingredientSub(ri.ingredient, qty));
  }, ZERO_SUB);
  return { total, perServing: scaleSub(total, 1 / servings) };
}
