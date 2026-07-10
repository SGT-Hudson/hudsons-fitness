import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { classify, type PhaseType, type Tone } from '@/core/nutritionTone';
import { roundMacro } from '@/features/recipes/macros';
import type { TdeeConfidence } from '@/features/tdee/api';

// Same tone→token map as DayTotalsCard/MacroTile (per-component convention).
const TEXT_TONE: Record<Tone, string> = {
  good: 'text-tone-good',
  onTarget: 'text-tone-good',
  slightOver: 'text-tone-warn',
  low: 'text-tone-warn',
  over: 'text-destructive',
  neutral: 'text-foreground',
};

interface Props {
  consumed: number;
  target: number;
  phaseType?: PhaseType;
  /** Active-phase label for the accent chip (e.g. "Corte"). Omitted → no chip. */
  phaseLabel?: string;
  /** Adaptive TDEE estimate for the micro-line. Omitted/null → no line. */
  tdeeKcal?: number | null;
  /** Confidence band; low/medium swaps the line for the "approximate" note. */
  tdeeConfidence?: TdeeConfidence | null;
}

/**
 * Web right-rail kcal hero (R-33 wave 2, task 6). Phase-aware "remaining"
 * headline + a thick accent progress bar (consumed/target) + a TDEE micro-line
 * that reuses the same confidence data DayTotalsCard surfaces on mobile.
 */
export function KcalHero({
  consumed,
  target,
  phaseType,
  phaseLabel,
  tdeeKcal,
  tdeeConfidence,
}: Props) {
  const { t } = useTranslation('diario');
  const s = classify('kcal', consumed, target, phaseType);
  const remaining = Math.max(0, roundMacro(s.remaining));
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;

  const lowConfidence = tdeeConfidence === 'low' || tdeeConfidence === 'medium';
  let tdeeText: string | null = null;
  if (lowConfidence) {
    tdeeText =
      tdeeConfidence === 'low'
        ? t('totals.tdeeConfidenceLow')
        : t('totals.tdeeConfidenceMedium');
  } else if (tdeeKcal != null) {
    tdeeText = t('hero.tdeeLine', { n: roundMacro(tdeeKcal) });
  }

  return (
    <div className="rounded-[14px] border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-text-dim">
          {t('hero.remainingLabel')}
        </span>
        {phaseLabel && (
          <Badge variant="accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            {phaseLabel}
          </Badge>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span
          data-testid="kcal-hero-remaining"
          className={cn(
            'text-[52px] font-semibold leading-none tracking-tight tabular-nums',
            TEXT_TONE[s.tone],
          )}
        >
          {remaining}
        </span>
        <span className="text-base text-muted-foreground">kcal</span>
      </div>

      <div className="mt-3.5 mb-1.5 flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>
          <b className="text-foreground">{roundMacro(consumed)}</b> {t('hero.consumed')}
        </span>
        <span>
          <b className="text-foreground">{roundMacro(target)}</b> {t('hero.target')}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          data-testid="kcal-hero-bar"
          className="h-full rounded-full bg-accent"
          style={{ width: `${pct}%` }}
        />
      </div>

      {tdeeText && (
        <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-text-dim">
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              lowConfidence ? 'bg-amber' : 'bg-text-dim',
            )}
            aria-hidden="true"
          />
          <span>{tdeeText}</span>
        </div>
      )}
    </div>
  );
}
