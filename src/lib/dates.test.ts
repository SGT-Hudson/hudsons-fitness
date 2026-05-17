import { describe, it, expect } from 'vitest';
import { isoDate, mondayOf, daysBetween, formatDate } from './dates';

// Characterization tests for the client date helpers (D-F1 / R-16).
// Dates are built with local components so date-fns local formatting is
// deterministic regardless of the machine's timezone.

describe('isoDate', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    expect(isoDate(new Date(2026, 4, 17, 13, 45))).toBe('2026-05-17');
  });

  it('zero-pads month and day', () => {
    expect(isoDate(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
});

describe('mondayOf', () => {
  it('returns the Monday of the containing week (Mon start)', () => {
    // 2026-05-17 is a Sunday -> Monday of that ISO week is 2026-05-11
    const monday = mondayOf(new Date(2026, 4, 17));
    expect(isoDate(monday)).toBe('2026-05-11');
  });

  it('returns the same day when given a Monday', () => {
    // 2026-05-11 is a Monday
    const monday = mondayOf(new Date(2026, 4, 11));
    expect(isoDate(monday)).toBe('2026-05-11');
  });
});

describe('daysBetween', () => {
  it('is positive when "to" is after "from"', () => {
    expect(daysBetween('2026-05-01', '2026-05-17')).toBe(16);
  });

  it('is negative when "to" is before "from"', () => {
    expect(daysBetween('2026-05-17', '2026-05-01')).toBe(-16);
  });

  it('is zero for the same day', () => {
    expect(daysBetween('2026-05-17', '2026-05-17')).toBe(0);
  });

  it('accepts Date objects', () => {
    expect(
      daysBetween(new Date(2026, 4, 1), new Date(2026, 4, 11)),
    ).toBe(10);
  });
});

describe('formatDate', () => {
  it('formats an ISO string with the default Spanish locale', () => {
    expect(formatDate('2026-05-17', 'yyyy-MM-dd')).toBe('2026-05-17');
  });

  it('honors the English locale for month names', () => {
    const en = formatDate('2026-05-17', 'MMMM', 'en');
    expect(en.toLowerCase()).toBe('may');
  });
});
