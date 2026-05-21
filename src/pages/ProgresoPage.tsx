import { useMemo, useState } from 'react';
import { ProgressTabs } from './ProgressTabs';
import { CompositionChart } from '@/features/measurements/components/CompositionChart';
import { LatestMeasurementCard } from '@/features/measurements/components/LatestMeasurementCard';
import { MeasurementDialog } from '@/features/measurements/components/MeasurementDialog';
import { MeasurementsList } from '@/features/measurements/components/MeasurementsList';
import { WeightChart } from '@/features/measurements/components/WeightChart';
import { MacrosChart } from '@/features/progreso/components/MacrosChart';
import {
  useLatestMeasurement,
  useRecentMeasurements,
  useSmoothedMeasurements,
} from '@/features/measurements/hooks';
import { useActivePhase } from '@/features/phases/hooks';
import { useGoal } from '@/features/objetivos/hooks';
import { computeTargetWeightKg } from '@/lib/macros';
import type { BodyMeasurement } from '@/features/measurements/api';
import type { PhaseType } from '@/features/measurements/trend';
import { isoDate } from '@/lib/dates';

export function ProgresoPage() {
  const today = isoDate();

  const latestQuery = useLatestMeasurement();
  const recentQuery = useRecentMeasurements(30);
  const smoothedQuery = useSmoothedMeasurements('90d');
  const activePhase = useActivePhase();
  const goal = useGoal();

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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BodyMeasurement | null>(null);

  function openForToday() {
    setEditing(todayEntry);
    setDialogOpen(true);
  }

  function openForEdit(m: BodyMeasurement) {
    setEditing(m);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <ProgressTabs />

      <LatestMeasurementCard
        latest={latestQuery.data}
        todayEntry={todayEntry}
        loading={latestQuery.isLoading}
        onLogToday={openForToday}
        onEditToday={openForToday}
        smoothed={smoothedQuery.data ?? []}
        recent={recentQuery.data ?? []}
        phaseType={phaseType}
        targetBodyFatPct={targetBodyFatPct}
      />

      <WeightChart targetWeightKg={targetWeightKg} />

      <CompositionChart />

      <MacrosChart />

      <MeasurementsList
        measurements={recentQuery.data ?? []}
        loading={recentQuery.isLoading}
        onEdit={openForEdit}
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
  );
}
