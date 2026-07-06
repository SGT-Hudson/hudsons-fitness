import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, type Locale } from '@/lib/dates';
import { useSmoothedMeasurements, type TimeRange } from '../hooks';
import type { SmoothedMeasurement } from '../api';
import { interpolateSeries, type Point } from '../interpolate';
import { fatKg, leanKg, leanPct, pctToKg, type CompositionUnit } from '../composition';
import { TimeRangePills } from './TimeRangePills';
import { UnitToggle } from './UnitToggle';
import { TrendChart, type TrendPoint } from './TrendChart';

// R-11 / D-D5 redesign. The composition STACK is fat + lean ONLY — a true
// disjoint 100% partition (lean ≡ 100 − bodyFat%), so the hard [0,100] domain
// is now correct in % mode. Muscle% and water% (and a bodyFat% trend) are
// rendered as INDEPENDENT non-stacked trend charts, never stacked into the
// partition (water is distributed within lean tissue → not disjoint). A local
// %↔kg toggle (component useState, no URL/persistence) switches the kg
// decomposition derived frontend from the stored weight_kg. Presentational
// only — must not feed protein/TDEE/targets.

interface StackRow {
  date: string;
  fat: number | null;
  lean: number | null;
}

export function CompositionChart() {
  const { t, i18n } = useTranslation('metricas');
  const locale: Locale = i18n.language?.startsWith('en') ? 'en' : 'es';
  const [range, setRange] = useState<TimeRange>('90d');
  const [unit, setUnit] = useState<CompositionUnit>('pct');
  const { data, isLoading } = useSmoothedMeasurements(range);

  // Raw points keyed for the shared interpolateSeries module (reused, never
  // duplicated). weight is carried alongside for the kg decomposition.
  const raw = useMemo(() => {
    if (!data) return [];
    return data
      .filter((m): m is SmoothedMeasurement & { measured_on: string } =>
        m.measured_on !== null,
      )
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
    () =>
      raw.some(
        (p) => p.bodyFat != null || p.muscle != null || p.water != null,
      ),
    [raw],
  );

  // Per-series linear interpolation via the existing module (one copy only).
  const fatI = useMemo(() => interpolateSeries(interpPoints, 'bodyFat'), [interpPoints]);
  const muscleI = useMemo(() => interpolateSeries(interpPoints, 'muscle'), [interpPoints]);
  const waterI = useMemo(() => interpolateSeries(interpPoints, 'water'), [interpPoints]);

  // fat/lean 100% partition. In % mode lean = 100 − bodyFat%; in kg mode
  // fat_kg / lean_kg derived frontend from weight_kg.
  const stack = useMemo<StackRow[]>(
    () =>
      raw.map((p, i) => {
        const bf = fatI[i];
        if (unit === 'kg') {
          return { date: p.date, fat: fatKg(bf, p.weight), lean: leanKg(bf, p.weight) };
        }
        return { date: p.date, fat: bf, lean: leanPct(bf) };
      }),
    [raw, fatI, unit],
  );

  // Each trend is an independent series: in % mode the interpolated value
  // itself; in kg mode the same % applied to that day's stored weight.
  const fatTrend = useMemo<TrendPoint[]>(
    () =>
      raw.map((p, i) => ({
        date: p.date,
        value: unit === 'kg' ? pctToKg(fatI[i], p.weight) : fatI[i],
      })),
    [raw, fatI, unit],
  );
  const muscleTrend = useMemo<TrendPoint[]>(
    () =>
      raw.map((p, i) => ({
        date: p.date,
        value: unit === 'kg' ? pctToKg(muscleI[i], p.weight) : muscleI[i],
      })),
    [raw, muscleI, unit],
  );
  const waterTrend = useMemo<TrendPoint[]>(
    () =>
      raw.map((p, i) => ({
        date: p.date,
        value: unit === 'kg' ? pctToKg(waterI[i], p.weight) : waterI[i],
      })),
    [raw, waterI, unit],
  );

  const isKg = unit === 'kg';
  const suffix = isKg ? ' kg' : '%';

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">{t('charts.composition.title')}</CardTitle>
        <div className="flex items-center gap-2">
          <UnitToggle value={unit} onChange={setUnit} />
          <TimeRangePills value={range} onChange={setRange} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            {t('latest.loading')}
          </p>
        ) : !hasAny ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            {t('charts.composition.empty')}
          </p>
        ) : (
          <div className="space-y-6">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stack} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickFormatter={(d: string) => formatDate(d, 'd MMM', locale)}
                    minTickGap={32}
                  />
                  <YAxis
                    domain={isKg ? ['auto', 'auto'] : [0, 100]}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    width={48}
                    tickFormatter={(v: number) => (isKg ? `${v}` : `${v}%`)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelFormatter={(d: string) => formatDate(d, 'd MMM yyyy', locale)}
                    formatter={(value: number, name: string) => [
                      `${value.toFixed(1)}${suffix}`,
                      name === 'fat'
                        ? t('charts.composition.fat')
                        : t('charts.composition.lean'),
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value: string) =>
                      value === 'fat'
                        ? t('charts.composition.fat')
                        : t('charts.composition.lean')
                    }
                  />
                  <Area
                    type="monotone"
                    stackId="1"
                    dataKey="fat"
                    stroke="var(--destructive)"
                    fill="var(--destructive)"
                    fillOpacity={0.45}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    stackId="1"
                    dataKey="lean"
                    stroke="var(--primary)"
                    fill="var(--primary)"
                    fillOpacity={0.5}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2">
                {isKg
                  ? t('charts.composition.helpKg')
                  : t('charts.composition.help')}
              </p>
            </div>

            <div>
              <div className="mb-2">
                <p className="text-sm font-medium">
                  {t('charts.composition.trends.title')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('charts.composition.trends.help')}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <TrendChart
                  title={t('charts.composition.trends.bodyFat')}
                  points={fatTrend}
                  color="var(--destructive)"
                  unit={unit}
                  locale={locale}
                />
                <TrendChart
                  title={t('charts.composition.trends.muscle')}
                  points={muscleTrend}
                  color="var(--primary)"
                  unit={unit}
                  locale={locale}
                />
                <TrendChart
                  title={t('charts.composition.trends.water')}
                  points={waterTrend}
                  color="var(--secondary-foreground)"
                  unit={unit}
                  locale={locale}
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
