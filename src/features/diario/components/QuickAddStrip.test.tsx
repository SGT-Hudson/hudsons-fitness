import '@/i18n';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuickAddStrip } from './QuickAddStrip';

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mutate = vi.fn();
vi.mock('../hooks', () => ({
  useQuickAddMealLog: () => ({ mutate, isPending: false }),
  deleteMealLog: vi.fn(),
  toastUndoableQuickAdd: vi.fn(),
}));

describe('QuickAddStrip', () => {
  it('renders chips and fires the mutation with meal + recipe on click', () => {
    renderWithClient(
      <QuickAddStrip
        mealType="dinner"
        date="2026-05-18"
        items={[{ recipeId: 'r1', name: 'Salmón', kcalPerServing: 480 }]}
        onAddRecipe={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Salmón/ }));
    expect(mutate).toHaveBeenCalledWith(
      { recipeId: 'r1', mealType: 'dinner', loggedOn: '2026-05-18' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('shows at most 3 chips, ellipsis-truncating long names and keeping the full name in the title', () => {
    renderWithClient(
      <QuickAddStrip
        mealType="dinner"
        date="2026-05-18"
        items={[
          { recipeId: 'r1', name: 'Ensalada de garbanzos con atún', kcalPerServing: 320 },
          { recipeId: 'r2', name: 'Pollo', kcalPerServing: 297 },
          { recipeId: 'r3', name: 'Arroz', kcalPerServing: 260 },
          { recipeId: 'r4', name: 'Lentejas', kcalPerServing: 210 },
        ]}
        onAddRecipe={vi.fn()}
      />,
    );
    const chipButtons = screen.getAllByRole('button', {
      name: /^(añadir (?!receta$)|add (?!recipe$))/i,
    });
    expect(chipButtons).toHaveLength(3);

    const longChip = screen.getByTitle('Ensalada de garbanzos con atún');
    expect(longChip).toHaveTextContent('Ensalada de garba…');
    expect(screen.getByText('Pollo')).toBeInTheDocument();
  });

  it('renders the "add recipe" button and fires onAddRecipe when there are no quick-add items', () => {
    const onAddRecipe = vi.fn();
    renderWithClient(
      <QuickAddStrip
        mealType="lunch"
        date="2026-05-18"
        items={[]}
        onAddRecipe={onAddRecipe}
      />,
    );
    expect(
      screen.queryByText(/recomendaciones|recommendations/i),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /añadir receta|add recipe/i }),
    );
    expect(onAddRecipe).toHaveBeenCalledTimes(1);
  });

  it('only mounts at md+ (hidden on mobile, matching canvas parity)', () => {
    const { container } = renderWithClient(
      <QuickAddStrip
        mealType="lunch"
        date="2026-05-18"
        items={[{ recipeId: 'r1', name: 'Salmón', kcalPerServing: 480 }]}
        onAddRecipe={vi.fn()}
      />,
    );
    expect(container.firstChild).toHaveClass('hidden', 'md:flex');
  });
});
