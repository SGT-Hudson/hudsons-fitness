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
import { TimeRangePills } from './TimeRangePills';

export function CompositionChart() {
  const { t, i18n } = useTranslation('metricas');
  const locale: Locale = i18n.language?.startsWith('en') ? 'en' : 'es';
  const [range, setRange] = useState<TimeRange>('90d');
  const { data, isLoading } = useSmoothedMeasurements(range);

  const points = useMemo<Point[]>(() => {
    if (!data) return [];
    const raw: Point[] = data
      .filter((m): m is SmoothedMeasurement & { measured_on: string } => m.measured_on !== null)
      .map((m) => ({
        date: m.measured_on,
        bodyFat: m.body_fat_pct,
        muscle: m.muscle_pct,
        water: m.water_pct,
      }));
    // Keep only points where at least one composition value exists somewhere in the dataset
    const hasAny = raw.some(
      (p) => p.bodyFat != null || p.muscle != null || p.water != null,
    );
    if (!hasAny) return [];
    const fat = interpolateSeries(raw, 'bodyFat');
    const muscle = interpolateSeries(raw, 'muscle');
    const water = interpolateSeries(raw, 'water');
    return raw.map((p, i) => ({
      date: p.date,
      bodyFat: fat[i],
      muscle: muscle[i],
      water: water[i],
    }));
  }, [data]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{t('charts.composition.title')}</CardTitle>
        <TimeRangePills value={range} onChange={setRange} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            {t('latest.loading')}
          </p>
        ) : points.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            {t('charts.composition.empty')}
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(d: string) => formatDate(d, 'd MMM', locale)}
                  minTickGap={32}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  width={48}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(d: string) => formatDate(d, 'd MMM yyyy', locale)}
                  formatter={(value: number) => `${value.toFixed(1)}%`}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value: string) =>
                    value === 'muscle'
                      ? t('charts.composition.muscle')
                      : value === 'water'
                        ? t('charts.composition.water')
                        : t('charts.composition.bodyFat')
                  }
                />
                <Area
                  type="monotone"
                  stackId="1"
                  dataKey="bodyFat"
                  stroke="hsl(var(--destructive))"
                  fill="hsl(var(--destructive))"
                  fillOpacity={0.45}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  stackId="1"
                  dataKey="muscle"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.55}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  stackId="1"
                  dataKey="water"
                  stroke="hsl(var(--secondary-foreground))"
                  fill="hsl(var(--secondary-foreground))"
                  fillOpacity={0.25}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2">
              {t('charts.composition.help')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
