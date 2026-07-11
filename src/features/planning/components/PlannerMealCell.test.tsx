import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlannerMealCell, type PlannerCellEntry } from './PlannerMealCell';
import { ZERO_MACROS } from '@/features/recipes/macros';

// The cell mounts the (closed) RecipePickerDialog, which transitively imports the
// Supabase client; stub the recipe hook so the import chain stays inert.
vi.mock('@/features/recipes/hooks', () => ({
  useRecipes: () => ({ data: [], isLoading: false }),
}));

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

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
    renderWithClient(
      <PlannerMealCell
        entries={[entry(), entry({ id: 'e2', recipe_name: 'Pan integral', macros: { ...ZERO_MACROS, kcal: 156, proteinG: 6, carbsG: 28, fatG: 2 } })]}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByText('Lentejas estofadas')).toBeInTheDocument();
    expect(screen.getByText('Pan integral')).toBeInTheDocument();
    expect(screen.getByText('698')).toBeInTheDocument(); // 542 + 156 kcal
    expect(screen.getByText('44')).toBeInTheDocument(); // protein
  });

  it('marks a servings multiplier only when it is not 1', () => {
    renderWithClient(
      <PlannerMealCell entries={[entry({ servings: 2 })]} onAdd={noop} onUpdate={noop} onRemove={noop} />,
    );
    expect(screen.getByText('×2')).toBeInTheDocument();
  });

  it('renders a dashed empty state with an add affordance', () => {
    const { container } = renderWithClient(
      <PlannerMealCell entries={[]} onAdd={noop} onUpdate={noop} onRemove={noop} />,
    );
    expect(container.querySelector('[data-empty="true"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /añadir comida/i })).toBeInTheDocument();
  });

  it('shows the copy affordance only when the cell has entries', async () => {
    const onCopy = vi.fn();
    const { rerender } = renderWithClient(
      <PlannerMealCell entries={[]} onAdd={noop} onUpdate={noop} onRemove={noop} onCopy={onCopy} />,
    );
    expect(screen.queryByRole('button', { name: /copiar/i })).toBeNull();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <PlannerMealCell entries={[entry()]} onAdd={noop} onUpdate={noop} onRemove={noop} onCopy={onCopy} />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: /copiar/i }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });
});
