import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Scale, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageShell } from '@/components/layout/PageShell';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { MeasurementDialog } from '@/features/measurements/components/MeasurementDialog';
import { groupMeasurementsByMonth } from '@/features/measurements/history';
import {
  TIME_RANGES,
  useDeleteMeasurement,
  useFirstMeasurement,
  useMeasurementsInRange,
  type TimeRange,
} from '@/features/measurements/hooks';
import type { BodyMeasurement } from '@/features/measurements/api';
import { deltaTone, type DeltaTone, type PhaseType } from '@/features/measurements/trend';
import { useActivePhase } from '@/features/phases/hooks';
import { formatDate, isoDate, type Locale } from '@/lib/dates';
import { formatDecimal } from '@/lib/number';
import { cn } from '@/lib/utils';

/**
 * Signed to one decimal. `signed` gives `+82,4` / `-1,3` / `0,0`, and a value
 * that rounds to `-0.0` (e.g. `-0.04`) is zero, so it shows no sign — the
 * rounding-artefact case, handled natively rather than by hand.
 */
function formatDeltaKg(deltaKg: number, lang: string): string {
  return formatDecimal(deltaKg, { lang, digits: 1, signed: true });
}

/**
 * A weight delta is only "good" or "bad" against the active phase — gaining
 * 2 kg mid-cut is not a win. Colouring every delta with the accent would tell
 * the user the opposite of what the hero's phase-toned rate chip tells them,
 * on the same screen. `deltaTone` is the authority (it returns neutral without
 * a phase, and for maintenance).
 */
const DELTA_TONE_CLASS: Record<DeltaTone, string> = {
  good: 'text-accent-ink',
  bad: 'text-danger-ink',
  neutral: 'text-text-dim',
};

/** Weights render to one decimal, so `80` and `82,4` line up in the column. */
function formatKg(weightKg: number, lang: string): string {
  return formatDecimal(weightKg, { lang, digits: 1 });
}

/**
 * `/progress/history` — the full measurement archive, grouped by month
 * (newest first) with a per-month count, one row per measurement (date, weight,
 * body fat, the change against the previous measurement) and its note in
 * guillemets. The footer pins the first measurement ever logged.
 *
 * **Edit and delete live here.** The canvas draws neither, but the app has had
 * both since the flat `MeasurementsList` this screen retires: a restyle never
 * deletes working behaviour. Delete confirms with `window.confirm`, as every
 * other destructive action in the redesigned app does (Recetas, Plantillas,
 * Ingredientes).
 *
 * The range filter is local state, never URL state (D-D4).
 */
export function MeasurementHistoryPage() {
  const { t, i18n } = useTranslation('metricas');
  const { t: tCommon } = useTranslation('common');
  const locale: Locale = i18n.language?.startsWith('en') ? 'en' : 'es';

  const activePhase = useActivePhase();
  const phaseType = activePhase.data?.phase_type as PhaseType | undefined;

  // A history screen opens on the whole record: a shorter default would hide
  // rows on the very screen whose job is to show them all.
  const [range, setRange] = useState<TimeRange>('all');
  const [editing, setEditing] = useState<BodyMeasurement | null>(null);

  const { data, isLoading } = useMeasurementsInRange(range);
  const firstEver = useFirstMeasurement();
  const del = useDeleteMeasurement();

  const groups = useMemo(() => groupMeasurementsByMonth(data ?? []), [data]);
  const total = data?.length ?? 0;

  function confirmDelete(m: BodyMeasurement) {
    if (!window.confirm(t('list.deleteConfirm'))) return;
    del.mutate(m.id);
  }

  return (
    <PageShell
      title={t('history.title')}
      subtitle={isLoading ? undefined : t('history.count', { count: total })}
      back="/progress"
    >
      <div className="space-y-3">
        <SegmentedControl
          ariaLabel={t('charts.range.label')}
          options={TIME_RANGES.map((r) => ({ value: r, label: t(`charts.range.${r}`) }))}
          value={range}
          onChange={setRange}
        />

        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{tCommon('loading')}</p>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={Scale}
            title={t('history.emptyTitle')}
            hint={t('history.emptyHint')}
          />
        ) : (
          groups.map((group) => (
            <section key={group.key}>
              <div className="flex items-baseline gap-2 px-0.5 pb-2">
                <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                  {formatDate(group.monthStart, 'LLLL yyyy', locale)}
                </h2>
                <span className="tnum text-[10px] text-text-dim">
                  {t('history.count', { count: group.rows.length })}
                </span>
              </div>

              <Card className="overflow-hidden">
                {group.rows.map(({ measurement: m, deltaKg }) => (
                  <div key={m.id} className="border-t px-3.5 py-2 first:border-t-0">
                    <div className="flex items-baseline gap-2">
                      <span className="w-[62px] shrink-0 text-[11.5px] font-semibold">
                        {formatDate(m.measured_on, 'd MMM', locale)}
                      </span>
                      <span className="tnum flex-1 text-[12.5px] font-medium">
                        {m.weight_kg == null ? '—' : `${formatKg(m.weight_kg, locale)} kg`}
                      </span>
                      <span className="tnum w-[52px] text-right text-[11px] text-text-dim">
                        {m.body_fat_pct == null ? '—' : `${m.body_fat_pct} %`}
                      </span>
                      <span
                        data-testid={`history-delta-${m.id}`}
                        className={cn(
                          'tnum w-[42px] text-right text-[11px]',
                          deltaKg == null
                            ? 'text-text-dim'
                            : DELTA_TONE_CLASS[deltaTone('weight', deltaKg, phaseType)],
                        )}
                      >
                        {deltaKg == null ? '—' : formatDeltaKg(deltaKg, locale)}
                      </span>
                      <span className="flex shrink-0 items-center gap-0.5 self-center pl-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-text-dim hover:text-foreground"
                          aria-label={tCommon('edit')}
                          onClick={() => setEditing(m)}
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-text-dim hover:text-destructive"
                          aria-label={tCommon('delete')}
                          disabled={del.isPending}
                          onClick={() => confirmDelete(m)}
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </Button>
                      </span>
                    </div>

                    {m.notes && (
                      <p className="mt-0.5 text-[10.5px] italic text-text-dim">« {m.notes} »</p>
                    )}
                  </div>
                ))}
              </Card>
            </section>
          ))
        )}

        {firstEver.data && (
          <p className="tnum pt-1 text-center text-[10.5px] text-text-dim">
            {t('history.firstEver', {
              date: formatDate(firstEver.data.measured_on, 'd MMM yyyy', locale),
              weight:
                firstEver.data.weight_kg == null
                  ? '—'
                  : `${formatKg(firstEver.data.weight_kg, locale)} kg`,
            })}
          </p>
        )}

        <MeasurementDialog
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          defaultDate={editing?.measured_on ?? isoDate()}
          existing={editing}
        />
      </div>
    </PageShell>
  );
}
