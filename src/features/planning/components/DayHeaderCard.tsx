import { useTranslation } from 'react-i18next';
import { parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { MacroBar } from '@/components/ui/MacroBar';
import { DayMacroChip } from './DayMacroChip';
import { roundMacro, type Macros } from '@/features/recipes/macros';
import { classify, essentialFatFloorG, type PhaseType, type Tone } from '@/core/nutritionTone';
import { formatDate, type Locale } from '@/lib/dates';

const BG_TONE: Record<Tone, string> = {
  good: 'bg-tone-good',
  onTarget: 'bg-tone-good',
  slightOver: 'bg-tone-warn',
  low: 'bg-tone-warn',
  over: 'bg-destructive',
  neutral: 'bg-muted-foreground/50',
};

const TEXT_TONE: Record<Tone, string> = {
  good: 'text-tone-good',
  onTarget: 'text-tone-good',
  slightOver: 'text-tone-warn',
  low: 'text-tone-warn',
  over: 'text-destructive',
  neutral: 'text-muted-foreground',
};

interface Props {
  /** ISO `YYYY-MM-DD`. */
  dateIso: string;
  isToday: boolean;
  isPast?: boolean;
  totals: Macros;
  targets?: Macros;
  phaseType?: PhaseType;
  /** Bodyweight in kg — derives the fat floor at render (hard invariant 5). */
  weightKg?: number;
  className?: string;
}

/**
 * The canvas `PlaniDayHeader`: a tone-striped column head carrying the day's
 * planned kcal against target and a 2×2 macro-chip grid. Today is marked with a
 * *neutral* outline, deliberately — a coloured one would collide with the
 * semantic tone palette (canvas `TODAY_OUTLINE`).
 */
export function DayHeaderCard({
  dateIso,
  isToday,
  isPast,
  totals,
  targets,
  phaseType,
  weightKg,
  className,
}: Props) {
  const { i18n } = useTranslation('planning');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  const date = parseISO(dateIso);

  const kcal = classify('kcal', totals.kcal, targets?.kcal, phaseType);
  const hasKcalTarget = targets != null && targets.kcal > 0;
  const delta = hasKcalTarget ? Math.round(totals.kcal - targets!.kcal) : null;
  const fatFloor = weightKg != null ? essentialFatFloorG(weightKg) : undefined;

  return (
    <div
      data-day-header
      className={cn(
        'relative flex flex-col gap-1.5 self-start overflow-hidden rounded-md border bg-card px-2.5 pb-2.5 pt-2',
        isToday ? 'border-text-dim' : 'border-border',
        isPast && 'opacity-60',
        className,
      )}
    >
      <span
        data-stripe
        aria-hidden="true"
        className={cn('absolute inset-x-0 top-0 h-[3px]', BG_TONE[kcal.tone])}
      />

      <div className="mt-px flex items-baseline gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.05em] text-text-dim">
          {formatDate(date, 'EEE', locale)}
        </span>
        <span className="tnum text-base font-semibold leading-none">
          {formatDate(date, 'd', locale)}
        </span>
      </div>

      <div>
        <div className="flex items-baseline gap-1">
          <span
            className={cn(
              'tnum text-[19px] font-semibold leading-none tracking-[-0.03em]',
              TEXT_TONE[kcal.tone],
            )}
          >
            {roundMacro(totals.kcal)}
          </span>
          {/* "kcal" is the same token in both locales — a unit, not a translated word. */}
          <span className="text-[9px] text-text-dim">kcal</span>
          <div className="flex-1" />
          {delta != null && (
            <span className={cn('tnum text-[10px] font-semibold', TEXT_TONE[kcal.tone])}>
              {delta >= 0 ? `+${delta}` : delta}
            </span>
          )}
        </div>
        {hasKcalTarget && (
          <MacroBar
            consumed={totals.kcal}
            target={targets!.kcal}
            tone={kcal.tone}
            excess={kcal.excess}
            className="mt-1 h-[3px]"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-[3px]">
        <DayMacroChip metric="protein" consumed={totals.proteinG} target={targets?.proteinG} phase={phaseType} />
        <DayMacroChip metric="carbs" consumed={totals.carbsG} target={targets?.carbsG} phase={phaseType} />
        <DayMacroChip metric="fat" consumed={totals.fatG} target={targets?.fatG} phase={phaseType} floorG={fatFloor} />
        <DayMacroChip metric="fiber" consumed={totals.fiberG} target={targets?.fiberG} phase={phaseType} />
      </div>
    </div>
  );
}
