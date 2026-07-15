import '@/i18n';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WeeklyKcalChart, type WeeklyKcalDay } from './WeeklyKcalChart';

const CHART_H = 72;

function day(date: string, kcal: number, isToday = false): WeeklyKcalDay {
  return { date, kcal, isToday };
}

function bars(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-testid="weekly-kcal-bar"]'));
}

describe('WeeklyKcalChart', () => {
  it('bar heights are proportional to kcal / max, max = max(target, ...days) * 1.15', () => {
    const days: WeeklyKcalDay[] = [
      day('2026-07-04', 2080),
      day('2026-07-05', 2240),
      day('2026-07-06', 2120),
      day('2026-07-07', 2280),
      day('2026-07-08', 2150),
      day('2026-07-09', 2010),
      day('2026-07-10', 1568, true),
    ];
    const target = 2180;
    const max = Math.max(target, ...days.map((d) => d.kcal)) * 1.15;

    const { container } = render(
      <WeeklyKcalChart days={days} target={target} phase="cut" />,
    );
    const els = bars(container);
    expect(els).toHaveLength(7);
    els.forEach((el, i) => {
      const expected = (days[i].kcal / max) * CHART_H;
      expect(el).toHaveStyle({ height: `${expected}px` });
    });
  });

  it('cut phase: a day over target renders the "bad" excess fill', () => {
    const days: WeeklyKcalDay[] = [
      day('2026-07-04', 2400), // +10% over target on a cut → 'over' tone
      day('2026-07-05', 2000),
      day('2026-07-06', 2000),
      day('2026-07-07', 2000),
      day('2026-07-08', 2000),
      day('2026-07-09', 2000),
      day('2026-07-10', 2000, true),
    ];
    const { container } = render(
      <WeeklyKcalChart days={days} target={2000} phase="cut" />,
    );
    expect(bars(container)[0]).toHaveClass('bg-excess-bad');
  });

  it('bulk phase: a day under target ("short" of the surplus) renders the warn excess fill', () => {
    const days: WeeklyKcalDay[] = [
      day('2026-07-04', 1800), // -10% under target on a bulk → 'low' tone
      day('2026-07-05', 2400),
      day('2026-07-06', 2400),
      day('2026-07-07', 2400),
      day('2026-07-08', 2400),
      day('2026-07-09', 2400),
      day('2026-07-10', 2400, true),
    ];
    const { container } = render(
      <WeeklyKcalChart days={days} target={2000} phase="bulk" />,
    );
    expect(bars(container)[0]).toHaveClass('bg-excess-warn');
  });

  it('maintenance: an in-band day renders the neutral excess fill', () => {
    const days: WeeklyKcalDay[] = [
      day('2026-07-04', 2010), // within ±3% of target → 'onTarget' tone
      day('2026-07-05', 2000),
      day('2026-07-06', 2000),
      day('2026-07-07', 2000),
      day('2026-07-08', 2000),
      day('2026-07-09', 2000),
      day('2026-07-10', 2000, true),
    ];
    const { container } = render(
      <WeeklyKcalChart days={days} target={2000} phase="maintenance" />,
    );
    expect(bars(container)[0]).toHaveClass('bg-excess-neutral');
  });

  it("today's bar is always accent-filled, even when well over target", () => {
    const days: WeeklyKcalDay[] = [
      day('2026-07-04', 2000),
      day('2026-07-05', 2000),
      day('2026-07-06', 2000),
      day('2026-07-07', 2000),
      day('2026-07-08', 2000),
      day('2026-07-09', 2000),
      day('2026-07-10', 3000, true), // way over target, but it's today
    ];
    const { container } = render(
      <WeeklyKcalChart days={days} target={2000} phase="cut" />,
    );
    const els = bars(container);
    expect(els[6]).toHaveClass('bg-accent');
    expect(els[6]).not.toHaveClass('bg-excess-bad');
  });

  it('a missing/zero day (no history row) renders a zero-height bar without crashing', () => {
    const days: WeeklyKcalDay[] = [
      day('2026-07-04', 0),
      day('2026-07-05', 2000),
      day('2026-07-06', 2000),
      day('2026-07-07', 2000),
      day('2026-07-08', 2000),
      day('2026-07-09', 2000),
      day('2026-07-10', 2000, true),
    ];
    expect(() =>
      render(<WeeklyKcalChart days={days} target={2000} phase="cut" />),
    ).not.toThrow();
    const { container } = render(
      <WeeklyKcalChart days={days} target={2000} phase="cut" />,
    );
    expect(bars(container)[0]).toHaveStyle({ height: '0px' });
  });

  it('renders the weekday letters with today bold', () => {
    const days: WeeklyKcalDay[] = [
      day('2026-07-04', 2000), // Saturday
      day('2026-07-05', 2000), // Sunday
      day('2026-07-06', 2000), // Monday
      day('2026-07-07', 2000),
      day('2026-07-08', 2000),
      day('2026-07-09', 2000),
      day('2026-07-10', 2000, true), // Friday
    ];
    const { getByText } = render(
      <WeeklyKcalChart days={days} target={2000} phase="cut" />,
    );
    const todayLabel = getByText(/^[VF]$/);
    expect(todayLabel).toHaveClass('font-semibold');
  });

  it('showWeekdays={false} drops the weekday row (the planner strip above already shows it)', () => {
    const days: WeeklyKcalDay[] = [
      day('2026-07-04', 2000),
      day('2026-07-05', 2000),
      day('2026-07-06', 2000),
      day('2026-07-07', 2000),
      day('2026-07-08', 2000),
      day('2026-07-09', 2000),
      day('2026-07-10', 2000, true), // Friday
    ];
    const { container, queryByText } = render(
      <WeeklyKcalChart days={days} target={2000} phase="cut" showWeekdays={false} />,
    );
    expect(queryByText(/^[VF]$/)).not.toBeInTheDocument();
    // the bars themselves are untouched
    expect(bars(container)).toHaveLength(7);
  });

  it('renders the "Semana" title and "media … · obj …" summary with the dashed target chip', () => {
    const days: WeeklyKcalDay[] = [
      day('2026-07-04', 2000),
      day('2026-07-05', 2000),
      day('2026-07-06', 2000),
      day('2026-07-07', 2000),
      day('2026-07-08', 2000),
      day('2026-07-09', 2000),
      day('2026-07-10', 2000, true),
    ];
    const { getByText } = render(
      <WeeklyKcalChart days={days} target={2000} phase="cut" />,
    );
    expect(getByText(/^(Semana|Week)$/)).toBeInTheDocument();
    expect(getByText(/media 2000 · obj 2000|avg 2000 · target 2000/)).toBeInTheDocument();
    expect(getByText(/^(obj|target) 2000$/)).toBeInTheDocument();
  });

  it('a non-positive target hides the dashed line/chip but still renders 7 bars without crashing', () => {
    const days: WeeklyKcalDay[] = [
      day('2026-07-04', 2000),
      day('2026-07-05', 0),
      day('2026-07-06', 0),
      day('2026-07-07', 0),
      day('2026-07-08', 0),
      day('2026-07-09', 0),
      day('2026-07-10', 0, true),
    ];
    const { container, queryByText } = render(
      <WeeklyKcalChart days={days} target={0} phase="cut" />,
    );
    expect(bars(container)).toHaveLength(7);
    expect(queryByText(/obj 0/)).not.toBeInTheDocument();
  });
});
