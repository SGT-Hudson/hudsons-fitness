// R-33 wave 5 PR-B — the editor's frame, end to end through the page.
//
// The sibling component test pins what `RecipeEditorForm` hands to `onSubmit`.
// This one pins the step after it: what RecetaEditorPage actually sends to
// `save_recipe`. That is where the silent-data-loss bug would land — the RPC
// writes `p_prep_time_minutes` UNCONDITIONALLY, so a payload that omits the
// value (or maps it to null) wipes the recipe's prep time. Opening a recipe
// with a prep time, editing something else and saving must send it back.
import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
vi.mock('@/features/recipes/hooks', () => ({
  useRecipe: (id: string | null) => useRecipe(id),
  useSaveRecipe: () => ({ mutateAsync: saveMutateAsync, isPending: false }),
  useHideRecipe: () => ({ mutateAsync: hideMutateAsync, isPending: false }),
}));

// Ownership (task 3): the recipe below is created by 'u-1'. Signed in as its
// creator by default, so the existing edit-mode tests keep exercising an
// owner; the redirect test overrides this to a different uid.
const useAuth = vi.fn();
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => useAuth() }));

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
    instructions: 'Hornear 25 min.',
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

describe('RecetaEditorPage — editing an existing recipe', () => {
  it("renders the recipe's values, prep time included", () => {
    renderEditor('/recipes/r-1/edit');

    expect(screen.getByLabelText('Nombre')).toHaveValue('Pollo con arroz');
    expect(screen.getByLabelText('Raciones')).toHaveValue(4);
    expect(screen.getByLabelText('Tiempo')).toHaveValue('35');
    expect(screen.getByLabelText('Descripción')).toHaveValue('Batch cooking');
    expect(screen.getByLabelText('Instrucciones')).toHaveValue('Hornear 25 min.');
  });

  // THE regression this whole thread exists to prevent.
  it('sends the prep time it loaded when the user never touches the field', async () => {
    const user = userEvent.setup();
    renderEditor('/recipes/r-1/edit');

    await user.type(screen.getByLabelText('Nombre'), ' v2');
    await user.click(save());

    await waitFor(() => expect(saveMutateAsync).toHaveBeenCalledTimes(1));
    const payload = saveMutateAsync.mock.calls[0][0];
    expect(payload.name).toBe('Pollo con arroz v2');
    expect(payload.prepTimeMinutes).toBe(35);
  });

  it('sends the edited prep time', async () => {
    const user = userEvent.setup();
    renderEditor('/recipes/r-1/edit');

    await user.clear(screen.getByLabelText('Tiempo'));
    await user.type(screen.getByLabelText('Tiempo'), '50');
    await user.click(save());

    await waitFor(() => expect(saveMutateAsync).toHaveBeenCalledTimes(1));
    expect(saveMutateAsync.mock.calls[0][0].prepTimeMinutes).toBe(50);
  });

  it('sends null when the user empties the field — an explicit "no time recorded"', async () => {
    const user = userEvent.setup();
    renderEditor('/recipes/r-1/edit');

    await user.clear(screen.getByLabelText('Tiempo'));
    await user.click(save());

    await waitFor(() => expect(saveMutateAsync).toHaveBeenCalledTimes(1));
    expect(saveMutateAsync.mock.calls[0][0].prepTimeMinutes).toBeNull();
  });

  it('never sends an out-of-range prep time — it stops at the form, with the localized message', async () => {
    const user = userEvent.setup();
    renderEditor('/recipes/r-1/edit');

    await user.clear(screen.getByLabelText('Tiempo'));
    await user.type(screen.getByLabelText('Tiempo'), '99999999999');
    await user.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El tiempo de preparación no puede superar las 24 h (1440 min).',
    );
    expect(saveMutateAsync).not.toHaveBeenCalled();
  });

  // The decimal-comma fix, at the row quantity — the recipe editor's one
  // fraction-capable field. `<input type="number">` strips the comma before
  // React sees it (`82,4` → `"824"`), and the page's own `Number(...)` boundary
  // then has to read the comma back. Asserts what reaches `save_recipe`.
  it('sends a comma-typed row quantity as a decimal: 82,4 → 82.4', async () => {
    const user = userEvent.setup();
    renderEditor('/recipes/r-1/edit');

    const qty = screen.getByLabelText('Cantidad de Pollo pechuga');
    await user.clear(qty);
    await user.type(qty, '82,4');
    await user.click(save());

    await waitFor(() => expect(saveMutateAsync).toHaveBeenCalledTimes(1));
    expect(saveMutateAsync.mock.calls[0][0].ingredients).toEqual([
      expect.objectContaining({ ingredient_id: 'i-1', quantity: 82.4 }),
    ]);
  });

  // The regression this task exists to fix: `initial` used to be a fresh
  // object on every render, and opening (then cancelling) the remove dialog
  // re-renders the page — which reset the form back to the saved values and
  // silently threw away whatever the user had typed.
  it('keeps unsaved edits after opening the remove dialog and cancelling', async () => {
    const user = userEvent.setup();
    renderEditor('/recipes/r-1/edit');

    await user.type(screen.getByLabelText('Nombre'), ' v2');
    await user.clear(screen.getByLabelText('Tiempo'));
    await user.type(screen.getByLabelText('Tiempo'), '50');

    // Two "Quitar receta" buttons exist (desktop header action + mobile
    // footer button — both are always in the DOM, one is only CSS-hidden).
    await user.click(screen.getAllByRole('button', { name: 'Quitar receta' })[0]);

    const dialog = await screen.findByRole('dialog', {
      name: '¿Quitar esta receta de tu biblioteca?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByLabelText('Nombre')).toHaveValue('Pollo con arroz v2');
    expect(screen.getByLabelText('Tiempo')).toHaveValue('50');
  });

  // Task 3: "Duplicar" is the one mechanism the read view's own button reuses
  // (`navigateToRecipeDuplicate`). This pins the part that would silently
  // break it: the create route must actually read the state it was handed —
  // it used to navigate with a `duplicate` state nobody consumed, so this
  // landed on a BLANK form (and, with it, a copy that lost its prep time).
  it('"Duplicar" lands on /recipes/new pre-filled with an owned copy, prep time included', async () => {
    const user = userEvent.setup();
    renderEditor('/recipes/r-1/edit');

    // Two "Duplicar" buttons exist for the same reason as "Quitar receta"
    // above — both headers are always mounted, one only CSS-hidden.
    await user.click(screen.getAllByRole('button', { name: 'Duplicar' })[0]);

    // Landed on the create route, not still bound to the source recipe: no
    // remove action — this copy does not exist yet, there is nothing to
    // remove from a library.
    expect(screen.queryByRole('button', { name: 'Quitar receta' })).toBeNull();

    expect(screen.getByLabelText('Nombre')).toHaveValue('Pollo con arroz (copia)');
    expect(screen.getByLabelText('Raciones')).toHaveValue(4);
    expect(screen.getByLabelText('Tiempo')).toHaveValue('35');
    expect(screen.getByLabelText('Descripción')).toHaveValue('Batch cooking');

    // The whole point of "Duplicar" is copying the recipe WITH its ingredients
    // and meal types — a copy that landed on the right name/servings/time but
    // dropped `rows` or `mealTypes` would still pass every assertion above.
    // The source recipe carries one ingredient (Pollo pechuga) and one meal
    // type (lunch/"Comida"); both must have made it into the duplicated form.
    expect(screen.getByLabelText('Cantidad de Pollo pechuga')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comida' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

// Task 3, item 2: nothing in the UI links to `/recipes/:id/edit` for a recipe
// the signed-in user did not create any more, but a bookmark or typed URL
// still can. `save_recipe` scopes its UPDATE to `created_by_user_id`, so
// rendering the editor there is a guaranteed 400 — redirect to the read view
// instead. Must NOT interfere with duplicating (previous describe block):
// that always targets `/recipes/new`, a route this check does not touch.
describe('RecetaEditorPage — a non-owner deep link to /recipes/:id/edit', () => {
  it('redirects to the read view instead of rendering the editor', () => {
    useAuth.mockReturnValue({ user: { id: 'someone-else' } });
    renderEditor('/recipes/r-1/edit');

    expect(screen.getByText('vista')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre')).toBeNull();
  });

  it('redirects when signed out entirely too', () => {
    useAuth.mockReturnValue({ user: null });
    renderEditor('/recipes/r-1/edit');

    expect(screen.getByText('vista')).toBeInTheDocument();
  });
});

describe('RecetaEditorPage — creating a recipe', () => {
  beforeEach(() => {
    useRecipe.mockReturnValue({ data: undefined, isLoading: false, error: null });
  });

  it('opens blank, with the live-macros card in its empty state', () => {
    renderEditor('/recipes/new');

    expect(screen.getByLabelText('Nombre')).toHaveValue('');
    expect(screen.getByLabelText('Tiempo')).toHaveValue('');
    // Rendered twice (mobile stack + desktop rail), like the read view's card.
    expect(
      screen.getAllByText('Los macros se calcularán a medida que añadas ingredientes.').length,
    ).toBeGreaterThan(0);
  });

  it('offers no remove action — there is nothing to remove yet', () => {
    renderEditor('/recipes/new');
    expect(screen.queryByRole('button', { name: 'Quitar receta' })).toBeNull();
  });
});
