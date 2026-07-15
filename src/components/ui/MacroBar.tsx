import { cn } from '@/lib/utils';
import type { Tone, Excess } from '@/core/nutritionTone';

const BASE_TONE: Record<Tone, string> = {
  good: 'bg-tone-good',
  onTarget: 'bg-tone-good',
  slightOver: 'bg-tone-warn',
  low: 'bg-tone-warn',
  over: 'bg-destructive',
  neutral: 'bg-muted-foreground/50',
};

const EXCESS_TONE: Record<Excess, string> = {
  neutral: 'bg-excess-neutral',
  warn: 'bg-excess-warn',
  bad: 'bg-excess-bad',
};

interface Props {
  consumed: number;
  target: number;
  tone: Tone;
  excess: Excess;
  /** Fat only: essential floor in grams; renders an amber min-tick. */
  minFloorG?: number;
  className?: string;
}

/**
 * Pure macro progress bar. Not over: a single base-tone fill. Over: the bar
 * normalises to `consumed`, the base tone fills up to the target tick, and the
 * over-target segment uses the excess colour.
 */
export function MacroBar({ consumed, target, tone, excess, minFloorG, className }: Props) {
  const valid = Number.isFinite(target) && target > 0;
  const over = valid && consumed > target;
  const denom = over ? consumed : target;
  const basePct = valid ? Math.max(0, Math.min(consumed, target)) / denom * 100 : 0;
  const overPct = over ? (consumed - target) / denom * 100 : 0;
  const tickPct = valid ? (target / denom) * 100 : 100;
  const minPct = valid && minFloorG ? (minFloorG / denom) * 100 : null;

  return (
    <div className={cn('relative h-1.5 rounded-full bg-muted overflow-hidden flex', className)}>
      <span data-seg className={cn('h-full', BASE_TONE[tone])} style={{ width: `${basePct}%` }} />
      {over && (
        <span
          data-seg
          data-excess={excess}
          className={cn('h-full', EXCESS_TONE[excess])}
          style={{ width: `${overPct}%` }}
        />
      )}
      {over && (
        <span data-tick="target" className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-foreground/80" style={{ left: `${tickPct}%` }} />
      )}
      {minPct != null && (
        <span data-tick="min" className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-amber" style={{ left: `${minPct}%` }} />
      )}
    </div>
  );
}
