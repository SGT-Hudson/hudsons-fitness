import i18n from '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ActiveWeek } from '@/features/planner/api';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/lib/stats', () => ({ track: vi.fn() }));

// The apply dialog is its own component (ApplyTemplateDialog.test.tsx); here only
// the page's handler matters, so the dialog is a button that calls it.
vi.mock('@/features/planning/components/ApplyTemplateDialog', () => ({
  ApplyTemplateDialog: ({ onApply }: { onApply: (id: string) => Promise<void> }) => (
    <button type="button" onClick={() => void onApply('t1').catch(() => {})}>
      apply-mock
    </button>
  ),
}));

const week: ActiveWeek = {
  id: 'w1', week_start: '2026-05-25', source_template_id: null, source_template_name: null,
  has_diverged: false, meal_times: ['08:00', '14:00'], slots: [],
};
const applyMutateAsync = vi.fn();
const noopMutation = { mutateAsync: vi.fn(), isPending: false };
vi.mock('@/features/planner/hooks', () => ({
  useActiveWeek: () => ({ data: week, isLoading: false }),
  useAddWeekSlot: () => noopMutation,
  useUpdateWeekSlot: () => noopMutation,
  useDeleteWeekSlot: () => noopMutation,
  useCopyWeekMeal: () => noopMutation,
  useAppendWeekMeal: () => noopMutation,
  useApplyTemplateToWeek: () => ({ mutateAsync: applyMutateAsync, isPending: false }),
  useSaveWeekAsTemplate: () => noopMutation,
  useWeekShopping: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/features/templates/hooks', () => ({ useTemplates: () => ({ data: [], isLoading: false }) }));
vi.mock('@/features/planning/useDailyTarget', () => ({
  useDailyTarget: () => ({
    targets: { kcal: 2180, proteinG: 168, carbsG: 245, fatG: 68, fiberG: 30 },
    phaseType: 'cut', proteinBasis: 'lean', weightKg: 80,
  }),
}));
vi.mock('@/features/recipes/hooks', () => ({
  useRecipes: () => ({ data: [], isLoading: false }),
  useRecipe: () => ({ data: undefined, isLoading: false }),
}));

import { track } from '@/lib/stats';
import { PlanificadorPage } from './PlanificadorPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PlanificadorPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('es');
});

describe('PlanificadorPage events', () => {
  it('tracks aplicar-plantilla once the template is applied', async () => {
    applyMutateAsync.mockResolvedValue(undefined);
    renderPage();
    await userEvent.click(screen.getByText('apply-mock'));
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
    expect(track).toHaveBeenCalledWith('aplicar-plantilla');
    expect(applyMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ templateId: 't1' }));
  });

  it('tracks nothing when applying is rejected', async () => {
    applyMutateAsync.mockRejectedValue(new Error('fail'));
    renderPage();
    await userEvent.click(screen.getByText('apply-mock'));
    await waitFor(() => expect(applyMutateAsync).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(track).not.toHaveBeenCalled();
  });
});
