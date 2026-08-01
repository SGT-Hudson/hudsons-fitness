import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, type Locale } from '@/lib/dates';
import { useNum } from '@/hooks/useNum';
import { cn } from '@/lib/utils';
import { toWeekGrid, type AdherenceDay, type AdherenceState } from '../adherence';

/** The five drawn states. `sinDatos` is deliberately absent: those cells are
 *  holes in the grid, not a colour. */
const FILL: Record<Exclude<AdherenceState, 'sinDatos'>, string> = {
  enObjetivo: 'var(--adh-on)',
  cerca: 'var(--adh-near)',
  lejos: 'var(--adh-far)',
  sinRegistrar: 'var(--heat-zero)',
  sinObjetivo: 'var(--heat-part)',
};

const LEGEND: Exclude<AdherenceState, 'sinDatos'>[] = [
  'enObjetivo',
  'cerca',
  'lejos',
  'sinRegistrar',
  'sinObjetivo',
];

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

interface Props {
  days: AdherenceDay[];
  loading?: boolean;
}

export function AdherenceHeatmap({ days, loading = false }: Props) {
  const { t, i18n } = useTranslation('metricas');
  const num = useNum();
  const locale: Locale = i18n.language?.startsWith('en') ? 'en' : 'es';
  const [selected, setSelected] = useState<AdherenceDay | null>(null);

  const grid = useMemo(() => toWeekGrid(days), [days]);
  const columns = grid[0]?.length ?? 0;
  const hasAnyData = days.some((d) => d.state !== 'sinDatos');

  function cellLabel(d: AdherenceDay): string {
    const date = formatDate(d.date, 'd MMM yyyy', locale);
    if (d.state === 'sinObjetivo') return t('adherence.cell.noTarget', { date });
    if (d.state === 'sinRegistrar') {
      return t('adherence.cell.unlogged', { date, target: d.targetKcal });
    }
    return t('adherence.cell.logged', {
      date,
      consumed: d.consumedKcal,
      target: d.targetKcal,
      state: t(`adherence.state.${d.state}`),
    });
  }

  function detailText(): string {
    if (!selected) return t('adherence.detail.hint');
    const date = formatDate(selected.date, 'd MMM yyyy', locale);
    if (selected.state === 'sinObjetivo') return t('adherence.detail.noTarget', { date });
    if (selected.state === 'sinRegistrar') {
      return t('adherence.detail.unlogged', { date, target: selected.targetKcal });
    }
    const dev = selected.deviationPct ?? 0;
    return t('adherence.detail.logged', {
      date,
      consumed: selected.consumedKcal,
      target: selected.targetKcal,
      // The sign is information, so it is written out rather than left to the
      // formatter, which drops a leading "+".
      deviation: `${dev >= 0 ? '+' : '−'}${num.dec(Math.abs(dev), 0)}`,
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('adherence.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">{t('adherence.subtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {t('adherence.loading')}
          </p>
        ) : !hasAnyData ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {t('adherence.empty')}
          </p>
        ) : (
          <>
            <div className="flex gap-1.5">
              <div className="flex flex-col justify-between py-px text-[9px] leading-none text-muted-foreground">
                {WEEKDAY_KEYS.map((k) => (
                  <span key={k} className="h-[1em]">
                    {t(`adherence.weekdays.${k}`)}
                  </span>
                ))}
              </div>
              {/* Explicit column count from the JS-built grid: no auto-flow, no
                  measured pixels. The cells scale with the card. */}
              <div
                className="grid min-w-0 flex-1 gap-[2px]"
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              >
                {grid.map((row, rowIndex) =>
                  row.map((d, colIndex) =>
                    d == null || d.state === 'sinDatos' ? (
                      <div key={`${rowIndex}-${colIndex}`} className="aspect-square" />
                    ) : (
                      <button
                        key={d.date}
                        type="button"
                        aria-label={cellLabel(d)}
                        aria-pressed={selected?.date === d.date}
                        onClick={() => setSelected(d)}
                        style={{ backgroundColor: FILL[d.state] }}
                        className={cn(
                          'aspect-square rounded-[2px] transition-shadow',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          d.state === 'sinRegistrar' && 'border border-dashed border-border',
                          selected?.date === d.date && 'ring-2 ring-ring',
                        )}
                      />
                    ),
                  ),
                )}
              </div>
            </div>

            <p
              data-testid="adherence-detail"
              aria-live="polite"
              className="text-xs tabular-nums text-muted-foreground"
            >
              {detailText()}
            </p>

            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {LEGEND.map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    style={{ backgroundColor: FILL[s] }}
                    className={cn(
                      'size-2.5 rounded-[2px]',
                      s === 'sinRegistrar' && 'border border-dashed border-border',
                    )}
                  />
                  {t(`adherence.state.${s}`)}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
