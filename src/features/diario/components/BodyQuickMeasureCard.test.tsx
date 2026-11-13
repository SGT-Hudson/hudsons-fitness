import i18n from '@/i18n';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// MeasurementDialog (mounted inside the card) pulls in the upsert mutation,
// which reaches supabase/auth. Stub it so the card renders under jsdom with no
// data layer — same isolation the standalone MeasurementDialog test uses.
const mutateAsync = vi.fn().mockResolvedValue({});
vi.mock('@/features/measurements/hooks', () => ({
  useUpsertMeasurement: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('@/lib/stats', () => ({ track: vi.fn() }));

import { track } from '@/lib/stats';
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

// The card must behave like Progreso: if today already has a measurement, the
// dialog edits it (edit title, locked date) instead of opening as a new one —
// otherwise re-saving today's weight upserts the same row and counts another
// `registrar-medida` in Umami.
describe("BodyQuickMeasureCard — today's measurement", () => {
  // 2026-05-15T12:00:00Z is 2026-05-15 in UTC and in Europe/Madrid, so the
  // frozen "today" holds whatever the host timezone (same as MeasurementDialog's tests).
  const FROZEN_NOW = new Date('2026-05-15T12:00:00Z');
  const TODAY = '2026-05-15';
  const row = (measured_on: string) =>
    ({
      id: `m-${measured_on}`,
      measured_on,
      weight_kg: 82.9,
      body_fat_pct: null,
      muscle_pct: null,
      water_pct: null,
      notes: null,
    }) as never;

  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FROZEN_NOW);
    // The card lives in the Diario's desktop right rail: use the dialog branch.
    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    mutateAsync.mockClear();
    vi.mocked(track).mockClear();
    await i18n.changeLanguage('es');
  });

  afterEach(() => {
    vi.useRealTimers();
    window.matchMedia = originalMatchMedia;
  });

  async function openDialog(latestRow: never) {
    const user = userEvent.setup();
    render(<BodyQuickMeasureCard latest={latestRow} rate={null} />);
    await user.click(screen.getByRole('button', { name: i18n.t('diario:body.register') }));
    return user;
  }

  const dateInput = () => screen.getByLabelText(i18n.t('metricas:fields.date'));
  const save = () => screen.getByRole('button', { name: i18n.t('common:save') });

  it("opens today's measurement for editing, with the date locked", async () => {
    await openDialog(row(TODAY));
    expect(
      screen.getByRole('dialog', { name: i18n.t('metricas:dialog.editTitle') }),
    ).toBeInTheDocument();
    expect(dateInput()).toBeDisabled();
    expect(dateInput()).toHaveValue(TODAY);
  });

  it("re-saving today's measurement updates it without counting another registrar-medida", async () => {
    const user = await openDialog(row(TODAY));
    await user.click(save());
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ measured_on: TODAY, weight_kg: 82.9 }),
    );
    expect(track).not.toHaveBeenCalled();
  });

  it('with only an earlier measurement it still opens as new and counts one registrar-medida', async () => {
    const user = await openDialog(row('2026-05-14'));
    expect(
      screen.getByRole('dialog', { name: i18n.t('metricas:dialog.newTitle') }),
    ).toBeInTheDocument();
    expect(dateInput()).toBeEnabled();
    expect(dateInput()).toHaveValue(TODAY);
    await user.click(save());
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ measured_on: TODAY }));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('registrar-medida');
  });
});
