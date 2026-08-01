import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays } from 'date-fns';
import { Plus } from 'lucide-react';
import { ProgressTabs } from './ProgressTabs';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/button';
import { CompositionCard } from '@/features/measurements/components/CompositionCard';
import { CompositionChart } from '@/features/measurements/components/CompositionChart';
import { LatestMeasurementCard } from '@/features/measurements/components/LatestMeasurementCard';
import { useGoalEta } from '@/features/measurements/useGoalEta';
import { MeasurementDialog } from '@/features/measurements/components/MeasurementDialog';
import { RecentMeasurementsCard } from '@/features/measurements/components/RecentMeasurementsCard';
import { WeightChart } from '@/features/measurements/components/WeightChart';
import { MacrosChart } from '@/features/progreso/components/MacrosChart';
import { AdherenceHeatmap } from '@/features/progreso/components/AdherenceHeatmap';
import { EnergyBalanceCard } from '@/features/tdee/components/EnergyBalanceCard';
import {
  useLatestMeasurement,
  useRecentMeasurements,
  useSmoothedMeasurements,
  fromDateForRange,
} from '@/features/measurements/hooks';
import { useDailyNutritionHistory } from '@/features/progreso/hooks';
import { buildAdherenceDays } from '@/features/progreso/adherence';
import { useActivePhase, usePhases } from '@/features/phases/hooks';
import { useGoal } from '@/features/objetivos/hooks';
import { useLatestTdee, useTdeeEstimates } from '@/features/tdee/hooks';
import { useProfile } from '@/features/profile/hooks';
import { computeTargetWeightKg, estimatedBmr } from '@/lib/macros';
import type { BodyMeasurement } from '@/features/measurements/api';
import type { PhaseType } from '@/features/measurements/trend';
import { isoDate } from '@/lib/dates';

export function ProgresoPage() {
  const { t } = useTranslation('metricas');
  const today = isoDate();

  const latestQuery = useLatestMeasurement();
  const recentQuery = useRecentMeasurements(30);
  const smoothedQuery = useSmoothedMeasurements('6m');
  const activePhase = useActivePhase();
  const goal = useGoal();
  const latestTdee = useLatestTdee();
  const profile = useProfile();

  // The heatmap's window: 26 weeks, fixed, no control of its own.
  // `fromDateForRange('6m')` is today − 182 days = exactly 26 weeks, and this
  // is MacrosChart's default query key — the grid costs no extra request.
  const adherenceFrom = fromDateForRange('6m');
  const nutritionHistory = useDailyNutritionHistory('6m');
  const phases = usePhases();
  const tdeeEstimates = useTdeeEstimates(adherenceFrom);

  const adherenceDays = useMemo(() => {
    const rows = nutritionHistory.data ?? [];
    if (adherenceFrom == null) return [];
    return buildAdherenceDays({
      from: adherenceFrom,
      to: today,
      firstSnapshotDate: rows[0]?.logged_on ?? null,
      consumedByDate: new Map(rows.map((r) => [r.logged_on, r.consumed_kcal])),
      phases: phases.data ?? [],
      tdeeByDate: new Map(
        (tdeeEstimates.data ?? []).map((e) => [e.computed_on, e.estimated_tdee_kcal]),
      ),
    });
  }, [nutritionHistory.data, phases.data, tdeeEstimates.data, adherenceFrom, today]);

  const energyBalance = useMemo(() => {
    const e = latestTdee.data;
    if (!e) return null;
    return {
      tdeeKcal: e.estimated_tdee_kcal,
      avgIntakeKcal: e.avg_kcal_intake,
      bmrKcal: estimatedBmr({
        sex: profile.data?.sex,
        birthDate: profile.data?.birth_date,
        heightCm: profile.data?.height_cm,
        weightKg: latestQuery.data?.weight_kg,
        asOfISO: today,
      }),
    };
  }, [latestTdee.data, profile.data, latestQuery.data, today]);

  const todayEntry = useMemo<BodyMeasurement | null>(() => {
    const entry = recentQuery.data?.find((m) => m.measured_on === today);
    return entry ?? null;
  }, [recentQuery.data, today]);

  const phaseType = activePhase.data?.phase_type as PhaseType | undefined;
  const targetBodyFatPct = goal.data?.target_body_fat_pct ?? undefined;

  const targetWeightKg = useMemo<number | null>(() => {
    const m = latestQuery.data;
    if (
      targetBodyFatPct == null ||
      !m ||
      m.body_fat_pct == null ||
      m.weight_kg == null
    ) {
      return null;
    }
    return computeTargetWeightKg({
      currentWeightKg: m.weight_kg,
      currentBodyFatPct: m.body_fat_pct,
      targetBodyFatPct,
    });
  }, [latestQuery.data, targetBodyFatPct]);

  const goalEta = useGoalEta(targetWeightKg);
  const projection = useMemo(() => {
    if (goalEta?.status !== 'on_track' || goalEta.daysToTarget == null || targetWeightKg == null) {
      return null;
    }
    return {
      toWeightKg: targetWeightKg,
      etaDate: isoDate(addDays(new Date(), goalEta.daysToTarget)),
    };
  }, [goalEta, targetWeightKg]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BodyMeasurement | null>(null);

  // The composition chart's expanded sheet. It lives here, not inside the chart,
  // so a CompositionCard tile opens the very same sheet the chart's own expand
  // button opens — one chart, one sheet, no second copy.
  const [compositionExpanded, setCompositionExpanded] = useState(false);

  function openForToday() {
    setEditing(todayEntry);
    setDialogOpen(true);
  }

  function openForEdit(m: BodyMeasurement) {
    setEditing(m);
    setDialogOpen(true);
  }

  return (
    <PageShell
      title={t('pageTitle')}
      subtitle={t('subtitle')}
      /* Desktop only: PageHeaderV2 is CSS-hidden below md (see the note at
         IngredientesPage.tsx). The mobile affordance for the same action is the
         hero's own "Registrar hoy" / "Editar de hoy" / "Registrar primera
         medición" button, which is in the body and opens this same dialog — so
         mobile is not left without one, and it is not duplicated either. */
      actions={
        <Button onClick={openForToday}>
          <Plus className="size-4" aria-hidden="true" />
          {t('newMeasurement')}
        </Button>
      }
    >
      <div className="space-y-3.5">
        <ProgressTabs />

        <LatestMeasurementCard
          latest={latestQuery.data}
          todayEntry={todayEntry}
          loading={latestQuery.isLoading}
          onLogToday={openForToday}
          onEditToday={openForToday}
          smoothed={smoothedQuery.data ?? []}
          phaseType={phaseType}
          targetBodyFatPct={targetBodyFatPct}
        />

        <CompositionCard
          latest={latestQuery.data}
          recent={recentQuery.data ?? []}
          phaseType={phaseType}
          onExpand={() => setCompositionExpanded(true)}
        />

        {energyBalance && <EnergyBalanceCard data={energyBalance} />}

        <WeightChart targetWeightKg={targetWeightKg} projection={projection} />

        <CompositionChart
          expanded={compositionExpanded}
          onExpandedChange={setCompositionExpanded}
        />

        {/* The glance: the last five. The archive — and the only place a
            measurement can be deleted — is `/progress/history`. */}
        <RecentMeasurementsCard
          measurements={recentQuery.data ?? []}
          loading={recentQuery.isLoading}
          onEdit={openForEdit}
        />

        <MacrosChart />

        <AdherenceHeatmap
          days={adherenceDays}
          loading={nutritionHistory.isLoading || phases.isLoading || tdeeEstimates.isLoading}
        />

        <MeasurementDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setEditing(null);
          }}
          defaultDate={today}
          existing={editing}
          prefillFrom={!editing && !todayEntry ? latestQuery.data : null}
        />
      </div>
    </PageShell>
  );
}
