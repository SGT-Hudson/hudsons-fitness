import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const noop = () => {};

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('WeekStrip', () => {
  it('renders one cell per day with its day number', () => {
    const { container } = render(
      <WeekStrip days={days} target={2180} phase="cut" selectedDate="2026-05-26" onSelect={noop} />,
    );
    expect(container.querySelectorAll('[data-day]').length).toBe(7);
    expect(container.querySelector('[data-day="2026-05-30"]')?.textContent).toContain('30');
  });

  it('tints the over-target day red and today with the accent', () => {
    const { container } = render(
      <WeekStrip days={days} target={2180} phase="cut" selectedDate="2026-05-26" onSelect={noop} />,
    );
    // Saturday is 2540 kcal on a 2180 cut target → over (>5%).
    const sat = container.querySelector('[data-day="2026-05-30"] [data-stripe]');
    expect(sat?.className).toContain('bg-destructive');
    const today = container.querySelector('[data-day="2026-05-26"]');
    expect(today?.className).toContain('bg-accent-soft');
  });

  it('stays neutral with no target', () => {
    const { container } = render(
      <WeekStrip days={days} selectedDate="2026-05-26" onSelect={noop} />,
    );
    expect(container.querySelector('[data-day="2026-05-30"] [data-stripe]')?.className).toContain(
      'bg-muted-foreground/50',
    );
  });

  it('renders a day with nothing planned as neutral, never good', () => {
    // classify('kcal', 0, 2180, 'cut') is `good` — the cut band only guards the
    // upper side — so an unplanned day would otherwise show a green stripe.
    const withEmptyThursday = days.map((d) => (d.date === '2026-05-28' ? { ...d, kcal: 0 } : d));
    const { container } = render(
      <WeekStrip
        days={withEmptyThursday}
        target={2180}
        phase="cut"
        selectedDate="2026-05-26"
        onSelect={noop}
      />,
    );
    const stripe = container.querySelector('[data-day="2026-05-28"] [data-stripe]');
    expect(stripe?.className).toContain('bg-muted-foreground/50');
    expect(stripe?.className).not.toContain('bg-tone-good');
  });

  it('exposes each day as a button whose accessible name carries the date', () => {
    render(
      <WeekStrip days={days} target={2180} phase="cut" selectedDate="2026-05-26" onSelect={noop} />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(7);
    expect(screen.getByRole('button', { name: /28/ })).toBeInTheDocument();
  });

  it('reports the picked day to onSelect', async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <WeekStrip
        days={days}
        target={2180}
        phase="cut"
        selectedDate="2026-05-26"
        onSelect={onSelect}
      />,
    );
    await userEvent.click(container.querySelector('[data-day="2026-05-28"]') as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith('2026-05-28');
  });

  it('marks only the selected day as pressed and ringed', () => {
    const { container } = render(
      <WeekStrip days={days} target={2180} phase="cut" selectedDate="2026-05-28" onSelect={noop} />,
    );
    const thu = container.querySelector('[data-day="2026-05-28"]') as HTMLElement;
    expect(thu.getAttribute('aria-pressed')).toBe('true');
    expect(thu.className).toContain('ring-2');

    const fri = container.querySelector('[data-day="2026-05-29"]') as HTMLElement;
    expect(fri.getAttribute('aria-pressed')).toBe('false');
    expect(fri.className).not.toContain('ring-2');
  });

  it('still reads as selected when the selected day is also today', () => {
    const { container } = render(
      <WeekStrip days={days} target={2180} phase="cut" selectedDate="2026-05-26" onSelect={noop} />,
    );
    const today = container.querySelector('[data-day="2026-05-26"]') as HTMLElement;
    expect(today.getAttribute('aria-pressed')).toBe('true');
    expect(today.className).toContain('ring-2'); // selection ring wins…
    expect(today.className).toContain('bg-accent-soft'); // …without losing the today tint
  });
});
