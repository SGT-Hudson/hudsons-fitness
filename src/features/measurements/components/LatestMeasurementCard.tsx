import { useTranslation } from 'react-i18next';
import { addDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { daysBetween, formatDate, isoDate, type Locale } from '@/lib/dates';
import { computeTargetWeightKg, estimatedBmr } from '@/lib/macros';
import { useProfile } from '@/features/profile/hooks';
import { useLatestTdee, useTdeeState } from '@/features/tdee/hooks';
import { computeGoalEta } from '../eta';
import type { BodyMeasurement, SmoothedMeasurement } from '../api';
import {
  compositionDelta,
  deltaTone,
  smoothedRatePerWeek,
  type DeltaMetric,
  type DeltaTone,
  type PhaseType,
} from '../trend';

interface Props {
  latest: BodyMeasurement | null | undefined;
  todayEntry: BodyMeasurement | null | undefined;
  loading: boolean;
  onLogToday: () => void;
  onEditToday: () => void;
  smoothed: SmoothedMeasurement[];
  recent: BodyMeasurement[];
  phaseType?: PhaseType;
  targetBodyFatPct?: number;
}

const TONE_CLASS: Record<DeltaTone, string> = {
  good: 'text-tone-good',
  bad: 'text-destructive',
  neutral: 'text-muted-foreground',
};

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

function signed(n: number, digits = 1): string {
  const v = fmt(Math.abs(n), digits);
  if (n > 0) return `↑ ${v}`;
  if (n < 0) return `↓ ${v}`;
  return `· ${v}`;
}

function CompStat({
  label,
  value,
  delta,
  metric,
  phaseType,
}: {
  label: string;
  value: number | null;
  delta: number | null;
  metric: DeltaMetric;
  phaseType?: PhaseType;
}) {
  if (value === null) return null;
  const tone =
    delta == null ? 'neutral' : deltaTone(metric, Math.sign(delta), phaseType);
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold tabular-nums">
        {value}
        <span className="text-sm font-normal text-muted-foreground ml-1">%</span>
      </div>
      {delta != null && (
        <div className={cn('text-[11px] font-semibold tabular-nums', TONE_CLASS[tone])}>
          {signed(delta)}
        </div>
      )}
    </div>
  );
}

export function LatestMeasurementCard({
  latest,
  todayEntry,
  loading,
  onLogToday,
  onEditToday,
  smoothed,
  recent,
  phaseType,
  targetBodyFatPct,
}: Props) {
  const { t, i18n } = useTranslation('metricas');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  const profile = useProfile();
  const latestTdee = useLatestTdee();
  const tdeeState = useTdeeState();

  const bmr = estimatedBmr({
    sex: profile.data?.sex,
    birthDate: profile.data?.birth_date,
    heightCm: profile.data?.height_cm,
    weightKg: latest?.weight_kg,
    asOfISO: isoDate(),
  });

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('latest.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('latest.loading')}</p>
        </CardContent>
      </Card>
    );
  }

  if (!latest) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('latest.title')}</CardTitle>
          <CardDescription>{t('latest.emptyDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onLogToday}>{t('latest.logFirst')}</Button>
        </CardContent>
      </Card>
    );
  }

  const today = isoDate();
  const isToday = todayEntry !== null && todayEntry !== undefined;
  const daysOld = daysBetween(latest.measured_on, today);

  let staleLabel = '';
  if (!isToday) {
    if (daysOld <= 0) staleLabel = t('latest.stale.today');
    else if (daysOld === 1) staleLabel = t('latest.stale.yesterday');
    else staleLabel = t('latest.stale.daysAgo', { count: daysOld });
  }

  // --- Trend ---
  const smoothedPoints = smoothed
    .filter((m) => m.measured_on)
    .map((m) => ({
      measuredOn: m.measured_on as string,
      ma5: m.weight_kg_5day_avg,
    }));
  const latestMa5 =
    [...smoothedPoints].reverse().find((p) => p.ma5 != null)?.ma5 ?? null;
  const rate = smoothedRatePerWeek(smoothedPoints);
  const rateTone: DeltaTone =
    rate == null ? 'neutral' : deltaTone('weight', Math.sign(rate), phaseType);

  const initial = profile.data?.initial_weight_kg ?? null;
  const sinceStart =
    latestMa5 != null && initial != null ? latestMa5 - initial : null;

  const targetWeight =
    targetBodyFatPct != null && latest.body_fat_pct != null && latest.weight_kg != null
      ? computeTargetWeightKg({
          currentWeightKg: latest.weight_kg,
          currentBodyFatPct: latest.body_fat_pct,
          targetBodyFatPct,
        })
      : null;
  const toGoal =
    targetWeight != null && latestMa5 != null ? latestMa5 - targetWeight : null;

  // Goal-date ETA from the adaptive filter's own dynamics (chosen 2026-05-19:
  // the Kalman trend-weight rate). Anchored at the filter's de-noised trend
  // weight; rate = (avgIntake − expenditure)/7700. Purely derived, never
  // stored — same rule as targetWeight / estimatedBmr.
  const ts = tdeeState.data;
  const te = latestTdee.data;
  const eta =
    targetWeight != null && ts != null && te != null
      ? computeGoalEta({
          currentWeightKg: ts.trend_weight_kg,
          targetWeightKg: targetWeight,
          avgIntakeKcal: te.avg_kcal_intake,
          expenditureKcal: te.estimated_tdee_kcal,
        })
      : null;
  let etaText: string | null = null;
  if (eta && eta.status !== 'reached') {
    if (eta.status === 'on_track' && eta.daysToTarget != null) {
      etaText = t('latest.eta.onTrack', {
        date: formatDate(
          addDays(new Date(), eta.daysToTarget),
          'd MMM yyyy',
          locale,
        ),
      });
    } else if (eta.status === 'stalled') {
      etaText = t('latest.eta.stalled');
    } else if (eta.status === 'wrong_direction') {
      etaText = t('latest.eta.wrongDirection');
    }
  }

  function compPoints(field: 'body_fat_pct' | 'muscle_pct' | 'water_pct') {
    return [...recent]
      .filter((m) => m.measured_on)
      .sort((a, b) => (a.measured_on as string).localeCompare(b.measured_on as string))
      .map((m) => ({ measuredOn: m.measured_on as string, value: m[field] }));
  }
  const bfDelta = compositionDelta(compPoints('body_fat_pct'));
  const muscleDelta = compositionDelta(compPoints('muscle_pct'));
  const waterDelta = compositionDelta(compPoints('water_pct'));

  const sinceStartStr =
    sinceStart == null
      ? null
      : `${sinceStart >= 0 ? '+' : '-'}${fmt(Math.abs(sinceStart))}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{t('latest.title')}</CardTitle>
          <CardDescription>
            {isToday
              ? t('latest.measuredToday')
              : t('latest.measuredOn', {
                  date: formatDate(latest.measured_on, 'd MMM yyyy', locale),
                })}
          </CardDescription>
        </div>
        {isToday ? (
          <Button variant="outline" size="sm" onClick={onEditToday}>
            {t('latest.editToday')}
          </Button>
        ) : (
          <Button size="sm" onClick={onLogToday}>
            {t('latest.logToday')}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!isToday && (
          <div
            role="status"
            className="rounded-md border border-transparent bg-amber-soft px-3 py-2 text-sm text-amber-ink"
          >
            {t('latest.stale.prefix')} {staleLabel} · {t('latest.stale.usingValues')}
          </div>
        )}

        {/* Weight headline (smoothed) */}
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {t('latest.weightTrendLabel')}
          </div>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="text-3xl font-bold tabular-nums leading-none">
              {latestMa5 != null ? fmt(latestMa5) : latest.weight_kg}
            </span>
            <span className="text-sm text-muted-foreground">kg</span>
            {rate != null && (
              <span
                className={cn('text-sm font-semibold tabular-nums', TONE_CLASS[rateTone])}
              >
                {signed(rate)} {t('latest.rateUnit')}
              </span>
            )}
          </div>
          {(sinceStartStr != null || toGoal != null) && (
            <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
              {sinceStartStr != null && t('latest.sinceStart', { n: sinceStartStr })}
              {sinceStartStr != null && toGoal != null && ' · '}
              {toGoal != null &&
                t('latest.toGoal', {
                  n: fmt(Math.abs(toGoal)),
                  target: targetWeight != null ? fmt(targetWeight) : '',
                })}
            </div>
          )}
          {etaText != null && (
            <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
              {etaText}
            </div>
          )}
        </div>

        {/* BMR — quiet, derived, no delta (T1b) */}
        {bmr !== null && (
          <>
            <div className="flex items-baseline justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">{t('fields.estimatedBmr')}</span>
              <span className="font-semibold tabular-nums">{Math.round(bmr)} kcal</span>
            </div>
            <p className="text-[11px] text-muted-foreground -mt-2">
              {t('fields.estimatedBmrHelp')}
            </p>
          </>
        )}

        {/* Composition 3-up with phase-aware deltas */}
        <div className="grid grid-cols-3 gap-4 border-t pt-4">
          <CompStat
            label={t('fields.bodyFatPct')}
            value={latest.body_fat_pct}
            delta={bfDelta}
            metric="bodyFat"
            phaseType={phaseType}
          />
          <CompStat
            label={t('fields.musclePct')}
            value={latest.muscle_pct}
            delta={muscleDelta}
            metric="muscle"
            phaseType={phaseType}
          />
          <CompStat
            label={t('fields.waterPct')}
            value={latest.water_pct}
            delta={waterDelta}
            metric="water"
            phaseType={phaseType}
          />
        </div>

        {latest.notes && (
          <p className="text-sm text-muted-foreground border-l-2 border-muted pl-3">
            {latest.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
