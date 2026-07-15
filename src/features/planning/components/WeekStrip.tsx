import { useTranslation } from 'react-i18next';
import { parseISO } from 'date-fns';
import { Check, Lock } from 'lucide-react';
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
  /** Planned kcal. Only read by the `select` variant — `fill` has no day totals. */
  kcal?: number;
  isToday: boolean;
}

interface BaseProps {
  days: WeekStripDay[];
  /** Phase kcal target — omit and every day renders neutral. */
  target?: number;
  phase?: PhaseType;
  className?: string;
}

interface SelectProps extends BaseProps {
  variant?: 'select';
  /** ISO date the mobile plan list is showing — the pressed cell. */
  selectedDate: string;
  onSelect: (dateIso: string) => void;
  fillFrom?: never;
  /**
   * The template editor (R-33 wave 4): `days[].date` is a reference week's
   * ISO date, kept only to derive each column's weekday and drive selection —
   * a template has no calendar dates of its own. Suppresses the day number
   * and shortens the accessible name to the weekday alone, so neither the
   * render nor a screen reader announces a date the template does not have.
   */
  dateless?: boolean;
}

interface FillProps extends BaseProps {
  variant: 'fill';
  /**
   * ISO date the write starts at: this day and every later day of the week are
   * marked as "will be filled", earlier ones as untouched. Mirrors
   * `apply_template_to_week`, which deletes and refills from `p_target_date`
   * through the Sunday of that same week and leaves earlier days alone.
   */
  fillFrom: string;
  selectedDate?: never;
  onSelect?: never;
}

type Props = SelectProps | FillProps;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const CELL =
  'relative flex flex-col items-center gap-px overflow-hidden rounded-lg border px-0.5 pb-[5px] pt-1';

/**
 * Mobile 7-day strip (canvas `PlanificadorMobileV2`): a tone stripe per day over
 * the weekday letter + number. Each cell is the day picker for the plan list
 * below it — below `md` the week grid is hidden, so this is the only way to
 * reach another day of the week from a phone.
 *
 * Today keeps its accent tint; the selected day takes a neutral ring, so a day
 * that is both still reads as selected. Columns, gap AND horizontal inset match
 * `WeeklyKcalChart`'s bar grid so each day sits centred over its bar: the chart
 * is nested inside `WeekSummaryCard`, so its bars start one card border (1px)
 * plus one card padding (`p-3.5` = 14px) in from the content edge, while the
 * strip is a full-width page-level sibling — without the same 15px inset the
 * two 7-column grids drift apart by up to a third of a column across the week.
 *
 * The `fill` variant reuses the same 7-cell chrome as a read-only preview of an
 * upcoming template apply — no tones, no press, no inset (it lives in a dialog,
 * not over the chart).
 */
export function WeekStrip(props: Props) {
  const { days, target, phase, className } = props;
  const { t, i18n } = useTranslation('planning');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  // Non-interactive read-out of what a template apply is about to overwrite:
  // no day totals, no selection, nothing to press.
  if (props.variant === 'fill') {
    const { fillFrom } = props;
    return (
      <ul className={cn('grid grid-cols-7 gap-1.5', className)}>
        {days.map((d) => {
          // ISO dates compare lexicographically.
          const willFill = d.date >= fillFrom;
          const date = parseISO(d.date);
          return (
            <li
              key={d.date}
              data-day={d.date}
              data-fill={willFill ? 'true' : 'false'}
              className={cn(
                CELL,
                willFill
                  ? 'border-accent-line bg-accent-soft'
                  : 'border-transparent bg-muted opacity-60',
              )}
            >
              <span className="sr-only">
                {`${capitalize(formatDate(date, 'EEEE d MMMM', locale))}: ${
                  willFill ? t('weekStrip.willFill') : t('weekStrip.untouched')
                }`}
              </span>
              <span
                data-stripe
                aria-hidden="true"
                className={cn(
                  'absolute inset-x-0 top-0 h-[3px]',
                  willFill ? 'bg-accent' : 'bg-muted-foreground/30',
                )}
              />
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 text-[8px] font-medium uppercase tracking-[0.02em]',
                  willFill ? 'text-accent-ink' : 'text-text-dim',
                )}
              >
                {formatDate(date, 'EEE', locale)}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'tnum text-[12.5px] font-semibold',
                  willFill ? 'text-accent-ink' : 'text-text-dim',
                )}
              >
                {formatDate(date, 'd', locale)}
              </span>
              {willFill ? (
                <Check aria-hidden="true" className="h-3 w-3 text-accent-ink" />
              ) : (
                <Lock aria-hidden="true" className="h-3 w-3 text-text-dim" />
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  const { selectedDate, onSelect, dateless } = props;

  return (
    <div className={cn('grid grid-cols-7 gap-1.5 px-[15px]', className)}>
      {days.map((d) => {
        // A day with nothing planned has no signal to report: `classify` would
        // paint an empty cut day green (its band only guards the upper side).
        // Same "no data ≠ good" call as DayHeaderCard — kept out of the shared
        // tone core, which is presentation-agnostic.
        const kcal = d.kcal ?? 0;
        const tone: Tone = kcal === 0 ? 'neutral' : classify('kcal', kcal, target, phase).tone;
        const selected = d.date === selectedDate;
        const date = parseISO(d.date);
        const ariaLabel = dateless
          ? capitalize(formatDate(date, 'EEEE', locale))
          : capitalize(formatDate(date, 'EEEE d MMMM', locale));
        return (
          <button
            key={d.date}
            type="button"
            data-day={d.date}
            aria-pressed={selected}
            aria-label={ariaLabel}
            onClick={() => onSelect(d.date)}
            className={cn(
              CELL,
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
            {!dateless && (
              <span
                className={cn(
                  'tnum text-[12.5px] font-semibold',
                  d.isToday ? 'text-accent-ink' : 'text-foreground',
                )}
              >
                {formatDate(date, 'd', locale)}
              </span>
            )}
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
