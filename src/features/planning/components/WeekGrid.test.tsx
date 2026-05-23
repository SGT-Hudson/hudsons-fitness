import i18n from '@/i18n';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WeekGrid } from './WeekGrid';
import type { WeekSlotWithRecipe } from '@/features/planner/api';
import { ZERO_MACROS } from '@/features/recipes/macros';

// SlotCell renders the (closed) RecipePickerDialog, which transitively imports the
// Supabase client; stub the recipe data hook so the import chain stays inert.
vi.mock('@/features/recipes/hooks', () => ({
  useRecipes: () => ({ data: [], isLoading: false }),
}));

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const slot = (over: Partial<WeekSlotWithRecipe>): WeekSlotWithRecipe => ({
  id: 'id', date: '2026-05-25', meal_index: 0, meal_time: '08:00',
  recipe_id: 'r', recipe_name: 'Avena', servings: 1, display_order: 0,
  macros: ZERO_MACROS, ...over,
});

const noop = () => {};

// jsdom defaults to English; the assertions below match the Spanish copy.
beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('WeekGrid — all periods visible', () => {
  it('renders every meal period from mealTimes, including empty ones', () => {
    renderWithClient(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00', '13:00', '17:00', '21:00']}
        slots={[slot({ id: 's1', meal_index: 0, recipe_name: 'Avena' })]}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getAllByText('08:00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('13:00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('17:00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('21:00').length).toBeGreaterThan(0);
    // Empty periods expose the add affordance: 4 periods × 7 days.
    expect(screen.getAllByText(/Añadir/i).length).toBeGreaterThanOrEqual(4 * 7);
  });

  it('renders the day summary AFTER the meal periods (bottom of the card)', () => {
    const { container } = renderWithClient(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00']}
        slots={[]}
        targets={{ kcal: 2000, proteinG: 150, carbsG: 200, fatG: 65, fiberG: 30 }}
        phaseType="cut"
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    );
    const card = container.querySelector('.grid > div') as HTMLElement;
    const html = card.innerHTML;
    expect(html.indexOf('Añadir')).toBeGreaterThan(-1);
    expect(html.toLowerCase().indexOf('kcal')).toBeGreaterThan(html.indexOf('Añadir'));
  });
});
