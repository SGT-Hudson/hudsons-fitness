import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { WeeklyKcalChart, type WeeklyKcalDay } from '@/features/diario/components/WeeklyKcalChart';
import { weekAverages } from '@/features/planning/weekSummary';
import { ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import { classify, type PhaseType, type Tone } from '@/core/nutritionTone';

const TEXT_TONE: Record<Tone, string> = {
  good: 'text-tone-good',
  onTarget: 'text-tone-good',
  slightOver: 'text-tone-warn',
  low: 'text-tone-warn',
  over: 'text-destructive',
  neutral: 'text-muted-foreground',
};

interface Props {
  days: WeeklyKcalDay[];
  targets?: Macros;
  phase?: PhaseType;
  className?: string;
}

/**
 * Mobile week summary: the "Media diaria" hero + per-day delta over the reused
 * `WeeklyKcalChart` (rendered headerless — this card supplies the heading).
 */
export function WeekSummaryCard({ days, targets, phase, className }: Props) {
  const { t } = useTranslation('planning');
  const dayTotals: Macros[] = days.map((d) => ({ ...ZERO_MACROS, kcal: d.kcal }));
  const { avgKcal, kcalDelta } = weekAverages(dayTotals, targets);
  const tone = classify('kcal', avgKcal, targets?.kcal, phase).tone;

  return (
    <div className={cn('rounded-md border bg-card p-3.5', className)}>
      <div className="flex items-end gap-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            {t('planner.avgDaily')}
          </span>
          <div className="flex items-baseline gap-1">
            <span className="tnum text-[23px] font-semibold tracking-[-0.02em]">{avgKcal}</span>
            <span className="text-[11px] text-text-dim">kcal</span>
          </div>
        </div>
        {targets && kcalDelta != null && (
          <div className="ml-auto text-right">
            <div className="tnum text-[10px] text-text-dim">
              {t('planner.targetShort', { n: Math.round(targets.kcal) })}
            </div>
            <div className={cn('tnum text-[12.5px] font-semibold', TEXT_TONE[tone])}>
              {t('planner.kcalPerDay', { n: kcalDelta >= 0 ? `+${kcalDelta}` : kcalDelta })}
            </div>
          </div>
        )}
      </div>

      <WeeklyKcalChart
        days={days}
        target={targets?.kcal ?? 0}
        phase={phase}
        showHeader={false}
        showWeekdays={false}
        className="mt-2.5 rounded-none border-0 bg-transparent p-0"
      />
    </div>
  );
}
