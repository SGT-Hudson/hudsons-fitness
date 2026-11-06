// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';

const mutateAsync = vi.fn();
vi.mock('../hooks', () => ({
  useUpsertMeasurement: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('@/lib/stats', () => ({ track: vi.fn() }));

import { track } from '@/lib/stats';
import { MeasurementDialog } from './MeasurementDialog';

const TODAY = '2026-05-15';
const EXISTING = {
  id: 'm0', measured_on: TODAY, weight_kg: 82.9, body_fat_pct: null,
  muscle_pct: null, water_pct: null, notes: null,
} as never;

function setup(props: Partial<React.ComponentProps<typeof MeasurementDialog>> = {}) {
  const onOpenChange = vi.fn();
  render(
    <MeasurementDialog open onOpenChange={onOpenChange} defaultDate={TODAY} existing={null} prefillFrom={null} {...props} />,
  );
  return { onOpenChange };
}

beforeEach(async () => {
  vi.clearAllMocks();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: true, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  mutateAsync.mockResolvedValue({});
  await i18n.changeLanguage('es');
});

const save = () => screen.getByRole('button', { name: i18n.t('common:save') });

describe('MeasurementDialog events', () => {
  it('tracks registrar-medida when a new measurement is saved', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup();
    await user.type(screen.getByLabelText(i18n.t('metricas:dialog.weightLabel')), '82,4');
    await user.click(save());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('registrar-medida');
  });

  it('tracks nothing when editing an existing measurement', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup({ existing: EXISTING });
    await user.click(save());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(track).not.toHaveBeenCalled();
  });

  it('tracks nothing when the save fails', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new Error('fail'));
    setup();
    await user.type(screen.getByLabelText(i18n.t('metricas:dialog.weightLabel')), '82');
    await user.click(save());
    await screen.findByText('fail');
    expect(track).not.toHaveBeenCalled();
  });
});
