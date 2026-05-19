import { describe, expect, it } from 'vitest';
import { buildCopyPayloads } from './copyDay';
import type { MealLogWithJoins } from './api';

function log(over: Partial<MealLogWithJoins> = {}): MealLogWithJoins {
  return {
    id: 'l1',
    user_id: 'u1',
    logged_on: '2026-05-18',
    meal_type: 'lunch',
    from_plan: false,
    recipe_id: null,
    servings: null,
    ingredient_id: null,
    quantity: null,
    custom_name: null,
    custom_kcal: null,
    custom_protein_g: null,
    custom_carbs_g: null,
    custom_fat_g: null,
    custom_fiber_g: null,
    plan_week_slot_id: null,
    notes: null,
    created_at: '2026-05-18T08:00:00Z',
    recipe: null,
    ingredient: null,
    ...over,
  } as MealLogWithJoins;
}

describe('buildCopyPayloads', () => {
  it('copies a recipe entry onto the target date, preserving meal type and notes', () => {
    const out = buildCopyPayloads(
      [log({ recipe_id: 'r1', servings: 2, meal_type: 'dinner', notes: 'rico' })],
      '2026-05-20',
    );
    expect(out).toEqual([
      {
        loggedOn: '2026-05-20',
        mealType: 'dinner',
        source: { kind: 'recipe', recipeId: 'r1', servings: 2 },
        notes: 'rico',
      },
    ]);
  });

  it('copies an ingredient entry', () => {
    const out = buildCopyPayloads(
      [log({ ingredient_id: 'i1', quantity: 150 })],
      '2026-05-20',
    );
    expect(out[0].source).toEqual({
      kind: 'ingredient',
      ingredientId: 'i1',
      quantity: 150,
    });
  });

  it('copies a custom entry, defaulting a null kcal to 0', () => {
    const out = buildCopyPayloads(
      [
        log({
          custom_name: 'Café',
          custom_kcal: null,
          custom_protein_g: 1,
          custom_carbs_g: null,
          custom_fat_g: null,
          custom_fiber_g: null,
        }),
      ],
      '2026-05-20',
    );
    expect(out[0].source).toEqual({
      kind: 'custom',
      name: 'Café',
      kcal: 0,
      proteinG: 1,
      carbsG: null,
      fatG: null,
      fiberG: null,
    });
  });

  it('copies plan-origin entries too (as independent manual entries)', () => {
    const out = buildCopyPayloads(
      [log({ recipe_id: 'r9', servings: 1, from_plan: true })],
      '2026-05-20',
    );
    expect(out).toHaveLength(1);
    expect(out[0].source).toEqual({ kind: 'recipe', recipeId: 'r9', servings: 1 });
  });

  it('skips malformed rows and falls back to "other" when meal_type is null', () => {
    const out = buildCopyPayloads(
      [
        log({ id: 'bad' }), // no recipe/ingredient/custom → skipped
        log({ ingredient_id: 'i2', quantity: 10, meal_type: null }),
      ],
      '2026-05-20',
    );
    expect(out).toHaveLength(1);
    expect(out[0].mealType).toBe('other');
  });

  it('preserves source order', () => {
    const out = buildCopyPayloads(
      [
        log({ id: 'a', recipe_id: 'r1', servings: 1 }),
        log({ id: 'b', ingredient_id: 'i1', quantity: 5 }),
      ],
      '2026-05-20',
    );
    expect(out.map((p) => p.source.kind)).toEqual(['recipe', 'ingredient']);
  });
});
