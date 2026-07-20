import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { formatDecimal } from '@/lib/number';
import { classify, type PhaseType, type Tone } from '@/core/nutritionTone';

// Same tone→token mapping as DayTotalsCard's `TEXT_TONE` (D-F19 single-arc
// kcal ring), duplicated locally per this codebase's per-component tone-map
// convention (see MacroBar's own `BASE_TONE`/`EXCESS_TONE`) rather than a
// cross-component import, which would create a DayTotalsCard ⇄ KcalRing cycle.
const TEXT_TONE: Record<Tone, string> = {
  good: 'text-tone-good',
  onTarget: 'text-tone-good',
  slightOver: 'text-tone-warn',
  low: 'text-tone-warn',
  over: 'text-destructive',
  neutral: 'text-muted-foreground',
};

// Same mapping, expressed as CSS custom-property references for the SVG
// `stroke` attribute (no Tailwind `stroke-*` utility in use here — mirrors
// the `stroke="var(--bg-elev)"` precedent in MuscleBody.tsx).
const STROKE_TONE: Record<Tone, string> = {
  good: 'var(--tone-good)',
  onTarget: 'var(--tone-good)',
  slightOver: 'var(--tone-warn)',
  low: 'var(--tone-warn)',
  over: 'var(--destructive)',
  neutral: 'var(--muted-foreground)',
};

interface Props {
  consumed: number;
  target: number;
  phase?: PhaseType;
  size?: number;
  stroke?: number;
  className?: string;
}

/** Single-arc kcal ring (D-F19): phase-aware tone colours the arc and the
 * center consumed number; the track is a plain `--bg-sunken` circle. */
export function KcalRing({ consumed, target, phase, size = 118, stroke = 11, className }: Props) {
  const { t, i18n } = useTranslation('diario');
  const lang = i18n.language;
  const { tone } = classify('kcal', consumed, target, phase);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(1, Math.max(0, consumed / target)) : 0;
  const offset = circ * (1 - pct);
  const center = size / 2;

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        <circle cx={center} cy={center} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth={stroke} />
        <circle
          data-testid="kcal-ring-arc"
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={STROKE_TONE[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span
          data-testid="kcal-ring-value"
          className={cn('tabular-nums text-[27px] font-semibold tracking-tight', TEXT_TONE[tone])}
        >
          {formatDecimal(consumed, { lang, digits: 0 })}
        </span>
        <span className="text-[9.5px] text-muted-foreground mt-1">
          {t('totals.ringOf', { target: formatDecimal(target, { lang, digits: 0 }) })}
        </span>
      </div>
    </div>
  );
}
