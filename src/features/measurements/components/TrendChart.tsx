import { useMemo } from 'react';
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
import { formatDate, type Locale } from '@/lib/dates';
import type { CompositionUnit } from '../composition';

export interface TrendPoint {
  date: string;
  value: number | null;
}

interface Props {
  title: string;
  points: TrendPoint[];
  color: string;
  unit: CompositionUnit;
  locale: Locale;
}

// One independent (non-stacked) trend series. Used for the bodyFat%, muscle%
// and water% trends (D-D5) — these are NOT part of the fat/lean 100% partition.
// The series is pre-interpolated by the caller (reuses interpolateSeries); this
// component is purely presentational.
export function TrendChart({ title, points, color, unit, locale }: Props) {
  const { t } = useTranslation('metricas');

  const yDomain = useMemo<[number, number] | undefined>(() => {
    const values = points
      .map((p) => p.value)
      .filter((v): v is number => v != null);
    if (values.length === 0) return undefined;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(0.5, (max - min) * 0.1);
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [points]);

  const suffix = unit === 'kg' ? ' kg' : '%';
  const hasData = points.some((p) => p.value != null);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground mb-2">{title}</p>
      {!hasData ? (
        <p className="text-xs text-muted-foreground py-8 text-center">
          {t('charts.composition.empty')}
        </p>
      ) : (
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                tickFormatter={(d: string) => formatDate(d, 'd MMM', locale)}
                minTickGap={28}
              />
              <YAxis
                domain={yDomain ?? ['auto', 'auto']}
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                width={40}
                tickFormatter={(v: number) => `${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(d: string) => formatDate(d, 'd MMM yyyy', locale)}
                formatter={(value: number) => [`${value.toFixed(1)}${suffix}`, title]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
