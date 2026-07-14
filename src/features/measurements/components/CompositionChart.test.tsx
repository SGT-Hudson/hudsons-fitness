import { cloneElement, type ReactElement } from 'react';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';
import { CompositionChart } from './CompositionChart';

// recharts' ResponsiveContainer sizes itself from a ResizeObserver, which jsdom
// does not implement — and a zero-width chart draws no paths at all. Hand the
// chart a fixed box, which is all ResponsiveContainer does in a browser.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 640, height: 320 }),
  };
});

// The data hook, not the component, is what reaches for Supabase — mocking it
// keeps this test env-free (it would otherwise fail in CI, which has no
// VITE_SUPABASE_* ). `../hooks` is mocked whole so `../api` never even loads.
const { SMOOTHED } = vi.hoisted(() => ({
  SMOOTHED: [
    { measured_on: '2026-05-04', weight_kg: 80.2, weight_kg_5day_avg: 80.4, body_fat_pct: 19.0, muscle_pct: 41.2, water_pct: 57.9 },
    { measured_on: '2026-05-11', weight_kg: 79.4, weight_kg_5day_avg: 79.6, body_fat_pct: 18.5, muscle_pct: 41.6, water_pct: 58.1 },
    { measured_on: '2026-05-18', weight_kg: 78.4, weight_kg_5day_avg: 78.7, body_fat_pct: 18.2, muscle_pct: 41.9, water_pct: 58.2 },
  ],
}));

vi.mock('../hooks', () => ({
  TIME_RANGES: ['1m', '6m', '1y', 'all'],
  DEFAULT_TIME_RANGE: '6m',
  useSmoothedMeasurements: () => ({ data: SMOOTHED, isLoading: false }),
}));

/** The main chart is the first recharts surface on the card; the three sparkline
 *  trend cards follow it. */
function mainChart(container: HTMLElement): HTMLElement {
  const wrappers = container.querySelectorAll<HTMLElement>('.recharts-wrapper');
  return wrappers[0];
}

beforeAll(async () => {
  await i18n.changeLanguage('es');
});

describe('CompositionChart', () => {
  it('draws three lines — grasa, músculo, agua — and no stacked area', () => {
    const { container } = render(<CompositionChart />);

    const strokes = [...mainChart(container).querySelectorAll('.recharts-line-curve')].map((p) =>
      p.getAttribute('stroke'),
    );
    // Three independent series, on the shared --comp-* tokens (never hardcoded).
    expect(strokes).toEqual(['var(--comp-fat)', 'var(--comp-muscle)', 'var(--comp-water)']);

    // The fat/lean stacked area is gone — it hid músculo and agua, which the app
    // stores. If this ever comes back, it comes back deliberately.
    expect(container.querySelector('.recharts-area')).toBeNull();
  });

  it('names the three series in the legend', () => {
    render(<CompositionChart />);
    expect(screen.getByText('Grasa')).toBeInTheDocument();
    expect(screen.getByText('Músculo')).toBeInTheDocument();
    expect(screen.getByText('Agua')).toBeInTheDocument();
  });

  it('keeps the %/kg toggle and the three trend sparklines', () => {
    const { container } = render(<CompositionChart />);
    expect(screen.getByRole('radiogroup', { name: 'Unidad' })).toBeInTheDocument();
    expect(screen.getByText('Tendencia de grasa')).toBeInTheDocument();
    expect(screen.getByText('Tendencia de músculo')).toBeInTheDocument();
    expect(screen.getByText('Tendencia de agua')).toBeInTheDocument();
    // main chart + one per sparkline card
    expect(container.querySelectorAll('.recharts-wrapper')).toHaveLength(4);
  });

  it('opens the same chart in the expanded sheet', async () => {
    render(<CompositionChart />);
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Ampliar gráfica' }));

    const sheet = await screen.findByRole('dialog');
    expect(sheet).toHaveTextContent('Grasa · músculo · agua · 6M');
    // The sheet re-renders the SAME chart, larger — it is not a second component.
    const strokes = [...sheet.querySelectorAll('.recharts-line-curve')].map((p) =>
      p.getAttribute('stroke'),
    );
    expect(strokes).toEqual(['var(--comp-fat)', 'var(--comp-muscle)', 'var(--comp-water)']);
  });
});
