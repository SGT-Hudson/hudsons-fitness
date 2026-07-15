import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { KcalRing } from './KcalRing';
import { MacroGrid } from './MacroGrid';
import { roundMacro, type Macros, type SubMacros } from '@/features/recipes/macros';
import type { PartialSub } from '@/core/subMacros';
import type { TdeeConfidence } from '@/features/tdee/api';
import { classify, essentialFatFloorG, type Tone, type PhaseType } from '@/core/nutritionTone';
import type { ProteinBasis } from '@/lib/macros';

interface Props {
  totals: Macros;
  /** Optional sugar + saturated-fat totals (U-1, honest-partial). */
  subTotals?: SubMacros;
  targets?: Macros;
  proteinBasis?: ProteinBasis;
  tdeeConfidence?: TdeeConfidence | null;
  /** Active phase type — drives kcal budget vs goal semantics (Theme 1). */
  phaseType?: PhaseType;
  /** Current bodyweight in kg, for the fat essential floor. */
  weightKg?: number;
  /** Sum of kcal from today's `from_plan` meal-log entries (D-F19 footnote). */
  planKcal?: number;
}

/** Secondary "of which" line: sugar / saturated fat, honest about missing data. */
function SubMacroLine({ label, part }: { label: string; part: PartialSub }) {
  const { t } = useTranslation('diario');
  const incomplete = part.missing > 0;
  const qualifier = t('totals.subPartial', { count: part.missing });
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">
        {part.known === 0 && incomplete ? (
          qualifier
        ) : (
          <>
            {incomplete && '≥ '}
            {roundMacro(part.known)} g
            {incomplete && <span className="ml-1">· {qualifier}</span>}
          </>
        )}
      </span>
    </div>
  );
}

const TEXT_TONE: Record<Tone, string> = {
  good: 'text-tone-good',
  onTarget: 'text-tone-good',
  slightOver: 'text-tone-warn',
  low: 'text-tone-warn',
  over: 'text-destructive',
  neutral: 'text-muted-foreground',
};

export function DayTotalsCard({
  totals,
  subTotals,
  targets,
  proteinBasis,
  tdeeConfidence,
  phaseType,
  weightKg,
  planKcal,
}: Props) {
  const { t } = useTranslation('diario');

  const proteinNote =
    targets && proteinBasis
      ? proteinBasis === 'lean'
        ? t('totals.proteinBasisLean')
        : t('totals.proteinBasisFallback')
      : undefined;

  const showTdeeBadge =
    !!targets && (tdeeConfidence === 'low' || tdeeConfidence === 'medium');

  const fatFloor = weightKg != null ? essentialFatFloorG(weightKg) : undefined;

  // kcal hero (phase-aware). Hidden when no target.
  let hero: { value: number; label: string; tone: Tone } | null = null;
  if (targets) {
    const k = classify('kcal', totals.kcal, targets.kcal, phaseType);
    const remaining = roundMacro(k.remaining);
    if (phaseType === 'bulk') {
      hero = { value: Math.max(remaining, 0), label: t('totals.heroToGoal'), tone: k.tone };
    } else if (k.tone === 'over') {
      hero = { value: Math.abs(remaining), label: t('totals.heroOver'), tone: 'over' };
    } else {
      hero = { value: Math.max(remaining, 0), label: t('totals.heroRemaining'), tone: k.tone };
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('totals.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {hero && (
          <div className="flex flex-col items-center gap-2 pb-4 mb-4 border-b">
            <KcalRing consumed={roundMacro(totals.kcal)} target={roundMacro(targets!.kcal)} phase={phaseType} />
            <div className={cn('text-xs uppercase tracking-wide tabular-nums', TEXT_TONE[hero.tone])}>
              {hero.value} {hero.label}
            </div>
            {!!planKcal && planKcal > 0 && (
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {t('totals.planToday', { n: roundMacro(planKcal) })}
              </div>
            )}
            {showTdeeBadge && (
              <div className="mt-1">
                <Badge variant="warning">
                  {tdeeConfidence === 'low'
                    ? t('totals.tdeeConfidenceLow')
                    : t('totals.tdeeConfidenceMedium')}
                </Badge>
              </div>
            )}
          </div>
        )}

        <MacroGrid
          collapsible
          items={[
            { metric: 'protein', consumed: totals.proteinG, target: targets?.proteinG, unit: 'g', phase: phaseType },
            { metric: 'carbs', consumed: totals.carbsG, target: targets?.carbsG, unit: 'g', phase: phaseType },
            { metric: 'fat', consumed: totals.fatG, target: targets?.fatG, unit: 'g', floorG: fatFloor, phase: phaseType },
            { metric: 'fiber', consumed: totals.fiberG, target: targets?.fiberG, unit: 'g', phase: phaseType },
          ]}
        />
        {proteinNote && (
          <p className="mt-2 text-[11px] text-muted-foreground leading-tight">{proteinNote}</p>
        )}

        {subTotals && (
          <div className="mt-4 pt-4 border-t space-y-1.5">
            <SubMacroLine label={t('totals.sugar')} part={subTotals.sugarG} />
            <SubMacroLine label={t('totals.satFat')} part={subTotals.satFatG} />
          </div>
        )}

        {!targets && (
          <p className="mt-4 text-xs text-muted-foreground">{t('totals.targetsHint')}</p>
        )}
      </CardContent>
    </Card>
  );
}
