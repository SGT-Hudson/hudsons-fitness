import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { roundMacro, type Macros } from '@/features/recipes/macros';
import type { TdeeConfidence } from '@/features/tdee/api';
import {
  classifyMacro,
  type MacroKey,
  type MacroTone,
  type PhaseType,
} from '../targetStatus';

/** Which protein basis the active target was computed on (D-B1). */
export type ProteinBasis = 'lean' | 'fallback';

interface Props {
  totals: Macros;
  targets?: Macros;
  proteinBasis?: ProteinBasis;
  tdeeConfidence?: TdeeConfidence | null;
  /** Active phase type — drives kcal budget vs goal semantics (Theme 1). */
  phaseType?: PhaseType;
}

const TEXT_TONE: Record<MacroTone, string> = {
  budget: 'text-sky-600 dark:text-sky-400',
  overBudget: 'text-destructive',
  floorMet: 'text-emerald-600 dark:text-emerald-400',
  floorUnderSoft: 'text-muted-foreground',
  floorUnderWarn: 'text-amber-600 dark:text-amber-400',
  flex: 'text-muted-foreground',
};

const BAR_TONE: Record<MacroTone, string> = {
  budget: 'bg-sky-600 dark:bg-sky-500',
  overBudget: 'bg-destructive',
  floorMet: 'bg-emerald-600 dark:bg-emerald-500',
  floorUnderSoft: 'bg-muted-foreground/50',
  floorUnderWarn: 'bg-amber-500 dark:bg-amber-400',
  flex: 'bg-muted-foreground/40',
};

function MacroBlock({
  label,
  macroKey,
  consumed,
  target,
  phaseType,
  note,
}: {
  label: string;
  macroKey: MacroKey;
  consumed: number;
  target?: number;
  phaseType?: PhaseType;
  note?: string;
}) {
  const { t } = useTranslation('diario');
  const s = classifyMacro(macroKey, consumed, target, phaseType);
  const hasTarget = target != null && target > 0;

  let sub: string | null = null;
  if (hasTarget) {
    const n = Math.abs(roundMacro(s.remaining));
    if (macroKey === 'proteinG') {
      sub = s.tone === 'floorMet' ? t('totals.floorMet', { n }) : t('totals.remainingG', { n });
    } else if (macroKey === 'fiberG') {
      sub = s.tone === 'floorMet' ? t('totals.floorMet', { n }) : t('totals.fiberBelowMin', { n });
    } else {
      sub = s.remaining >= 0 ? t('totals.remainingG', { n }) : t('totals.overG', { n });
    }
  }

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold tabular-nums leading-tight">
        {roundMacro(consumed)}
        {hasTarget && (
          <span className="text-sm font-normal text-muted-foreground">/{roundMacro(target!)}</span>
        )}
        <span className="text-sm font-normal text-muted-foreground ml-1">g</span>
      </div>
      {note && <div className="text-[11px] text-muted-foreground leading-tight">{note}</div>}
      {hasTarget && (
        <>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', BAR_TONE[s.tone])}
              style={{ width: `${s.fillPct}%` }}
            />
          </div>
          {sub && (
            <div className={cn('text-[11px] leading-tight tabular-nums', TEXT_TONE[s.tone])}>
              {sub}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function DayTotalsCard({
  totals,
  targets,
  proteinBasis,
  tdeeConfidence,
  phaseType,
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

  // kcal hero (phase-aware). Hidden when no target.
  let hero: { value: number; label: string; tone: MacroTone } | null = null;
  if (targets) {
    const k = classifyMacro('kcal', totals.kcal, targets.kcal, phaseType);
    const remaining = roundMacro(k.remaining);
    if (phaseType === 'bulk') {
      hero = { value: Math.max(remaining, 0), label: t('totals.heroToGoal'), tone: k.tone };
    } else if (k.tone === 'overBudget') {
      hero = { value: Math.abs(remaining), label: t('totals.heroOver'), tone: 'overBudget' };
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
          <div className="text-center pb-4 mb-4 border-b">
            <div
              className={cn(
                'text-4xl font-bold tabular-nums leading-none tracking-tight',
                TEXT_TONE[hero.tone],
              )}
            >
              {hero.value}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mt-1.5">
              {hero.label}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1.5 tabular-nums">
              {t('totals.consumedOf', {
                consumed: roundMacro(totals.kcal),
                target: roundMacro(targets!.kcal),
              })}
            </div>
            {showTdeeBadge && (
              <div className="mt-2">
                <Badge variant="warning">
                  {tdeeConfidence === 'low'
                    ? t('totals.tdeeConfidenceLow')
                    : t('totals.tdeeConfidenceMedium')}
                </Badge>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <MacroBlock
            label={t('totals.protein')}
            macroKey="proteinG"
            consumed={totals.proteinG}
            target={targets?.proteinG}
            phaseType={phaseType}
            note={proteinNote}
          />
          <MacroBlock
            label={t('totals.carbs')}
            macroKey="carbsG"
            consumed={totals.carbsG}
            target={targets?.carbsG}
            phaseType={phaseType}
          />
          <MacroBlock
            label={t('totals.fat')}
            macroKey="fatG"
            consumed={totals.fatG}
            target={targets?.fatG}
            phaseType={phaseType}
          />
          <MacroBlock
            label={t('totals.fiber')}
            macroKey="fiberG"
            consumed={totals.fiberG}
            target={targets?.fiberG}
            phaseType={phaseType}
          />
        </div>

        {!targets && (
          <p className="mt-4 text-xs text-muted-foreground">{t('totals.targetsHint')}</p>
        )}
      </CardContent>
    </Card>
  );
}
