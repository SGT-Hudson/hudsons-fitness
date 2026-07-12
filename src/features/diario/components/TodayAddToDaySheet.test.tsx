import '@/i18n';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import i18n from '@/i18n';
import type { MealLogWithJoins } from '../api';

// Tier-2: nothing here may reach a real client (green-local/red-CI trap).
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false })); // Drawer

const state = vi.hoisted(() => ({ logs: [] as MealLogWithJoins[] }));

vi.mock('../hooks', () => ({
  useMealLogsForDay: () => ({ data: state.logs, isLoading: false, isError: false }),
  useQuickAddRecipes: () => ({ data: [], isLoading: false }),
  useCreateMealLog: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMealLog: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteMealLog: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/features/recipes/hooks', () => ({ useRecipes: () => ({ data: [], isLoading: false }) }));
vi.mock('@/features/ingredients/hooks', () => ({
  useLocalIngredientSearch: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/features/phases/hooks', () => ({
  useActivePhase: () => ({ data: { phase_type: 'cut', kcal_mode: 'absolute' } }),
}));
vi.mock('@/features/phases/targets', () => ({
  computePhaseTargets: () => ({ kcal: 2200, proteinG: 160, carbsG: 240, fatG: 70, fiberG: 30 }),
}));
vi.mock('@/features/measurements/hooks', () => ({
  useLatestMeasurement: () => ({ data: { weight_kg: 82.9, body_fat_pct: 18 } }),
}));
vi.mock('@/features/tdee/hooks', () => ({
  useLatestTdee: () => ({ data: { estimated_tdee_kcal: 2480 } }),
}));

import { TodayAddToDaySheet } from './TodayAddToDaySheet';
import type { AddSheetSelection } from './AddToDaySheet';

const RECIPE = {
  id: 'r1',
  name: 'Pollo con arroz',
  servings: 2,
  ingredient_count: 4,
  perServing: { kcal: 420, proteinG: 30, carbsG: 40, fatG: 12, fiberG: 6 },
};

/** A fresh object every call — exactly what an un-memoised call site hands us. */
function freshSelection(): AddSheetSelection {
  return { kind: 'recipe', recipe: { ...RECIPE } };
}

function logAt(mealType: string, id: string): MealLogWithJoins {
  return {
    id,
    meal_type: mealType,
    logged_on: '2026-07-12',
    custom_name: 'Algo',
    custom_kcal: 300,
    custom_protein_g: 10,
    custom_carbs_g: 30,
    custom_fat_g: 8,
    custom_fiber_g: 2,
    from_plan: false,
    recipe_id: null,
    ingredient_id: null,
    recipe: null,
    ingredient: null,
  } as unknown as MealLogWithJoins;
}

beforeEach(async () => {
  state.logs = [];
  await i18n.changeLanguage('es');
});

describe('TodayAddToDaySheet', () => {
  it('opens the sheet on the preselected recipe, at the first empty slot of the day', () => {
    state.logs = [logAt('breakfast', 'l1')]; // desayuno taken → lands on comida
    render(<TodayAddToDaySheet open onOpenChange={vi.fn()} selection={freshSelection()} />);

    const group = screen.getByRole('radiogroup', { name: 'Elegir franja' });
    expect(within(group).getByRole('radio', { name: /Comida/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText('Pollo con arroz')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Añadir a Comida' })).toBeEnabled();
  });

  // The sheet's reset effect depends on `initialSelection`, so an object rebuilt
  // on a parent re-render used to re-fire it and snap the chosen slot back to the
  // default. The connector freezes the selection on the recipe's identity.
  it('keeps the user’s chosen meal slot across a parent re-render that rebuilds the selection', () => {
    const { rerender } = render(
      <TodayAddToDaySheet open onOpenChange={vi.fn()} selection={freshSelection()} />,
    );

    const group = screen.getByRole('radiogroup', { name: 'Elegir franja' });
    fireEvent.click(within(group).getByRole('radio', { name: /Cena/ }));
    expect(within(group).getByRole('radio', { name: /Cena/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // A parent re-render (a react-query refetch, a sibling state change…) hands
    // the connector a brand-new, equal selection object.
    rerender(<TodayAddToDaySheet open onOpenChange={vi.fn()} selection={freshSelection()} />);

    expect(
      within(screen.getByRole('radiogroup', { name: 'Elegir franja' })).getByRole('radio', {
        name: /Cena/,
      }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Añadir a Cena' })).toBeEnabled();
  });

  // The real shape of the bug: `defaultAddSlot` comes off an async query. The
  // sheet opens while the day's logs are still in flight (fallback: breakfast);
  // ~200 ms later they land and the default becomes the first empty slot. That
  // must not reach into an open sheet and move the slot the user chose.
  it('keeps the user’s chosen meal slot when the day’s logs resolve after the sheet is open', () => {
    state.logs = []; // query in flight → defaultAddSlot falls back to breakfast
    const { rerender } = render(
      <TodayAddToDaySheet open onOpenChange={vi.fn()} selection={freshSelection()} />,
    );

    const group = screen.getByRole('radiogroup', { name: 'Elegir franja' });
    fireEvent.click(within(group).getByRole('radio', { name: /Cena/ }));
    expect(within(group).getByRole('radio', { name: /Cena/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // The logs land: desayuno is taken → defaultAddSlot flips to 'lunch'.
    state.logs = [logAt('breakfast', 'l1')];
    rerender(<TodayAddToDaySheet open onOpenChange={vi.fn()} selection={freshSelection()} />);

    const after = screen.getByRole('radiogroup', { name: 'Elegir franja' });
    expect(within(after).getByRole('radio', { name: /Cena/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(after).getByRole('radio', { name: /Comida/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Añadir a Cena' })).toBeEnabled();
  });
});
