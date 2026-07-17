import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import type { BodyMeasurement } from '@/features/measurements/api';

// The data hooks below are mocked, but the feature modules still import
// `@/lib/supabase` at module scope — which throws in CI, where no VITE_SUPABASE_*
// exists. Stub the client so importing them is env-free.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

function measurement(m: Partial<BodyMeasurement> & { id: string; measured_on: string }): BodyMeasurement {
  return {
    user_id: 'u1',
    created_at: '2026-01-01T00:00:00Z',
    weight_kg: null,
    body_fat_pct: null,
    muscle_pct: null,
    water_pct: null,
    notes: null,
    ...m,
  };
}

// Two months, so the grouping has something to group. Newest first, as the
// query returns them.
const MAY_18 = measurement({ id: 'm3', measured_on: '2026-05-18', weight_kg: 79.0, body_fat_pct: 18.2 });
const MAY_11 = measurement({
  id: 'm2',
  measured_on: '2026-05-11',
  weight_kg: 79.4,
  body_fat_pct: 19.0,
  notes: 'Tras viaje',
});
const APR_28 = measurement({ id: 'm1', measured_on: '2026-04-28', weight_kg: 80.0, body_fat_pct: 19.5 });

const ALL = [MAY_18, MAY_11, APR_28];

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  first: null as unknown,
  deleteMutate: vi.fn(),
}));

// The range presets (TIME_RANGES / fromDateForRange) stay real — only the
// queries are stubbed.
vi.mock('@/features/measurements/hooks', async (importActual) => ({
  ...(await importActual<typeof import('@/features/measurements/hooks')>()),
  useMeasurementsInRange: () => ({ data: h.rows, isLoading: false }),
  useFirstMeasurement: () => ({ data: h.first }),
  useDeleteMeasurement: () => ({ mutate: h.deleteMutate, isPending: false }),
  useUpsertMeasurement: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// The page reads the active phase so a weight delta is toned against it (gaining
// mid-cut is not a win). The fixture is a cut, matching the hero's own tone.
vi.mock('@/features/phases/hooks', () => ({
  useActivePhase: () => ({ data: { phase_type: 'cut' } }),
}));

import { MeasurementHistoryPage } from './MeasurementHistoryPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/progress/history']}>
        <MeasurementHistoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
  h.rows = ALL;
  h.first = APR_28;
  h.deleteMutate = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MeasurementHistoryPage', () => {
  it('groups the measurements by month, newest first, with a count per group', () => {
    renderPage();

    const months = screen.getAllByRole('heading', { level: 2 });
    expect(months.map((m) => m.textContent)).toEqual(['mayo 2026', 'abril 2026']);

    // The count sits next to its month header.
    const may = months[0].parentElement as HTMLElement;
    const april = months[1].parentElement as HTMLElement;
    expect(within(may).getByText('2 mediciones')).toBeInTheDocument();
    expect(within(april).getByText('1 medición')).toBeInTheDocument();
  });

  // The delta is the weight change against the previous measurement. The oldest
  // row of the loaded range has no predecessor loaded → no delta.
  it('shows the delta of each row against the previous measurement', () => {
    renderPage();

    expect(screen.getByTestId('history-delta-m3')).toHaveTextContent('-0,4'); // 79.0 − 79.4
    expect(screen.getByTestId('history-delta-m2')).toHaveTextContent('-0,6'); // 79.4 − 80.0
    expect(screen.getByTestId('history-delta-m1')).toHaveTextContent('—'); // oldest
  });

  it('renders the note under its row, in guillemets', () => {
    renderPage();

    expect(screen.getByText('« Tras viaje »')).toBeInTheDocument();
  });

  it('pins the first-ever measurement in the footer', () => {
    renderPage();

    // One decimal everywhere, so the weights line up down the column.
    expect(screen.getByText(/Inicio del registro/)).toHaveTextContent('80,0 kg');
  });

  // Edit and delete were on the flat `MeasurementsList` this screen retires.
  // Losing either of them would be a regression, not a redesign.
  it('opens the measurement dialog from a row (edit)', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getAllByRole('button', { name: 'Editar' })[0]);

    expect(await screen.findByRole('dialog')).toHaveTextContent('Editar medición');
  });

  it('deletes a measurement after confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();

    await user.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]);

    expect(window.confirm).toHaveBeenCalled();
    expect(h.deleteMutate).toHaveBeenCalledWith('m3');
  });

  it('does not delete when the confirmation is dismissed', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();

    await user.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]);

    expect(h.deleteMutate).not.toHaveBeenCalled();
  });

  it('shows the empty state when there are no measurements', () => {
    h.rows = [];
    h.first = null;
    renderPage();

    expect(screen.getByText('Sin mediciones')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    expect(screen.queryByText(/Inicio del registro/)).toBeNull();
  });
});
