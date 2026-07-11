import i18n from '@/i18n';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddRecipeDrawer } from './AddRecipeDrawer';
import { type Macros } from '@/features/recipes/macros';

const perServing: Macros = { kcal: 400, proteinG: 30, carbsG: 45, fatG: 10, fiberG: 4 };

vi.mock('@/features/recipes/hooks', () => ({
  useRecipes: () => ({
    data: [
      { id: 'r1', name: 'Lentejas estofadas', servings: 4, description: null, updated_at: '', ingredient_count: 5, meal_types: ['lunch'], labels: {}, perServing },
      { id: 'r2', name: 'Tortilla francesa', servings: 1, description: null, updated_at: '', ingredient_count: 2, meal_types: ['dinner'], labels: {}, perServing: { ...perServing, kcal: 188 } },
    ],
    isLoading: false,
  }),
}));

// jsdom has no matchMedia; ResponsiveDialog needs one. Desktop branch.
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: true, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

const targetDay = {
  date: '2026-05-28',
  mealIndex: 1,
  mealTime: '14:00',
  dayTotals: { kcal: 1500, proteinG: 100, carbsG: 150, fatG: 40, fiberG: 20 } as Macros,
};

const macroTargets: Macros = { kcal: 2200, proteinG: 160, carbsG: 250, fatG: 70, fiberG: 30 };

const noop = () => {};

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('AddRecipeDrawer', () => {
  it('names its destination slot', () => {
    render(
      <AddRecipeDrawer open onOpenChange={noop} target={targetDay} targets={macroTargets}
        onAdd={noop} onUpdate={noop} onRemove={noop} />,
    );
    // Meal 1 = "Comida", at 14:00. Scoped to the destination line — a meal-type
    // filter chip also reads "Comida" (lunch), so an unscoped query would collide.
    const destination = screen.getByTestId('destination');
    expect(destination).toHaveTextContent(/Comida/);
    expect(destination).toHaveTextContent(/14:00/);
  });

  it('filters the recipe list by the search box', async () => {
    const user = userEvent.setup();
    render(
      <AddRecipeDrawer open onOpenChange={noop} target={targetDay} targets={macroTargets}
        onAdd={noop} onUpdate={noop} onRemove={noop} />,
    );
    expect(screen.getByText('Tortilla francesa')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'lentej');
    expect(screen.getByText('Lentejas estofadas')).toBeInTheDocument();
    expect(screen.queryByText('Tortilla francesa')).toBeNull();
  });

  it('projects the day balance once a recipe is picked, and follows the servings stepper', async () => {
    const user = userEvent.setup();
    render(
      <AddRecipeDrawer open onOpenChange={noop} target={targetDay} targets={macroTargets}
        onAdd={noop} onUpdate={noop} onRemove={noop} />,
    );
    await user.click(screen.getByText('Lentejas estofadas'));

    // 1 serving: 1500 + 400 = 1900 projected kcal.
    expect(screen.getByTestId('projected-kcal')).toHaveTextContent('1900');
    // Protein proj bar: base 100, added 30. (The dialog is portaled out of
    // `container` — query the document.)
    const p = document.body.querySelector('[data-metric="protein"]');
    expect(p).not.toBeNull();

    // The stepper moves in half-serving increments across the whole range
    // (matches the Diario's ración stepper): 1 -> 1.5, not 1 -> 2.
    await user.click(screen.getByRole('button', { name: /más|increase|\+/i }));
    // 1.5 servings: 1500 + 600 = 2100.
    expect(screen.getByTestId('projected-kcal')).toHaveTextContent('2100');
  });

  it('adds the picked recipe with its servings', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <AddRecipeDrawer open onOpenChange={noop} target={targetDay} targets={macroTargets}
        onAdd={onAdd} onUpdate={noop} onRemove={noop} />,
    );
    await user.click(screen.getByText('Lentejas estofadas'));
    await user.click(screen.getByRole('button', { name: /añadir a/i }));
    expect(onAdd).toHaveBeenCalledWith('r1', 'Lentejas estofadas', 1);
  });

  it('opens pre-filled in edit mode and does not double-count the edited entry', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <AddRecipeDrawer
        open
        onOpenChange={noop}
        // The day's 1900 kcal ALREADY include this entry's 400.
        target={{ ...targetDay, dayTotals: { kcal: 1900, proteinG: 130, carbsG: 195, fatG: 50, fiberG: 24 } }}
        editing={{ id: 'e1', recipe_id: 'r1', recipe_name: 'Lentejas estofadas', servings: 1, macros: perServing }}
        targets={macroTargets}
        onAdd={noop}
        onUpdate={onUpdate}
        onRemove={noop}
      />,
    );
    // Base is 1900 − 400 = 1500, so the projection at 1 serving is 1900 again (not 2300).
    expect(screen.getByTestId('projected-kcal')).toHaveTextContent('1900');
    await user.click(screen.getByRole('button', { name: /guardar|añadir a/i }));
    expect(onUpdate).toHaveBeenCalledWith('e1', 'r1', 'Lentejas estofadas', 1);
  });

  it('filters the recipe list by meal-type chips, composing with the search box', async () => {
    const user = userEvent.setup();
    render(
      <AddRecipeDrawer open onOpenChange={noop} target={targetDay} targets={macroTargets}
        onAdd={noop} onUpdate={noop} onRemove={noop} />,
    );
    // Both recipes visible with no filter applied.
    expect(screen.getByText('Lentejas estofadas')).toBeInTheDocument();
    expect(screen.getByText('Tortilla francesa')).toBeInTheDocument();

    // Scoped to the chip group by role — avoids colliding with the "Comida"
    // destino chip text asserted in the destination test above.
    const group = screen.getByRole('radiogroup', { name: /tipo de comida/i });
    expect(within(group).getByRole('radio', { name: 'Todas' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // r2 (Tortilla francesa) carries meal_types: ['dinner'] -> "Cena".
    await user.click(within(group).getByRole('radio', { name: 'Cena' }));
    expect(screen.getByText('Tortilla francesa')).toBeInTheDocument();
    expect(screen.queryByText('Lentejas estofadas')).toBeNull();

    // Chips compose (AND) with the search box.
    await user.type(screen.getByRole('searchbox'), 'lentej');
    expect(screen.queryByText('Tortilla francesa')).toBeNull();
    expect(screen.queryByText('Lentejas estofadas')).toBeNull();

    // "Todas" clears the meal-type facet; the search term still narrows it.
    await user.click(within(group).getByRole('radio', { name: 'Todas' }));
    expect(screen.getByText('Lentejas estofadas')).toBeInTheDocument();
    expect(screen.queryByText('Tortilla francesa')).toBeNull();
  });

  it('offers delete only in edit mode', () => {
    const { rerender } = render(
      <AddRecipeDrawer open onOpenChange={noop} target={targetDay} targets={macroTargets}
        onAdd={noop} onUpdate={noop} onRemove={noop} />,
    );
    expect(screen.queryByRole('button', { name: /quitar|eliminar/i })).toBeNull();

    rerender(
      <AddRecipeDrawer open onOpenChange={noop} target={targetDay} targets={macroTargets}
        editing={{ id: 'e1', recipe_id: 'r1', recipe_name: 'Lentejas estofadas', servings: 1, macros: perServing }}
        onAdd={noop} onUpdate={noop} onRemove={noop} />,
    );
    expect(screen.getByRole('button', { name: /quitar|eliminar/i })).toBeInTheDocument();
  });

  it('replaces the date-derived destino chip with an explicit destinationLabel when given one', () => {
    render(
      <AddRecipeDrawer open onOpenChange={noop} target={targetDay} targets={macroTargets}
        destinationLabel="Lunes · Comida" onAdd={noop} onUpdate={noop} onRemove={noop} />,
    );
    const destination = screen.getByTestId('destination');
    expect(destination).toHaveTextContent('Lunes · Comida');
    // The date-derived chip (weekday-of-date + time) must not leak through.
    expect(destination).not.toHaveTextContent('14:00');
  });

  it('falls back to the date-derived destino chip when no destinationLabel is given', () => {
    render(
      <AddRecipeDrawer open onOpenChange={noop} target={targetDay} targets={macroTargets}
        onAdd={noop} onUpdate={noop} onRemove={noop} />,
    );
    const destination = screen.getByTestId('destination');
    expect(destination).toHaveTextContent(/Comida/);
    expect(destination).toHaveTextContent('14:00');
  });
});
