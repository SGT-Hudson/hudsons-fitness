// @vitest-environment jsdom
//
// Tier-2 for the phase half of ObjetivosPage: the hero's derived daily targets
// and the delete path. The data hooks are mocked (they import Supabase, which
// has no env in CI) but `useDailyTarget` / `computePhaseTargets` are NOT — the
// point of the hero test is that the REAL macro maths reaches the screen.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { computePhaseTargets } from '@/features/phases/targets';
import type { Phase } from '@/features/phases/api';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const activePhase: Phase = {
  id: 'p1',
  user_id: 'u1',
  name: 'Corte primavera',
  phase_type: 'cut',
  start_date: '2026-01-05',
  end_date: null,
  kcal_mode: 'absolute',
  kcal_value: 2180,
  protein_g_per_kg: 2.4,
  fat_pct_of_kcal: 0.28,
  fiber_mode: 'fixed_g',
  fiber_value: 30,
  notes: null,
  created_at: '2026-01-05T00:00:00Z',
};

const state = {
  phase: activePhase as Phase | null,
  measurement: { weight_kg: 82.6, body_fat_pct: 18 } as {
    weight_kg: number;
    body_fat_pct: number | null;
  } | null,
  tdee: null as { estimated_tdee_kcal: number } | null,
};

const deletePhase = vi.fn().mockResolvedValue(undefined);

vi.mock('@/features/objetivos/hooks', () => ({
  useGoal: () => ({ data: null, isLoading: false }),
  useUpsertGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/features/phases/hooks', () => ({
  usePhases: () => ({ data: state.phase ? [state.phase] : [], isLoading: false }),
  useActivePhase: () => ({ data: state.phase, isLoading: false }),
  useCreatePhase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePhase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePhase: () => ({ mutateAsync: deletePhase, isPending: false }),
}));
vi.mock('@/features/measurements/hooks', () => ({
  useLatestMeasurement: () => ({ data: state.measurement, isLoading: false }),
}));
vi.mock('@/features/tdee/hooks', () => ({
  useLatestTdee: () => ({ data: state.tdee, isLoading: false }),
}));

import { ObjetivosPage } from './ObjetivosPage';

function renderPage() {
  render(
    <MemoryRouter>
      <ObjetivosPage />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  deletePhase.mockClear();
  state.phase = { ...activePhase };
  state.measurement = { weight_kg: 82.6, body_fat_pct: 18 };
  state.tdee = null;
  await i18n.changeLanguage('es');
});

describe('ObjetivosPage — phase hero (Tier-2)', () => {
  it('renders the active phase and the targets computePhaseTargets derives', () => {
    renderPage();

    // The numbers on screen must be the canonical ones — computed here from the
    // same frozen fn the hero consumes, never re-derived by hand.
    const expected = computePhaseTargets(activePhase, 82.6, 18, null);
    expect(expected).not.toBeNull();

    expect(screen.getByText(i18n.t('objetivos:phases.hero.activeLabel'))).toBeInTheDocument();
    expect(screen.getAllByText('Corte primavera').length).toBeGreaterThan(0);
    expect(screen.getByTestId('hero-kcal')).toHaveTextContent(String(expected!.kcal));
    expect(screen.getByText(`${expected!.proteinG} g`)).toBeInTheDocument();
    expect(screen.getByText(`${expected!.carbsG} g`)).toBeInTheDocument();
    expect(screen.getByText(`${expected!.fiberG} g`)).toBeInTheDocument();
    // R-06: the fat % comes from `fractionToPct(0.28)` → 28, not 0.28 and not 2800.
    expect(screen.getByText(`${expected!.fatG} g · 28 %`)).toBeInTheDocument();
  });

  // `computePhaseTargets` returns null for a tdee_delta phase with no TDEE
  // estimate. The old page would have had nothing to show; showing 0 kcal would
  // be a lie. Say why instead.
  it('a tdee_delta phase with no TDEE estimate shows the hint, never zeros', () => {
    state.phase = { ...activePhase, kcal_mode: 'tdee_delta', kcal_value: -300 };
    state.tdee = null;
    renderPage();

    expect(screen.getByText(i18n.t('objetivos:phases.hero.needsTdee'))).toBeInTheDocument();
    expect(screen.queryByTestId('hero-kcal')).not.toBeInTheDocument();
    expect(screen.queryByText('0 g')).not.toBeInTheDocument();
  });

  it('with a TDEE estimate, the same tdee_delta phase does resolve its targets', () => {
    const phase: Phase = { ...activePhase, kcal_mode: 'tdee_delta', kcal_value: -300 };
    state.phase = phase;
    state.tdee = { estimated_tdee_kcal: 2480 };
    renderPage();

    const expected = computePhaseTargets(phase, 82.6, 18, 2480);
    expect(screen.getByTestId('hero-kcal')).toHaveTextContent(String(expected!.kcal));
  });

  it('with no weight logged, the hero says so instead of inventing targets', () => {
    state.measurement = null;
    renderPage();

    expect(screen.getByText(i18n.t('objetivos:phases.hero.needsWeight'))).toBeInTheDocument();
    expect(screen.queryByTestId('hero-kcal')).not.toBeInTheDocument();
  });
});

describe('ObjetivosPage — phase list (Tier-2)', () => {
  it('deleting a live row confirms and calls the mutation', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();

    await user.click(screen.getByRole('button', { name: i18n.t('objetivos:phases.delete') }));

    await waitFor(() => expect(deletePhase).toHaveBeenCalledWith('p1'));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('a cancelled confirm does not delete', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();

    await user.click(screen.getByRole('button', { name: i18n.t('objetivos:phases.delete') }));

    expect(deletePhase).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
