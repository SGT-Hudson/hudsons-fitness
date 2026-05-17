import { describe, it, expect } from 'vitest';
import {
  isoDateInTZ,
  todayInTZ,
  previousDayInTZ,
  mondayOfTodayInTZ,
} from './dates';

// Direct coverage of the shared pure date/TZ core (D-F3 / R-17). Behavior is
// byte-identical to the helpers the edge `_shared/macros.ts` used to inline.

describe('isoDateInTZ', () => {
  it('formats a UTC instant in Europe/Madrid (CEST, UTC+2)', () => {
    expect(isoDateInTZ(new Date('2026-05-17T22:30:00Z'))).toBe('2026-05-18');
  });

  it('respects the winter DST offset (CET, UTC+1)', () => {
    expect(isoDateInTZ(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16');
  });

  it('honors an explicit timezone argument', () => {
    expect(isoDateInTZ(new Date('2026-05-17T22:30:00Z'), 'UTC')).toBe('2026-05-17');
  });
});

describe('todayInTZ', () => {
  it('equals isoDateInTZ(now) for Madrid (the canonical "today")', () => {
    expect(todayInTZ()).toBe(isoDateInTZ(new Date(), 'Europe/Madrid'));
  });

  it('honors an explicit timezone argument', () => {
    expect(todayInTZ('UTC')).toBe(isoDateInTZ(new Date(), 'UTC'));
  });
});

describe('previousDayInTZ', () => {
  it('is exactly one calendar day before today in Madrid', () => {
    const today = isoDateInTZ(new Date(), 'Europe/Madrid');
    const [y, m, d] = today.split('-').map(Number);
    const expected = new Date(Date.UTC(y, m - 1, d) - 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(previousDayInTZ()).toBe(expected);
  });
});

describe('mondayOfTodayInTZ', () => {
  it('returns an ISO Monday on or within the previous 6 days of today', () => {
    const monday = mondayOfTodayInTZ();
    expect(monday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${monday}T00:00:00Z`).getUTCDay()).toBe(1);

    const today = isoDateInTZ(new Date(), 'Europe/Madrid');
    const [y, m, d] = today.split('-').map(Number);
    const [my, mm, md] = monday.split('-').map(Number);
    const diffDays =
      (Date.UTC(y, m - 1, d) - Date.UTC(my, mm - 1, md)) / 86_400_000;
    expect(diffDays).toBeGreaterThanOrEqual(0);
    expect(diffDays).toBeLessThanOrEqual(6);
  });
});
