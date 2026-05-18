import '@/i18n';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LatestMeasurementCard } from './LatestMeasurementCard';

vi.mock('@/features/profile/hooks', () => ({
  useProfile: () => ({
    data: { sex: 'male', birth_date: '1990-01-01', height_cm: 178, initial_weight_kg: 82 },
  }),
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
        recent={[latest]}
        phaseType="cut"
        targetBodyFatPct={12}
      />,
    );
    expect(screen.getByText('78.7')).toBeInTheDocument();
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
        recent={[latest]}
        phaseType="cut"
      />,
    );
    expect(screen.queryByText(/objetivo|to goal/i)).toBeNull();
  });
});
