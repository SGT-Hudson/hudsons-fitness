// R-33 wave 5 — save_recipe writes p_prep_time_minutes unconditionally, so
// null genuinely clears the column (src/features/recipes/api.ts saveRecipe).
// The editor has no input for it yet: the only thing standing between an
// edit-then-save and silently wiping a recipe's prep time is
// recipeToEditorState carrying `prep_time_minutes` through into the editor
// state it hands the form. This pins that line so a future rewrite that
// drops it turns red instead of shipping silent data loss.
import { describe, it, expect, vi } from 'vitest';

// recipeToEditorState/emptyEditorState are pure, but this file transitively
// imports IngredientAutocomplete -> @/features/ingredients/api, which loads
// @/lib/supabase at module scope; that throws without env vars. Stub it out
// (same pattern as api.test.ts) so this stays a Tier-1, no-DOM, no-network test.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { emptyEditorState, recipeToEditorState } from './RecipeEditorForm';
import { parsePrepTimeMinutes } from '../schema';
import type { RecipeWithIngredients } from '../api';

function recipe(overrides: Partial<RecipeWithIngredients> = {}): RecipeWithIngredients {
  return {
    id: 'recipe-1',
    created_at: '2026-06-01T00:00:00.000Z',
    created_by_user_id: 'user-1',
    description: null,
    instructions: null,
    meal_types: [],
    name: 'Tortilla',
    photo_url: null,
    prep_time_minutes: null,
    servings: 2,
    updated_at: '2026-06-01T00:00:00.000Z',
    recipe_ingredients: [],
    ...overrides,
  };
}

describe('recipeToEditorState — prep time round trip', () => {
  it('carries a recorded prep time through as the input string', () => {
    const state = recipeToEditorState(recipe({ prep_time_minutes: 35 }));
    expect(state.prepTime).toBe('35');
  });

  it('maps a null prep time to the empty string, not "0" or "null"', () => {
    const state = recipeToEditorState(recipe({ prep_time_minutes: null }));
    expect(state.prepTime).toBe('');
  });

  it('round trips a recorded prep time back through parsePrepTimeMinutes to the same integer', () => {
    const state = recipeToEditorState(recipe({ prep_time_minutes: 90 }));
    expect(parsePrepTimeMinutes(state.prepTime)).toBe(90);
  });

  it('round trips a null prep time through parsePrepTimeMinutes back to null', () => {
    const state = recipeToEditorState(recipe({ prep_time_minutes: null }));
    expect(parsePrepTimeMinutes(state.prepTime)).toBeNull();
  });
});

describe('emptyEditorState — new recipe has no prep time', () => {
  it('starts with an empty prepTime, which parses to null (not a stored 0)', () => {
    const state = emptyEditorState();
    expect(state.prepTime).toBe('');
    expect(parsePrepTimeMinutes(state.prepTime)).toBeNull();
  });
});
