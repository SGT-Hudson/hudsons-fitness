// @vitest-environment jsdom
import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The page pulls `useRecipe` from a supabase-importing module: mock the client
// (CI has no env) and the hook itself, so the render is pure.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const useRecipeMock = vi.fn();
vi.mock('@/features/recipes/hooks', () => ({ useRecipe: () => useRecipeMock() }));

// The add-to-day cache warm-up. Its query never runs here (the sheet is not
// opened), but the hook is called on every render.
vi.mock('@/features/diario/hooks', async (importActual) => ({
  ...(await importActual<typeof import('@/features/diario/hooks')>()),
  useMealLogsForDay: () => ({ data: [], isLoading: false }),
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
    servings: 4,
    description: null,
    instructions: 'Dora el pollo.\nAñade el arroz.',
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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/recipes/r-1']}>
        <Routes>
          <Route path="/recipes/:id" element={<RecetaDetailPage />} />
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

  // R-36 will bring structured steps; until then the single `instructions`
  // column is ONE step, line breaks preserved — never split into fake steps.
  it('renders the instructions as a single numbered step', () => {
    useRecipeMock.mockReturnValue({ data: recipe(), isLoading: false, isError: false });
    renderPage();

    expect(screen.getAllByText('Preparación').length).toBeGreaterThan(0);

    const text = screen.getByText(/Dora el pollo\./);
    // Both lines live in the same step node — the text keeps its own breaks.
    expect(text.textContent).toContain('Añade el arroz.');

    // The card holds exactly one numbered step, and it is "1": the second line
    // must not be promoted into a step "2".
    const card = text.closest('[data-slot="instructions"]')!;
    expect(within(card as HTMLElement).getAllByText(/^\d+$/).map((n) => n.textContent)).toEqual([
      '1',
    ]);
  });

  it('omits the preparación card when the recipe has no instructions', () => {
    useRecipeMock.mockReturnValue({
      data: recipe({ instructions: null }),
      isLoading: false,
      isError: false,
    });
    renderPage();

    expect(screen.queryByText('Preparación')).not.toBeInTheDocument();
  });

  it('routes the edit action to the editor', () => {
    useRecipeMock.mockReturnValue({ data: recipe(), isLoading: false, isError: false });
    renderPage();

    const editLinks = screen.getAllByRole('link', { name: /Editar/ });
    expect(editLinks.length).toBeGreaterThan(0);
    for (const link of editLinks) expect(link).toHaveAttribute('href', '/recipes/r-1/edit');
  });

  it('offers the favourite and add-to-day actions', () => {
    useRecipeMock.mockReturnValue({ data: recipe(), isLoading: false, isError: false });
    renderPage();

    expect(screen.getAllByRole('button', { name: 'Favorita' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Añadir al día' }).length).toBeGreaterThan(0);
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
