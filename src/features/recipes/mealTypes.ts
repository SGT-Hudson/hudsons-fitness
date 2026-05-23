import { z } from 'zod';

// U-2 — the single source of truth for recipe meal-type tags. The DB CHECK on
// `recipes.meal_types` (migration 20260526120000) lists these SAME 5 keys; keep
// them in sync. Flat vocabulary, any combination, empty = untagged. U-3's recipe
// filter reuses this constant. Labels live in i18n (`recipes:mealTypes.<key>`).
export const RECIPE_MEAL_TYPES = ['breakfast', 'lunch', 'snack', 'dinner', 'dessert'] as const;

export type RecipeMealType = (typeof RECIPE_MEAL_TYPES)[number];

export const recipeMealTypeSchema = z.enum(RECIPE_MEAL_TYPES);

/** Narrow an arbitrary string[] (e.g. a DB row) to known meal-type keys, dropping
 *  anything unrecognised — defensive for forward/backward compat. */
export function toRecipeMealTypes(values: readonly string[] | null | undefined): RecipeMealType[] {
  const allowed = new Set<string>(RECIPE_MEAL_TYPES);
  return (values ?? []).filter((v): v is RecipeMealType => allowed.has(v));
}
