import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DateNavigator } from '@/features/diario/components/DateNavigator';
import { DayTotalsCard, type ProteinBasis } from '@/features/diario/components/DayTotalsCard';
import { MealLogEntry } from '@/features/diario/components/MealLogEntry';
import { MealLogDialog } from '@/features/diario/components/MealLogDialog';
import { useMaterializePlan, useMealLogsForDay } from '@/features/diario/hooks';
import { computeMealLogMacros, sumMacros } from '@/features/diario/macros';
import { MEAL_TYPE_ORDER, type MealLogWithJoins, type MealType } from '@/features/diario/api';
import { useLatestMeasurement } from '@/features/measurements/hooks';
import { useActivePhase } from '@/features/phases/hooks';
import { computePhaseTargets } from '@/features/phases/targets';
import { useLatestTdee } from '@/features/tdee/hooks';
import { tdeeConfidenceBand } from '@/features/tdee/api';
import { isoDate } from '@/lib/dates';

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export function DiarioPage() {
  const { t } = useTranslation('diario');
  const navigate = useNavigate();
  const params = useParams<{ date?: string }>();
  const today = isoDate();
  const date = params.date && isValidDate(params.date) ? params.date : today;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMealType, setDialogMealType] = useState<MealType>('breakfast');
  const [editing, setEditing] = useState<MealLogWithJoins | null>(null);

  const logs = useMealLogsForDay(date);
  const latestMeasurement = useLatestMeasurement();
  const activePhase = useActivePhase();
  const latestTdee = useLatestTdee();
  const materialize = useMaterializePlan();

  // The plan is the default truth: any active-week slot for this date that
  // hasn't been materialized into a meal_log yet gets one inserted with
  // from_plan=true. Idempotent on the server side, but we also gate per
  // (date, mutation status) on the client so we don't fire multiple times
  // while the page is in view. Logs must have finished loading first — running
  // before we know what's already there would race with the dedup check.
  const materializeMutate = materialize.mutate;
  useEffect(() => {
    if (logs.isLoading || logs.isError) return;
    materializeMutate(date);
  }, [date, logs.isLoading, logs.isError, materializeMutate]);

  function changeDate(newDate: string) {
    navigate(newDate === today ? '/diario' : `/diario/${newDate}`);
  }

  useEffect(() => {
    if (params.date && !isValidDate(params.date)) {
      navigate('/diario', { replace: true });
    }
  }, [params.date, navigate]);

  const grouped = useMemo(() => {
    const map = new Map<MealType, MealLogWithJoins[]>();
    for (const mt of MEAL_TYPE_ORDER) map.set(mt, []);
    for (const log of logs.data ?? []) {
      const mt = (log.meal_type as MealType) ?? 'other';
      const list = map.get(mt) ?? [];
      list.push(log);
      map.set(mt, list);
    }
    return map;
  }, [logs.data]);

  const totals = useMemo(
    () => sumMacros((logs.data ?? []).map((l) => computeMealLogMacros(l))),
    [logs.data],
  );

  const targets = useMemo(() => {
    if (!activePhase.data || !latestMeasurement.data?.weight_kg) return undefined;
    return (
      computePhaseTargets(
        activePhase.data,
        latestMeasurement.data.weight_kg,
        latestMeasurement.data.body_fat_pct,
        latestTdee.data?.estimated_tdee_kcal ?? null,
      ) ?? undefined
    );
  }, [activePhase.data, latestMeasurement.data, latestTdee.data]);

  // The protein basis is fully data-driven (D-B1): a logged body-fat % on the
  // latest measurement → phase-aware lean-mass path; absent → 1.6 g/kg
  // bodyweight fallback. No manual toggle.
  const proteinBasis: ProteinBasis =
    latestMeasurement.data?.body_fat_pct != null ? 'lean' : 'fallback';

  // Surface the adaptive-TDEE confidence (R-07 / D-B4) only when the active
  // phase's kcal actually came from the estimate (`tdee_delta`) — otherwise
  // the estimate doesn't drive the displayed target so the badge would be
  // noise. Null/`high` confidence → no badge (preserves the prior UI).
  const tdeeConfidence =
    activePhase.data?.kcal_mode === 'tdee_delta'
      ? tdeeConfidenceBand(latestTdee.data)
      : null;

  function openNew(mealType: MealType) {
    setEditing(null);
    setDialogMealType(mealType);
    setDialogOpen(true);
  }

  function openEdit(log: MealLogWithJoins) {
    setEditing(log);
    setDialogMealType((log.meal_type as MealType) ?? 'other');
    setDialogOpen(true);
  }

  const isEmpty = (logs.data ?? []).length === 0 && !logs.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>
        <Button onClick={() => openNew('breakfast')}>
          <Plus className="h-4 w-4" />
          {t('addEntry')}
        </Button>
      </div>

      <DateNavigator date={date} onChange={changeDate} />

      <DayTotalsCard
        totals={totals}
        targets={targets}
        proteinBasis={proteinBasis}
        tdeeConfidence={tdeeConfidence}
      />

      {logs.isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="py-4 space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isEmpty ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-muted-foreground">{t('empty.message')}</p>
            <Button onClick={() => openNew('breakfast')}>
              <Plus className="h-4 w-4" />
              {t('empty.cta')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {MEAL_TYPE_ORDER.map((mt) => {
            const items = grouped.get(mt) ?? [];
            if (items.length === 0) return null;
            return (
              <Card key={mt}>
                <div className="flex items-center justify-between px-4 py-2 border-b">
                  <h2 className="font-semibold">{t(`mealType.${mt}`)}</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openNew(mt)}
                    aria-label={t('addToMeal')}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <ul className="divide-y">
                  {items.map((log) => (
                    <MealLogEntry key={log.id} log={log} onEdit={openEdit} />
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      <MealLogDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        loggedOn={date}
        initialMealType={dialogMealType}
        editing={editing}
      />
    </div>
  );
}
