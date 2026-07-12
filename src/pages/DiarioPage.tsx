import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CopyPlus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageShell } from '@/components/layout/PageShell';
import { BodyQuickMeasureCard } from '@/features/diario/components/BodyQuickMeasureCard';
import { CopyDayDialog } from '@/features/diario/components/CopyDayDialog';
import { DateNavigator } from '@/features/diario/components/DateNavigator';
import { DayTotalsCard } from '@/features/diario/components/DayTotalsCard';
import { KcalHero } from '@/features/diario/components/KcalHero';
import { MacroGrid, type MacroGridItem } from '@/features/diario/components/MacroGrid';
import { WeeklyKcalChart } from '@/features/diario/components/WeeklyKcalChart';
import type { ProteinBasis } from '@/lib/macros';
import { AddToDaySheet } from '@/features/diario/components/AddToDaySheet';
import { MealSection } from '@/features/diario/components/MealSection';
import { useMaterializePlan, useQuickAddRecipes, useWeeklyKcal } from '@/features/diario/hooks';
import { useDayContext } from '@/features/diario/useDayContext';
import { computeMealLogMacros, computeMealLogSub, sumSub } from '@/features/diario/macros';
import { MEAL_TYPE_ORDER, type MealLogWithJoins, type MealType } from '@/features/diario/api';
import { useSmoothedMeasurements } from '@/features/measurements/hooks';
import { smoothedRatePerWeek } from '@/features/measurements/trend';
import { essentialFatFloorG } from '@/core/nutritionTone';
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
  const [copyOpen, setCopyOpen] = useState(false);

  // The day's shared context — entries, slot subtotals, totals, phase targets,
  // the add-sheet's default slot. `TodayAddToDaySheet` derives the same thing
  // from the same hook.
  const {
    logs,
    activePhase,
    latestMeasurement,
    latestTdee,
    entries,
    grouped,
    mealSubtotals,
    defaultAddSlot,
    totals,
    targets,
    phaseType,
    phaseLabel,
  } = useDayContext(date);

  const smoothed = useSmoothedMeasurements('30d');
  const materialize = useMaterializePlan();
  // Quick-add chips are best-effort: loading/error silently degrade to none.
  const quickAddItems = useQuickAddRecipes().data ?? [];

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
    navigate(newDate === today ? '/diary' : `/diary/${newDate}`);
  }

  useEffect(() => {
    if (params.date && !isValidDate(params.date)) {
      navigate('/diary', { replace: true });
    }
  }, [params.date, navigate]);

  const subTotals = useMemo(
    () => sumSub(entries.map((l) => computeMealLogSub(l))),
    [entries],
  );

  // D-F19 ring footnote: kcal contributed by today's plan-materialized
  // entries (from_plan=true), already counted inside `totals.kcal`.
  const planKcal = useMemo(
    () =>
      entries
        .filter((l) => l.from_plan)
        .reduce((sum, l) => sum + computeMealLogMacros(l).kcal, 0),
    [entries],
  );

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

  const fatFloor =
    latestMeasurement.data?.weight_kg != null
      ? essentialFatFloorG(latestMeasurement.data.weight_kg)
      : undefined;

  // Shared macro-tile config: the mobile ring card builds this internally; the
  // web rail's static (always-open) grid reuses the same four items.
  const macroItems: MacroGridItem[] = [
    { metric: 'protein', consumed: totals.proteinG, target: targets?.proteinG, unit: 'g', phase: phaseType },
    { metric: 'carbs', consumed: totals.carbsG, target: targets?.carbsG, unit: 'g', phase: phaseType },
    { metric: 'fat', consumed: totals.fatG, target: targets?.fatG, unit: 'g', floorG: fatFloor, phase: phaseType },
    { metric: 'fiber', consumed: totals.fiberG, target: targets?.fiberG, unit: 'g', phase: phaseType },
  ];

  // Web-rail weekly chart (md+ only): 7-day kcal series ending on the selected
  // date, with today's live running total spliced in (see useWeeklyKcal).
  const weeklyKcal = useWeeklyKcal(date, totals.kcal);

  // Web-rail body card: smoothed kg/week rate over the last 30 days.
  const weeklyRate = useMemo(() => {
    const points = (smoothed.data ?? [])
      .filter((m) => m.measured_on)
      .map((m) => ({ measuredOn: m.measured_on as string, ma5: m.weight_kg_5day_avg }));
    return smoothedRatePerWeek(points);
  }, [smoothed.data]);

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

  const headerActions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setCopyOpen(true)}>
        <CopyPlus className="h-4 w-4" />
        {t('copyDay.open')}
      </Button>
      <Button onClick={() => openNew(defaultAddSlot)}>
        <Plus className="h-4 w-4" />
        {t('addEntry')}
      </Button>
    </div>
  );

  return (
    <PageShell title={t('pageTitle')} actions={headerActions}>
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 md:hidden">{headerActions}</div>
      <DateNavigator date={date} onChange={changeDate} />

      {/* Mobile-primary summary. The ring hero + collapsible macros live here;
          on md+ the web right rail owns them instead, so this card is hidden
          there to avoid a duplicated kcal hero / macro grid. */}
      <div className="md:hidden">
        <DayTotalsCard
          totals={totals}
          subTotals={subTotals}
          targets={targets}
          proteinBasis={proteinBasis}
          tdeeConfidence={tdeeConfidence}
          phaseType={phaseType}
          weightKg={latestMeasurement.data?.weight_kg ?? undefined}
          planKcal={planKcal}
        />
      </div>

      <div className="md:grid md:grid-cols-[1fr_380px] md:items-start md:gap-4">
        {/* Meals — shown at both breakpoints (left column on md+). */}
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
        ) : (
          <div className="space-y-4">
            {MEAL_TYPE_ORDER.map((mt) => {
              const items = grouped.get(mt) ?? [];
              // 'other' is a fallback bucket — only show it when it has entries.
              if (mt === 'other' && items.length === 0) return null;
              return (
                <MealSection
                  key={mt}
                  mealType={mt}
                  date={date}
                  items={items}
                  quickAddItems={quickAddItems}
                  onAdd={openNew}
                  onEdit={openEdit}
                />
              );
            })}
          </div>
        )}

        {/* Web right rail — md+ only. Hero + static macro grid + weekly chart
            gate on a phase target (mirrors DayTotalsCard's fallback); the body
            card always shows. */}
        <aside className="hidden md:flex md:flex-col md:gap-3">
          {targets ? (
            <>
              <KcalHero
                consumed={totals.kcal}
                target={targets.kcal}
                phaseType={phaseType}
                phaseLabel={phaseLabel}
                tdeeKcal={latestTdee.data?.estimated_tdee_kcal ?? null}
                tdeeConfidence={tdeeConfidence}
              />
              <MacroGrid collapsible={false} items={macroItems} />
              {weeklyKcal.data && (
                <WeeklyKcalChart
                  days={weeklyKcal.data}
                  target={targets.kcal}
                  phase={phaseType}
                />
              )}
            </>
          ) : (
            <div className="rounded-[14px] border bg-card p-5 text-xs text-muted-foreground">
              {t('totals.targetsHint')}
            </div>
          )}
          <BodyQuickMeasureCard
            latest={latestMeasurement.data}
            rate={weeklyRate}
            phaseType={phaseType}
          />
        </aside>
      </div>

      <AddToDaySheet
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        loggedOn={date}
        initialMealType={dialogMealType}
        mealSubtotals={mealSubtotals}
        totals={totals}
        targets={targets}
        phaseLabel={phaseLabel}
        editing={editing}
      />

      <CopyDayDialog
        open={copyOpen}
        onOpenChange={setCopyOpen}
        targetDate={date}
      />
    </div>
    </PageShell>
  );
}
