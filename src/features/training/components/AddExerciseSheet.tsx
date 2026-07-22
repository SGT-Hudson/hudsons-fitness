import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface AddExerciseEntry {
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
}

export interface AddExerciseRoutineOption {
  id: string;
  name: string;
  /** Days until this routine is next scheduled; null when it isn't in the cycle. */
  daysAhead: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseName: string;
  /** Suggested first, then the rest — the caller owns the ordering. */
  routines: AddExerciseRoutineOption[];
  isSaving?: boolean;
  onAddToRoutine: (routineId: string, entry: AddExerciseEntry) => void;
  onTrainNow: (entry: AddExerciseEntry) => void;
}

const DEFAULT_ENTRY: AddExerciseEntry = {
  target_sets: 3,
  target_reps_min: 8,
  target_reps_max: 12,
};

/**
 * Destination picker for "add this exercise" on the catalogue detail page
 * (R-31). Two destinations, because they mean different things: adding to a
 * routine is a permanent change to the plan (targets only — no weights to
 * invent), while "train now" opens a fresh session pre-filled with the
 * exercise, for a one-off.
 */
export function AddExerciseSheet({
  open,
  onOpenChange,
  exerciseName,
  routines,
  isSaving = false,
  onAddToRoutine,
  onTrainNow,
}: Props) {
  const { t } = useTranslation('entrenamiento');
  const routineId = useId();
  const setsId = useId();
  const minId = useId();
  const maxId = useId();

  const [target, setTarget] = useState<string>(routines[0]?.id ?? '');
  const [entry, setEntry] = useState<AddExerciseEntry>(DEFAULT_ENTRY);

  // Re-open with a clean slate; also picks up routines that arrived late.
  useEffect(() => {
    if (!open) return;
    setEntry(DEFAULT_ENTRY);
    setTarget((prev) => (routines.some((r) => r.id === prev) ? prev : (routines[0]?.id ?? '')));
  }, [open, routines]);

  const valid =
    Number.isInteger(entry.target_sets) && entry.target_sets >= 1 &&
    Number.isInteger(entry.target_reps_min) && entry.target_reps_min >= 1 &&
    Number.isInteger(entry.target_reps_max) && entry.target_reps_max >= entry.target_reps_min;

  function whenLabel(daysAhead: number | null): string | null {
    if (daysAhead === null) return null;
    if (daysAhead === 0) return t('addFromDetail.when.today');
    if (daysAhead === 1) return t('addFromDetail.when.tomorrow');
    return t('addFromDetail.when.inDays', { count: daysAhead });
  }

  function numberField(id: string, label: string, key: keyof AddExerciseEntry, min: number) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id} className="text-xs">{label}</Label>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          step={1}
          value={Number.isNaN(entry[key]) ? '' : entry[key]}
          onChange={(e) => setEntry((prev) => ({ ...prev, [key]: e.target.valueAsNumber }))}
        />
      </div>
    );
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('addFromDetail.title', { name: exerciseName })}
    >
      <div className="flex flex-col gap-5">
        <div className="space-y-1">
          <p className="text-base font-semibold">{t('addFromDetail.heading')}</p>
          <p className="text-sm text-muted-foreground">{exerciseName}</p>
        </div>

        {routines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('addFromDetail.noRoutines')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={routineId} className="text-xs">{t('addFromDetail.routineLabel')}</Label>
              <select
                id={routineId}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
              >
                {routines.map((r) => {
                  const when = whenLabel(r.daysAhead);
                  return (
                    <option key={r.id} value={r.id}>
                      {when ? `${r.name} · ${when}` : r.name}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {numberField(setsId, t('routine.targetSets'), 'target_sets', 1)}
              {numberField(minId, t('routine.repsMin'), 'target_reps_min', 1)}
              {numberField(maxId, t('routine.repsMax'), 'target_reps_max', 1)}
            </div>

            <p className="text-xs text-muted-foreground">{t('addFromDetail.permanentHint')}</p>

            <Button
              disabled={!valid || isSaving || target === ''}
              onClick={() => onAddToRoutine(target, entry)}
            >
              {t('addFromDetail.addToRoutine')}
            </Button>
          </div>
        )}

        <div className="border-t pt-4">
          <Button
            variant="outline"
            className="w-full"
            disabled={!valid}
            onClick={() => onTrainNow(entry)}
          >
            {t('addFromDetail.trainNow')}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">{t('addFromDetail.trainNowHint')}</p>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
