import { useTranslation } from 'react-i18next';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MacroBar } from '@/components/ui/MacroBar';
import { roundMacro, type Macros, type SubMacros } from '@/features/recipes/macros';
import type { PartialSub } from '@/core/subMacros';
import type { TdeeConfidence } from '@/features/tdee/api';
import {
  classifyMacro,
  essentialFatFloorG,
  type MacroKey,
  type MacroTone,
  type PhaseType,
} from '@/lib/macroStatus';
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

const TEXT_TONE: Record<MacroTone, string> = {
  budget: 'text-tone-info',
  onTarget: 'text-tone-good',
  floorMet: 'text-tone-good',
  slightOver: 'text-tone-warn',
  surplusHigh: 'text-tone-warn',
  over: 'text-destructive',
  fatLow: 'text-destructive',
  neutral: 'text-muted-foreground',
};

function MacroBlock({
  label,
  macroKey,
  consumed,
  target,
  phaseType,
  note,
  fatFloor,
}: {
  label: string;
  macroKey: MacroKey;
  consumed: number;
  target?: number;
  phaseType?: PhaseType;
  note?: string;
  fatFloor?: number;
}) {
  const { t } = useTranslation('diario');
  const s = classifyMacro(
    macroKey,
    consumed,
    target,
    phaseType,
    macroKey === 'fatG' && fatFloor != null ? { essentialFatFloorG: fatFloor } : undefined,
  );
  const hasTarget = target != null && target > 0;

  let sub: string | null = null;
  if (hasTarget) {
    const n = Math.abs(roundMacro(s.remaining));
    if (macroKey === 'proteinG') {
      sub = s.tone === 'floorMet' ? t('totals.floorMet', { n }) : t('totals.remainingG', { n });
    } else if (macroKey === 'fiberG') {
      // fiber is informational: only show "met" state, no warning when under
      sub = s.tone === 'floorMet' ? t('totals.floorMet', { n }) : t('totals.remainingG', { n });
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
          <MacroBar
            consumed={consumed}
            target={target!}
            tone={s.tone}
            excess={s.excess}
            minFloorG={s.minFloorG}
          />
          {sub && (
            <div className={cn('text-[11px] leading-tight tabular-nums', TEXT_TONE[s.tone])}>
              {sub}
            </div>
          )}
          {s.tone === 'fatLow' && (
            <div className="flex items-center gap-1 text-[10px] font-semibold text-destructive">
              <span>{t('totals.fatLow')}</span>
              <button
                type="button"
                aria-label={t('totals.fatLowHelpLabel')}
                title={t('totals.fatLowHelp')}
                className="opacity-80"
              >
                <HelpCircle className="h-3 w-3" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function DayTotalsCard({
  totals,
  subTotals,
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

  const fatFloor = targets ? essentialFatFloorG(targets.kcal) : 0;

  // kcal hero (phase-aware). Hidden when no target.
  let hero: { value: number; label: string; tone: MacroTone } | null = null;
  if (targets) {
    const k = classifyMacro('kcal', totals.kcal, targets.kcal, phaseType);
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
            fatFloor={fatFloor}
          />
          <MacroBlock
            label={t('totals.fiber')}
            macroKey="fiberG"
            consumed={totals.fiberG}
            target={targets?.fiberG}
            phaseType={phaseType}
          />
        </div>

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
