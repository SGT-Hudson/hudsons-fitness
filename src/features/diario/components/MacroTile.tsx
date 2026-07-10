import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { MacroBar } from '@/components/ui/MacroBar';
import { roundMacro } from '@/features/recipes/macros';
import { classify, type Metric, type PhaseType, type Tone } from '@/core/nutritionTone';

/** The four macro tile metrics — kcal has its own hero (`KcalRing`), not a tile. */
export type MacroTileMetric = Exclude<Metric, 'kcal'>;

// Same tone→token mapping as MacroBar's BASE_TONE / DayTotalsCard's TEXT_TONE
// (this codebase's per-component tone-map convention — see KcalRing.tsx).
const TEXT_TONE: Record<Tone, string> = {
  good: 'text-tone-good',
  onTarget: 'text-tone-good',
  slightOver: 'text-tone-warn',
  low: 'text-tone-warn',
  over: 'text-destructive',
  neutral: 'text-muted-foreground',
};

const BORDER_TONE: Record<Tone, string> = {
  good: 'border-tone-good',
  onTarget: 'border-tone-good',
  slightOver: 'border-tone-warn',
  low: 'border-tone-warn',
  over: 'border-destructive',
  neutral: 'border-border',
};

// Fixed per-macro identity color (not tone-dependent) — dots the macro's
// label regardless of how it's doing today.
const DOT_TONE: Record<MacroTileMetric, string> = {
  protein: 'bg-macro-p',
  carbs: 'bg-macro-c',
  fat: 'bg-macro-g',
  fiber: 'bg-macro-fib',
};

interface Props {
  metric: MacroTileMetric;
  consumed: number;
  target?: number;
  unit: string;
  /** Fat only: essential floor in grams: renders a bar tick + tints the border below it. */
  floorG?: number;
  phase?: PhaseType;
  className?: string;
}

/**
 * Compact macro card: identity dot + label, big tone-colored value, thin
 * renormalized bar (reuses MacroBar as-is via its `className` override — no
 * duplicated segment math), and a status caption. Border tints when fat sits
 * below its essential floor.
 */
export function MacroTile({ metric, consumed, target, unit, floorG, phase, className }: Props) {
  const { t } = useTranslation('diario');
  const s = classify(
    metric,
    consumed,
    target,
    phase,
    metric === 'fat' && floorG != null ? { fatFloorG: floorG } : undefined,
  );
  const hasTarget = target != null && target > 0;
  const fatBelowFloor = metric === 'fat' && floorG != null && consumed < floorG;

  // Caption text + color, ported from the canvas's macroDiaryCaption:
  // over-direction always wins ("+n g over"), then exact match, then the
  // tone-penalized "short" case, else a dim (not tone-colored) "margin" note.
  let caption: string | null = null;
  let captionClass = TEXT_TONE[s.tone];
  if (hasTarget) {
    if (s.overG > 0) {
      caption = t('totals.macroCaptionOver', { n: roundMacro(s.overG) });
    } else if (s.remaining === 0) {
      caption = t('totals.macroCaptionOnTarget');
    } else if (s.tone === 'over' || s.tone === 'slightOver' || s.tone === 'low') {
      caption = t('totals.macroCaptionShort', { n: roundMacro(s.remaining) });
    } else {
      caption = t('totals.macroCaptionMargin', { n: roundMacro(s.remaining) });
      captionClass = 'text-text-dim';
    }
  }

  return (
    <div
      data-macro={metric}
      className={cn(
        'flex flex-col gap-1.5 rounded-[14px] border bg-card p-3',
        fatBelowFloor ? BORDER_TONE[s.tone] : 'border-border',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn('h-2 w-2 rounded-full', DOT_TONE[metric])} aria-hidden="true" />
        {t(`totals.${metric}`)}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn('text-[22px] font-semibold tabular-nums leading-none', TEXT_TONE[s.tone])}>
          {roundMacro(consumed)}
        </span>
        {hasTarget && (
          <span className="text-xs text-muted-foreground">
            / {roundMacro(target!)} {unit}
          </span>
        )}
      </div>
      {hasTarget && (
        <MacroBar
          consumed={consumed}
          target={target!}
          tone={s.tone}
          excess={s.excess}
          minFloorG={s.minFloorG}
          className="h-1"
        />
      )}
      {caption && (
        <div data-caption className={cn('text-[11px] leading-tight tabular-nums', captionClass)}>
          {caption}
        </div>
      )}
    </div>
  );
}
