import '@/i18n';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// MeasurementDialog (mounted inside the card) pulls in the upsert mutation,
// which reaches supabase/auth. Stub it so the card renders under jsdom with no
// data layer — same isolation the standalone MeasurementDialog test uses.
vi.mock('@/features/measurements/hooks', () => ({
  useUpsertMeasurement: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { BodyQuickMeasureCard } from './BodyQuickMeasureCard';

const latest = {
  id: 'm1',
  measured_on: '2026-05-27',
  weight_kg: 82.9,
  body_fat_pct: 18,
  muscle_pct: 40,
  water_pct: 55,
  notes: null,
} as never;

describe('BodyQuickMeasureCard', () => {
  it('renders the latest weight and the weekly-delta chip', () => {
    render(<BodyQuickMeasureCard latest={latest} rate={-0.52} phaseType="cut" />);
    expect(screen.getByText('82.9')).toBeInTheDocument();
    expect(screen.getByText(/0\.52/)).toBeInTheDocument();
  });

  it('shows the empty state when there is no measurement', () => {
    render(<BodyQuickMeasureCard latest={null} rate={null} />);
    expect(screen.getByText(/sin mediciones|no measurements/i)).toBeInTheDocument();
  });

  it('opens the measurement dialog when the register button is clicked', () => {
    render(<BodyQuickMeasureCard latest={latest} rate={-0.52} phaseType="cut" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: /registrar medición|log measurement/i }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
