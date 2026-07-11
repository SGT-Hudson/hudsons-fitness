import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WeekGrid } from './WeekGrid';
import type { WeekSlotWithRecipe } from '@/features/planner/api';
import { ZERO_MACROS } from '@/features/recipes/macros';

vi.mock('@/features/recipes/hooks', () => ({
  useRecipes: () => ({ data: [], isLoading: false }),
}));

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const slot = (over: Partial<WeekSlotWithRecipe>): WeekSlotWithRecipe => ({
  id: 'id',
  date: '2026-05-25',
  meal_index: 0,
  meal_time: '08:00',
  recipe_id: 'r',
  recipe_name: 'Avena',
  servings: 1,
  display_order: 0,
  macros: ZERO_MACROS,
  ...over,
});

const targets = { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 65, fiberG: 30 };
const noop = () => {};

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('WeekGrid — aligned matrix', () => {
  it('labels each configured meal row with its name and time', () => {
    renderWithClient(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00', '13:00', '17:00', '21:00']}
        slots={[slot({ id: 's1' })]}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByText('Desayuno')).toBeInTheDocument();
    expect(screen.getByText('Cena')).toBeInTheDocument();
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('21:00')).toBeInTheDocument();
  });

  it('renders one day header per day, carrying the day totals', () => {
    const { container } = renderWithClient(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00']}
        slots={[slot({ id: 's1', macros: { ...ZERO_MACROS, kcal: 500 } })]}
        targets={targets}
        phaseType="cut"
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    );
    const headers = container.querySelectorAll('[data-day-header]');
    expect(headers.length).toBe(7);
    // Monday's kcal hero — scoped to the header, since the same "500" also
    // shows up in that day's populated meal cell footer.
    expect(within(headers[0] as HTMLElement).getByText('500')).toBeInTheDocument();
  });

  it("shows a populated cell's recipe", () => {
    renderWithClient(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00']}
        slots={[slot({ id: 's1', date: '2026-05-26', recipe_name: 'Tortilla' })]}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByText('Tortilla')).toBeInTheDocument();
  });

  it('renders an orphan slot (meal_index beyond mealTimes) in its own numbered row', () => {
    renderWithClient(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00']}
        slots={[
          slot({ id: 'o1', date: '2026-05-27', meal_index: 4, meal_time: '23:00', recipe_name: 'Snack' }),
        ]}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByText('Comida 5')).toBeInTheDocument();
    expect(screen.getByText('23:00')).toBeInTheDocument();
    expect(screen.getByText('Snack')).toBeInTheDocument();
  });

  it('outlines today neutrally and dims past days', () => {
    const { container } = renderWithClient(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-27"
        mealTimes={['08:00']}
        slots={[]}
        targets={targets}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    );
    expect(container.querySelector('[data-day-header].border-text-dim')).not.toBeNull();
    expect(container.querySelector('.opacity-60')).not.toBeNull();
  });
});
