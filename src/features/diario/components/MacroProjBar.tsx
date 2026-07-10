import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { roundMacro } from '@/features/recipes/macros';

export type MacroProjBarMetric = 'protein' | 'carbs' | 'fat';

const BG_TONE: Record<MacroProjBarMetric, string> = {
  protein: 'bg-macro-p',
  carbs: 'bg-macro-c',
  fat: 'bg-macro-g',
};

const TEXT_TONE: Record<MacroProjBarMetric, string> = {
  protein: 'text-macro-p',
  carbs: 'text-macro-c',
  fat: 'text-macro-g',
};

// Fixed position (%) of the target tick — never moves regardless of values,
// so the bar visually "crosses" it and overflows into the striped segment
// instead of ever renormalizing. Ported from the canvas MacroProjBar.
const TX = 76;

interface Props {
  metric: MacroProjBarMetric;
  /** Already consumed today, before this serving. */
  base: number;
  /** This serving's contribution. */
  added: number;
  target: number;
  className?: string;
}

/**
 * Per-macro projection bar for the "ración" step: already-consumed + this
 * serving's contribution against a fixed target line, with a striped
 * overflow segment when the projected total exceeds target. Pure and
 * prop-driven — no data fetching, no hooks beyond i18n.
 */
export function MacroProjBar({ metric, base, added, target, className }: Props) {
  const { t } = useTranslation('diario');
  const total = base + added;
  const over = Math.max(0, total - target);
  const x = (v: number) => (target > 0 ? Math.min(100, (v / target) * TX) : 0);
  const baseX = x(base);
  const totalX = x(total);
  const addEnd = Math.min(totalX, TX);
  const overStart = Math.max(baseX, TX);
  const addMid = Math.max(10, Math.min(90, (baseX + totalX) / 2));

  return (
    <div className={cn('flex flex-col gap-1', className)} data-metric={metric}>
      {/* Floating labels above the bar: this serving's contribution, and the
          over-target pill when the projection exceeds target. */}
      <div className="relative h-[13px]">
        <span
          className={cn(
            'tabular-nums absolute -translate-x-1/2 whitespace-nowrap text-[10.5px] font-bold',
            TEXT_TONE[metric],
          )}
          style={{ left: `${addMid}%` }}
        >
          {t('projBar.added', { n: roundMacro(added) })}
        </span>
        {over > 0 && (
          <span className="tabular-nums absolute right-0 inline-flex items-center gap-0.5 rounded-full bg-destructive px-1.5 py-0.5 text-[9.5px] font-bold text-destructive-foreground">
            {t('projBar.over', { n: roundMacro(over) })}
          </span>
        )}
      </div>

      {/* Track: consumed (faint) + this serving (solid) + overflow (striped), fixed target line. */}
      <div className="relative h-[10px] overflow-hidden rounded-[5px] bg-muted">
        <div
          data-seg="base"
          className={cn('absolute inset-y-0 left-0 opacity-[0.32]', BG_TONE[metric])}
          style={{ width: `${baseX}%` }}
        />
        {addEnd > baseX && (
          <div
            data-seg="added"
            className={cn('absolute inset-y-0', BG_TONE[metric])}
            style={{ left: `${baseX}%`, width: `${addEnd - baseX}%` }}
          />
        )}
        {over > 0 && (
          <div
            data-seg="over"
            className="absolute inset-y-0 box-border border-[1.5px] border-destructive"
            style={{
              left: `${overStart}%`,
              width: `${totalX - overStart}%`,
              backgroundColor: 'var(--bg-sunken)',
              backgroundImage:
                'repeating-linear-gradient(-45deg, var(--destructive) 0 2px, transparent 2px, transparent 5px)',
            }}
          />
        )}
        <div
          data-tick="target"
          className="absolute -top-px -bottom-px w-0.5 -translate-x-1/2 bg-muted-foreground"
          style={{ left: `${TX}%` }}
        />
      </div>

      {/* Axis labels: consumed-so-far on the left, fixed target on the right. */}
      <div className="tabular-nums relative h-3 text-[9px] text-text-dim">
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${Math.max(5, Math.min(baseX, TX - 16))}%` }}
        >
          {roundMacro(base)}
        </span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${TX}%` }}>
          {t('projBar.target', { n: roundMacro(target) })}
        </span>
      </div>
    </div>
  );
}
