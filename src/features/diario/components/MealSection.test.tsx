import '@/i18n';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MealSection } from './MealSection';
import type { MealLogWithJoins } from '../api';

const mutate = vi.fn();
vi.mock('../hooks', () => ({
  useQuickAddMealLog: () => ({ mutate, isPending: false }),
  deleteMealLog: vi.fn(),
  toastUndoableQuickAdd: vi.fn(),
}));

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function makeLog(overrides: Partial<MealLogWithJoins> = {}): MealLogWithJoins {
  return {
    id: 'log-1',
    user_id: 'u1',
    logged_on: '2026-05-18',
    meal_type: 'breakfast',
    notes: null,
    from_plan: false,
    recipe_id: null,
    ingredient_id: null,
    servings: null,
    quantity: null,
    custom_name: 'Avena con plátano',
    custom_kcal: 318,
    custom_protein_g: 11,
    custom_carbs_g: 58,
    custom_fat_g: 5,
    custom_fiber_g: 4,
    custom_sugar_g: null,
    custom_saturated_fat_g: null,
    plan_week_slot_id: null,
    created_at: '2026-05-18T08:00:00Z',
    recipe: null,
    ingredient: null,
    ...overrides,
  };
}

describe('MealSection', () => {
  it('renders the empty state and the entry list is absent when there are no items', () => {
    renderWithClient(
      <MealSection
        mealType="dinner"
        date="2026-05-18"
        items={[]}
        quickAddItems={[]}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText(/cena|dinner/i)).toBeInTheDocument();
    expect(screen.getByText(/sin registros|nothing logged/i)).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('renders the kcal subtotal and one row per item', () => {
    renderWithClient(
      <MealSection
        mealType="breakfast"
        date="2026-05-18"
        items={[makeLog(), makeLog({ id: 'log-2', custom_name: 'Café', custom_kcal: 68 })]}
        quickAddItems={[]}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('386')).toBeInTheDocument(); // 318 + 68
    expect(screen.getByText('Avena con plátano')).toBeInTheDocument();
    expect(screen.getByText('Café')).toBeInTheDocument();
  });

  it('fires onAdd with the meal type when the + button is clicked', () => {
    const onAdd = vi.fn();
    renderWithClient(
      <MealSection
        mealType="lunch"
        date="2026-05-18"
        items={[]}
        quickAddItems={[]}
        onAdd={onAdd}
        onEdit={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /añadir a esta comida|add to this meal/i }));
    expect(onAdd).toHaveBeenCalledWith('lunch');
  });

  it('fires onEdit with the log when an entry row is edited', () => {
    const onEdit = vi.fn();
    const log = makeLog();
    renderWithClient(
      <MealSection
        mealType="breakfast"
        date="2026-05-18"
        items={[log]}
        quickAddItems={[]}
        onAdd={vi.fn()}
        onEdit={onEdit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /editar entrada|edit entry/i }));
    expect(onEdit).toHaveBeenCalledWith(log);
  });
});
