// @vitest-environment jsdom
//
// Tier-2 for the option-B grouping on ObjetivosPage: future phases in an
// always-expanded "Programadas" group, past phases behind the collapsible
// "Historial de fases" bar. The data hooks are mocked (they import Supabase,
// which has no env in CI); the grouping rule itself is the feature's
// (`phaseStatus`), and it is NOT mocked — the split on screen must be the one
// the domain says.
//
// Dates are built relative to the real today, because the page reads `isoDate()`
// off the system clock. A hardcoded fixture would rot on a calendar boundary.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { addDays } from 'date-fns';
import i18n from '@/i18n';
import { isoDate } from '@/lib/dates';
import type { Phase } from '@/features/phases/api';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const day = (offset: number) => isoDate(addDays(new Date(), offset));

function phase(overrides: Partial<Phase> & Pick<Phase, 'id' | 'name'>): Phase {
  return {
    user_id: 'u1',
    phase_type: 'cut',
    start_date: day(-10),
    end_date: null,
    kcal_mode: 'absolute',
    kcal_value: 2180,
    protein_g_per_kg: 2.4,
    fat_pct_of_kcal: 0.28,
    fiber_mode: 'fixed_g',
    fiber_value: 30,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Phase;
}

const active = phase({
  id: 'active',
  name: 'Corte en curso',
  start_date: day(-20),
  end_date: day(20),
});
const upcoming = phase({
  id: 'upcoming',
  name: 'Volumen otoño',
  phase_type: 'bulk',
  start_date: day(30),
  end_date: day(90),
});
// Ended well past R-02's 7-day grace window → history, and frozen.
const pastCut = phase({
  id: 'past-cut',
  name: 'Mini-cut invierno',
  phase_type: 'cut',
  start_date: day(-400),
  end_date: day(-330),
});
const pastMaint = phase({
  id: 'past-maint',
  name: 'Mantenimiento navideño',
  phase_type: 'maintenance',
  start_date: day(-320),
  end_date: day(-260),
});

const state = { phases: [] as Phase[] };

vi.mock('@/features/objetivos/hooks', () => ({
  useGoal: () => ({ data: null, isLoading: false }),
  useUpsertGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/features/phases/hooks', () => ({
  usePhases: () => ({ data: state.phases, isLoading: false }),
  useActivePhase: () => ({ data: null, isLoading: false }),
  useCreatePhase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePhase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePhase: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/features/measurements/hooks', () => ({
  useLatestMeasurement: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/features/tdee/hooks', () => ({
  useLatestTdee: () => ({ data: null, isLoading: false }),
}));

import { ObjetivosPage } from './ObjetivosPage';

function renderPage() {
  render(
    <MemoryRouter>
      <ObjetivosPage />
    </MemoryRouter>,
  );
}

const historyBar = () =>
  screen.getByRole('button', { name: new RegExp(i18n.t('objetivos:phases.history.title')) });

beforeEach(async () => {
  state.phases = [active, upcoming, pastCut, pastMaint];
  await i18n.changeLanguage('es');
});

describe('ObjetivosPage — Programadas / Historial split (Tier-2)', () => {
  it('a future phase lands in Programadas, an old one does not', () => {
    renderPage();

    expect(screen.getByText(i18n.t('objetivos:phases.scheduled.label'))).toBeInTheDocument();
    expect(screen.getByText('Volumen otoño')).toBeInTheDocument();
    // The active phase keeps its row (it owns the only delete affordance).
    expect(screen.getByText('Corte en curso')).toBeInTheDocument();
    // History starts collapsed: its rows are not on screen.
    expect(screen.queryByText('Mini-cut invierno')).not.toBeInTheDocument();
    expect(screen.queryByText('Mantenimiento navideño')).not.toBeInTheDocument();
  });

  it('the Programadas header counts its phases', () => {
    renderPage();

    expect(
      screen.getByText(i18n.t('objetivos:phases.scheduled.count', { count: 1 })),
    ).toBeInTheDocument();
  });

  it('the closed bar summarises the history: one phase-coloured dot each, plus "Ver todo"', () => {
    renderPage();

    const bar = historyBar();
    expect(bar).toHaveAttribute('aria-expanded', 'false');
    expect(within(bar).getAllByTestId('phase-history-dot')).toHaveLength(2);
    expect(within(bar).getByText(i18n.t('objetivos:phases.history.seeAll'))).toBeInTheDocument();
    // The count line: "2 fases · N meses".
    expect(
      within(bar).getByText(
        new RegExp(i18n.t('objetivos:phases.history.phases', { count: 2 })),
      ),
    ).toBeInTheDocument();
  });

  it('the bar toggles the history open and closed', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(historyBar());

    expect(historyBar()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Mini-cut invierno')).toBeInTheDocument();
    expect(screen.getByText('Mantenimiento navideño')).toBeInTheDocument();
    // Open, the inline summary (dots + "Ver todo") gives way to the list.
    expect(screen.queryAllByTestId('phase-history-dot')).toHaveLength(0);
    expect(
      screen.queryByText(i18n.t('objetivos:phases.history.seeAll')),
    ).not.toBeInTheDocument();

    await user.click(historyBar());

    expect(historyBar()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Mini-cut invierno')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('phase-history-dot')).toHaveLength(2);
  });

  // R-02 survives the regrouping: a frozen row still edits notes and only notes.
  it('an expanded frozen row offers "editar notas", not edit/delete', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(historyBar());

    const row = screen.getByText('Mini-cut invierno').closest('article');
    expect(row).not.toBeNull();
    expect(
      within(row!).getByRole('button', { name: i18n.t('objetivos:phases.editNotes') }),
    ).toBeInTheDocument();
    expect(
      within(row!).queryByRole('button', { name: i18n.t('objetivos:phases.delete') }),
    ).not.toBeInTheDocument();
  });

  it('with no history there is no bar, and with no future phases no Programadas group', () => {
    state.phases = [active];
    renderPage();

    expect(
      screen.queryByRole('button', {
        name: new RegExp(i18n.t('objetivos:phases.history.title')),
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(i18n.t('objetivos:phases.scheduled.label')),
    ).not.toBeInTheDocument();
  });
});
