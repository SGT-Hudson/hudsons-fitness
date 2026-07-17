import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useNum } from '@/hooks/useNum';
import { cn } from '@/lib/utils';
import type { Macros } from '../macros';

interface Props {
  /** Whole-recipe macros. Ignored when `empty`. */
  total: Macros;
  /** Per-serving macros — the highlighted column. Ignored when `empty`. */
  perServing: Macros;
  /** Card heading. Defaults to the read view's "Macros"; the editor passes "Macros en vivo". */
  title?: string;
  /**
   * Nothing to add up yet (the editor with no ingredient rows): both columns
   * render `—`, neither is highlighted — there is no "the one you eat" to point
   * at — and the distribution bar becomes the "they'll add up as you go" hint.
   */
  empty?: boolean;
  className?: string;
}

const MACRO_DOT = ['bg-macro-p', 'bg-macro-c', 'bg-macro-g'] as const;

function MacroColumn({
  title,
  macros,
  highlight,
  empty,
}: {
  title: string;
  macros: Macros;
  highlight: boolean;
  empty: boolean;
}) {
  const { t } = useTranslation('recetas');
  const num = useNum();
  const grams: Array<{ key: 'protein' | 'carbs' | 'fat'; value: number; dot: string }> = [
    { key: 'protein', value: macros.proteinG, dot: MACRO_DOT[0] },
    { key: 'carbs', value: macros.carbsG, dot: MACRO_DOT[1] },
    { key: 'fat', value: macros.fatG, dot: MACRO_DOT[2] },
  ];

  return (
    <div
      className={cn(
        'rounded-[11px] border p-2.5 md:p-3',
        highlight ? 'border-accent-line bg-card shadow-card' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'text-[9.5px] font-medium uppercase tracking-[0.05em]',
          highlight ? 'text-accent-ink' : 'text-text-dim',
        )}
      >
        {title}
      </span>
      <div className="mb-1.5 mt-1 flex items-baseline gap-1">
        <span
          className={cn(
            'tnum text-[21px] font-semibold tracking-[-0.02em]',
            empty && 'text-text-dim',
          )}
        >
          {empty ? '—' : Math.round(macros.kcal)}
        </span>
        <span className="text-[10px] text-text-dim">{t('detail.kcalUnit')}</span>
      </div>
      <div className="tnum grid grid-cols-3 gap-1 text-[10.5px]">
        {grams.map(({ key, value, dot }) => (
          <div key={key} className="flex flex-col">
            <span className="flex items-center gap-1 text-[9px] text-text-dim">
              <span className={cn('h-[6px] w-[6px] shrink-0 rounded-full', dot)} aria-hidden="true" />
              {t(`macros.letter.${key}`)}
            </span>
            <b className={cn('font-semibold', empty && 'text-text-dim')}>
              {empty ? '— g' : `${num.qty(Math.round(value))}g`}
            </b>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The macros card (canvas `RecetaMacrosCard` / `MRecetaMacros` / `RecetaMacrosEmpty`):
 * totals vs. per-serving side by side — per-serving is the highlighted column,
 * because that is the number you actually eat — plus the calorie-distribution
 * bar underneath. The read view renders it as "Macros"; the editor renders the
 * SAME card as "Macros en vivo", recomputed on every keystroke, and in its
 * `empty` variant before the first ingredient lands.
 *
 * The bar's segments are **kcal share** (P×4 · C×4 · G×9 over the macro-derived
 * kcal), not gram share: 20 g of fat and 20 g of carbs are not the same slice of
 * a day. It is a plain flex bar with `overflow-hidden` and no gaps, so the three
 * segments read as one rounded bar. Colours are the app's macro identity tokens
 * (`--macro-p/c/g`, the same triad the dots use), which carry their own dark
 * override — the artboard's pastels are hardcoded for the light theme only.
 *
 * A recipe whose ingredients carry no macros at all (0 kcal) has no distribution
 * to draw: the bar is omitted rather than divided by zero.
 */
export function RecipeMacrosCard({ total, perServing, title, empty = false, className }: Props) {
  const { t } = useTranslation('recetas');
  const num = useNum();

  const kcalFromP = total.proteinG * 4;
  const kcalFromC = total.carbsG * 4;
  const kcalFromG = total.fatG * 9;
  const kcalFromMacros = kcalFromP + kcalFromC + kcalFromG;
  const shares =
    !empty && kcalFromMacros > 0
      ? ([
          { key: 'protein', pct: (kcalFromP / kcalFromMacros) * 100, dot: MACRO_DOT[0] },
          { key: 'carbs', pct: (kcalFromC / kcalFromMacros) * 100, dot: MACRO_DOT[1] },
          { key: 'fat', pct: (kcalFromG / kcalFromMacros) * 100, dot: MACRO_DOT[2] },
        ] as const)
      : null;

  return (
    <Card className={cn('p-3.5 md:p-4', className)}>
      <h2 className="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
        {title ?? t('detail.macrosTitle')}
      </h2>
      <div className="grid grid-cols-2 gap-2.5 md:gap-3.5">
        <MacroColumn title={t('macros.total')} macros={total} highlight={false} empty={empty} />
        <MacroColumn
          title={t('macros.perServing')}
          macros={perServing}
          highlight={!empty}
          empty={empty}
        />
      </div>

      {empty && (
        <div className="mt-3 flex items-center gap-2 border-t pt-3 text-[11px] text-text-dim">
          <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{t('macros.emptyHint')}</span>
        </div>
      )}

      {shares && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-1.5 text-[9.5px] uppercase tracking-[0.05em] text-text-dim">
            {t('detail.distribution')}
          </p>
          <div className="flex h-3 overflow-hidden rounded-full" aria-hidden="true">
            {shares.map(({ key, pct, dot }) => (
              <span key={key} className={dot} style={{ width: `${pct}%` }} />
            ))}
          </div>
          <div className="tnum mt-1.5 flex justify-between text-[10.5px] text-muted-foreground">
            {shares.map(({ key, pct, dot }) => (
              <span key={key} className="inline-flex items-center gap-1">
                <span
                  className={cn('h-[6px] w-[6px] shrink-0 rounded-full', dot)}
                  aria-hidden="true"
                />
                {t(`macros.letter.${key}`)} {num.qty(Math.round(pct))}%
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
