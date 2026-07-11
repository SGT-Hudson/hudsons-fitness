import i18n from '@/i18n';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    // Meal 1 = "Comida", at 14:00.
    expect(screen.getByText(/Comida/)).toBeInTheDocument();
    expect(screen.getByText(/14:00/)).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: /más|increase|\+/i }));
    // 2 servings: 1500 + 800 = 2300.
    expect(screen.getByTestId('projected-kcal')).toHaveTextContent('2300');
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
});
