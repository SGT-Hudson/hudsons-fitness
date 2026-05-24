import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
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

beforeAll(() => {
  void i18n.changeLanguage('es'); // jsdom defaults to English; assert Spanish copy
});

describe('WeekGrid — aligned matrix', () => {
  it('renders each configured meal time once in the gutter', () => {
    renderWithClient(
      <WeekGrid
        weekStart="2026-05-25" todayIso="2026-05-25"
        mealTimes={['08:00', '13:00', '17:00', '21:00']}
        slots={[slot({ id: 's1', meal_index: 0, recipe_name: 'Avena' })]}
        onAdd={noop} onUpdate={noop} onRemove={noop}
      />,
    );
    // Gutter holds one label per meal time (not one per day).
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('21:00')).toBeInTheDocument();
    // 4 periods × 7 days of add affordances.
    expect(screen.getAllByText(/Añadir/i).length).toBeGreaterThanOrEqual(4 * 7);
  });

  it('puts the TOTAL row before the meal periods', () => {
    const { container } = renderWithClient(
      <WeekGrid
        weekStart="2026-05-25" todayIso="2026-05-25"
        mealTimes={['08:00']} slots={[]}
        targets={{ kcal: 2000, proteinG: 150, carbsG: 200, fatG: 65, fiberG: 30 }}
        phaseType="cut"
        onAdd={noop} onUpdate={noop} onRemove={noop}
      />,
    );
    const html = container.innerHTML.toLowerCase();
    // The macro total (kcal) row is rendered above the meal "add" cells.
    expect(html.indexOf('kcal')).toBeGreaterThan(-1);
    expect(html.indexOf('kcal')).toBeLessThan(html.indexOf('añadir'));
  });

  it("shows a populated cell's recipe", () => {
    renderWithClient(
      <WeekGrid
        weekStart="2026-05-25" todayIso="2026-05-25"
        mealTimes={['08:00']}
        slots={[slot({ id: 's1', date: '2026-05-26', recipe_name: 'Tortilla' })]}
        onAdd={noop} onUpdate={noop} onRemove={noop}
      />,
    );
    expect(screen.getByText('Tortilla')).toBeInTheDocument();
  });

  it('renders an orphan slot (meal_index beyond mealTimes) in its own row', () => {
    renderWithClient(
      <WeekGrid
        weekStart="2026-05-25" todayIso="2026-05-25"
        mealTimes={['08:00']}
        slots={[slot({ id: 'o1', date: '2026-05-27', meal_index: 3, meal_time: '23:00', recipe_name: 'Snack' })]}
        onAdd={noop} onUpdate={noop} onRemove={noop}
      />,
    );
    expect(screen.getByText('23:00')).toBeInTheDocument();
    expect(screen.getByText('Snack')).toBeInTheDocument();
  });

  it('marks today (ring) and past days (dimmed)', () => {
    const { container } = renderWithClient(
      <WeekGrid
        weekStart="2026-05-25" todayIso="2026-05-27"
        mealTimes={['08:00']} slots={[]}
        targets={{ kcal: 2000, proteinG: 150, carbsG: 200, fatG: 65, fiberG: 30 }}
        onAdd={noop} onUpdate={noop} onRemove={noop}
      />,
    );
    // 2026-05-25/26 are past (before the 27th); the 27th is today.
    expect(container.querySelector('.ring-primary')).not.toBeNull();
    expect(container.querySelector('.opacity-60')).not.toBeNull();
  });
});
