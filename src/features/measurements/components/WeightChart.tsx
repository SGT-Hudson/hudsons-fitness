import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, type Locale } from '@/lib/dates';
import { useSmoothedMeasurements, type TimeRange } from '../hooks';
import { TimeRangePills } from './TimeRangePills';

interface Point {
  date: string;
  weight: number | null;
  ma5: number | null;
}

export function WeightChart() {
  const { t, i18n } = useTranslation('metricas');
  const locale: Locale = i18n.language?.startsWith('en') ? 'en' : 'es';
  const [range, setRange] = useState<TimeRange>('90d');
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
    if (values.length === 0) return undefined;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(0.5, (max - min) * 0.1);
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [points]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{t('charts.weight.title')}</CardTitle>
        <TimeRangePills value={range} onChange={setRange} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            {t('latest.loading')}
          </p>
        ) : points.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            {t('charts.empty')}
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(d: string) => formatDate(d, 'd MMM', locale)}
                  minTickGap={32}
                />
                <YAxis
                  domain={yDomain ?? ['auto', 'auto']}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  width={48}
                  tickFormatter={(v: number) => `${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(d: string) => formatDate(d, 'd MMM yyyy', locale)}
                  formatter={(value: number, name: string) => [
                    `${value.toFixed(2)} kg`,
                    name === 'ma5' ? t('charts.weight.ma5') : t('charts.weight.raw'),
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="ma5"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
