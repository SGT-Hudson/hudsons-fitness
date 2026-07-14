import { useTranslation } from 'react-i18next';
import { differenceInCalendarMonths, parseISO } from 'date-fns';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isoDate } from '@/lib/dates';
import type { PhaseType } from '@/core/nutritionTone';
import type { Phase } from '../api';

/** The dots are pure identity: one per historic phase, in its phase colour. */
const DOT_TONE: Record<PhaseType, string> = {
  cut: 'bg-phase-cut',
  bulk: 'bg-phase-bulk',
  maintenance: 'bg-phase-maint',
};

/**
 * Calendar span covered by the history, in whole months (never below 1 — a
 * two-week phase still reads "1 mes"). Calendar maths only; no macro maths.
 */
function monthsSpanned(phases: Phase[]): number {
  if (phases.length === 0) return 0;
  const starts = phases.map((p) => p.start_date);
  const ends = phases.map((p) => p.end_date ?? isoDate());
  const first = starts.reduce((a, b) => (a < b ? a : b));
  const last = ends.reduce((a, b) => (a > b ? a : b));
  return Math.max(1, differenceInCalendarMonths(parseISO(last), parseISO(first)));
}

interface Props {
  /** The historic (past) phases, already ordered by the page. */
  phases: Phase[];
  open: boolean;
  onToggle: () => void;
  /** Id of the region this bar expands, for `aria-controls`. */
  controls: string;
}

/**
 * The "Historial de fases" bar (option B of the registered artboard): a
 * full-width button that collapses the past. Closed, it summarises the history
 * inline — a phase-coloured dot per phase plus "Ver todo"; open, it just labels
 * the list below it. State is local to the page: history is a browsing detail,
 * not something a URL should carry.
 */
export function PhaseHistoryBar({ phases, open, onToggle, controls }: Props) {
  const { t } = useTranslation('objetivos');

  const summary = `${t('phases.history.phases', { count: phases.length })} · ${t(
    'phases.history.months',
    { count: monthsSpanned(phases) },
  )}`;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className={cn(
        'flex w-full items-center gap-3 rounded-[14px] border p-3 text-left transition-colors md:px-4',
        open ? 'bg-card' : 'bg-muted hover:bg-card',
      )}
    >
      <span
        className={cn(
          'grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg border bg-card text-muted-foreground transition-transform duration-200',
          open && 'rotate-90',
        )}
      >
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </span>

      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13.5px] font-semibold">{t('phases.history.title')}</span>
        <span className="tnum truncate text-[11.5px] text-text-dim">{summary}</span>
      </span>

      <span className="flex-1" />

      {!open && (
        <span className="flex shrink-0 items-center gap-1.5">
          {phases.map((phase) => (
            <span
              key={phase.id}
              data-testid="phase-history-dot"
              title={phase.name}
              className={cn(
                'block h-2 w-2 rounded-full',
                DOT_TONE[phase.phase_type as PhaseType],
              )}
            />
          ))}
          <span className="ml-1 text-[11.5px] text-muted-foreground">
            {t('phases.history.seeAll')}
          </span>
        </span>
      )}
    </button>
  );
}
