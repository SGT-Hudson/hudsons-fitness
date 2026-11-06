import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mutate = vi.fn();
vi.mock('../hooks', () => ({
  useQuickAddMealLog: () => ({ mutate, isPending: false }),
  deleteMealLog: vi.fn(),
  toastUndoableQuickAdd: vi.fn(),
}));
vi.mock('@/lib/stats', () => ({ track: vi.fn() }));

import { track } from '@/lib/stats';
import { QuickAddStrip } from './QuickAddStrip';

function renderStrip() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <QuickAddStrip
        mealType="dinner"
        date="2026-05-18"
        items={[{ recipeId: 'r1', name: 'Salmón', kcalPerServing: 480 }]}
        onAddRecipe={vi.fn()}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Salmón/ }));
  return mutate.mock.calls[0][1] as { onSuccess: (created: { id: string }) => void; onError?: unknown };
}

beforeEach(() => vi.clearAllMocks());

describe('QuickAddStrip events', () => {
  it('tracks nothing on click, before the add succeeds', () => {
    renderStrip();
    expect(track).not.toHaveBeenCalled();
  });

  it('tracks registrar-comida (rapida) when the quick add succeeds', () => {
    renderStrip().onSuccess({ id: 'log1' });
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('registrar-comida', { origen: 'rapida' });
  });
});
