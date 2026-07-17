import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
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
import type { SmoothedMeasurement } from '../api';
import { interpolateSeries, type Point } from '../interpolate';
import { pctToKg, type CompositionUnit } from '../composition';
import { UnitToggle } from './UnitToggle';
import { TrendChart, type TrendPoint } from './TrendChart';
import { ChartSheet, ExpandChartButton } from './ChartSheet';
import {
  AXIS_TICK,
  COMPOSITION_COLORS,
  COMPOSITION_SERIES,
  TOOLTIP_STYLE,
  type CompositionSeriesKey,
} from './chartChrome';

// R-33 wave 7. The stacked fat/lean area is GONE: a 100% partition can only
// show two of the four numbers the app stores, and it hid the two the user
// actually logs a scale for (músculo, agua). The chart is now three independent
// lines — grasa / músculo / agua — which is also why they are NOT stacked: water
// is distributed within lean tissue, so the three are not a disjoint partition.
// A local %↔kg toggle (component useState, no URL/persistence — D-D4/D-D5)
// switches the kg decomposition, derived frontend from the stored weight_kg via
// composition.ts. Presentational only — never feeds protein/TDEE/targets.

type Row = { date: string } & Record<CompositionSeriesKey, number | null>;

interface Props {
  /**
   * Expansion state, optionally controlled: the Progreso page owns it so that a
   * `CompositionCard` tile can open *this* chart's sheet (one chart, never a
   * second copy). Omitted → the card keeps its own state and the expand button
   * still works on its own.
   */
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
}

export function CompositionChart({ expanded: expandedProp, onExpandedChange }: Props) {
  const { t, i18n } = useTranslation('metricas');
  const num = useNum();
  const locale: Locale = i18n.language?.startsWith('en') ? 'en' : 'es';
  const [range, setRange] = useState<TimeRange>(DEFAULT_TIME_RANGE);
  const [unit, setUnit] = useState<CompositionUnit>('pct');
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false);
  const expanded = expandedProp ?? uncontrolledExpanded;
  const setExpanded: (open: boolean) => void = onExpandedChange ?? setUncontrolledExpanded;
  const { data, isLoading } = useSmoothedMeasurements(range);

  // Raw points keyed for the shared interpolateSeries module (reused, never
  // duplicated). weight is carried alongside for the kg decomposition.
  const raw = useMemo(() => {
    if (!data) return [];
    return data
      .filter((m): m is SmoothedMeasurement & { measured_on: string } => m.measured_on !== null)
      .map((m) => ({
        date: m.measured_on,
        weight: m.weight_kg,
        bodyFat: m.body_fat_pct,
        muscle: m.muscle_pct,
        water: m.water_pct,
      }));
  }, [data]);

  const interpPoints = useMemo<Point[]>(
    () =>
      raw.map((p) => ({
        date: p.date,
        bodyFat: p.bodyFat,
        muscle: p.muscle,
        water: p.water,
      })),
    [raw],
  );

  const hasAny = useMemo(
    () => raw.some((p) => p.bodyFat != null || p.muscle != null || p.water != null),
    [raw],
  );

  // Per-series linear interpolation via the existing module (one copy only).
  const fatI = useMemo(() => interpolateSeries(interpPoints, 'bodyFat'), [interpPoints]);
  const muscleI = useMemo(() => interpolateSeries(interpPoints, 'muscle'), [interpPoints]);
  const waterI = useMemo(() => interpolateSeries(interpPoints, 'water'), [interpPoints]);

  // The three series. In % mode each is the interpolated percentage itself; in
  // kg mode the same percentage applied to that day's stored weight (pctToKg —
  // composition.ts owns the arithmetic).
  const rows = useMemo<Row[]>(
    () =>
      raw.map((p, i) => {
        const toValue = (pct: number | null) => (unit === 'kg' ? pctToKg(pct, p.weight) : pct);
        return {
          date: p.date,
          fat: toValue(fatI[i]),
          muscle: toValue(muscleI[i]),
          water: toValue(waterI[i]),
        };
      }),
    [raw, fatI, muscleI, waterI, unit],
  );

  const isKg = unit === 'kg';
  const suffix = isKg ? ' kg' : '%';

  // Padded to the data. The old hard [0,100] domain existed because the chart
  // was a 100% partition; three independent series would drown in it.
  const yDomain = useMemo<[number, number] | undefined>(() => {
    const values = rows
      .flatMap((r) => COMPOSITION_SERIES.map((k) => r[k]))
      .filter((v): v is number => v != null);
    if (values.length === 0) return undefined;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(1, (max - min) * 0.1);
    const lo = min - pad;
    const hi = max + pad;
    return isKg
      ? [Math.floor(lo), Math.ceil(hi)]
      : [Math.max(0, Math.floor(lo)), Math.min(100, Math.ceil(hi))];
  }, [rows, isKg]);

  const seriesLabel = (key: CompositionSeriesKey) => t(`charts.composition.series.${key}`);

  /** The canvas's end dot, one per series: each line terminates in a filled circle. */
  const endDots = useMemo(
    () =>
      COMPOSITION_SERIES.map((key) => {
        const last = [...rows].reverse().find((r) => r[key] != null);
        return last ? { key, date: last.date, value: last[key] as number } : null;
      }).filter((d): d is { key: CompositionSeriesKey; date: string; value: number } => d != null),
    [rows],
  );

  const trendPoints = (key: CompositionSeriesKey): TrendPoint[] =>
    rows.map((r) => ({ date: r.date, value: r[key] }));

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
  const plot = (heightClass: string) => (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 12, right: 10, left: -18, bottom: 0 }}>
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
            tickFormatter={(v: number) => (isKg ? num.qty(v) : `${num.qty(v)}%`)}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(d: string) => formatDate(d, 'd MMM yyyy', locale)}
            formatter={(value: number, name: string) => [
              `${formatDecimal(value, { lang: locale, digits: 1 })}${suffix}`,
              seriesLabel(name as CompositionSeriesKey),
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => seriesLabel(value as CompositionSeriesKey)}
          />
          {COMPOSITION_SERIES.map((key) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={COMPOSITION_COLORS[key]}
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
          {endDots.map((d) => (
            <ReferenceDot
              key={d.key}
              x={d.date}
              y={d.value}
              r={3.4}
              fill={COMPOSITION_COLORS[d.key]}
              stroke="none"
              isFront
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const body = (heightClass: string) => {
    if (isLoading) {
      return (
        <p className="py-12 text-center text-sm text-muted-foreground">{t('latest.loading')}</p>
      );
    }
    if (!hasAny) {
      return (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {t('charts.composition.empty')}
        </p>
      );
    }
    return (
      <>
        {plot(heightClass)}
        <p className="mt-2 text-xs text-muted-foreground">
          {isKg ? t('charts.composition.helpKg') : t('charts.composition.help')}
        </p>
      </>
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="text-base">{t('charts.composition.title')}</CardTitle>
          <div className="flex items-center gap-2">
            <UnitToggle value={unit} onChange={setUnit} />
            {rangeControl()}
            <ExpandChartButton onClick={() => setExpanded(true)} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {body('h-64')}

          {hasAny && !isLoading && (
            <div>
              <div className="mb-2">
                <p className="text-sm font-medium">{t('charts.composition.trends.title')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('charts.composition.trends.help')}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {COMPOSITION_SERIES.map((key) => (
                  <TrendChart
                    key={key}
                    title={t(`charts.composition.trends.${key}`)}
                    points={trendPoints(key)}
                    color={COMPOSITION_COLORS[key]}
                    unit={unit}
                    locale={locale}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ChartSheet
        open={expanded}
        onOpenChange={setExpanded}
        title={t('charts.composition.title')}
        subtitle={t('charts.composition.sheetSubtitle', { range: t(`charts.range.${range}`) })}
      >
        <div className="flex items-center gap-2">
          {rangeControl('flex flex-1 [&>button]:flex-1')}
          <UnitToggle value={unit} onChange={setUnit} />
        </div>
        <div className="rounded-[12px] border border-border bg-card p-3">{body('h-[320px]')}</div>
      </ChartSheet>
    </>
  );
}
