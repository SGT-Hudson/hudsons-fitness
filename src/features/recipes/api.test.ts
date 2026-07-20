// R-33 wave 2 PR-B, task 1: listRecipes already computes each recipe's
// per-serving macros (via computeRecipeMacros) to derive the U-3 `labels`,
// then used to discard the numbers. This pins that `perServing` (the same
// Macros the labels were derived from) now survives onto RecipeListItem —
// with zero extra Supabase calls (the mock below only ever sees one
// `.from('user_recipe_refs')` round trip).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const order = vi.fn();
const single = vi.fn();
const eq = vi.fn();
const select = vi.fn();
const from = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
  },
}));

import { fetchRecipe, listRecipes } from './api';
import { computeRecipeMacros } from './macros';

const USER = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  from.mockReset().mockReturnValue({ select });
  select.mockReset().mockReturnValue({ eq });
  eq.mockReset().mockReturnValue({ order });
  order.mockReset();
  single.mockReset();
});

describe('listRecipes — per-serving macros surfaced on RecipeListItem', () => {
  it('exposes perServing equal to computeRecipeMacros(...).perServing, with a single round trip', async () => {
    const recipe_ingredients = [
      {
        quantity: 200,
        per_serving: false,
        ingredient: {
          unit_type: 'gram',
          kcal_per_unit: 1,
          protein_g_per_unit: 0.1,
          carbs_g_per_unit: 0.2,
          fat_g_per_unit: 0.05,
          fiber_g_per_unit: 0.02,
          sugar_g_per_unit: 0.03,
          saturated_fat_g_per_unit: 0.01,
        },
      },
      {
        quantity: 1,
        per_serving: true,
        ingredient: {
          unit_type: 'unit',
          kcal_per_unit: 90,
          protein_g_per_unit: 6,
          carbs_g_per_unit: 1,
          fat_g_per_unit: 5,
          fiber_g_per_unit: 0,
          sugar_g_per_unit: 0,
          saturated_fat_g_per_unit: 1.5,
        },
      },
    ];

    order.mockResolvedValue({
      data: [
        {
          recipe: {
            id: 'recipe-1',
            name: 'Tortilla',
            servings: 2,
            description: null,
            updated_at: '2026-06-01T00:00:00.000Z',
            meal_types: ['lunch'],
            recipe_ingredients,
          },
        },
      ],
      error: null,
    });

    const result = await listRecipes(USER);

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('user_recipe_refs');

    const expected = computeRecipeMacros({
      servings: 2,
      rows: recipe_ingredients.map((r) => ({
        ingredient: r.ingredient,
        quantity: r.quantity,
        perServing: r.per_serving,
      })),
    }).perServing;

    expect(result).toHaveLength(1);
    expect(result[0].perServing).toEqual(expected);
  });
});

// PostgREST gives no ordering guarantee on embedded resources (recipe_steps
// here), so fetchRecipe's `.sort((a, b) => a.display_order - b.display_order)`
// is load-bearing, not decorative. This test feeds it an OUT-OF-ORDER embed —
// deleting the sort line should turn this red.
describe('fetchRecipe — recipe_steps sort', () => {
  it('returns steps ordered by display_order regardless of embed order', async () => {
    select.mockReturnValue({ eq });
    eq.mockReturnValue({ single });
    single.mockResolvedValue({
      data: {
        id: 'recipe-1',
        name: 'Tortilla',
        recipe_ingredients: [],
        recipe_steps: [
          { id: 's3', recipe_id: 'recipe-1', display_order: 2, text: 'tercero', created_at: '' },
          { id: 's1', recipe_id: 'recipe-1', display_order: 0, text: 'primero', created_at: '' },
          { id: 's2', recipe_id: 'recipe-1', display_order: 1, text: 'segundo', created_at: '' },
        ],
      },
      error: null,
    });

    const result = await fetchRecipe('recipe-1');

    expect(result.recipe_steps.map((s) => s.text)).toEqual(['primero', 'segundo', 'tercero']);
  });
});
