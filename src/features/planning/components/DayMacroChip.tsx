import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { MacroBar } from '@/components/ui/MacroBar';
import { roundMacro } from '@/features/recipes/macros';
import { classify, type PhaseType, type Tone, type ToneStatus } from '@/core/nutritionTone';

/** kcal has the day-header hero, not a chip. */
export type ChipMetric = 'protein' | 'carbs' | 'fat' | 'fiber';

/** "No data" is not a tone — see the `neutral` prop. */
const NO_DATA: ToneStatus = { tone: 'neutral', excess: 'neutral', remaining: 0, overG: 0 };

// Per-component tone maps — this codebase's convention (see MacroBar, MacroTile).
const TEXT_TONE: Record<Tone, string> = {
  good: 'text-tone-good',
  onTarget: 'text-tone-good',
  slightOver: 'text-tone-warn',
  low: 'text-tone-warn',
  over: 'text-destructive',
  neutral: 'text-muted-foreground',
};

const SOFT_BG: Record<Tone, string> = {
  good: 'bg-tone-good/12',
  onTarget: 'bg-tone-good/12',
  slightOver: 'bg-tone-warn/12',
  low: 'bg-tone-warn/12',
  over: 'bg-destructive/12',
  neutral: 'bg-muted',
};

const BORDER_TONE: Record<Tone, string> = {
  good: 'border-tone-good',
  onTarget: 'border-tone-good',
  slightOver: 'border-tone-warn',
  low: 'border-tone-warn',
  over: 'border-destructive',
  neutral: 'border-border',
};

interface Props {
  metric: ChipMetric;
  consumed: number;
  target?: number;
  phase?: PhaseType;
  /** Fat only: essential floor in grams — draws the bar tick and outlines the chip below it. */
  floorG?: number;
  /**
   * Force the "no data" presentation: no tone, no floor alarm. The caller owns
   * this decision — `classify` has no notion of an unplanned day (a 0 g cut day
   * classifies as `good`).
   */
  neutral?: boolean;
  className?: string;
}

/**
 * The canvas `MacroChipV4`: a tone-tinted micro-card for one macro inside the
 * day header. The bar (renormalisation, excess segment, floor tick) is
 * `MacroBar` as-is — no duplicated segment math.
 */
export function DayMacroChip({
  metric,
  consumed,
  target,
  phase,
  floorG,
  neutral,
  className,
}: Props) {
  const { t } = useTranslation('planning');
  const s = neutral
    ? NO_DATA
    : classify(
        metric,
        consumed,
        target,
        phase,
        metric === 'fat' && floorG != null ? { fatFloorG: floorG } : undefined,
      );
  const hasTarget = target != null && target > 0;
  const fatBelowFloor = !neutral && metric === 'fat' && floorG != null && consumed < floorG;

  return (
    <div
      data-macro={metric}
      // The essential-fat floor is a health signal: the red outline and the bar
      // tick alone would carry it by colour only. The chip is too small for a
      // visible sentence, so the warning rides on the tooltip (pointer) and on
      // screen-reader text (assistive tech) — never on colour alone.
      title={fatBelowFloor ? t('summary.fatLowHelp') : undefined}
      className={cn(
        'flex min-w-0 flex-col gap-[3px] rounded-[5px] border px-1.5 pb-[5px] pt-1',
        SOFT_BG[s.tone],
        fatBelowFloor ? BORDER_TONE[s.tone] : 'border-transparent',
        className,
      )}
    >
      {fatBelowFloor && <span className="sr-only">{t('summary.fatLow')}</span>}
      <div className="flex items-baseline justify-between gap-1">
        <span className={cn('text-[9.5px] font-bold tracking-[0.05em]', TEXT_TONE[s.tone])}>
          {t(`summary.letter.${metric}`)}
        </span>
        <span className="tnum text-[9px] text-text-dim">
          <b className="font-medium text-foreground">{roundMacro(consumed)}</b>
          {hasTarget && (
            <>
              <span className="mx-px opacity-60">/</span>
              {roundMacro(target!)}
            </>
          )}
        </span>
      </div>
      {hasTarget && (
        <MacroBar
          consumed={consumed}
          target={target!}
          tone={s.tone}
          excess={s.excess}
          minFloorG={s.minFloorG}
          className="h-[3px]"
        />
      )}
    </div>
  );
}
