import { cloneElement, type ReactElement } from 'react';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';
import { WeightChart } from './WeightChart';

// See CompositionChart.test.tsx: ResponsiveContainer needs a ResizeObserver
// jsdom does not have, and a zero-width chart draws nothing.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 640, height: 320 }),
  };
});

// `../hooks` is mocked whole so `../api` (and the Supabase client under it)
// never loads — a component test that imports it dies in CI, which has no env.
const { SMOOTHED } = vi.hoisted(() => ({
  SMOOTHED: [
    { measured_on: '2026-05-04', weight_kg: 80.2, weight_kg_5day_avg: 80.4 },
    { measured_on: '2026-05-11', weight_kg: 79.4, weight_kg_5day_avg: 79.6 },
    { measured_on: '2026-05-18', weight_kg: 78.4, weight_kg_5day_avg: 78.7 },
  ],
}));

vi.mock('../hooks', () => ({
  TIME_RANGES: ['1m', '6m', '1y', 'all'],
  DEFAULT_TIME_RANGE: '6m',
  useSmoothedMeasurements: () => ({ data: SMOOTHED, isLoading: false }),
}));

beforeAll(async () => {
  await i18n.changeLanguage('es');
});

describe('WeightChart', () => {
  it('draws the MA5 line over the raw points, with a wash underneath', () => {
    const { container } = render(<WeightChart targetWeightKg={74.5} />);

    // Two series: the raw daily weights (dots only, no stroke) and the MA5 line.
    const strokes = [...container.querySelectorAll('.recharts-line-curve')].map((p) =>
      p.getAttribute('stroke'),
    );
    expect(strokes).toEqual(['none', 'var(--primary)']);
    expect(container.querySelectorAll('.recharts-line-dot').length).toBeGreaterThan(0);
    expect(container.querySelector('.recharts-area-area')).not.toBeNull();
  });

  it('draws the target as a dashed reference line', () => {
    const { container } = render(<WeightChart targetWeightKg={74.5} />);
    const target = container.querySelector('.recharts-reference-line-line');
    expect(target).not.toBeNull();
    expect(target).toHaveAttribute('stroke-dasharray', '5 4');
    expect(screen.getByText(/objetivo 74,5 kg/)).toBeInTheDocument();
  });

  it('omits the reference line when there is no target weight', () => {
    const { container } = render(<WeightChart targetWeightKg={null} />);
    expect(container.querySelector('.recharts-reference-line-line')).toBeNull();
  });

  it('keeps the range filter and opens the same chart in the expanded sheet', async () => {
    const { container } = render(<WeightChart targetWeightKg={74.5} />);
    expect(screen.getByRole('radiogroup', { name: 'Rango temporal' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '6M' })).toBeChecked();
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Ampliar gráfica' }));

    const sheet = await screen.findByRole('dialog');
    expect(sheet).toHaveTextContent('Peso · evolución');
    expect(sheet).toHaveTextContent('Media móvil 5 días · 6M');
    // The chart is re-rendered inside the sheet, not forked into a second one.
    expect(container.querySelectorAll('.recharts-wrapper').length).toBe(1);
    expect(sheet.querySelectorAll('.recharts-line-curve')).toHaveLength(2);
  });

  it('appends the projection points when the target is inside the horizon', () => {
    const { container } = render(
      <WeightChart targetWeightKg={78} projection={{ toWeightKg: 78, etaDate: '2026-06-01' }} />,
    );
    expect(screen.getByTestId('weight-projection')).toBeInTheDocument();
    // The MA5 end dot plus the target dot: the ETA (2026-06-01, 14 days past
    // the last real point) lands exactly at the edge of the 14-day span the
    // fixture covers, so it counts as inside the horizon and gets an end dot.
    expect(container.querySelectorAll('.recharts-reference-dot')).toHaveLength(2);
  });

  it('caps the ray and drops the end dot when the target is beyond the horizon', () => {
    const { container } = render(
      <WeightChart targetWeightKg={78} projection={{ toWeightKg: 78, etaDate: '2027-06-01' }} />,
    );
    // The ray itself still draws, truncated to the data span...
    expect(screen.getByTestId('weight-projection')).toBeInTheDocument();
    // ...but only the MA5 end dot remains — the target dot is suppressed
    // because the ETA is far beyond the span the real data covers.
    expect(container.querySelectorAll('.recharts-reference-dot')).toHaveLength(1);
  });

  it('draws no projection when none is supplied', () => {
    const { container } = render(<WeightChart targetWeightKg={78} />);
    expect(screen.queryByTestId('weight-projection')).not.toBeInTheDocument();
    // Just the MA5 end dot — no ray, no target dot.
    expect(container.querySelectorAll('.recharts-reference-dot')).toHaveLength(1);
  });
});
