import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateGrid, type TemplateSlotInput } from './TemplateGrid';
import { type Macros } from '@/features/recipes/macros';

const slot = (
  over: Partial<TemplateSlotInput> & { day_of_week: number; meal_index: number },
): TemplateSlotInput => ({
  rowId: 'r1',
  recipe_id: 'rec',
  recipe_name: 'Avena',
  servings: 1,
  display_order: 0,
  ...over,
});

const noop = () => {};

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('TemplateGrid — matrix', () => {
  it('renders one day header per weekday, with its full localized label', () => {
    const { container } = render(
      <TemplateGrid
        mealTimes={['08:00']}
        slots={[]}
        onAddRequest={noop}
        onOpenEntry={noop}
      />,
    );
    const headers = container.querySelectorAll('[data-day-header]');
    expect(headers.length).toBe(7);
    expect(screen.getByText('Lunes')).toBeInTheDocument();
    expect(screen.getByText('Domingo')).toBeInTheDocument();
  });

  it('labels each meal row with its name and time', () => {
    render(
      <TemplateGrid
        mealTimes={['08:00', '13:00', '17:00', '21:00']}
        slots={[]}
        onAddRequest={noop}
        onOpenEntry={noop}
      />,
    );
    expect(screen.getByText('Desayuno')).toBeInTheDocument();
    expect(screen.getByText('Cena')).toBeInTheDocument();
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('21:00')).toBeInTheDocument();
  });

  it("shows a populated cell's recipe", () => {
    render(
      <TemplateGrid
        mealTimes={['08:00']}
        slots={[slot({ day_of_week: 2, meal_index: 0, recipe_name: 'Tortilla' })]}
        onAddRequest={noop}
        onOpenEntry={noop}
      />,
    );
    expect(screen.getByText('Tortilla')).toBeInTheDocument();
  });

  it('carries per-day macro totals into the matching weekday header (Monday = day_of_week 0)', () => {
    const recipeMacros = new Map<string, Macros>([
      ['rec', { kcal: 500, proteinG: 40, carbsG: 60, fatG: 10, fiberG: 5 }],
    ]);
    const { container } = render(
      <TemplateGrid
        mealTimes={['08:00']}
        slots={[slot({ day_of_week: 0, meal_index: 0, recipe_id: 'rec' })]}
        recipeMacros={recipeMacros}
        targets={{ kcal: 2000, proteinG: 150, carbsG: 200, fatG: 65, fiberG: 30 }}
        phaseType="cut"
        onAddRequest={noop}
        onOpenEntry={noop}
      />,
    );
    const headers = container.querySelectorAll('[data-day-header]');
    expect(within(headers[0] as HTMLElement).getByText('500')).toBeInTheDocument();
  });

  it('has no today outline and no past-day dimming — a template has no today', () => {
    const { container } = render(
      <TemplateGrid
        mealTimes={['08:00']}
        slots={[]}
        targets={{ kcal: 2000, proteinG: 150, carbsG: 200, fatG: 65, fiberG: 30 }}
        onAddRequest={noop}
        onOpenEntry={noop}
      />,
    );
    expect(container.querySelector('[data-day-header].border-text-dim')).toBeNull();
    expect(container.querySelector('[data-day-header].opacity-60')).toBeNull();
  });
});

// The grid holds no dialog of its own: it raises the cell's coordinates and the
// page opens the single picker on them (mirroring WeekGrid's cell intents).
describe('TemplateGrid — cell intents', () => {
  it("raises onAddRequest with the empty cell's (dayOfWeek, mealIndex)", async () => {
    const onAddRequest = vi.fn();
    render(
      <TemplateGrid
        mealTimes={['08:00', '14:00']}
        slots={[]}
        onAddRequest={onAddRequest}
        onOpenEntry={noop}
      />,
    );
    // First cell of the matrix: Monday, breakfast (08:00).
    const cells = screen.getAllByRole('button', { name: /añadir comida/i });
    await userEvent.click(cells[0]);
    expect(onAddRequest).toHaveBeenCalledWith(0, 0);
  });

  it("raises onOpenEntry with the bullet's entry and its cell's (dayOfWeek, mealIndex)", async () => {
    const onOpenEntry = vi.fn();
    render(
      <TemplateGrid
        mealTimes={['08:00', '14:00']}
        slots={[slot({ day_of_week: 3, meal_index: 1, recipe_name: 'Tortilla' })]}
        onAddRequest={noop}
        onOpenEntry={onOpenEntry}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /tortilla/i }));
    expect(onOpenEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r1', recipe_name: 'Tortilla' }),
      3,
      1,
    );
  });

  it("raises onCopyMeal with the cell's (dayOfWeek, mealIndex)", async () => {
    const onCopyMeal = vi.fn();
    render(
      <TemplateGrid
        mealTimes={['08:00']}
        slots={[slot({ day_of_week: 1, meal_index: 0, recipe_name: 'Tortilla' })]}
        onAddRequest={noop}
        onOpenEntry={noop}
        onCopyMeal={onCopyMeal}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /copiar comida/i }));
    expect(onCopyMeal).toHaveBeenCalledWith(1, 0);
  });
});
