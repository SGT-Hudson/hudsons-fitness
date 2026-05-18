import '@/i18n';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickAddStrip } from './QuickAddStrip';

const mutate = vi.fn();
vi.mock('../hooks', () => ({
  useQuickAddMealLog: () => ({ mutate, isPending: false }),
  deleteMealLog: vi.fn(),
  toastUndoableQuickAdd: vi.fn(),
}));

describe('QuickAddStrip', () => {
  it('renders chips and fires the mutation with meal + recipe on click', () => {
    render(
      <QuickAddStrip
        mealType="dinner"
        date="2026-05-18"
        items={[{ recipeId: 'r1', name: 'Salmón', kcalPerServing: 480 }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Salmón/ }));
    expect(mutate).toHaveBeenCalledWith(
      { recipeId: 'r1', mealType: 'dinner', loggedOn: '2026-05-18' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('renders nothing when there are no items', () => {
    const { container } = render(
      <QuickAddStrip mealType="lunch" date="2026-05-18" items={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
