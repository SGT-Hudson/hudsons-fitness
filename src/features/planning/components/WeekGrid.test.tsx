import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeekGrid } from './WeekGrid';
import type { WeekSlotWithRecipe } from '@/features/planner/api';
import { ZERO_MACROS } from '@/features/recipes/macros';

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
    render(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00', '13:00', '17:00', '21:00']}
        slots={[slot({ id: 's1' })]}
        onAddRequest={noop}
        onOpenEntry={noop}
      />,
    );
    expect(screen.getByText('Desayuno')).toBeInTheDocument();
    expect(screen.getByText('Cena')).toBeInTheDocument();
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('21:00')).toBeInTheDocument();
  });

  it('renders one day header per day, carrying the day totals', () => {
    const { container } = render(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00']}
        slots={[slot({ id: 's1', macros: { ...ZERO_MACROS, kcal: 500 } })]}
        targets={targets}
        phaseType="cut"
        onAddRequest={noop}
        onOpenEntry={noop}
      />,
    );
    const headers = container.querySelectorAll('[data-day-header]');
    expect(headers.length).toBe(7);
    // Monday's kcal hero — scoped to the header, since the same "500" also
    // shows up in that day's populated meal cell footer.
    expect(within(headers[0] as HTMLElement).getByText('500')).toBeInTheDocument();
  });

  it("shows a populated cell's recipe", () => {
    render(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00']}
        slots={[slot({ id: 's1', date: '2026-05-26', recipe_name: 'Tortilla' })]}
        onAddRequest={noop}
        onOpenEntry={noop}
      />,
    );
    expect(screen.getByText('Tortilla')).toBeInTheDocument();
  });

  it('renders an orphan slot (meal_index beyond mealTimes) in its own numbered row', () => {
    render(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00']}
        slots={[
          slot({ id: 'o1', date: '2026-05-27', meal_index: 4, meal_time: '23:00', recipe_name: 'Snack' }),
        ]}
        onAddRequest={noop}
        onOpenEntry={noop}
      />,
    );
    expect(screen.getByText('Comida 5')).toBeInTheDocument();
    expect(screen.getByText('23:00')).toBeInTheDocument();
    expect(screen.getByText('Snack')).toBeInTheDocument();
  });

  it('outlines today neutrally and dims past days', () => {
    const { container } = render(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-27"
        mealTimes={['08:00']}
        slots={[]}
        targets={targets}
        onAddRequest={noop}
        onOpenEntry={noop}
      />,
    );
    expect(container.querySelector('[data-day-header].border-text-dim')).not.toBeNull();
    expect(container.querySelector('.opacity-60')).not.toBeNull();
  });
});

// The grid holds no dialog of its own: it raises the cell's coordinates and the
// page opens the single add drawer / recipe peek on them.
describe('WeekGrid — cell intents', () => {
  it("raises onAddRequest with the empty cell's (date, mealIndex, mealTime)", async () => {
    const onAddRequest = vi.fn();
    render(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00', '14:00']}
        slots={[]}
        onAddRequest={onAddRequest}
        onOpenEntry={noop}
      />,
    );

    // First cell of the matrix: Monday 25, breakfast (08:00).
    const cells = screen.getAllByRole('button', { name: /añadir comida/i });
    await userEvent.click(cells[0]);
    expect(onAddRequest).toHaveBeenCalledWith('2026-05-25', 0, '08:00');
  });

  it("raises onOpenEntry with the bullet's entry and its cell's coordinates", async () => {
    const onOpenEntry = vi.fn();
    render(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00', '14:00']}
        slots={[slot({ id: 's1', date: '2026-05-27', meal_index: 1, meal_time: '14:00', recipe_name: 'Tortilla' })]}
        onAddRequest={noop}
        onOpenEntry={onOpenEntry}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /tortilla/i }));
    expect(onOpenEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1', recipe_name: 'Tortilla' }),
      '2026-05-27',
      1,
      '14:00',
    );
  });
});
