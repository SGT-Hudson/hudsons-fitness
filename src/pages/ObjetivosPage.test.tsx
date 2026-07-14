// @vitest-environment jsdom
//
// Tier-2 component test for the goal dialog on ObjetivosPage. The page's data
// hooks are mocked (they import Supabase, which has no env in CI), so the test
// asserts against the upsert spy: the value the form would STORE, not the
// value the field shows.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const upsertGoal = vi.fn().mockResolvedValue(undefined);
vi.mock('@/features/objetivos/hooks', () => ({
  useGoal: () => ({ data: null, isLoading: false }),
  useUpsertGoal: () => ({ mutateAsync: upsertGoal, isPending: false }),
}));
vi.mock('@/features/phases/hooks', () => ({
  usePhases: () => ({ data: [], isLoading: false }),
  useCreatePhase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePhase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePhase: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/features/measurements/hooks', () => ({
  useLatestMeasurement: () => ({ data: null, isLoading: false }),
}));

import { ObjetivosPage } from './ObjetivosPage';

function renderPage() {
  render(
    <MemoryRouter>
      <ObjetivosPage />
    </MemoryRouter>,
  );
}

async function openGoalDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: i18n.t('objetivos:goal.setGoal') }));
  return screen.getByLabelText(i18n.t('objetivos:goal.dialog.targetBf'));
}

beforeEach(async () => {
  upsertGoal.mockClear();
  await i18n.changeLanguage('es');
});

describe('ObjetivosPage — goal dialog (Tier-2)', () => {
  // The decimal-comma fix: on the old `type="number"` element the browser ate
  // the comma before RHF saw it (`12,5` → `"125"`), and `valueAsNumber` on a
  // real comma returns NaN. Both halves (the `type` switch + parseDecimalInput)
  // are needed for this to pass. Assert the STORED number, not the field value.
  it('accepts a decimal comma on the target body fat %: 12,5 → 12.5', async () => {
    const user = userEvent.setup();
    renderPage();

    const bf = await openGoalDialog(user);
    await user.clear(bf);
    await user.type(bf, '12,5');
    await user.click(screen.getByRole('button', { name: i18n.t('objetivos:goal.dialog.save') }));

    await waitFor(() => expect(upsertGoal).toHaveBeenCalledTimes(1));
    expect(upsertGoal.mock.calls[0][0].target_body_fat_pct).toBeCloseTo(12.5, 10);
  });

  // `type="text"` drops the native min/max gates — zod is now the only thing
  // enforcing 3–50, and the app's own error must appear (not a browser bubble).
  it('rejects a target body fat % outside 3–50 (the gate the DOM used to own)', async () => {
    const user = userEvent.setup();
    renderPage();

    const bf = await openGoalDialog(user);
    await user.clear(bf);
    await user.type(bf, '60');
    await user.click(screen.getByRole('button', { name: i18n.t('objetivos:goal.dialog.save') }));

    await waitFor(() =>
      expect(screen.getByText(i18n.t('objetivos:goal.errors.targetBf'))).toBeInTheDocument(),
    );
    expect(upsertGoal).not.toHaveBeenCalled();
  });

  it('does not submit a blank target body fat %', async () => {
    const user = userEvent.setup();
    renderPage();

    const bf = await openGoalDialog(user);
    await user.clear(bf);
    await user.click(screen.getByRole('button', { name: i18n.t('objetivos:goal.dialog.save') }));

    await waitFor(() =>
      expect(screen.getByText(i18n.t('objetivos:goal.errors.targetBf'))).toBeInTheDocument(),
    );
    expect(upsertGoal).not.toHaveBeenCalled();
  });
});
