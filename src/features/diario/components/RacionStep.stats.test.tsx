import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '@/i18n';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false }));
vi.mock('@/lib/stats', () => ({ track: vi.fn() }));

const useCreateMealLog = vi.fn();
const useUpdateMealLog = vi.fn();
vi.mock('../hooks', () => ({
  useQuickAddRecipes: () => ({ data: [], isLoading: false }),
  useCreateMealLog: () => useCreateMealLog(),
  useUpdateMealLog: () => useUpdateMealLog(),
  useDeleteMealLog: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const Z = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };
const RECIPES = [
  { id: 'r2', name: 'Ensalada César', servings: 1, ingredient_count: 5, perServing: { ...Z, kcal: 320 } },
];
vi.mock('@/features/recipes/hooks', () => ({
  useRecipes: () => ({ data: RECIPES, isLoading: false }),
}));
const INGREDIENTS = [
  {
    id: 'i1', name: 'Manzana', name_en: 'Apple', brand: null, unit_type: 'g',
    kcal_per_unit: 52, protein_g_per_unit: 1, carbs_g_per_unit: 14, fat_g_per_unit: 0.2,
    fiber_g_per_unit: 2.4, sugar_g_per_unit: null, saturated_fat_g_per_unit: null,
    source: 'system', is_verified: true, created_at: '', updated_at: '',
    created_by_user_id: null, external_id: null,
  },
];
vi.mock('@/features/ingredients/hooks', () => ({
  useLocalIngredientSearch: () => ({ data: INGREDIENTS, isLoading: false }),
}));

import { track } from '@/lib/stats';
import { AddToDaySheet } from './AddToDaySheet';
import type { MealLogWithJoins } from '../api';

const EDIT_CUSTOM = {
  id: 'log9', user_id: 'u1', logged_on: '2026-05-18', meal_type: 'lunch', notes: null,
  from_plan: false, recipe_id: null, ingredient_id: null, servings: null, quantity: null,
  custom_name: 'Yogur', custom_kcal: 300, custom_protein_g: 20, custom_carbs_g: 10,
  custom_fat_g: 5, custom_fiber_g: 0, custom_sugar_g: null, custom_saturated_fat_g: null,
  plan_week_slot_id: null, created_at: '', recipe: null, ingredient: null,
} as unknown as MealLogWithJoins;

let create: ReturnType<typeof vi.fn>;
let update: ReturnType<typeof vi.fn>;
let onOpenChange: ReturnType<typeof vi.fn>;

function renderSheet(extra: Partial<Parameters<typeof AddToDaySheet>[0]> = {}) {
  onOpenChange = vi.fn();
  render(
    <AddToDaySheet
      open
      onOpenChange={onOpenChange}
      loggedOn="2026-05-18"
      initialMealType="breakfast"
      mealSubtotals={{}}
      totals={{ ...Z, kcal: 1200 }}
      targets={{ ...Z, kcal: 2000 }}
      {...extra}
    />,
  );
}

const addButton = () => screen.getByRole('button', { name: /^Añadir a /i });

beforeEach(async () => {
  vi.clearAllMocks();
  create = vi.fn().mockResolvedValue({ id: 'log1' });
  update = vi.fn().mockResolvedValue({ id: 'log1' });
  useCreateMealLog.mockReturnValue({ mutateAsync: create, isPending: false });
  useUpdateMealLog.mockReturnValue({ mutateAsync: update, isPending: false });
  await i18n.changeLanguage('es');
});

describe('RacionStep events', () => {
  it('tracks registrar-comida (receta) after creating from a recipe, before closing', async () => {
    renderSheet();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Recetas' }));
    fireEvent.click(screen.getByText('Ensalada César'));
    fireEvent.click(addButton());
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
    expect(track).toHaveBeenCalledWith('registrar-comida', { origen: 'receta' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalled());
  });

  it('tracks registrar-comida (ingrediente) after creating from an ingredient', async () => {
    renderSheet();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Alimentos' }));
    fireEvent.click(screen.getByText('Manzana'));
    fireEvent.click(addButton());
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
    expect(track).toHaveBeenCalledWith('registrar-comida', { origen: 'ingrediente' });
  });

  it('tracks registrar-comida (propia) after creating a custom food', async () => {
    renderSheet();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Alimentos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear alimento personalizado' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Batido casero' } });
    fireEvent.change(screen.getByLabelText('Kcal'), { target: { value: '250' } });
    fireEvent.click(addButton());
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
    expect(track).toHaveBeenCalledWith('registrar-comida', { origen: 'propia' });
  });

  it('tracks nothing when creating fails', async () => {
    create.mockRejectedValue(new Error('fail'));
    renderSheet();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Recetas' }));
    fireEvent.click(screen.getByText('Ensalada César'));
    fireEvent.click(addButton());
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(track).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('tracks nothing when editing an entry', async () => {
    renderSheet({ editing: EDIT_CUSTOM });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalled());
    expect(track).not.toHaveBeenCalled();
  });
});
