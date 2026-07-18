// @vitest-environment jsdom
import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The page pulls `useRecipe` from a supabase-importing module: mock the client
// (CI has no env) and the hook itself, so the render is pure.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const useRecipeMock = vi.fn();
vi.mock('@/features/recipes/hooks', () => ({ useRecipe: () => useRecipeMock() }));

// Ownership drives whether "Editar" is offered at all (R-01 shared pool).
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me', email: 'qa@x.dev' } }),
}));

// The add-to-day cache warm-up. Its query never runs here (the sheet is not
// opened), but the hook is called on every render.
vi.mock('@/features/diario/hooks', async (importActual) => ({
  ...(await importActual<typeof import('@/features/diario/hooks')>()),
  useMealLogsForDay: () => ({ data: [], isLoading: false }),
}));

// R-36: the notes card is Supabase-backed (its own hooks + queries) and
// separately tested; the page test only asserts it is mounted with the right
// recipeId, so it is mocked to keep this test off the network.
vi.mock('@/features/recipes/components/RecipeNotesCard', () => ({
  RecipeNotesCard: ({ recipeId }: { recipeId: string }) => (
    <div data-testid="notes-card">{recipeId}</div>
  ),
}));

import { RecetaDetailPage } from './RecetaDetailPage';
import type { Ingredient } from '@/features/ingredients/api';
import type { RecipeWithIngredients } from '@/features/recipes/api';

function ingredient(over: Partial<Ingredient>): Ingredient {
  return {
    id: 'i-1',
    name: 'Pollo pechuga',
    name_en: null,
    brand: null,
    // gram ingredients are per-100 g (core `divisor`), unit ones per unit.
    unit_type: 'gram',
    kcal_per_unit: 110,
    protein_g_per_unit: 22,
    carbs_g_per_unit: 0,
    fat_g_per_unit: 2,
    fiber_g_per_unit: 0,
    sugar_g_per_unit: 0,
    saturated_fat_g_per_unit: 0,
    ...over,
  } as unknown as Ingredient;
}

function recipe(over: Partial<RecipeWithIngredients> = {}): RecipeWithIngredients {
  return {
    id: 'r-1',
    name: 'Pollo con arroz',
    // Mine by default (the useAuth mock above is 'me'); override to model a
    // pooled recipe someone else created but that I hold a ref to.
    created_by_user_id: 'me',
    servings: 4,
    description: null,
    recipe_steps: [
      { id: 'step-1', recipe_id: 'r-1', display_order: 0, text: 'Dora el pollo.', created_at: '' },
      { id: 'step-2', recipe_id: 'r-1', display_order: 1, text: 'Añade el arroz.', created_at: '' },
    ],
    meal_types: ['lunch'],
    prep_time_minutes: 35,
    recipe_ingredients: [
      {
        id: 'ri-1',
        quantity: 500,
        per_serving: false,
        display_order: 0,
        ingredient: ingredient({ id: 'i-1', name: 'Pollo pechuga', brand: 'Hacendado' }),
      },
      {
        id: 'ri-2',
        quantity: 1,
        per_serving: true,
        display_order: 1,
        ingredient: ingredient({
          id: 'i-2',
          name: 'Pan integral',
          unit_type: 'unit',
          kcal_per_unit: 80,
          protein_g_per_unit: 4,
          carbs_g_per_unit: 14,
          fat_g_per_unit: 1,
        }),
      },
    ],
    ...over,
  } as unknown as RecipeWithIngredients;
}

// Stands in for the editor's create route: reads the `duplicate` state
// `navigateToRecipeDuplicate` hands it (name|servings|prepTime), the same
// shape RecetaEditorPage itself consumes on `/recipes/new`.
function DuplicateStateProbe() {
  const location = useLocation();
  const dup = (
    location.state as { duplicate?: { name: string; servings: string; prepTime: string } } | null
  )?.duplicate;
  return <div data-testid="duplicate-probe">{dup ? `${dup.name}|${dup.servings}|${dup.prepTime}` : 'none'}</div>;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/recipes/r-1']}>
        <Routes>
          <Route path="/recipes/:id" element={<RecetaDetailPage />} />
          <Route path="/recipes/new" element={<DuplicateStateProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
  localStorage.clear();
  useRecipeMock.mockReset();
});

describe('RecetaDetailPage', () => {
  // PageShell mounts the mobile header AND the desktop one (CSS hides one), so
  // the name is in the DOM twice — hence getAllBy* throughout.
  it('renders the recipe name, its macros and its ingredients', () => {
    useRecipeMock.mockReturnValue({ data: recipe(), isLoading: false, isError: false });
    renderPage();

    expect(screen.getAllByText('Pollo con arroz').length).toBeGreaterThan(0);

    // Ingredients, with the per-serving chip only on the row that has it, and
    // the unit derived from the ingredient's unit_type.
    expect(screen.getAllByText('Pollo pechuga').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Hacendado').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pan integral').length).toBeGreaterThan(0);
    expect(screen.getAllByText('500 g').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 ud').length).toBeGreaterThan(0);
    expect(screen.getAllByText('por ración').length).toBe(1);

    // Macros: totals and the highlighted per-serving column. 500 g chicken
    // (550 kcal) + 4 × 1 unit of bread (320 kcal) = 870 kcal total, 218/serving.
    expect(screen.getAllByText('Totales').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Por ración').length).toBeGreaterThan(0);
    expect(screen.getAllByText('870').length).toBeGreaterThan(0);
    expect(screen.getAllByText('218').length).toBeGreaterThan(0);
  });

  it('omits the tiempo stat when the recipe has no prep time', () => {
    useRecipeMock.mockReturnValue({
      data: recipe({ prep_time_minutes: null }),
      isLoading: false,
      isError: false,
    });
    renderPage();

    expect(screen.queryByText('Tiempo')).not.toBeInTheDocument();
    // …and nothing stands in for it.
    expect(screen.queryByText('—')).not.toBeInTheDocument();
    expect(screen.queryByText('0 min')).not.toBeInTheDocument();
    // The other three stats are still there.
    expect(screen.getAllByText('Raciones').length).toBeGreaterThan(0);
  });

  it('shows the tiempo stat when a prep time is set', () => {
    useRecipeMock.mockReturnValue({
      data: recipe({ prep_time_minutes: 35 }),
      isLoading: false,
      isError: false,
    });
    renderPage();

    expect(screen.getAllByText('Tiempo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('35 min').length).toBeGreaterThan(0);
  });

  // R-36: structured steps render as a real numbered <ol>, in `display_order`
  // (fetchRecipe already sorts — the page must not re-sort).
  it('renders steps as an ordered, numbered list', async () => {
    useRecipeMock.mockReturnValue({
      data: recipe({
        recipe_steps: [
          { id: 's1', recipe_id: 'r-1', display_order: 0, text: 'primero', created_at: '' },
          { id: 's2', recipe_id: 'r-1', display_order: 1, text: 'segundo', created_at: '' },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    renderPage();

    expect(screen.getAllByText('Preparación').length).toBeGreaterThan(0);
    await screen.findAllByRole('listitem');

    // Scoped to the steps card: the ingredients list above also renders <li>s.
    const card = screen.getByText('primero').closest('[data-slot="steps"]')! as HTMLElement;

    // DOM order, not just presence — ties each text to ITS position so a
    // reversed render (or any other reordering) fails this assertion.
    const items = within(card).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('primero'),
      expect.stringContaining('segundo'),
    ]);

    // Numbered by position, not by the step's own data.
    expect(within(card).getAllByText(/^\d+$/).map((n) => n.textContent)).toEqual(['1', '2']);
  });

  // R-01 shared pool: a non-owner has nothing actionable to do about missing
  // steps, so the whole card disappears rather than showing an empty state.
  it('hides the steps card entirely for a non-owner when there are no steps', () => {
    useRecipeMock.mockReturnValue({
      data: recipe({ created_by_user_id: 'someone-else', recipe_steps: [] }),
      isLoading: false,
      isError: false,
    });
    renderPage();

    expect(screen.queryByText(/preparación/i)).not.toBeInTheDocument();
  });

  it('shows an empty state to the owner when there are no steps', () => {
    useRecipeMock.mockReturnValue({
      data: recipe({ recipe_steps: [] }),
      isLoading: false,
      isError: false,
    });
    renderPage();

    expect(screen.getByText(/aún no hay pasos/i)).toBeInTheDocument();
  });

  it('routes the edit action to the editor for a recipe I created', () => {
    useRecipeMock.mockReturnValue({ data: recipe(), isLoading: false, isError: false });
    renderPage();

    const editLinks = screen.getAllByRole('link', { name: /Editar/ });
    expect(editLinks.length).toBeGreaterThan(0);
    for (const link of editLinks) expect(link).toHaveAttribute('href', '/recipes/r-1/edit');
  });

  // R-01: recipes are a shared pool — my library can hold a ref to a recipe
  // someone else created, and `save_recipe` refuses to update it ("recipe not
  // found or not owned by user"). Offering "Editar" there is a guaranteed 400.
  it('offers no edit action on a pooled recipe I did not create', () => {
    useRecipeMock.mockReturnValue({
      data: recipe({ created_by_user_id: 'someone-else' }),
      isLoading: false,
      isError: false,
    });
    renderPage();

    expect(screen.queryByRole('link', { name: /Editar/ })).toBeNull();
    // …and the page is otherwise fully usable: it is still a recipe I can read,
    // favourite and cook. Only the action that cannot succeed is gone.
    expect(screen.getAllByText('Pollo con arroz').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Favorita' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Añadir al día' }).length).toBeGreaterThan(0);
  });

  // Task 3, item 1: PR-A gated "editar" on ownership, which — since opening
  // the editor was the only way to reach its "Duplicar" button — made
  // duplicating a pooled recipe (R-01) into your own library unreachable too.
  // This button on the read view is how that capability survives; it is
  // offered on ANY recipe, owned or not (unlike "editar").
  it('offers Duplicar for a recipe I created', () => {
    useRecipeMock.mockReturnValue({ data: recipe(), isLoading: false, isError: false });
    renderPage();

    expect(screen.getAllByRole('button', { name: 'Duplicar' }).length).toBeGreaterThan(0);
  });

  it('offers Duplicar on a recipe I did not create — the only way to copy a pooled recipe into my library', () => {
    useRecipeMock.mockReturnValue({
      data: recipe({ created_by_user_id: 'someone-else' }),
      isLoading: false,
      isError: false,
    });
    renderPage();

    expect(screen.getAllByRole('button', { name: 'Duplicar' }).length).toBeGreaterThan(0);
    // Still not a back door into editing it directly.
    expect(screen.queryByRole('link', { name: /Editar/ })).toBeNull();
  });

  // Mutation-guarding: this is the exact payload a broken duplicate would get
  // wrong — dropping the prep time silently wipes it, since `save_recipe`
  // writes `p_prep_time_minutes` unconditionally on the copy's first save.
  it('"Duplicar" hands the editor an owned copy of a pooled recipe, prep time included', async () => {
    const user = userEvent.setup();
    useRecipeMock.mockReturnValue({
      data: recipe({
        created_by_user_id: 'someone-else',
        name: 'Curry de garbanzos',
        prep_time_minutes: 20,
      }),
      isLoading: false,
      isError: false,
    });
    renderPage();

    await user.click(screen.getAllByRole('button', { name: 'Duplicar' })[0]);

    expect(await screen.findByTestId('duplicate-probe')).toHaveTextContent(
      'Curry de garbanzos (copia)|4|20',
    );
  });

  // An orphaned recipe (its creator dropped their ref) is re-owned by the ANON
  // user, so it belongs to nobody and nobody can save an edit to it.
  it('offers no edit action on an orphaned recipe re-owned by the anon user', () => {
    useRecipeMock.mockReturnValue({
      data: recipe({ created_by_user_id: '00000000-0000-0000-0000-00000000a0a0' }),
      isLoading: false,
      isError: false,
    });
    renderPage();

    expect(screen.queryByRole('link', { name: /Editar/ })).toBeNull();
  });

  it('offers the favourite and add-to-day actions', () => {
    useRecipeMock.mockReturnValue({ data: recipe(), isLoading: false, isError: false });
    renderPage();

    expect(screen.getAllByRole('button', { name: 'Favorita' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Añadir al día' }).length).toBeGreaterThan(0);
  });

  it('mounts the private notes card for the recipe', async () => {
    useRecipeMock.mockReturnValue({ data: recipe(), isLoading: false, isError: false });
    renderPage();

    expect(await screen.findByTestId('notes-card')).toHaveTextContent(recipe().id);
  });

  it('shows a not-found state when the recipe cannot be loaded', () => {
    useRecipeMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderPage();

    expect(screen.getAllByText('Receta no encontrada').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Volver a Recetas' })).toHaveAttribute(
      'href',
      '/recipes',
    );
  });
});
