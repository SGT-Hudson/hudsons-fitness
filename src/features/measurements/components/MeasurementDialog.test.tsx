// @vitest-environment jsdom
//
// Tier-2 component test (R-16, rides R-09) for the measurement entry form.
// Asserts the RHF + zodResolver migration preserves behavior: weight is
// required + bounded (schema rejects bad input, mutation not called),
// optional metrics are blank→null, and a valid submit ships the parsed
// numeric payload. The mutation hook is mocked (not the schema).
//
// R-33 wave 7 moved the form onto `ResponsiveDialog` (vaul sheet on mobile,
// centred dialog on desktop). The form logic is shared by both branches, so the
// behaviour cases run on the desktop one and the sheet gets its own cases —
// including a full submit, because the drawer is the branch the phone (and the
// Diario card) actually renders.
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

// The shell branches on `useMediaQuery`, which jsdom cannot answer on its own.
function setViewport(isDesktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: isDesktop,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const PREVIOUS = {
  id: 'm0',
  measured_on: '2026-05-08',
  weight_kg: 82.9,
  body_fat_pct: 18,
  muscle_pct: 40,
  water_pct: 55,
  notes: null,
} as never;

const WEIGHT = () => i18n.t('metricas:dialog.weightLabel');
const BODY_FAT = () => i18n.t('metricas:composition.fat');
const SAVE = () => i18n.t('common:save');

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FROZEN_NOW);
  await i18n.changeLanguage('es');
  setViewport(true);
  mutateAsync.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(props: Partial<React.ComponentProps<typeof MeasurementDialog>> = {}) {
  const onOpenChange = vi.fn();
  render(
    <MeasurementDialog
      open
      onOpenChange={onOpenChange}
      defaultDate={TODAY}
      existing={null}
      prefillFrom={null}
      {...props}
    />,
  );
  return { onOpenChange };
}

describe('MeasurementDialog (Tier-2)', () => {
  it('does not submit when weight is empty (weight is required)', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: SAVE() }));
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
  });

  it('rejects an out-of-range weight', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(
      screen.getByLabelText(WEIGHT()),
      '5', // below the 20 lower bound
    );
    await user.click(screen.getByRole('button', { name: SAVE() }));
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
  });

  // The headline case of the decimal-comma fix. A Spanish keyboard puts `,` on
  // the numeric keypad, so `82,4` is what a user types by default for a body
  // weight — and `<input type="number">` silently stored it as 824.
  //
  // ⚠️ jsdom does NOT implement `type="number"`'s comma-stripping, so this test
  // only pins the SCHEMA half of the fix (the parser behind `requiredNumericString`).
  // The DOM half — the field being `type="text" inputMode="decimal"` so the
  // comma survives to JS at all — is invisible to jsdom and can only be
  // confirmed in a real browser.
  it('accepts a decimal comma on body weight: 82,4 → 82.4', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(WEIGHT()), '82,4');
    await user.type(screen.getByLabelText(BODY_FAT()), '18,5');

    await user.click(screen.getByRole('button', { name: SAVE() }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload.weight_kg).toBe(82.4);
    expect(payload.body_fat_pct).toBe(18.5);
  });

  it('submits the parsed payload; blank optional metrics become null', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(WEIGHT()), '82.4');
    await user.type(screen.getByLabelText(BODY_FAT()), '18');

    await user.click(screen.getByRole('button', { name: SAVE() }));

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

// The R-33 wave-7 migration: the same form, two shells.
describe('MeasurementDialog — the responsive shell', () => {
  it('is a centred dialog on desktop, and a sheet on mobile', () => {
    setup();
    expect(
      screen.getByRole('dialog', { name: i18n.t('metricas:dialog.newTitle') }),
    ).toBeInTheDocument();
    // Desktop gets DialogContent's own X, so the form draws no close button of
    // its own; the footer's Cancelar is the escape hatch.
    expect(screen.getByRole('button', { name: i18n.t('common:cancel') })).toBeInTheDocument();
  });

  it('submits from the mobile sheet too', async () => {
    setViewport(false);
    const user = userEvent.setup();
    setup();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.type(screen.getByLabelText(WEIGHT()), '82,4');
    await user.click(screen.getByRole('button', { name: SAVE() }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0].weight_kg).toBe(82.4);
  });

  // The delta is the plain difference against the measurement the caller passed
  // in — never a trend, never a number this form invents.
  it('shows the delta against the previous measurement', async () => {
    const user = userEvent.setup();
    setup({ prefillFrom: PREVIOUS });

    // The field opens prefilled with the previous weight ⇒ no change yet.
    expect(screen.getByText(/± 0\.0 kg desde la última · 8 may/)).toBeInTheDocument();

    const weight = screen.getByLabelText(WEIGHT());
    await user.clear(weight);
    await user.type(weight, '82,6'); // 82,9 → 82,6
    expect(await screen.findByText(/↓ 0\.3 kg desde la última · 8 may/)).toBeInTheDocument();
  });

  it('draws no delta line when there is no previous measurement', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText(WEIGHT()), '82,4');
    expect(screen.queryByText(/desde la última/)).toBeNull();
  });
});
