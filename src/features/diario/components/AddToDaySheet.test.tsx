import '@/i18n';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import i18n from '@/i18n';

// Component-test env has no Supabase (Tier-2, R-16) — '@/features/ingredients/api'
// pulls in the real client at module scope for its `ingredientDisplayName`
// re-export, so the client itself needs stubbing (ExerciseFilters.test.tsx
// precedent) even though this file never calls it.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const useMediaQuery = vi.fn((_query: string) => false); // mobile (Drawer) by default
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: (q: string) => useMediaQuery(q) }));

const useQuickAddRecipes = vi.fn();
const useCreateMealLog = vi.fn();
const useUpdateMealLog = vi.fn();
const useDeleteMealLog = vi.fn();
vi.mock('../hooks', () => ({
  useQuickAddRecipes: () => useQuickAddRecipes(),
  useCreateMealLog: () => useCreateMealLog(),
  useUpdateMealLog: () => useUpdateMealLog(),
  useDeleteMealLog: () => useDeleteMealLog(),
}));

const useRecipes = vi.fn();
vi.mock('@/features/recipes/hooks', () => ({ useRecipes: () => useRecipes() }));

const useLocalIngredientSearch = vi.fn();
vi.mock('@/features/ingredients/hooks', () => ({
  useLocalIngredientSearch: (...a: unknown[]) => useLocalIngredientSearch(...a),
}));

import { AddToDaySheet } from './AddToDaySheet';
import type { MealLogWithJoins } from '../api';

const Z = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

const RECIPES = [
  { id: 'r1', name: 'Tortilla francesa', servings: 2, ingredient_count: 3, perServing: { ...Z, kcal: 250 } },
  {
    id: 'r2',
    name: 'Ensalada César',
    servings: 1,
    ingredient_count: 5,
    perServing: { kcal: 320, proteinG: 20, carbsG: 10, fatG: 18, fiberG: 4 },
  },
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
    // Per-100g convention: 100 g of this fixture ≈ 52 kcal / 1 g protein /
    // 14 g carbs / 0.2 g fat — real enough to drive exact projection math.
    kcal_per_unit: 52,
    protein_g_per_unit: 1,
    carbs_g_per_unit: 14,
    fat_g_per_unit: 0.2,
    fiber_g_per_unit: 2.4,
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

// --- Edit-mode fixtures (task 5) -------------------------------------------
// A logged custom entry: computeMealLogMacros → { kcal 300, protein 20, ... }.
const EDIT_CUSTOM = {
  id: 'log9',
  user_id: 'u1',
  logged_on: '2026-05-18',
  meal_type: 'lunch',
  notes: null,
  from_plan: false,
  recipe_id: null,
  ingredient_id: null,
  servings: null,
  quantity: null,
  custom_name: 'Yogur',
  custom_kcal: 300,
  custom_protein_g: 20,
  custom_carbs_g: 10,
  custom_fat_g: 5,
  custom_fiber_g: 0,
  custom_sugar_g: null,
  custom_saturated_fat_g: null,
  plan_week_slot_id: null,
  created_at: '2026-05-18T12:00:00Z',
  recipe: null,
  ingredient: null,
} as unknown as MealLogWithJoins;

// A logged recipe entry whose joined ingredient tree yields per-serving
// { kcal 320, protein 20, carbs 10, fat 18 } (one 'unit' ingredient, qty 1,
// not per-serving, over 1 serving).
const EDIT_RECIPE = {
  ...EDIT_CUSTOM,
  id: 'log8',
  recipe_id: 'r2',
  servings: 1,
  custom_name: null,
  custom_kcal: null,
  custom_protein_g: null,
  custom_carbs_g: null,
  custom_fat_g: null,
  custom_fiber_g: null,
  recipe: {
    id: 'r2',
    name: 'Ensalada César',
    servings: 1,
    recipe_ingredients: [
      {
        id: 'ri1',
        recipe_id: 'r2',
        ingredient_id: 'ing-r',
        quantity: 1,
        per_serving: false,
        display_order: 0,
        ingredient: {
          ...INGREDIENTS[0],
          id: 'ing-r',
          unit_type: 'unit',
          kcal_per_unit: 320,
          protein_g_per_unit: 20,
          carbs_g_per_unit: 10,
          fat_g_per_unit: 18,
          fiber_g_per_unit: 4,
        },
      },
    ],
  },
} as unknown as MealLogWithJoins;

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

let mutateAsync: ReturnType<typeof vi.fn>;
let updateAsync: ReturnType<typeof vi.fn>;
let deleteAsync: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  useMediaQuery.mockReturnValue(false);
  useQuickAddRecipes.mockReturnValue({ data: QUICK_ADD, isLoading: false });
  useRecipes.mockReturnValue({ data: RECIPES, isLoading: false });
  useLocalIngredientSearch.mockReturnValue({ data: INGREDIENTS, isLoading: false });
  mutateAsync = vi.fn().mockResolvedValue({ id: 'log1' });
  updateAsync = vi.fn().mockResolvedValue({ id: 'log1' });
  deleteAsync = vi.fn().mockResolvedValue(undefined);
  useCreateMealLog.mockReturnValue({ mutateAsync, isPending: false });
  useUpdateMealLog.mockReturnValue({ mutateAsync: updateAsync, isPending: false });
  useDeleteMealLog.mockReturnValue({ mutateAsync: deleteAsync, isPending: false });
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

  it('selecting a result row advances to the ración step with a live CTA; back returns to explore', () => {
    renderSheet();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Recetas' }));
    fireEvent.click(screen.getByText('Ensalada César'));

    // Explore chrome (search box, tabs) is gone; the ración step shows the pick.
    expect(screen.queryByPlaceholderText('Buscar receta, alimento…')).not.toBeInTheDocument();
    expect(screen.getByText('Ensalada César')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a explorar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Añadir a Desayuno' })).toBeEnabled();

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

  describe('ración step', () => {
    const totals = { kcal: 1200, proteinG: 80, carbsG: 120, fatG: 40, fiberG: 10 };
    const targets = { kcal: 2000, proteinG: 140, carbsG: 200, fatG: 70, fiberG: 30 };

    it('projects a recipe selection at the default 1-serving qty and creates it with the recipe source', () => {
      renderSheet({ totals, targets });
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Recetas' }));
      fireEvent.click(screen.getByText('Ensalada César'));

      // added = perServing × 1 serving; projected kcal = 1200 + 320.
      expect(screen.getByText('1520')).toBeInTheDocument();
      expect(screen.getByText('quedan 480 kcal')).toBeInTheDocument();
      expect(screen.getByText('+20 g')).toBeInTheDocument(); // protein
      expect(screen.getByText('+10 g')).toBeInTheDocument(); // carbs
      expect(screen.getByText('+18 g')).toBeInTheDocument(); // fat

      fireEvent.click(screen.getByRole('button', { name: 'Añadir a Desayuno' }));

      expect(mutateAsync).toHaveBeenCalledWith({
        loggedOn: '2026-05-18',
        mealType: 'breakfast',
        source: { kind: 'recipe', recipeId: 'r2', servings: 1 },
        notes: null,
      });
    });

    it('bumping the recipe servings stepper by a quarter re-projects the macros and CTA source', () => {
      renderSheet({ totals, targets });
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Recetas' }));
      fireEvent.click(screen.getByText('Ensalada César'));

      fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad' }));

      // qty 1.25 → added kcal = 320 * 1.25 = 400; projected = 1600.
      expect(screen.getByText('1600')).toBeInTheDocument();
      expect(screen.getByText('+25 g')).toBeInTheDocument(); // protein: 20 * 1.25

      fireEvent.click(screen.getByRole('button', { name: 'Añadir a Desayuno' }));
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ source: { kind: 'recipe', recipeId: 'r2', servings: 1.25 } }),
      );
    });

    it('projects an ingredient selection at the default 100 g qty and creates it with the ingredient source', () => {
      renderSheet({ totals, targets });
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Alimentos' }));
      fireEvent.click(screen.getByText('Manzana'));

      // 100 g of the fixture: kcal 52, protein 1, carbs 14, fat 0.2.
      expect(screen.getByText('1252')).toBeInTheDocument();
      expect(screen.getByText('+1 g')).toBeInTheDocument();
      expect(screen.getByText('+14 g')).toBeInTheDocument();
      expect(screen.getByText('+0.2 g')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Añadir a Desayuno' }));

      expect(mutateAsync).toHaveBeenCalledWith({
        loggedOn: '2026-05-18',
        mealType: 'breakfast',
        source: { kind: 'ingredient', ingredientId: 'i1', quantity: 100 },
        notes: null,
      });
    });

    it('shows the amber over-state alert once the projected kcal exceeds the target', () => {
      renderSheet({ totals: { ...totals, kcal: 1900 }, targets });
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Recetas' }));
      fireEvent.click(screen.getByText('Ensalada César')); // +320 → projected 2220 > 2000

      expect(screen.getByText('te pasas 220 kcal')).toBeInTheDocument();
      expect(screen.getByText(/por encima del objetivo/)).toBeInTheDocument();
    });

    it('the custom entry path blocks submission until name/kcal are filled, then projects and creates with the custom source', async () => {
      renderSheet({ totals, targets });
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Alimentos' }));
      fireEvent.click(screen.getByRole('button', { name: 'Crear alimento personalizado' }));

      fireEvent.click(screen.getByRole('button', { name: /^Añadir a /i }));
      // zodResolver validates asynchronously — the error message lands a tick later.
      await screen.findByText('Pon un nombre.');
      expect(mutateAsync).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Batido casero' } });
      fireEvent.change(screen.getByLabelText('Kcal'), { target: { value: '250' } });
      fireEvent.change(screen.getByLabelText('Proteína (g)'), { target: { value: '30' } });

      // Live projection from the typed numbers, before any submit.
      expect(screen.getByText('1450')).toBeInTheDocument(); // 1200 + 250
      expect(screen.getByText('+30 g')).toBeInTheDocument(); // protein

      fireEvent.click(screen.getByRole('button', { name: /^Añadir a /i }));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
        loggedOn: '2026-05-18',
        mealType: 'breakfast',
        source: {
          kind: 'custom',
          name: 'Batido casero',
          kcal: 250,
          proteinG: 30,
          carbsG: null,
          fatG: null,
          fiberG: null,
        },
        notes: null,
      }));
    });
  });

  describe('edit mode', () => {
    const totals = { kcal: 1200, proteinG: 80, carbsG: 120, fatG: 40, fiberG: 10 };
    const targets = { kcal: 2000, proteinG: 140, carbsG: 200, fatG: 70, fiberG: 30 };

    it('opens straight into the ración step (no explore chrome) with the edit title', () => {
      renderSheet({ editing: EDIT_CUSTOM, totals, targets });
      // The header/a11y title reflects edit, not "add".
      expect(screen.getAllByText('Editar entrada').length).toBeGreaterThan(0);
      // No search box / "back to explore" — explore is skipped in edit mode.
      expect(screen.queryByPlaceholderText('Buscar receta, alimento…')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Volver a explorar' })).not.toBeInTheDocument();
    });

    it('projects against a base that EXCLUDES the edited entry (no double-count), then updates on save', async () => {
      renderSheet({ editing: EDIT_CUSTOM, totals, targets });

      // totals (1200) already includes this entry (300). base = 1200 - 300 = 900;
      // pre-filled custom kcal 300 → projected 1200 (the day is unchanged), NOT
      // 1500 (which is what a naive base of 1200 + 300 would show).
      expect(screen.getByText('1200')).toBeInTheDocument();
      expect(screen.queryByText('1500')).not.toBeInTheDocument();

      // Re-projects on the excluded base: 900 + 400 = 1300.
      fireEvent.change(screen.getByLabelText('Kcal'), { target: { value: '400' } });
      expect(screen.getByText('1300')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
      await waitFor(() =>
        expect(updateAsync).toHaveBeenCalledWith({
          id: 'log9',
          patch: expect.objectContaining({
            meal_type: 'lunch',
            custom_name: 'Yogur',
            custom_kcal: 400,
            custom_protein_g: 20,
          }),
        }),
      );
    });

    it('a recipe entry is locked to its kind with an editable servings stepper, updating on save', () => {
      renderSheet({ editing: EDIT_RECIPE, totals, targets });

      expect(screen.getByText('Ensalada César')).toBeInTheDocument();
      // base = 1200 - 320 = 880; qty 1 → projected 1200.
      expect(screen.getByText('1200')).toBeInTheDocument();

      // qty 1.25 → added 320 * 1.25 = 400 → projected 1280.
      fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad' }));
      expect(screen.getByText('1280')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
      expect(updateAsync).toHaveBeenCalledWith({
        id: 'log8',
        patch: { meal_type: 'lunch', servings: 1.25 },
      });
    });

    it('the delete affordance confirms then deletes the entry', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderSheet({ editing: EDIT_CUSTOM, totals, targets });

      fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
      await waitFor(() => expect(deleteAsync).toHaveBeenCalledWith('log9'));
    });
  });
});
