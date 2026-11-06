import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Component tests that render a supabase-importing component pass locally and
// fail in CI (no env at module scope) unless the data layer is mocked.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
const idleMutation = { mutateAsync: vi.fn(), isPending: false, reset: vi.fn() };
vi.mock('@/features/ingredients/hooks', () => ({
  useLocalIngredientSearch: () => ({ data: [], isLoading: false }),
  // An empty ingredient row mounts IngredientAutocomplete → IngredientDialog,
  // which reaches for the rest of these.
  useOFFSearch: () => ({ data: [], isLoading: false }),
  useCreateManualIngredient: () => idleMutation,
  useImportFromOFF: () => idleMutation,
  useUpdateIngredient: () => idleMutation,
}));

const useRecipe = vi.fn();
const saveMutateAsync = vi.fn();
const hideMutateAsync = vi.fn();
// R-36b: the meta card's media tile is now the photo field, which reaches for
// the two cover-photo mutations. Idle stubs — the field has its own test.
const idlePhotoMutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
vi.mock('@/features/recipes/hooks', () => ({
  useRecipe: (id: string | null) => useRecipe(id),
  useSaveRecipe: () => ({ mutateAsync: saveMutateAsync, isPending: false }),
  useHideRecipe: () => ({ mutateAsync: hideMutateAsync, isPending: false }),
  useSetRecipePhoto: () => idlePhotoMutation,
  useClearRecipePhoto: () => idlePhotoMutation,
}));

// Ownership (task 3): the recipe below is created by 'u-1'. Signed in as its
// creator by default, so the existing edit-mode tests keep exercising an
// owner; the redirect test overrides this to a different uid.
const useAuth = vi.fn();
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => useAuth() }));

vi.mock('@/lib/stats', () => ({ track: vi.fn() }));
import { track } from '@/lib/stats';

import { RecetaEditorPage } from './RecetaEditorPage';
import type { RecipeWithIngredients } from '@/features/recipes/api';
import type { Ingredient } from '@/features/ingredients/api';

function ingredient(): Ingredient {
  return {
    id: 'i-1',
    name: 'Pollo pechuga',
    name_en: null,
    brand: null,
    unit_type: 'gram',
    kcal_per_unit: 1.1,
    protein_g_per_unit: 0.22,
    carbs_g_per_unit: 0,
    fat_g_per_unit: 0.02,
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
    description: 'Batch cooking',
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
    // Two entries, deliberately out of alphabetical order ('Precalentar' >
    // 'Picar'): if the load path ever sorted alphabetically instead of by
    // `display_order`, or a mapper silently reversed the array, the assertion
    // on visible order below would catch it either way.
    recipe_steps: [
      {
        id: 'st-1',
        recipe_id: 'r-1',
        display_order: 0,
        text: 'Precalentar el horno a 200°C',
        created_at: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'st-2',
        recipe_id: 'r-1',
        display_order: 1,
        text: 'Picar la cebolla',
        created_at: '2026-06-01T00:00:00.000Z',
      },
    ],
    ...over,
  } as unknown as RecipeWithIngredients;
}

function renderEditor(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/recipes/new" element={<RecetaEditorPage />} />
        <Route path="/recipes/:id/edit" element={<RecetaEditorPage />} />
        <Route path="/recipes/:id" element={<div>vista</div>} />
        <Route path="/recipes" element={<div>lista</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** PageShell mounts BOTH headers (one is CSS-hidden), so the save button is in the DOM twice. */
function save() {
  return screen.getAllByRole('button', { name: 'Guardar' })[0];
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('es');
  useRecipe.mockReturnValue({ data: recipe(), isLoading: false, error: null });
  saveMutateAsync.mockResolvedValue('r-1');
  useAuth.mockReturnValue({ user: { id: 'u-1' } });
});

describe('RecetaEditorPage events', () => {
  it('tracks guardar-receta when a new recipe is saved (a duplicate is a new recipe)', async () => {
    const user = userEvent.setup();
    renderEditor('/recipes/r-1/edit');
    await user.click(screen.getAllByRole('button', { name: 'Duplicar' })[0]);
    await user.click(save());
    await screen.findByText('vista');
    expect(saveMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ recipeId: null }));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('guardar-receta');
  });

  it('tracks nothing when an existing recipe is edited', async () => {
    const user = userEvent.setup();
    renderEditor('/recipes/r-1/edit');
    await user.click(save());
    await screen.findByText('vista');
    expect(track).not.toHaveBeenCalled();
  });

  it('tracks nothing when saving a new recipe fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    saveMutateAsync.mockRejectedValueOnce(new Error('fail'));
    renderEditor('/recipes/r-1/edit');
    await user.click(screen.getAllByRole('button', { name: 'Duplicar' })[0]);
    await user.click(save());
    await waitFor(() => expect(saveMutateAsync).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(track).not.toHaveBeenCalled();
  });
});
