// @vitest-environment jsdom
//
// Tier-2 component test (R-09 todayInTZ follow-up) for DateNavigator. The
// date-input `max`, the isToday check, and the future-shift guard must all
// use the project's canonical Europe/Madrid "today" (`todayInTZ`), not the
// host TZ. The frozen instant 2026-05-17T22:30:00Z is 2026-05-17 under UTC
// but already 2026-05-18 in Madrid (CEST, UTC+2) — so a host-TZ derivation
// would put `max` a day behind and disagree with the Madrid day. Asserting
// `max === '2026-05-18'` proves the canonical boundary is used.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import { DateNavigator } from './DateNavigator';

const FROZEN_NOW = new Date('2026-05-17T22:30:00Z');
const MADRID_TODAY = '2026-05-18';

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FROZEN_NOW);
  await i18n.changeLanguage('es');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DateNavigator', () => {
  it('uses the canonical Europe/Madrid "today" for the date-input max', () => {
    render(<DateNavigator date="2026-05-10" onChange={vi.fn()} />);
    const input = screen.getByDisplayValue('2026-05-10') as HTMLInputElement;
    expect(input.getAttribute('max')).toBe(MADRID_TODAY);
  });

  it('treats the Madrid day (not the host-TZ day) as today: hides the "today" shortcut and disables next', () => {
    render(<DateNavigator date={MADRID_TODAY} onChange={vi.fn()} />);
    // On the canonical "today" the next-day button is disabled and the
    // "jump to today" shortcut is not rendered.
    expect(screen.getByLabelText(i18n.t('diario:date.next'))).toBeDisabled();
    expect(screen.queryByText(i18n.t('diario:date.today'))).toBeNull();
  });

  it('does not shift past the canonical Madrid today', () => {
    const onChange = vi.fn();
    render(<DateNavigator date={MADRID_TODAY} onChange={onChange} />);
    // Next is disabled at today; the future-shift guard also blocks the call.
    const next = screen.getByLabelText(i18n.t('diario:date.next'));
    next.removeAttribute('disabled');
    next.click();
    expect(onChange).not.toHaveBeenCalled();
  });
});
