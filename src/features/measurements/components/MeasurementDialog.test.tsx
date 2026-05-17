// @vitest-environment jsdom
//
// Tier-2 component test (R-16, rides R-09) for the measurement entry form.
// Asserts the RHF + zodResolver migration preserves behavior: weight is
// required + bounded (schema rejects bad input, mutation not called),
// optional metrics are blank→null, and a valid submit ships the parsed
// numeric payload. The mutation hook is mocked (not the schema).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';

const mutateAsync = vi.fn().mockResolvedValue({});
vi.mock('../hooks', () => ({
  useUpsertMeasurement: () => ({ mutateAsync, isPending: false }),
}));

import { MeasurementDialog } from './MeasurementDialog';

beforeEach(async () => {
  await i18n.changeLanguage('es');
  mutateAsync.mockClear();
});

function setup() {
  const onOpenChange = vi.fn();
  render(
    <MeasurementDialog
      open
      onOpenChange={onOpenChange}
      defaultDate="2026-05-18"
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
      measured_on: '2026-05-18',
      weight_kg: 82.4,
      body_fat_pct: 18,
      muscle_pct: null, // left blank → null (parseOptional parity)
      water_pct: null,
      notes: null,
    });
    expect(typeof payload.weight_kg).toBe('number');
  });
});
