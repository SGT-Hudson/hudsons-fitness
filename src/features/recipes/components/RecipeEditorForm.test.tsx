// @vitest-environment jsdom
//
// R-33 wave 5 — the prep-time round trip through the REAL form.
//
// `save_recipe` writes `p_prep_time_minutes` unconditionally, so a save that
// carries no prep time genuinely clears the column. The editor renders no input
// for the field yet (it lands with the next PR): the value rides through
// react-hook-form's `defaultValues` unregistered. That is exactly the shape
// where a form library could plausibly drop it — and if it did, every edit of a
// recipe with a prep time would silently wipe it.
//
// The sibling Tier-1 test pins `recipeToEditorState` (the pure state builder).
// This one pins the half it cannot see: RHF + zodResolver + handleSubmit, i.e.
// what `onSubmit` ACTUALLY receives when the user presses save.
import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// IngredientAutocomplete -> @/features/ingredients/api -> @/lib/supabase, which
// throws at module scope without env vars (green-local/red-CI trap otherwise).
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/features/ingredients/hooks', () => ({
  useLocalIngredientSearch: () => ({ data: [], isLoading: false }),
}));

import { RecipeEditorForm, recipeToEditorState, type EditorState } from './RecipeEditorForm';
import type { Ingredient } from '@/features/ingredients/api';
import type { RecipeWithIngredients } from '../api';

function ingredient(): Ingredient {
  return {
    id: 'i-1',
    name: 'Pollo pechuga',
    name_en: null,
    brand: null,
    unit_type: 'gram',
    kcal_per_unit: 110,
    protein_g_per_unit: 22,
    carbs_g_per_unit: 0,
    fat_g_per_unit: 2,
    fiber_g_per_unit: 0,
    sugar_g_per_unit: 0,
    saturated_fat_g_per_unit: 0,
  } as unknown as Ingredient;
}

function recipe(over: Partial<RecipeWithIngredients> = {}): RecipeWithIngredients {
  return {
    id: 'r-1',
    created_at: '2026-06-01T00:00:00.000Z',
    created_by_user_id: 'u-1',
    description: null,
    instructions: null,
    meal_types: ['lunch'],
    name: 'Pollo con arroz',
    photo_url: null,
    prep_time_minutes: 35,
    servings: 4,
    updated_at: '2026-06-01T00:00:00.000Z',
    recipe_ingredients: [
      {
        id: 'ri-1',
        recipe_id: 'r-1',
        ingredient_id: 'i-1',
        quantity: 500,
        per_serving: false,
        display_order: 0,
        created_at: '2026-06-01T00:00:00.000Z',
        ingredient: ingredient(),
      },
    ],
    ...over,
  } as unknown as RecipeWithIngredients;
}

function renderForm(initial: EditorState) {
  const onSubmit = vi.fn();
  render(
    <RecipeEditorForm
      initial={initial}
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
  return onSubmit;
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('RecipeEditorForm — prep time survives a save', () => {
  it('hands the loaded prep time back to onSubmit even though no input renders it', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(recipeToEditorState(recipe({ prep_time_minutes: 35 })));

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // The whole point: NOT undefined, NOT '' — the value the recipe had.
    // `undefined`/`''` here means RecetaEditorPage sends p_prep_time_minutes:
    // null and the RPC wipes the column.
    expect(onSubmit.mock.calls[0][0].prepTime).toBe('35');
  });

  it('still submits after the user edits an unrelated field (prep time is not lost on re-render)', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(recipeToEditorState(recipe({ prep_time_minutes: 90 })));

    await user.type(screen.getByLabelText('Nombre'), ' v2');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const values = onSubmit.mock.calls[0][0] as EditorState;
    expect(values.name).toBe('Pollo con arroz v2');
    expect(values.prepTime).toBe('90');
  });

  it('keeps an empty prep time empty (a recipe with no time recorded stays that way)', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(recipeToEditorState(recipe({ prep_time_minutes: null })));

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].prepTime).toBe('');
  });
});
