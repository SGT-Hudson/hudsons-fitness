import '@/i18n';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MealLogEntry } from './MealLogEntry';
import type { MealLogWithJoins } from '../api';

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
    custom_name: 'Tostada con aguacate',
    custom_kcal: 320,
    custom_protein_g: 8,
    custom_carbs_g: 30,
    custom_fat_g: 18,
    custom_fiber_g: 5,
    custom_sugar_g: null,
    custom_saturated_fat_g: null,
    plan_week_slot_id: null,
    created_at: '2026-05-18T08:00:00Z',
    recipe: null,
    ingredient: null,
    ...overrides,
  };
}

describe('MealLogEntry', () => {
  it('renders the entry name and kcal', () => {
    render(<MealLogEntry log={makeLog()} onEdit={vi.fn()} />);
    expect(screen.getByText('Tostada con aguacate')).toBeInTheDocument();
    expect(screen.getByText('320')).toBeInTheDocument();
  });

  it('does not render the plan badge for a manually-added entry', () => {
    render(<MealLogEntry log={makeLog({ from_plan: false })} onEdit={vi.fn()} />);
    expect(screen.queryByText(/del plan|from plan/i)).toBeNull();
    expect(screen.queryByText('Plan')).toBeNull();
  });

  it('renders the plan badge only when from_plan is true', () => {
    render(<MealLogEntry log={makeLog({ from_plan: true })} onEdit={vi.fn()} />);
    expect(screen.getByText(/del plan|from plan/i)).toBeInTheDocument();
    expect(screen.getByText('Plan')).toBeInTheDocument();
  });

  it('fires onEdit with the log when the edit button is clicked', () => {
    const onEdit = vi.fn();
    const log = makeLog();
    render(<MealLogEntry log={log} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /editar entrada|edit entry/i }));
    expect(onEdit).toHaveBeenCalledWith(log);
  });
});
