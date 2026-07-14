import { useTranslation } from 'react-i18next';
import { Maximize2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { BodyMeasurement } from '../api';
import {
  compositionDelta,
  deltaTone,
  TREND_LOOKBACK_DAYS,
  type DeltaMetric,
  type DeltaTone,
  type PhaseType,
} from '../trend';

type CompField = 'body_fat_pct' | 'muscle_pct' | 'water_pct';

interface Tile {
  metric: DeltaMetric;
  field: CompField;
  labelKey: string;
  /** `--comp-*` token (index.css) — the same identity colour the chart lines use. */
  dot: string;
}

const TILES: Tile[] = [
  { metric: 'bodyFat', field: 'body_fat_pct', labelKey: 'composition.fat', dot: 'bg-comp-fat' },
  { metric: 'muscle', field: 'muscle_pct', labelKey: 'composition.muscle', dot: 'bg-comp-muscle' },
  { metric: 'water', field: 'water_pct', labelKey: 'composition.water', dot: 'bg-comp-water' },
];

const TONE_CLASS: Record<DeltaTone, string> = {
  good: 'text-tone-good',
  bad: 'text-destructive',
  neutral: 'text-text-dim',
};

function signed(n: number, digits = 1): string {
  const v = Math.abs(n).toFixed(digits);
  if (n > 0) return `↑ ${v}`;
  if (n < 0) return `↓ ${v}`;
  return `· ${v}`;
}

interface Props {
  latest: BodyMeasurement | null | undefined;
  /** Recent measurements (any order) — the source of the 7-day deltas. */
  recent: BodyMeasurement[];
  phaseType?: PhaseType;
  /** Opens the expanded composition chart. Omitted → the tiles are not clickable. */
  onExpand?: () => void;
}

/**
 * Composition tiles (R-33 wave 7): grasa / músculo / agua, each with its value
 * and its 7-day delta. The delta and its tone come straight from `trend.ts`
 * (`compositionDelta` + `deltaTone`) — nothing is recomputed here.
 */
export function CompositionCard({ latest, recent, phaseType, onExpand }: Props) {
  const { t } = useTranslation('metricas');

  function deltaFor(field: CompField): number | null {
    return compositionDelta(
      recent
        .filter((m) => m.measured_on)
        .map((m) => ({ measuredOn: m.measured_on as string, value: m[field] })),
    );
  }

  const hasAny = TILES.some((tile) => latest?.[tile.field] != null);

  return (
    <Card className="p-4 md:p-5">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-cap-label">{t('composition.title')}</span>
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            aria-label={t('composition.expand')}
            className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-[7px] border text-text-dim hover:text-foreground"
          >
            <Maximize2 size={12} aria-hidden="true" />
          </button>
        )}
      </div>

      {!hasAny ? (
        <p className="text-sm text-muted-foreground">{t('composition.empty')}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {TILES.map(({ metric, field, labelKey, dot }) => {
            const value = latest?.[field] ?? null;
            const delta = value == null ? null : deltaFor(field);
            const tone: DeltaTone =
              delta == null ? 'neutral' : deltaTone(metric, Math.sign(delta), phaseType);

            const body = (
              <>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span
                    className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)}
                    aria-hidden="true"
                  />
                  {t(labelKey)}
                </div>
                <div className="mt-1 flex items-baseline gap-0.5">
                  <span className="text-lg font-semibold tracking-[-0.02em] tabular-nums">
                    {value ?? '—'}
                  </span>
                  {value != null && <span className="text-[10px] text-text-dim">%</span>}
                </div>
                {delta != null && (
                  <span
                    data-testid={`comp-delta-${metric}`}
                    className={cn(
                      'mt-0.5 block text-[10px] font-medium tabular-nums',
                      TONE_CLASS[tone],
                    )}
                  >
                    {signed(delta)} · {t('composition.deltaWindow', { days: TREND_LOOKBACK_DAYS })}
                  </span>
                )}
              </>
            );

            const className = 'rounded-[10px] bg-muted px-2.5 py-2 text-left';

            return onExpand ? (
              <button
                key={metric}
                type="button"
                data-metric={metric}
                data-testid={`comp-tile-${metric}`}
                onClick={onExpand}
                className={cn(className, 'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none')}
              >
                {body}
              </button>
            ) : (
              <div
                key={metric}
                data-metric={metric}
                data-testid={`comp-tile-${metric}`}
                className={className}
              >
                {body}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
