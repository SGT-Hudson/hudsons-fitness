import { useTranslation } from 'react-i18next';
import { parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { classify, type PhaseType, type Tone } from '@/core/nutritionTone';
import { formatDate, type Locale } from '@/lib/dates';

const BG_TONE: Record<Tone, string> = {
  good: 'bg-tone-good',
  onTarget: 'bg-tone-good',
  slightOver: 'bg-tone-warn',
  low: 'bg-tone-warn',
  over: 'bg-destructive',
  neutral: 'bg-muted-foreground/50',
};

export interface WeekStripDay {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  kcal: number;
  isToday: boolean;
}

interface Props {
  days: WeekStripDay[];
  /** Phase kcal target — omit and every day renders neutral. */
  target?: number;
  phase?: PhaseType;
  className?: string;
}

/**
 * Mobile 7-day strip (canvas `PlanificadorMobileV2`): a tone stripe per day over
 * the weekday letter + number. Display-only — the list below always shows today.
 * Column widths and gap match `WeeklyKcalChart` so each day sits over its bar.
 */
export function WeekStrip({ days, target, phase, className }: Props) {
  const { i18n } = useTranslation('planning');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  return (
    <div className={cn('grid grid-cols-7 gap-1.5', className)}>
      {days.map((d) => {
        const tone = classify('kcal', d.kcal, target, phase).tone;
        return (
          <div
            key={d.date}
            data-day={d.date}
            className={cn(
              'relative flex flex-col items-center gap-px overflow-hidden rounded-lg border px-0.5 pb-[5px] pt-1',
              d.isToday
                ? 'border-accent-line bg-accent-soft'
                : 'border-transparent bg-muted',
            )}
          >
            <span
              data-stripe
              aria-hidden="true"
              className={cn('absolute inset-x-0 top-0 h-[3px]', BG_TONE[tone])}
            />
            <span
              className={cn(
                'mt-0.5 text-[8px] font-medium uppercase tracking-[0.02em]',
                d.isToday ? 'text-accent-ink' : 'text-text-dim',
              )}
            >
              {formatDate(parseISO(d.date), 'EEE', locale)}
            </span>
            <span
              className={cn(
                'tnum text-[12.5px] font-semibold',
                d.isToday ? 'text-accent-ink' : 'text-foreground',
              )}
            >
              {formatDate(parseISO(d.date), 'd', locale)}
            </span>
            <span
              aria-hidden="true"
              className={cn('h-1 w-1 rounded-full opacity-80', BG_TONE[tone])}
            />
          </div>
        );
      })}
    </div>
  );
}
