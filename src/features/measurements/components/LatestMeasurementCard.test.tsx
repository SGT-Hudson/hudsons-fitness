import '@/i18n';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LatestMeasurementCard } from './LatestMeasurementCard';

vi.mock('@/features/profile/hooks', () => ({
  useProfile: () => ({
    data: { sex: 'male', birth_date: '1990-01-01', height_cm: 178, initial_weight_kg: 82 },
  }),
}));

// Mocked the same way as useProfile — isolate the presentational card.
// Fixed values yield an on_track ETA (trend 78.0 → target ~72.9, cutting).
vi.mock('@/features/tdee/hooks', () => ({
  useLatestTdee: () => ({
    data: { avg_kcal_intake: 2000, estimated_tdee_kcal: 2350 },
  }),
  useTdeeState: () => ({ data: { trend_weight_kg: 78.0 } }),
}));

const latest = {
  id: 'm1',
  measured_on: '2026-05-18',
  weight_kg: 78.4,
  body_fat_pct: 18.2,
  muscle_pct: 41.1,
  water_pct: 55.3,
  notes: null,
} as never;

const smoothed = [
  { measured_on: '2026-05-11', weight_kg: 79.4, weight_kg_5day_avg: 79.3 },
  { measured_on: '2026-05-18', weight_kg: 78.4, weight_kg_5day_avg: 78.7 },
] as never;

describe('LatestMeasurementCard', () => {
  it('shows the smoothed weight headline and rate/week', () => {
    render(
      <LatestMeasurementCard
        latest={latest}
        todayEntry={latest}
        loading={false}
        onLogToday={() => {}}
        onEditToday={() => {}}
        smoothed={smoothed}
        phaseType="cut"
        targetBodyFatPct={12}
      />,
    );
    // The MA5 value also appears as the "hoy" marker under the phase-path bar,
    // so the headline is now pinned by its testid rather than by raw text.
    expect(screen.getByTestId('weight-headline')).toHaveTextContent('78.7');
    expect(screen.getByText(/\/ ?(sem|wk)/i)).toBeInTheDocument();
  });

  it('omits the to-goal clause when no targetBodyFatPct', () => {
    render(
      <LatestMeasurementCard
        latest={latest}
        todayEntry={latest}
        loading={false}
        onLogToday={() => {}}
        onEditToday={() => {}}
        smoothed={smoothed}
        phaseType="cut"
      />,
    );
    expect(screen.queryByText(/objetivo|to goal/i)).toBeNull();
  });

  it('renders the goal-date ETA line when on track toward the target', () => {
    render(
      <LatestMeasurementCard
        latest={latest}
        todayEntry={latest}
        loading={false}
        onLogToday={() => {}}
        onEditToday={() => {}}
        smoothed={smoothed}
        phaseType="cut"
        targetBodyFatPct={12}
      />,
    );
    expect(screen.getByText(/≈/)).toBeInTheDocument();
  });
});
