import { useEffect, useState } from 'react';
import {
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  type SubmitHandler,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { programSchema, type ProgramFormValues } from '../programs/programSchema';
import type { ProgramWithDays, SaveProgramPayload } from '../programs/api';
import type { RoutineWithExercises } from '../routines/api';

type FormValues = ProgramFormValues;

interface Props {
  initial: ProgramWithDays | null;
  routines: RoutineWithExercises[];
  onSubmit: (payload: SaveProgramPayload) => Promise<unknown>;
  onSaved?: (programId: string | null) => void;
}

function newRoutineSlot(routines: RoutineWithExercises[]): ProgramFormValues['days'][number] {
  return { day_index: 0, is_rest: false, routine_id: routines[0]?.id ?? null };
}

function deriveInitialForm(
  initial: ProgramWithDays | null,
  routines: RoutineWithExercises[],
): ProgramFormValues {
  if (!initial) {
    return {
      name: '',
      days: [newRoutineSlot(routines)],
    };
  }
  const sorted = [...initial.program_days].sort((a, b) => a.day_index - b.day_index);
  return {
    name: initial.name,
    days: sorted.map((d) => ({
      day_index: d.day_index,
      is_rest: d.is_rest,
      routine_id: d.routine_id ?? null,
    })),
  };
}

// ─── Per-slot row sub-component ───────────────────────────────────────────────

interface RowProps {
  index: number;
  totalCount: number;
  routines: RoutineWithExercises[];
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function DaySlotRow({ index, totalCount, routines, onRemove, onMoveUp, onMoveDown }: RowProps) {
  const { t } = useTranslation('entrenamiento');
  const { register, watch, setValue } = useFormContext<ProgramFormValues>();
  const isRest = watch(`days.${index}.is_rest`);

  function setRest(rest: boolean) {
    setValue(`days.${index}.is_rest`, rest, { shouldValidate: true });
    if (rest) {
      setValue(`days.${index}.routine_id`, null, { shouldValidate: true });
    } else {
      // Default to first routine when switching to routine day
      setValue(`days.${index}.routine_id`, routines[0]?.id ?? null, { shouldValidate: true });
    }
  }

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        {/* Rest / Routine toggle */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={isRest ? 'default' : 'outline'}
            onClick={() => setRest(true)}
          >
            {t('program.restDay')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={!isRest ? 'default' : 'outline'}
            onClick={() => setRest(false)}
          >
            {t('program.routineDay')}
          </Button>
        </div>

        {/* Reorder / remove controls */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground"
            aria-label={t('program.moveUp')}
            disabled={index === 0}
            onClick={onMoveUp}
          >
            ↑
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground"
            aria-label={t('program.moveDown')}
            disabled={index === totalCount - 1}
            onClick={onMoveDown}
          >
            ↓
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground"
            aria-label={t('program.removeDay')}
            onClick={onRemove}
          >
            ✕
          </Button>
        </div>
      </div>

      {/* Routine picker — only shown when not a rest day */}
      {!isRest && (
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          aria-label={t('program.pickRoutine')}
          {...register(`days.${index}.routine_id`)}
        >
          {routines.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProgramBuilder({ initial, routines, onSubmit, onSaved }: Props) {
  const { t } = useTranslation('entrenamiento');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const methods = useForm<FormValues>({
    resolver: zodResolver(programSchema),
    defaultValues: deriveInitialForm(initial, routines),
  });
  const { control, handleSubmit, register } = methods;

  const { fields, append, remove, swap } = useFieldArray({ control, name: 'days' });

  useEffect(() => {
    methods.reset(deriveInitialForm(initial, routines));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const onValid: SubmitHandler<ProgramFormValues> = async (values) => {
    setError(null);
    setSubmitting(true);
    try {
      const payload: SaveProgramPayload = {
        programId: initial?.id ?? null,
        name: values.name,
        days: values.days.map((slot, i) => ({
          day_index: i,
          is_rest: slot.is_rest,
          routine_id: slot.is_rest ? null : slot.routine_id,
        })),
      };
      const result = await onSubmit(payload);
      onSaved?.(typeof result === 'string' ? result : initial?.id ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onValid)} className="space-y-4">
        {/* Program name */}
        <div className="space-y-1.5">
          <Label htmlFor="program-name">{t('program.name')}</Label>
          <Input
            id="program-name"
            placeholder={t('program.namePlaceholder')}
            {...register('name')}
          />
        </div>

        {/* Cycle length */}
        <p className="text-sm text-muted-foreground">
          {t('program.cycleLength', { count: fields.length })}
        </p>

        {/* Day slots */}
        <div className="space-y-3">
          {fields.map((field, i) => (
            <DaySlotRow
              key={field.id}
              index={i}
              totalCount={fields.length}
              routines={routines}
              onRemove={() => remove(i)}
              onMoveUp={() => swap(i, i - 1)}
              onMoveDown={() => swap(i, i + 1)}
            />
          ))}
        </div>

        {/* Add day */}
        <Button
          type="button"
          variant="outline"
          onClick={() => append(newRoutineSlot(routines))}
          className="w-full"
        >
          {t('program.addDay')}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="sticky bottom-0 bg-background pt-2 pb-3 border-t flex justify-end gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? t('program.saving') : t('program.save')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
