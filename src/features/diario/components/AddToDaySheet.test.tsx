import '@/i18n';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import i18n from '@/i18n';

// Component-test env has no Supabase (Tier-2, R-16) — '@/features/ingredients/api'
// pulls in the real client at module scope for its `ingredientDisplayName`
// re-export, so the client itself needs stubbing (ExerciseFilters.test.tsx
// precedent) even though this file never calls it.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const useMediaQuery = vi.fn((_query: string) => false); // mobile (Drawer) by default
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: (q: string) => useMediaQuery(q) }));

const useQuickAddRecipes = vi.fn();
vi.mock('../hooks', () => ({ useQuickAddRecipes: () => useQuickAddRecipes() }));

const useRecipes = vi.fn();
vi.mock('@/features/recipes/hooks', () => ({ useRecipes: () => useRecipes() }));

const useLocalIngredientSearch = vi.fn();
vi.mock('@/features/ingredients/hooks', () => ({
  useLocalIngredientSearch: (...a: unknown[]) => useLocalIngredientSearch(...a),
}));

import { AddToDaySheet } from './AddToDaySheet';

const Z = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

const RECIPES = [
  { id: 'r1', name: 'Tortilla francesa', servings: 2, ingredient_count: 3, perServing: { ...Z, kcal: 250 } },
  { id: 'r2', name: 'Ensalada César', servings: 1, ingredient_count: 5, perServing: { ...Z, kcal: 320 } },
];

// Distinct from any recipe in RECIPES, and with no matching library recipe —
// exercises the "quick-add row without a full library match" fallback path.
const QUICK_ADD = [{ recipeId: 'r3', name: 'Batido proteico', kcalPerServing: 180 }];

const INGREDIENTS = [
  {
    id: 'i1',
    name: 'Manzana',
    name_en: 'Apple',
    brand: null,
    unit_type: 'g',
    kcal_per_unit: 0.52,
    protein_g_per_unit: 0.003,
    carbs_g_per_unit: 0.14,
    fat_g_per_unit: 0.002,
    fiber_g_per_unit: 0.024,
    sugar_g_per_unit: null,
    saturated_fat_g_per_unit: null,
    source: 'system',
    is_verified: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    created_by_user_id: null,
    external_id: null,
  },
];

function renderSheet(overrides: Partial<Parameters<typeof AddToDaySheet>[0]> = {}) {
  return render(
    <AddToDaySheet
      open
      onOpenChange={vi.fn()}
      loggedOn="2026-05-18"
      initialMealType="breakfast"
      mealSubtotals={{ breakfast: 300, lunch: 500 }}
      totals={{ ...Z, kcal: 1200 }}
      targets={{ ...Z, kcal: 2000 }}
      {...overrides}
    />,
  );
}

beforeEach(async () => {
  useMediaQuery.mockReturnValue(false);
  useQuickAddRecipes.mockReturnValue({ data: QUICK_ADD, isLoading: false });
  useRecipes.mockReturnValue({ data: RECIPES, isLoading: false });
  useLocalIngredientSearch.mockReturnValue({ data: INGREDIENTS, isLoading: false });
  await i18n.changeLanguage('es');
});

describe('AddToDaySheet', () => {
  it('renders the meal-slot selector at the initial meal type; clicking another slot selects it', () => {
    renderSheet();
    const group = screen.getByRole('radiogroup', { name: 'Elegir franja' });
    expect(within(group).getByRole('radio', { name: /Desayuno/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(group).getByRole('radio', { name: /Comida/ })).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(within(group).getByRole('radio', { name: /Comida/ }));

    expect(within(group).getByRole('radio', { name: /Comida/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(group).getByRole('radio', { name: /Desayuno/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('defaults to the Recientes tab (quick-add source); switching to Recetas swaps the list source', () => {
    renderSheet();
    expect(screen.getByText('Batido proteico')).toBeInTheDocument();
    expect(screen.queryByText('Ensalada César')).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Recetas' }));

    expect(screen.getByText('Ensalada César')).toBeInTheDocument();
    expect(screen.getByText('Tortilla francesa')).toBeInTheDocument();
    expect(screen.queryByText('Batido proteico')).not.toBeInTheDocument();
  });

  it('switching to Alimentos shows ingredient search results', () => {
    renderSheet();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Alimentos' }));
    expect(screen.getByText('Manzana')).toBeInTheDocument();
  });

  it('selecting a result row advances to the ración step and surfaces the selection; back returns to explore', () => {
    renderSheet();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Recetas' }));
    fireEvent.click(screen.getByText('Ensalada César'));

    // Explore chrome (search box, tabs) is gone; the placeholder shows the pick.
    expect(screen.queryByPlaceholderText('Buscar receta, alimento…')).not.toBeInTheDocument();
    expect(screen.getByText('Ensalada César')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a explorar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Añadir' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Volver a explorar' }));
    expect(screen.getByPlaceholderText('Buscar receta, alimento…')).toBeInTheDocument();
  });

  it('the balance footer reflects totals/targets: target, remaining and consumed', () => {
    renderSheet({ totals: { ...Z, kcal: 1200 }, targets: { ...Z, kcal: 2000 } });
    expect(screen.getByText('obj 2000')).toBeInTheDocument();
    expect(screen.getByText('800')).toBeInTheDocument();
    expect(screen.getByText('kcal restantes')).toBeInTheDocument();
    expect(screen.getByText('1200 consumidas')).toBeInTheDocument();
  });

  it('the balance footer falls back to the targets hint when there is no active phase', () => {
    renderSheet({ targets: undefined });
    expect(screen.queryByText('kcal restantes')).not.toBeInTheDocument();
    expect(screen.getByText(/objetivos diarios/)).toBeInTheDocument();
  });

  it('renders as a right-docked Dialog on desktop instead of a bottom Drawer', () => {
    useMediaQuery.mockReturnValue(true);
    renderSheet();
    // Both the a11y title (sr-only) and the visible header carry the name.
    expect(screen.getAllByText('Añadir a hoy')).toHaveLength(2);
    // Radix Dialog renders its own close button; the sheet must not double it up.
    expect(screen.getAllByRole('button', { name: /close|cerrar/i })).toHaveLength(1);
  });
});
