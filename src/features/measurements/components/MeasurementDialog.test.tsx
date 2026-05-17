// @vitest-environment jsdom
//
// Tier-2 component test (R-16, rides R-09) for the measurement entry form.
// Asserts the RHF + zodResolver migration preserves behavior: weight is
// required + bounded (schema rejects bad input, mutation not called),
// optional metrics are blank→null, and a valid submit ships the parsed
// numeric payload. The mutation hook is mocked (not the schema).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';

const mutateAsync = vi.fn().mockResolvedValue({});
vi.mock('../hooks', () => ({
  useUpsertMeasurement: () => ({ mutateAsync, isPending: false }),
}));

import { MeasurementDialog } from './MeasurementDialog';

// Freeze the clock at a fixed mid-day-UTC instant. The dialog's date-input
// `max` is the project's canonical Europe/Madrid "today" (`todayInTZ`); a
// real-clock test was timezone-flaky (CI at 23:51 UTC = next calendar day in
// Madrid pushed `max` a day off and the browser blocked the in-range submit).
// 2026-05-15T12:00:00Z is the same calendar date (2026-05-15) under BOTH UTC
// and Europe/Madrid (UTC+2 in May → 14:00), so the frozen "today" is stable
// regardless of the host timezone. The same-day measurement uses that date.
const FROZEN_NOW = new Date('2026-05-15T12:00:00Z');
const TODAY = '2026-05-15';

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FROZEN_NOW);
  await i18n.changeLanguage('es');
  mutateAsync.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const onOpenChange = vi.fn();
  render(
    <MeasurementDialog
      open
      onOpenChange={onOpenChange}
      defaultDate={TODAY}
      existing={null}
      prefillFrom={null}
    />,
  );
  return { onOpenChange };
}

describe('MeasurementDialog (Tier-2)', () => {
  it('does not submit when weight is empty (weight is required)', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(
      screen.getByRole('button', { name: i18n.t('common:save') }),
    );
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
  });

  it('rejects an out-of-range weight', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(
      screen.getByLabelText(i18n.t('metricas:fields.weightKg')),
      '5', // below the 20 lower bound
    );
    await user.click(screen.getByRole('button', { name: i18n.t('common:save') }));
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
  });

  it('submits the parsed payload; blank optional metrics become null', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(i18n.t('metricas:fields.weightKg')), '82.4');
    await user.type(
      screen.getByLabelText(i18n.t('metricas:fields.bodyFatPct')),
      '18',
    );

    await user.click(screen.getByRole('button', { name: i18n.t('common:save') }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload).toMatchObject({
      measured_on: TODAY,
      weight_kg: 82.4,
      body_fat_pct: 18,
      muscle_pct: null, // left blank → null (parseOptional parity)
      water_pct: null,
      notes: null,
    });
    expect(typeof payload.weight_kg).toBe('number');
  });
});
