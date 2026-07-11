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
  /** ISO date the mobile plan list is showing — the pressed cell. */
  selectedDate: string;
  onSelect: (dateIso: string) => void;
  /** Phase kcal target — omit and every day renders neutral. */
  target?: number;
  phase?: PhaseType;
  className?: string;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Mobile 7-day strip (canvas `PlanificadorMobileV2`): a tone stripe per day over
 * the weekday letter + number. Each cell is the day picker for the plan list
 * below it — below `md` the week grid is hidden, so this is the only way to
 * reach another day of the week from a phone.
 *
 * Today keeps its accent tint; the selected day takes a neutral ring, so a day
 * that is both still reads as selected. Column widths and gap match
 * `WeeklyKcalChart` so each day sits over its bar.
 */
export function WeekStrip({ days, selectedDate, onSelect, target, phase, className }: Props) {
  const { i18n } = useTranslation('planning');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  return (
    <div className={cn('grid grid-cols-7 gap-1.5', className)}>
      {days.map((d) => {
        // A day with nothing planned has no signal to report: `classify` would
        // paint an empty cut day green (its band only guards the upper side).
        // Same "no data ≠ good" call as DayHeaderCard — kept out of the shared
        // tone core, which is presentation-agnostic.
        const tone: Tone = d.kcal === 0 ? 'neutral' : classify('kcal', d.kcal, target, phase).tone;
        const selected = d.date === selectedDate;
        const date = parseISO(d.date);
        return (
          <button
            key={d.date}
            type="button"
            data-day={d.date}
            aria-pressed={selected}
            aria-label={capitalize(formatDate(date, 'EEEE d MMMM', locale))}
            onClick={() => onSelect(d.date)}
            className={cn(
              'relative flex flex-col items-center gap-px overflow-hidden rounded-lg border px-0.5 pb-[5px] pt-1',
              d.isToday ? 'border-accent-line bg-accent-soft' : 'border-transparent bg-muted',
              selected && 'ring-2 ring-foreground',
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
              {formatDate(date, 'EEE', locale)}
            </span>
            <span
              className={cn(
                'tnum text-[12.5px] font-semibold',
                d.isToday ? 'text-accent-ink' : 'text-foreground',
              )}
            >
              {formatDate(date, 'd', locale)}
            </span>
            <span
              aria-hidden="true"
              className={cn('h-1 w-1 rounded-full opacity-80', BG_TONE[tone])}
            />
          </button>
        );
      })}
    </div>
  );
}
