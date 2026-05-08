import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LatestMeasurementCard } from '@/features/measurements/components/LatestMeasurementCard';
import { MeasurementDialog } from '@/features/measurements/components/MeasurementDialog';
import { MeasurementsList } from '@/features/measurements/components/MeasurementsList';
import {
  useLatestMeasurement,
  useRecentMeasurements,
} from '@/features/measurements/hooks';
import type { BodyMeasurement } from '@/features/measurements/api';
import { isoDate } from '@/lib/dates';

export function ProgresoPage() {
  const { t } = useTranslation('metricas');
  const today = isoDate();

  const latestQuery = useLatestMeasurement();
  const recentQuery = useRecentMeasurements(30);

  const todayEntry = useMemo<BodyMeasurement | null>(() => {
    const entry = recentQuery.data?.find((m) => m.measured_on === today);
    return entry ?? null;
  }, [recentQuery.data, today]);

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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>
      </div>

      <LatestMeasurementCard
        latest={latestQuery.data}
        todayEntry={todayEntry}
        loading={latestQuery.isLoading}
        onLogToday={openForToday}
        onEditToday={openForToday}
      />

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
