import { useTranslation } from 'react-i18next';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { roundMacro, type Macros } from '@/features/recipes/macros';
import { MacroBar } from '@/components/ui/MacroBar';
import {
  classify,
  essentialFatFloorG,
  type Metric,
  type Tone,
  type PhaseType,
} from '@/core/nutritionTone';

const TEXT_TONE: Record<Tone, string> = {
  good: 'text-tone-good',
  onTarget: 'text-tone-good',
  slightOver: 'text-tone-warn',
  low: 'text-tone-warn',
  over: 'text-destructive',
  neutral: 'text-muted-foreground',
};

interface Props {
  totals: Macros;
  targets?: Macros;
  phaseType?: PhaseType;
  className?: string;
  /** Current bodyweight in kg, for the fat essential floor. */
  weightKg?: number;
}

export function DaySummary({ totals, targets, phaseType, className, weightKg }: Props) {
  const { t } = useTranslation('planning');
  const fatFloor = weightKg != null ? essentialFatFloorG(weightKg) : undefined;

  const kcal = classify('kcal', totals.kcal, targets?.kcal, phaseType);
  const macroRows: { key: Metric; label: string; consumed: number; target?: number }[] = [
    { key: 'protein', label: t('summary.protein'), consumed: totals.proteinG, target: targets?.proteinG },
    { key: 'carbs', label: t('summary.carbs'), consumed: totals.carbsG, target: targets?.carbsG },
    { key: 'fat', label: t('summary.fat'), consumed: totals.fatG, target: targets?.fatG },
    { key: 'fiber', label: t('summary.fiber'), consumed: totals.fiberG, target: targets?.fiberG },
  ];

  return (
    <div className={cn('space-y-2', className)}>
      {/* kcal line: number + unit after */}
      <div className="space-y-1">
        <div className={cn('text-sm font-bold tabular-nums leading-tight', TEXT_TONE[kcal.tone])}>
          {roundMacro(totals.kcal)}
          {targets && <span className="text-muted-foreground font-normal"> / {roundMacro(targets.kcal)}</span>}
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-normal ml-1">
            {t('summary.kcalUnit')}
          </span>
        </div>
        {targets && (
          <MacroBar consumed={totals.kcal} target={targets.kcal} tone={kcal.tone} excess={kcal.excess} />
        )}
      </div>

      {macroRows.map((r) => {
        const s = classify(
          r.key,
          r.consumed,
          r.target,
          phaseType,
          r.key === 'fat' && fatFloor != null ? { fatFloorG: fatFloor } : undefined,
        );
        return (
          <div key={r.key} className="space-y-0.5">
            <div className="flex justify-between items-baseline text-[10px] uppercase tracking-wide text-muted-foreground">
              <span>{r.label}</span>
              <span className={cn('tabular-nums', TEXT_TONE[s.tone])}>
                {roundMacro(r.consumed)}{r.target != null && <> / {roundMacro(r.target)}</>}
              </span>
            </div>
            {r.target != null && (
              <MacroBar consumed={r.consumed} target={r.target} tone={s.tone} excess={s.excess} minFloorG={s.minFloorG} />
            )}
            {r.key === 'fat' && s.tone === 'over' && (
              <div className="flex items-center gap-1 text-[10px] font-semibold text-destructive">
                <span>{t('summary.fatLow')}</span>
                <button
                  type="button"
                  aria-label={t('summary.fatLowHelpLabel')}
                  title={t('summary.fatLowHelp')}
                  className="opacity-80"
                >
                  <HelpCircle className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
