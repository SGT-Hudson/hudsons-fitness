import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { getExcessTone, getKcalStatus, type Excess, type PhaseType } from '@/core/nutritionTone';

export interface WeeklyKcalDay {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  kcal: number;
  /** The real-world "today" slot — always rendered in accent, regardless of tone. */
  isToday: boolean;
}

interface Props {
  /** Exactly 7 days, oldest → newest, ending on the selected diario date. */
  days: WeeklyKcalDay[];
  /**
   * Today's phase kcal target — the chart's single reference line. The
   * canvas draws one dashed target line, not a per-day one, and
   * `daily_nutrition_history` carries no per-day phase target, so
   * approximating the whole week with today's target is faithful to that
   * single-line model (see task-5-brief.md).
   */
  target: number;
  /** Today's active phase — drives non-today bar tone via `getKcalStatus`. */
  phase?: PhaseType;
  className?: string;
}

const CHART_H = 72;

// Same per-component tone-map convention as MacroBar.tsx's EXCESS_TONE — a
// solid single-fill bar only needs the 3-state excess vocabulary, not the
// full 6-state Tone.
const EXCESS_FILL: Record<Excess, string> = {
  neutral: 'bg-excess-neutral',
  warn: 'bg-excess-warn',
  bad: 'bg-excess-bad',
};

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Monday-first weekday index (0=Mon..6=Sun) for an ISO `YYYY-MM-DD` string. */
function weekdayIndex(iso: string): number {
  const d = new Date(`${iso}T00:00:00`);
  return (d.getDay() + 6) % 7;
}

/**
 * Phase-aware weekly kcal bar chart (R-33 wave 2, task 5). Web-rail-only —
 * pure/prop-driven so it's unit-testable without a data layer; `useWeeklyKcal`
 * supplies `days`, and the caller (Task 6) supplies today's phase target/type.
 */
export function WeeklyKcalChart({ days, target, phase = 'cut', className }: Props) {
  const { t } = useTranslation('diario');
  const hasTarget = target > 0;
  const average = days.length
    ? Math.round(days.reduce((sum, d) => sum + d.kcal, 0) / days.length)
    : 0;
  const max = Math.max(target, ...days.map((d) => d.kcal), 1) * 1.15;
  const targetTop = hasTarget ? CHART_H - (target / max) * CHART_H : null;

  return (
    <div className={cn('rounded-md border bg-card p-3.5', className)}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{t('weekly.title')}</span>
        <span className="tabular-nums text-[11px] text-text-dim">
          {t('weekly.summary', { avg: average, target })}
        </span>
      </div>

      <div className="relative mt-2" style={{ height: CHART_H }}>
        {targetTop != null && (
          <>
            <div
              className="absolute inset-x-0 border-t border-dashed border-text-dim/55"
              style={{ top: targetTop }}
              aria-hidden="true"
            />
            <span className="absolute right-0 tabular-nums bg-card px-1 text-[9.5px] text-text-dim">
              {t('weekly.target', { target })}
            </span>
          </>
        )}
        <div className="absolute inset-0 grid grid-cols-7 items-end gap-1.5">
          {days.map((d) => {
            const height = Math.max(0, (d.kcal / max) * CHART_H);
            const tone = hasTarget ? getKcalStatus(d.kcal, target, phase) : 'neutral';
            const excess = getExcessTone(tone);
            return (
              <div
                key={d.date}
                data-testid="weekly-kcal-bar"
                data-date={d.date}
                className={cn(
                  'w-full rounded',
                  d.isToday ? 'bg-accent' : cn(EXCESS_FILL[excess], 'border border-border'),
                )}
                style={{ height }}
              />
            );
          })}
        </div>
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1.5">
        {days.map((d) => (
          <span
            key={d.date}
            className={cn(
              'text-center text-[9.5px]',
              d.isToday ? 'font-semibold text-foreground' : 'text-text-dim',
            )}
          >
            {t(`weekly.weekday.${WEEKDAY_KEYS[weekdayIndex(d.date)]}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
