import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TodayPlanList, type TodayMeal } from './TodayPlanList';
import { ZERO_MACROS } from '@/features/recipes/macros';

const meals: TodayMeal[] = [
  {
    mealIndex: 0,
    mealTime: '08:00',
    entries: [
      {
        id: 'e1',
        recipe_id: 'r1',
        recipe_name: 'Avena con plátano',
        servings: 1,
        macros: { ...ZERO_MACROS, kcal: 318, proteinG: 12, carbsG: 55, fatG: 6 },
      },
      {
        id: 'e2',
        recipe_id: 'r2',
        recipe_name: 'Yogur griego',
        servings: 1,
        macros: { ...ZERO_MACROS, kcal: 109, proteinG: 10, carbsG: 5, fatG: 5 },
      },
    ],
  },
  { mealIndex: 1, mealTime: '14:00', entries: [] },
];

const noop = () => {};

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('TodayPlanList', () => {
  it('groups recipes under their meal, with the meal kcal subtotal', () => {
    render(<TodayPlanList meals={meals} onAddMeal={noop} onCopyMeal={noop} onOpenEntry={noop} />);
    expect(screen.getByText('Desayuno')).toBeInTheDocument();
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('427')).toBeInTheDocument(); // 318 + 109
    expect(screen.getByText('Avena con plátano')).toBeInTheDocument();
  });

  it('shows each recipe macro triad', () => {
    const { container } = render(
      <TodayPlanList meals={meals} onAddMeal={noop} onCopyMeal={noop} onOpenEntry={noop} />,
    );
    const triad = container.querySelector('[data-triad="e1"]');
    expect(triad?.textContent).toContain('12');
    expect(triad?.textContent).toContain('55');
    expect(triad?.textContent).toContain('6');
  });

  it('copies a meal and opens an entry through its callbacks', async () => {
    const onCopyMeal = vi.fn();
    const onOpenEntry = vi.fn();
    render(
      <TodayPlanList meals={meals} onAddMeal={noop} onCopyMeal={onCopyMeal} onOpenEntry={onOpenEntry} />,
    );
    await userEvent.click(screen.getAllByRole('button', { name: /copiar/i })[0]);
    expect(onCopyMeal).toHaveBeenCalledWith(0);

    await userEvent.click(screen.getByText('Avena con plátano'));
    expect(onOpenEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
  });

  it('offers an add affordance for an empty meal and for the day', async () => {
    const onAddMeal = vi.fn();
    render(
      <TodayPlanList meals={meals} onAddMeal={onAddMeal} onCopyMeal={noop} onOpenEntry={noop} />,
    );
    // The day-level "Añadir comida" footer targets the next free meal index.
    await userEvent.click(screen.getByRole('button', { name: /^Añadir comida$/i }));
    expect(onAddMeal).toHaveBeenCalled();
  });
});
