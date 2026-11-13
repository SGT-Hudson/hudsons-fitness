import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, type Locale } from '@/lib/dates';
import { formatDecimal } from '@/lib/number';
import { useNum } from '@/hooks/useNum';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import {
  DEFAULT_TIME_RANGE,
  TIME_RANGES,
  useSmoothedMeasurements,
  type TimeRange,
} from '../hooks';
import { ChartSheet, ExpandChartButton } from './ChartSheet';
import { AXIS_TICK, TOOLTIP_STYLE } from './chartChrome';

interface Point {
  date: string;
  weight: number | null;
  ma5: number | null;
}

/** `points`, plus the dashed-ray series. Every row carries `projected` —
 * `null` on the real rows, a number only on the anchor row and the
 * appended end-of-ray row — so the last-row checks below never need a cast. */
interface ChartRow extends Point {
  projected: number | null;
}

/**
 * Weight over time: the raw daily points, the MA5 line over them, and the
 * dashed target line.
 *
 * MA5 is `weight_kg_5day_avg` straight off the `body_measurements_smoothed`
 * view — the app never computes a moving average in JS. `targetWeightKg` is
 * derived by the caller from `computeTargetWeightKg`; this component only draws
 * the number it is handed.
 */
export function WeightChart({
  targetWeightKg,
  projection,
}: {
  targetWeightKg?: number | null;
  /** Drawn only for an `on_track` ETA; the page passes null otherwise. */
  projection?: { toWeightKg: number; etaDate: string } | null;
}) {
  const { t, i18n } = useTranslation('metricas');
  const num = useNum();
  const locale: Locale = i18n.language?.startsWith('en') ? 'en' : 'es';
  const [range, setRange] = useState<TimeRange>(DEFAULT_TIME_RANGE);
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useSmoothedMeasurements(range);

  const points = useMemo<Point[]>(() => {
    if (!data) return [];
    return data
      .filter((m) => m.measured_on)
      .map((m) => ({
        date: m.measured_on as string,
        weight: m.weight_kg,
        ma5: m.weight_kg_5day_avg,
      }));
  }, [data]);

  const yDomain = useMemo<[number, number] | undefined>(() => {
    const values = points
      .flatMap((p) => [p.weight, p.ma5])
      .filter((v): v is number => v != null);
    if (targetWeightKg != null) values.push(targetWeightKg);
    if (projection?.toWeightKg != null) values.push(projection.toWeightKg);
    if (values.length === 0) return undefined;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(0.5, (max - min) * 0.1);
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [points, targetWeightKg, projection]);

  /** The canvas's end dot: the trend line terminates in a filled circle. */
  const lastMa5 = useMemo(
    () => [...points].reverse().find((p) => p.ma5 != null) ?? null,
    [points],
  );

  /**
   * The dashed ray from today's trend weight to the target.
   *
   * Horizon cap: the x-axis is categorical, so an extra point 700 days out
   * would just occupy one more slot — it would not visually squeeze
   * anything. What it *would* do is give that one slot a wildly
   * disproportionate implied time step: a single category gap silently
   * standing in for months while every other gap on the axis stands in for
   * days. So the ray is capped at, at most, the span the real data already
   * covers: inside that window it ends on the target; beyond it, it is
   * truncated to the edge of the visible history with no end dot, and the
   * hero's ETA line keeps carrying the actual date.
   */
  const chartData = useMemo<ChartRow[]>(() => {
    const withNoProjection = points.map((p) => ({ ...p, projected: null as number | null }));
    if (!projection || points.length === 0) return withNoProjection;
    const lastReal = [...points].reverse().find((p) => p.ma5 != null);
    if (!lastReal?.ma5) return withNoProjection;
    const lastRealIndex = points.indexOf(lastReal);

    const firstDate = new Date(`${points[0].date}T00:00:00Z`);
    const lastDate = new Date(`${lastReal.date}T00:00:00Z`);
    const spanDays = Math.max(
      1,
      Math.round((lastDate.getTime() - firstDate.getTime()) / 86_400_000),
    );
    const etaDate = new Date(`${projection.etaDate}T00:00:00Z`);
    const etaDays = Math.round((etaDate.getTime() - lastDate.getTime()) / 86_400_000);
    if (etaDays <= 0) return withNoProjection;
    const withinHorizon = etaDays <= spanDays;

    const endDate = withinHorizon
      ? projection.etaDate
      : new Date(lastDate.getTime() + spanDays * 86_400_000).toISOString().slice(0, 10);
    const endWeight = withinHorizon
      ? projection.toWeightKg
      : lastReal.ma5 + ((projection.toWeightKg - lastReal.ma5) * spanDays) / etaDays;

    return [
      // Anchor the dashed line at the last real MA5 so it starts on the
      // curve instead of floating — anchored on the last point *with* an
      // MA5, not just the last point in the array (the two can differ: a
      // trailing raw weight with no MA5 yet would otherwise pull the anchor
      // past where the trend line actually ends).
      ...withNoProjection.map((row, i) =>
        i === lastRealIndex ? { ...row, projected: lastReal.ma5 } : row,
      ),
      { date: endDate, weight: null, ma5: null, projected: endWeight },
    ];
  }, [points, projection]);

  // Gates the target end-dot. Requires both the date match *and* a numeric
  // `projected` on that row — the date alone can coincidentally match (e.g.
  // when the memo bails via `withNoProjection` and the real last row's date
  // happens to equal `projection.etaDate`), which would otherwise draw a
  // stray dot with no ray behind it.
  const projectionEndsOnTarget = useMemo(() => {
    const last = chartData[chartData.length - 1];
    return (
      projection != null &&
      last?.date === projection.etaDate &&
      typeof last?.projected === 'number'
    );
  }, [chartData, projection]);

  const rangeControl = (className?: string) => (
    <SegmentedControl
      ariaLabel={t('charts.range.label')}
      options={TIME_RANGES.map((r) => ({ value: r, label: t(`charts.range.${r}`) }))}
      value={range}
      onChange={setRange}
      className={className}
    />
  );

  // One chart, drawn at two sizes: the card preview and the expanded sheet.
  const plot = (heightClass: string) => {
    if (isLoading) {
      return (
        <p className="py-12 text-center text-sm text-muted-foreground">{t('latest.loading')}</p>
      );
    }
    if (points.length === 0) {
      return (
        <p className="py-12 text-center text-sm text-muted-foreground">{t('charts.empty')}</p>
      );
    }
    return (
      <div className={heightClass}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 12, right: 10, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={(d: string) => formatDate(d, 'd MMM', locale)}
              minTickGap={32}
            />
            <YAxis
              domain={yDomain ?? ['auto', 'auto']}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) => num.qty(v)}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(d: string) => formatDate(d, 'd MMM yyyy', locale)}
              formatter={(value: number, name: string) => [
                `${formatDecimal(value, { lang: locale, digits: 2 })} kg`,
                name === 'ma5' ? t('charts.weight.ma5') : t('charts.weight.raw'),
              ]}
            />
            {targetWeightKg != null && (
              <ReferenceLine
                y={targetWeightKg}
                stroke="var(--primary)"
                strokeDasharray="5 4"
                strokeOpacity={0.6}
                label={{
                  value: t('charts.weight.targetLine', {
                    n: formatDecimal(targetWeightKg, { lang: locale, digits: 1 }),
                  }),
                  position: 'insideTopRight',
                  fontSize: 9.5,
                  fill: 'var(--accent-ink)',
                }}
              />
            )}
            {/* The wash under the trend line. Excluded from the tooltip: it is
                the same ma5 series as the Line, drawn a second time. */}
            <Area
              type="monotone"
              dataKey="ma5"
              stroke="none"
              fill="var(--primary)"
              fillOpacity={0.08}
              tooltipType="none"
              connectNulls
              isAnimationActive={false}
            />
            {/* Raw daily weights: points only, no connecting stroke. */}
            <Line
              type="monotone"
              dataKey="weight"
              stroke="none"
              dot={{ r: 2, fill: 'var(--text-dim)', strokeWidth: 0 }}
              activeDot={{ r: 3.5 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ma5"
              stroke="var(--primary)"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            {lastMa5?.ma5 != null && (
              <ReferenceDot
                x={lastMa5.date}
                y={lastMa5.ma5}
                r={3.4}
                fill="var(--primary)"
                stroke="none"
                isFront
              />
            )}
            {projection && (
              <Line
                data-testid="weight-projection"
                type="linear"
                dataKey="projected"
                stroke="var(--primary)"
                strokeWidth={1.6}
                strokeDasharray="2 5"
                strokeLinecap="round"
                dot={false}
                connectNulls
                tooltipType="none"
                isAnimationActive={false}
              />
            )}
            {projection && projectionEndsOnTarget && (
              <ReferenceDot
                x={projection.etaDate}
                y={projection.toWeightKg}
                r={3}
                fill="var(--card)"
                stroke="var(--primary)"
                strokeWidth={1.6}
                isFront
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="text-base">{t('charts.weight.title')}</CardTitle>
          <div className="flex items-center gap-2">
            {rangeControl()}
            <ExpandChartButton onClick={() => setExpanded(true)} />
          </div>
        </CardHeader>
        <CardContent>{plot('h-64')}</CardContent>
      </Card>

      <ChartSheet
        open={expanded}
        onOpenChange={setExpanded}
        title={t('charts.weight.sheetTitle')}
        subtitle={t('charts.weight.sheetSubtitle', { range: t(`charts.range.${range}`) })}
      >
        {rangeControl('flex w-full [&>button]:flex-1')}
        <div className="rounded-[12px] border border-border bg-card p-3">
          {plot('h-[320px]')}
        </div>
      </ChartSheet>
    </>
  );
}
