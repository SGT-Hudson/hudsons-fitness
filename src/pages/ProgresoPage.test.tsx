import { cloneElement, type ReactElement } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';

// recharts' ResponsiveContainer sizes itself from a ResizeObserver, which jsdom
// does not implement. Hand every chart on the page a fixed box instead.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 640, height: 320 }),
  };
});

// Every data hook below is mocked, but the feature modules still import
// `@/lib/supabase` at module scope — which throws in CI, where no VITE_SUPABASE_*
// exists. Stub the client so importing them is env-free.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const LATEST = {
  id: 'm1',
  measured_on: '2026-05-18',
  weight_kg: 78.4,
  body_fat_pct: 18.2,
  muscle_pct: 41.1,
  water_pct: 55.3,
  notes: null,
};

const RECENT = [
  { ...LATEST },
  {
    id: 'm0',
    measured_on: '2026-05-11',
    weight_kg: 79.4,
    body_fat_pct: 19.0,
    muscle_pct: 40.7,
    water_pct: 55.0,
    notes: null,
  },
];

const SMOOTHED = [
  { measured_on: '2026-05-11', weight_kg: 79.4, weight_kg_5day_avg: 79.3, body_fat_pct: 19.0, muscle_pct: 40.7, water_pct: 55.0 },
  { measured_on: '2026-05-18', weight_kg: 78.4, weight_kg_5day_avg: 78.7, body_fat_pct: 18.2, muscle_pct: 41.1, water_pct: 55.3 },
];

// The range presets (TIME_RANGES / DEFAULT_TIME_RANGE / fromDateForRange) stay
// real — only the queries are stubbed.
vi.mock('@/features/measurements/hooks', async (importActual) => ({
  ...(await importActual<typeof import('@/features/measurements/hooks')>()),
  useLatestMeasurement: () => ({ data: LATEST, isLoading: false }),
  useRecentMeasurements: () => ({ data: RECENT, isLoading: false }),
  useSmoothedMeasurements: () => ({ data: SMOOTHED, isLoading: false }),
  useUpsertMeasurement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteMeasurement: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/features/phases/hooks', () => ({
  useActivePhase: () => ({ data: { phase_type: 'cut' } }),
}));
vi.mock('@/features/objetivos/hooks', () => ({
  useGoal: () => ({ data: { target_body_fat_pct: 12 } }),
}));
vi.mock('@/features/profile/hooks', () => ({
  useProfile: () => ({
    data: { sex: 'male', birth_date: '1990-01-01', height_cm: 178, initial_weight_kg: 82 },
  }),
}));
vi.mock('@/features/tdee/hooks', () => ({
  useLatestTdee: () => ({ data: { avg_kcal_intake: 2000, estimated_tdee_kcal: 2350 } }),
  useTdeeState: () => ({ data: { trend_weight_kg: 78.0 } }),
}));
vi.mock('@/features/progreso/hooks', () => ({
  useDailyNutritionHistory: () => ({ data: [], isLoading: false }),
}));

import { ProgresoPage } from './ProgresoPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/progress']}>
        <ProgresoPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** DOM order of two nodes: a precedes b. */
function precedes(a: HTMLElement, b: HTMLElement): boolean {
  return Boolean(
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('ProgresoPage', () => {
  // The P0 stack (R-33 wave 7). It is deliberately SHORTER than the artboard:
  // no ETA banner, no energy-balance card — those are R-38.
  it('composes the cards in the P0 order', () => {
    renderPage();

    const cards = [
      screen.getByText('Peso · tendencia MA5'), // hero
      screen.getByText('Composición'), // composition tiles
      screen.getByText('Tendencia de peso'), // weight chart
      screen.getByText('Composición corporal'), // composition chart
      screen.getByText('Mediciones recientes'), // recent measurements
      screen.getByText('Nutrición diaria'), // macros chart
    ];

    for (let i = 0; i < cards.length - 1; i++) {
      expect(precedes(cards[i], cards[i + 1])).toBe(true);
    }
  });

  // PageShell mounts the mobile top bar AND PageHeaderV2 at once (CSS hides one),
  // so anything in the header is queried with getAllBy*.
  it('opens the measurement dialog from the "Nueva medición" header action', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getAllByRole('button', { name: 'Nueva medición' })[0]);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Nueva medición');
    expect(screen.getByLabelText('Peso (kg)')).toBeInTheDocument();
  });

  // The mobile affordance for the same action: the header is CSS-hidden below md,
  // so the hero's own button is what mobile taps. It must open the same dialog.
  it('opens the same dialog from the hero button (the mobile affordance)', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Registrar hoy' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('Nueva medición');
  });

  // A composition tile opens the composition chart's expanded sheet — the SAME
  // chart, not a forked copy (its expansion state is lifted to the page).
  it('opens the expanded composition chart from a composition tile', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByTestId('comp-tile-bodyFat'));

    expect(await screen.findByRole('dialog')).toHaveTextContent('Grasa · músculo · agua · 6M');
  });

  it('keeps the ETA line and the editable recent-measurements list', () => {
    renderPage();

    // The ETA line the hero already shipped (never stripped by the redesign).
    expect(screen.getByText(/≈/)).toBeInTheDocument();
    // Edit/delete stay on the recent list until PR-B moves them to /progress/history.
    expect(screen.getAllByRole('button', { name: 'Editar' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Eliminar' }).length).toBeGreaterThan(0);
  });
});
