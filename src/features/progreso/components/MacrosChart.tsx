import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLatestMeasurement } from '@/features/measurements/hooks';
import { TimeRangePills } from '@/features/measurements/components/TimeRangePills';
import { type TimeRange } from '@/features/measurements/hooks';
import { useActivePhase } from '@/features/phases/hooks';
import { computePhaseTargets } from '@/features/phases/targets';
import type { Macros } from '@/features/recipes/macros';
import { formatDate, type Locale } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { useDailyNutritionHistory } from '../hooks';
import type { DailyNutritionHistory } from '../api';

type MacroKey = 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber';

const MACRO_KEYS: MacroKey[] = ['kcal', 'protein', 'carbs', 'fat', 'fiber'];

interface ColumnPair {
  planned: keyof DailyNutritionHistory;
  consumed: keyof DailyNutritionHistory;
  target: keyof Macros;
  unit: 'kcal' | 'g';
}

const COLUMNS: Record<MacroKey, ColumnPair> = {
  kcal: {
    planned: 'planned_kcal',
    consumed: 'consumed_kcal',
    target: 'kcal',
    unit: 'kcal',
  },
  protein: {
    planned: 'planned_protein_g',
    consumed: 'consumed_protein_g',
    target: 'proteinG',
    unit: 'g',
  },
  carbs: {
    planned: 'planned_carbs_g',
    consumed: 'consumed_carbs_g',
    target: 'carbsG',
    unit: 'g',
  },
  fat: {
    planned: 'planned_fat_g',
    consumed: 'consumed_fat_g',
    target: 'fatG',
    unit: 'g',
  },
  fiber: {
    planned: 'planned_fiber_g',
    consumed: 'consumed_fiber_g',
    target: 'fiberG',
    unit: 'g',
  },
};

interface Point {
  date: string;
  planned: number | null;
  consumed: number | null;
}

export function MacrosChart() {
  const { t, i18n } = useTranslation('metricas');
  const locale: Locale = i18n.language?.startsWith('en') ? 'en' : 'es';
  const [range, setRange] = useState<TimeRange>('90d');
  const [macro, setMacro] = useState<MacroKey>('kcal');

  const history = useDailyNutritionHistory(range);
  const activePhase = useActivePhase();
  const latest = useLatestMeasurement();

  const cols = COLUMNS[macro];

  const points = useMemo<Point[]>(() => {
    if (!history.data) return [];
    return history.data.map((row) => {
      const plannedRaw = row[cols.planned];
      const consumedRaw = row[cols.consumed];
      return {
        date: row.logged_on,
        planned: typeof plannedRaw === 'number' ? plannedRaw : null,
        consumed: typeof consumedRaw === 'number' ? consumedRaw : null,
      };
    });
  }, [history.data, cols]);

  const targetValue = useMemo<number | null>(() => {
    if (!activePhase.data || !latest.data?.weight_kg) return null;
    const targets = computePhaseTargets(
      activePhase.data,
      latest.data.weight_kg,
      latest.data.body_fat_pct,
    );
    if (!targets) return null;
    return targets[cols.target];
  }, [activePhase.data, latest.data, cols.target]);

  const unitSuffix = cols.unit === 'kcal' ? ' kcal' : ' g';

  const isLoading = history.isLoading;
  const hasAnyData = points.some((p) => p.planned != null || p.consumed != null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-2 flex-wrap">
        <CardTitle className="text-base">{t('charts.macros.title')}</CardTitle>
        <TimeRangePills value={range} onChange={setRange} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          role="radiogroup"
          aria-label={t('charts.macros.selectorLabel')}
          className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs flex-wrap"
        >
          {MACRO_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={macro === k}
              onClick={() => setMacro(k)}
              className={cn(
                'px-2.5 py-1 rounded-sm transition-colors',
                macro === k
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`charts.macros.macro.${k}`)}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            {t('latest.loading')}
          </p>
        ) : !hasAnyData ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            {t('charts.macros.empty')}
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(d: string) => formatDate(d, 'd MMM', locale)}
                  minTickGap={32}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  width={48}
                  tickFormatter={(v: number) => `${Math.round(v)}`}
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
                    `${Math.round(value)}${unitSuffix}`,
                    name,
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  iconType="plainline"
                />
                {targetValue != null ? (
                  <ReferenceLine
                    y={targetValue}
                    stroke="hsl(var(--primary))"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: `${t('charts.macros.target')}: ${Math.round(targetValue)}${unitSuffix}`,
                      position: 'insideTopRight',
                      fontSize: 11,
                      fill: 'hsl(var(--primary))',
                    }}
                  />
                ) : null}
                <Line
                  type="monotone"
                  dataKey="planned"
                  name={t('charts.macros.planned')}
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="consumed"
                  name={t('charts.macros.consumed')}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={{ r: 2.5 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
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
