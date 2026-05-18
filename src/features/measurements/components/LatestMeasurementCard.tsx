import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { daysBetween, formatDate, isoDate, type Locale } from '@/lib/dates';
import { estimatedBmr } from '@/lib/macros';
import { useProfile } from '@/features/profile/hooks';
import type { BodyMeasurement } from '../api';

interface Props {
  latest: BodyMeasurement | null | undefined;
  todayEntry: BodyMeasurement | null | undefined;
  loading: boolean;
  onLogToday: () => void;
  onEditToday: () => void;
}

function Stat({ label, value, suffix }: { label: string; value: number | null; suffix: string }) {
  if (value === null) return null;
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold tabular-nums">
        {value}
        <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>
      </div>
    </div>
  );
}

export function LatestMeasurementCard({
  latest,
  todayEntry,
  loading,
  onLogToday,
  onEditToday,
}: Props) {
  const { t, i18n } = useTranslation('metricas');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  const profile = useProfile();

  // Estimated BMR (Mifflin–St Jeor) — a DERIVED, NEVER-STORED display value
  // (D-B5 / R-08), recomputed on render from profile + latest weight, same
  // pattern as computeTargetWeightKg. Display only: it never feeds
  // protein/TDEE/targets (D-A6/D-B5 guardrail). `null` (incomplete profile
  // or no measurement) → the Stat self-skips, like every other null metric.
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
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200"
          >
            {t('latest.stale.prefix')} {staleLabel} · {t('latest.stale.usingValues')}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label={t('fields.weightKg')} value={latest.weight_kg} suffix="kg" />
          <Stat label={t('fields.bodyFatPct')} value={latest.body_fat_pct} suffix="%" />
          <Stat label={t('fields.musclePct')} value={latest.muscle_pct} suffix="%" />
          <Stat label={t('fields.waterPct')} value={latest.water_pct} suffix="%" />
          <Stat
            label={t('fields.estimatedBmr')}
            value={bmr === null ? null : Math.round(bmr)}
            suffix="kcal"
          />
        </div>
        {bmr !== null && (
          <p className="text-xs text-muted-foreground">{t('fields.estimatedBmrHelp')}</p>
        )}
        {latest.notes && (
          <p className="text-sm text-muted-foreground border-l-2 border-muted pl-3">
            {latest.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
