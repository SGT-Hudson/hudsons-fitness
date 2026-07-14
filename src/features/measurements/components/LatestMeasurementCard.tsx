import { useTranslation } from 'react-i18next';
import { addDays } from 'date-fns';
import { Badge } from '@/components/ui/badge';
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
  deltaTone,
  smoothedRatePerWeek,
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
  /**
   * Kept so the page can hand its one recent-measurements query to the hero and
   * to `CompositionCard` alike. The hero itself no longer reads it: the 7-day
   * composition deltas moved to `CompositionCard` (R-33 wave 7).
   */
  recent?: BodyMeasurement[];
  phaseType?: PhaseType;
  targetBodyFatPct?: number;
}

// Phase-toned rate chip. `deltaTone` decides good/bad *for the active phase*
// (losing in a cut is good, in a bulk it is not) — this map only paints it.
const RATE_TONE_CLASS: Record<DeltaTone, string> = {
  good: 'bg-accent-soft text-accent-ink border-accent-line',
  bad: 'bg-danger-soft text-danger-ink border-danger-line',
  neutral: '',
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

export function LatestMeasurementCard({
  latest,
  todayEntry,
  loading,
  onLogToday,
  onEditToday,
  smoothed,
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

  // "Camino de la fase": how far the trend weight has travelled from the phase's
  // starting weight to its target. A plain fraction of two already-derived
  // numbers — direction-agnostic, so it reads the same in a cut and in a bulk.
  const pathPct =
    initial != null && targetWeight != null && latestMa5 != null && targetWeight !== initial
      ? Math.max(
          0,
          Math.min(100, Math.round(((latestMa5 - initial) / (targetWeight - initial)) * 100)),
        )
      : null;

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

  const sinceStartStr =
    sinceStart == null
      ? null
      : `${sinceStart >= 0 ? '+' : '-'}${fmt(Math.abs(sinceStart))}`;

  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center gap-2">
        <span className="text-cap-label">{t('latest.weightTrendLabel')}</span>
        <div className="ml-auto flex items-center gap-2">
          {rate != null && (
            <Badge
              variant="secondary"
              className={cn('tabular-nums', RATE_TONE_CLASS[rateTone])}
            >
              {signed(rate)} {t('latest.rateUnit')}
            </Badge>
          )}
          {isToday ? (
            <Button variant="outline" size="sm" onClick={onEditToday}>
              {t('latest.editToday')}
            </Button>
          ) : (
            <Button size="sm" onClick={onLogToday}>
              {t('latest.logToday')}
            </Button>
          )}
        </div>
      </div>

      {!isToday && (
        <div
          role="status"
          className="mt-3 rounded-md border border-transparent bg-amber-soft px-3 py-2 text-sm text-amber-ink"
        >
          {t('latest.stale.prefix')} {staleLabel} · {t('latest.stale.usingValues')}
        </div>
      )}

      {/* MA5 weight headline — the DB view's `weight_kg_5day_avg`, never a JS average. */}
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          data-testid="weight-headline"
          className="text-[33px] font-semibold leading-none tracking-[-0.03em] tabular-nums md:text-[44px]"
        >
          {latestMa5 != null ? fmt(latestMa5) : latest.weight_kg}
        </span>
        <span className="text-xs text-text-dim md:text-[15px]">kg</span>
      </div>

      {(sinceStartStr != null || toGoal != null) && (
        <div className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
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
        <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">{etaText}</div>
      )}

      {/* Camino de la fase — plain bar, no draggable knob (the P0 artboard dropped it). */}
      {pathPct != null && (
        <div className="mt-3 border-t pt-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-cap-label">{t('latest.path.title')}</span>
            <span className="ml-auto text-[15px] font-semibold tracking-[-0.02em] tabular-nums">
              {pathPct} %
            </span>
            <span className="text-[10.5px] text-muted-foreground">
              {t('latest.path.traveled')}
            </span>
          </div>
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full border bg-muted"
            role="progressbar"
            aria-valuenow={pathPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('latest.path.title')}
          >
            <div
              data-testid="phase-path-fill"
              className="h-full rounded-full bg-accent"
              style={{ width: `${pathPct}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-text-dim tabular-nums">
            <span>
              <b className="text-foreground">{fmt(initial as number)}</b>{' '}
              {t('latest.path.start')}
            </span>
            <span className="text-accent-ink">
              <b>{fmt(latestMa5 as number)}</b> {t('latest.path.today')}
            </span>
            <span>
              <b className="text-foreground">{fmt(targetWeight as number)}</b>{' '}
              {t('latest.path.goal')}
            </span>
          </div>
        </div>
      )}

      {/* BMR — quiet, derived, no delta (T1b) */}
      {bmr !== null && (
        <div className="mt-3 border-t pt-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">{t('fields.estimatedBmr')}</span>
            <span className="font-semibold tabular-nums">{Math.round(bmr)} kcal</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('fields.estimatedBmrHelp')}
          </p>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 border-t pt-3 text-[11px] text-muted-foreground">
        <span className="shrink-0">
          {isToday
            ? t('latest.measuredToday')
            : t('latest.measuredOn', {
                date: formatDate(latest.measured_on, 'd MMM yyyy', locale),
              })}
        </span>
        {latest.notes && (
          <span className="min-w-0 flex-1 truncate text-text-dim">«{latest.notes}»</span>
        )}
      </div>
    </Card>
  );
}
