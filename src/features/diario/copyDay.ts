import type { CreateMealLogInput, MealLogWithJoins, MealType } from './api';

/**
 * Build the create-payloads to replicate a source day's entries onto
 * `targetDate`. Pure + deterministic (no I/O): the caller fetches the source
 * day's logs and feeds the result to the existing createMealLog path, so
 * copied rows are independent manual entries (from_plan=false) — they record
 * "I ate this again", decoupled from the plan. Malformed rows (no recipe /
 * ingredient / custom) are skipped; order is preserved.
 */
export function buildCopyPayloads(
  sourceLogs: MealLogWithJoins[],
  targetDate: string,
): CreateMealLogInput[] {
  const out: CreateMealLogInput[] = [];
  for (const l of sourceLogs) {
    const mealType = (l.meal_type as MealType) ?? 'other';
    const notes = l.notes;
    let source: CreateMealLogInput['source'] | null = null;

    if (l.recipe_id != null && l.servings != null) {
      source = { kind: 'recipe', recipeId: l.recipe_id, servings: l.servings };
    } else if (l.ingredient_id != null && l.quantity != null) {
      source = {
        kind: 'ingredient',
        ingredientId: l.ingredient_id,
        quantity: l.quantity,
      };
    } else if (l.custom_name != null) {
      source = {
        kind: 'custom',
        name: l.custom_name,
        kcal: l.custom_kcal ?? 0,
        proteinG: l.custom_protein_g,
        carbsG: l.custom_carbs_g,
        fatG: l.custom_fat_g,
        fiberG: l.custom_fiber_g,
      };
    }

    if (source === null) continue;
    out.push({ loggedOn: targetDate, mealType, source, notes });
  }
  return out;
}

export type { MealType };
