import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The canvas's `StepperM` — a − / value / + control for a quantity, used
 * wherever a sheet asks "how much?" (the diario ración step, the recipe
 * editor's add-ingredient sheet). Extracted from RacionStep's private
 * `RacionStepper` when the second call site arrived; the markup is that one,
 * unchanged.
 *
 * Labels are props, not i18n lookups, so the component stays namespace-free:
 * each caller names the thing it is stepping in its own copy.
 */
interface Props {
  value: number;
  /** The unit under the number ("gramos", "raciones", "unidades"). */
  unitLabel: string;
  lang: 'es' | 'en';
  decreaseLabel: string;
  increaseLabel: string;
  onMinus: () => void;
  onPlus: () => void;
  className?: string;
}

export function formatQuantity(value: number, lang: 'es' | 'en'): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-ES').format(value);
}

/**
 * Snap a stepped value onto the step grid and clamp it at the floor. The
 * `Math.round(… * 100) / 100` guards float noise (0.1 + 0.2) before clamping.
 */
export function roundToStep(v: number, step: number, min: number): number {
  const snapped = Math.round(v / step) * step;
  return Math.max(min, Math.round(snapped * 100) / 100);
}

export function QuantityStepper({
  value,
  unitLabel,
  lang,
  decreaseLabel,
  increaseLabel,
  onMinus,
  onPlus,
  className,
}: Props) {
  return (
    <div
      className={cn(
        'flex h-11 shrink-0 items-stretch overflow-hidden rounded-xl border border-border bg-card',
        className,
      )}
    >
      <button
        type="button"
        onClick={onMinus}
        aria-label={decreaseLabel}
        className="flex w-10 items-center justify-center border-r border-border text-muted-foreground"
      >
        <Minus className="h-4 w-4" />
      </button>
      <div className="flex min-w-[74px] flex-col items-center justify-center leading-tight">
        <span className="tabular-nums text-base font-semibold">{formatQuantity(value, lang)}</span>
        <span className="text-[9.5px] text-text-dim">{unitLabel}</span>
      </div>
      <button
        type="button"
        onClick={onPlus}
        aria-label={increaseLabel}
        className="flex w-10 items-center justify-center border-l border-border text-muted-foreground"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
