// @vitest-environment jsdom
//
// R-33 wave 5 — the prep-time round trip through the REAL form.
//
// `save_recipe` writes `p_prep_time_minutes` unconditionally, so a save that
// carries no prep time genuinely clears the column. PR-B renders the real
// input, so the value now rides through a registered field instead of through
// `defaultValues` alone — and the round trip that matters most is still the one
// where the user NEVER TOUCHES it: open a recipe, rename it, save, keep the 35
// minutes it already had.
//
// The sibling Tier-1 test pins `recipeToEditorState` (the pure state builder).
// This one pins the half it cannot see: RHF + zodResolver + handleSubmit, i.e.
// what `onSubmit` ACTUALLY receives when the user presses save. The save button
// itself lives in the page header (PR-B), outside the <form> — so the harness
// renders it the way RecetaEditorPage does, via `form={RECIPE_EDITOR_FORM_ID}`.
import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// IngredientAutocomplete -> @/features/ingredients/api -> @/lib/supabase, which
// throws at module scope without env vars (green-local/red-CI trap otherwise).
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
const idleMutation = { mutateAsync: vi.fn(), isPending: false, reset: vi.fn() };
vi.mock('@/features/ingredients/hooks', () => ({
  useLocalIngredientSearch: () => ({ data: [], isLoading: false }),
  // A blank row mounts IngredientAutocomplete → IngredientDialog, which reaches
  // for the rest of these.
  useOFFSearch: () => ({ data: [], isLoading: false }),
  useCreateManualIngredient: () => idleMutation,
  useImportFromOFF: () => idleMutation,
  useUpdateIngredient: () => idleMutation,
}));

import {
  RecipeEditorForm,
  recipeToEditorState,
  emptyEditorState,
  RECIPE_EDITOR_FORM_ID,
  type EditorState,
} from './RecipeEditorForm';
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
    <>
      <RecipeEditorForm initial={initial} error={null} onSubmit={onSubmit} />
      {/* The page header's save button, verbatim: outside the form, owned by it. */}
      <button type="submit" form={RECIPE_EDITOR_FORM_ID}>
        Guardar
      </button>
    </>,
  );
  return onSubmit;
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('RecipeEditorForm — prep time survives a save', () => {
  it('hands the loaded prep time back to onSubmit when the user never touches the field', async () => {
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

// The rows rules (noIngredients / rowMissingIngredient / rowInvalidQuantity)
// all target the `rows` FIELD ARRAY, and react-hook-form parks an error aimed
// at the array itself under `errors.rows.root`. Reading only `errors.rows
// .message` found nothing: pressing Guardar on a recipe with no ingredients did
// nothing at all — no save, no message. See pickFirstError (src/lib/zod.ts).
describe('RecipeEditorForm — a rows error is actually shown', () => {
  it('shows the "add an ingredient" message instead of silently doing nothing', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(recipeToEditorState(recipe({ recipe_ingredients: [] })));

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Añade al menos un ingrediente.',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // The create page's shape: emptyEditorState() seeds ONE blank row, so `rows`
  // is a non-empty field array and RHF parks the array-level issue under
  // `errors.rows.root`. This is the case that was silently doing nothing.
  it('shows it too when a blank row is present (the create page\'s shape)', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(emptyEditorState());

    await user.type(screen.getByLabelText('Nombre'), 'Sin ingredientes');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Añade al menos un ingrediente.',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('RecipeEditorForm — the prep-time input (R-33 wave 5 PR-B)', () => {
  it("shows the recipe's recorded prep time in the field", () => {
    renderForm(recipeToEditorState(recipe({ prep_time_minutes: 35 })));
    expect(screen.getByLabelText('Tiempo')).toHaveValue('35');
  });

  it('leaves the field empty when the recipe has no time recorded', () => {
    renderForm(recipeToEditorState(recipe({ prep_time_minutes: null })));
    expect(screen.getByLabelText('Tiempo')).toHaveValue('');
  });

  it('submits the edited value', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(recipeToEditorState(recipe({ prep_time_minutes: 35 })));

    await user.clear(screen.getByLabelText('Tiempo'));
    await user.type(screen.getByLabelText('Tiempo'), '50');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].prepTime).toBe('50');
  });

  it('clears the prep time when the user empties the field (an explicit "no time")', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(recipeToEditorState(recipe({ prep_time_minutes: 35 })));

    await user.clear(screen.getByLabelText('Tiempo'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].prepTime).toBe('');
  });

  // Before PR-B nobody could type this. Now they can — and unbounded it
  // overflows the column's int4 and surfaces a raw Postgres error.
  it('rejects an out-of-range prep time at the form boundary, with the localized message', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(recipeToEditorState(recipe({ prep_time_minutes: 35 })));

    await user.clear(screen.getByLabelText('Tiempo'));
    await user.type(screen.getByLabelText('Tiempo'), '99999999999');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El tiempo de preparación no puede superar las 24 h (1440 min).',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
