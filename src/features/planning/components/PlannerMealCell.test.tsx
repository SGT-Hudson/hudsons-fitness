import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlannerMealCell, type PlannerCellEntry } from './PlannerMealCell';
import { ZERO_MACROS } from '@/features/recipes/macros';

// No QueryClient, no recipe-hook stub: the cell mounts no dialog and touches no
// data layer any more — the page owns the one add drawer and the one peek.

const entry = (over: Partial<PlannerCellEntry> = {}): PlannerCellEntry => ({
  id: 'e1',
  recipe_id: 'r1',
  recipe_name: 'Lentejas estofadas',
  servings: 1,
  macros: { ...ZERO_MACROS, kcal: 542, proteinG: 38, carbsG: 68, fatG: 12 },
  ...over,
});

const noop = () => {};

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('PlannerMealCell', () => {
  it('lists the recipes and sums the cell footer', () => {
    render(
      <PlannerMealCell
        entries={[entry(), entry({ id: 'e2', recipe_name: 'Pan integral', macros: { ...ZERO_MACROS, kcal: 156, proteinG: 6, carbsG: 28, fatG: 2 } })]}
        onAddRequest={noop}
        onOpenEntry={noop}
      />,
    );
    expect(screen.getByText('Lentejas estofadas')).toBeInTheDocument();
    expect(screen.getByText('Pan integral')).toBeInTheDocument();
    expect(screen.getByText('698')).toBeInTheDocument(); // 542 + 156 kcal
    expect(screen.getByText('44')).toBeInTheDocument(); // protein
  });

  it('marks a servings multiplier only when it is not 1', () => {
    render(<PlannerMealCell entries={[entry({ servings: 2 })]} onAddRequest={noop} onOpenEntry={noop} />);
    expect(screen.getByText('×2')).toBeInTheDocument();
  });

  it('renders a dashed empty state whose add affordance raises onAddRequest', async () => {
    const onAddRequest = vi.fn();
    const { container } = render(
      <PlannerMealCell entries={[]} onAddRequest={onAddRequest} onOpenEntry={noop} />,
    );
    expect(container.querySelector('[data-empty="true"]')).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /añadir comida/i }));
    expect(onAddRequest).toHaveBeenCalledTimes(1);
  });

  it('raises onAddRequest from the inline "añadir" of a populated cell', async () => {
    const onAddRequest = vi.fn();
    render(<PlannerMealCell entries={[entry()]} onAddRequest={onAddRequest} onOpenEntry={noop} />);

    await userEvent.click(screen.getByRole('button', { name: /^añadir$/i }));
    expect(onAddRequest).toHaveBeenCalledTimes(1);
  });

  it('raises onOpenEntry with the clicked entry (the page opens the peek)', async () => {
    const onOpenEntry = vi.fn();
    render(<PlannerMealCell entries={[entry()]} onAddRequest={noop} onOpenEntry={onOpenEntry} />);

    await userEvent.click(screen.getByRole('button', { name: /lentejas estofadas/i }));
    expect(onOpenEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1', recipe_id: 'r1' }));
  });

  it('shows the copy affordance only when the cell has entries', async () => {
    const onCopy = vi.fn();
    const { rerender } = render(
      <PlannerMealCell entries={[]} onAddRequest={noop} onOpenEntry={noop} onCopy={onCopy} />,
    );
    expect(screen.queryByRole('button', { name: /copiar/i })).toBeNull();

    rerender(
      <PlannerMealCell entries={[entry()]} onAddRequest={noop} onOpenEntry={noop} onCopy={onCopy} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /copiar/i }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });
});
