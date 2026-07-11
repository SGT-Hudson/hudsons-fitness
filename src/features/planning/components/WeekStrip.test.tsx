import i18n from '@/i18n';
import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { WeekStrip } from './WeekStrip';

const days = [
  { date: '2026-05-25', kcal: 2168, isToday: false },
  { date: '2026-05-26', kcal: 2240, isToday: true },
  { date: '2026-05-27', kcal: 2095, isToday: false },
  { date: '2026-05-28', kcal: 2210, isToday: false },
  { date: '2026-05-29', kcal: 2280, isToday: false },
  { date: '2026-05-30', kcal: 2540, isToday: false },
  { date: '2026-05-31', kcal: 2104, isToday: false },
];

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('WeekStrip', () => {
  it('renders one cell per day with its day number', () => {
    const { container } = render(<WeekStrip days={days} target={2180} phase="cut" />);
    expect(container.querySelectorAll('[data-day]').length).toBe(7);
    expect(container.querySelector('[data-day="2026-05-30"]')?.textContent).toContain('30');
  });

  it('tints the over-target day red and today with the accent', () => {
    const { container } = render(<WeekStrip days={days} target={2180} phase="cut" />);
    // Saturday is 2540 kcal on a 2180 cut target → over (>5%).
    const sat = container.querySelector('[data-day="2026-05-30"] [data-stripe]');
    expect(sat?.className).toContain('bg-destructive');
    const today = container.querySelector('[data-day="2026-05-26"]');
    expect(today?.className).toContain('bg-accent-soft');
  });

  it('stays neutral with no target', () => {
    const { container } = render(<WeekStrip days={days} />);
    expect(container.querySelector('[data-day="2026-05-30"] [data-stripe]')?.className).toContain(
      'bg-muted-foreground/50',
    );
  });
});
