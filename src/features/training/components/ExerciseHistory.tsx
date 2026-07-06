import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, type Locale } from '@/lib/dates';
import {
  detectPRsForExercise,
  e1rmTrendForExercise,
  workingSetVolume,
  type CoreSessionSet,
} from '@/core/training';
import { TrendChart } from '@/features/measurements/components/TrendChart';
import { useExerciseHistory } from '../hooks';

interface Props {
  exerciseId: string;
  exerciseName: string;
}

export function ExerciseHistory({ exerciseId, exerciseName }: Props) {
  const { t, i18n } = useTranslation('entrenamiento');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  const history = useExerciseHistory(exerciseId);

  const e1rmTrend = useMemo(() => {
    const trend = e1rmTrendForExercise(history.data ?? []);
    return trend.map((p) => ({ date: p.performedOn, value: p.e1rm }));
  }, [history.data]);

  const prs = useMemo(
    () => detectPRsForExercise(history.data ?? []),
    [history.data],
  );

  // Group sets by session for the past-sessions list.
  const bySession = useMemo(() => {
    const map = new Map<
      string,
      { performedOn: string; sessionId: string; sets: CoreSessionSet[] }
    >();
    for (const s of history.data ?? []) {
      const key = s.sessionId;
      const entry = map.get(key) ?? {
        performedOn: s.performedOn,
        sessionId: s.sessionId,
        sets: [],
      };
      entry.sets.push(s);
      map.set(key, entry);
    }
    return Array.from(map.values()).sort(
      (a, b) => b.performedOn.localeCompare(a.performedOn),
    );
  }, [history.data]);

  if (history.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if ((history.data ?? []).length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">{exerciseName}</h2>
        <p className="text-muted-foreground text-sm">{t('history.empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">{exerciseName}</h2>

      <TrendChart
        title={t('history.e1rmTrend')}
        points={e1rmTrend}
        color="var(--primary)"
        unit="kg"
        locale={locale}
      />

      {prs.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t('history.prs')}</h3>
          <ul className="space-y-1">
            {prs.map((p) => (
              <li
                key={`${p.sessionId}-${p.performedOn}`}
                className="flex items-center gap-2 text-sm"
              >
                <Badge variant="outline" className="tabular-nums">
                  {p.e1rm.toFixed(1)} kg
                </Badge>
                <span className="text-muted-foreground tabular-nums">
                  {p.reps}× {p.weightKg} kg
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {formatDate(p.performedOn, 'd MMM yyyy', locale)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          {t('history.pastSessions')}
        </h3>
        <ul className="space-y-3">
          {bySession.map((sess) => {
            const volume = workingSetVolume(sess.sets);
            return (
              <li key={sess.sessionId} className="rounded-md border bg-card p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    {formatDate(sess.performedOn, 'EEEE d MMM yyyy', locale)}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t('history.volume', { kg: Math.round(volume) })}
                  </span>
                </div>
                <ul className="space-y-1 text-sm tabular-nums">
                  {sess.sets
                    .slice()
                    .sort((a, b) => a.setIndex - b.setIndex)
                    .map((s) => (
                      <li
                        key={`${sess.sessionId}-${s.setIndex}`}
                        className="flex items-center gap-2"
                      >
                        <span className="text-muted-foreground w-6 text-xs">{s.setIndex}</span>
                        <span>
                          {String(s.reps)} × {String(s.weightKg)} kg
                        </span>
                        {s.rpe !== null && s.rpe !== '' && (
                          <span className="text-xs text-muted-foreground">
                            @ {String(s.rpe)}
                          </span>
                        )}
                        {s.isWarmup && (
                          <Badge variant="outline" className="text-[10px] ml-auto">
                            {t('history.warmup')}
                          </Badge>
                        )}
                      </li>
                    ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
