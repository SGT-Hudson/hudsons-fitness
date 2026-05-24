import { useEffect, useRef, useState } from 'react';
import {
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  type SubmitHandler,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ExercisePicker } from './ExercisePicker';
import { exerciseDisplayName, type Exercise } from '../exercises/api';
import { routineSchema, type RoutineFormValues } from '../routines/routineSchema';
import type { RoutineWithExercises, SaveRoutinePayload } from '../routines/api';

interface Props {
  initial: RoutineWithExercises | null;
  initialExercises?: Record<string, Exercise>;
  onSubmit: (payload: SaveRoutinePayload) => Promise<unknown>;
  onSaved?: (routineId: string | null) => void;
}

function newExerciseRow(): RoutineFormValues['exercises'][number] {
  return {
    exercise_id: '',
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: null,
    target_rpe: null,
    warmup_sets: [],
  };
}

function deriveInitialForm(initial: RoutineWithExercises | null): RoutineFormValues {
  if (!initial) {
    return {
      name: '',
      notes: null,
      exercises: [newExerciseRow()],
    };
  }
  return {
    name: initial.name,
    notes: initial.notes ?? null,
    exercises: (initial.routine_exercises ?? []).map((re) => ({
      exercise_id: re.exercise_id,
      target_sets: re.target_sets,
      target_reps_min: re.target_reps_min,
      target_reps_max: re.target_reps_max,
      rest_seconds: re.rest_seconds ?? null,
      target_rpe: re.target_rpe ?? null,
      warmup_sets: Array.isArray(re.warmup_sets) ? (re.warmup_sets as Array<{ pct: number; reps: number }>) : [],
    })),
  };
}

// ─── Per-row sub-form (in-file to keep the file self-contained) ──────────────

interface RowProps {
  index: number;
  totalCount: number;
  initialExercise?: Exercise | null;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function ExerciseRow({ index, totalCount, initialExercise, onRemove, onMoveUp, onMoveDown }: RowProps) {
  const { t, i18n } = useTranslation('entrenamiento');
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';
  const { register, setValue, control } = useFormContext<RoutineFormValues>();
  const [exercise, setExercise] = useState<Exercise | null>(initialExercise ?? null);
  const warmups = useFieldArray({ control, name: `exercises.${index}.warmup_sets` });

  // Sync exercise state if initialExercise changes (edit mode reset).
  useEffect(() => {
    setExercise(initialExercise ?? null);
  }, [initialExercise]);

  function pickExercise(ex: Exercise) {
    setExercise(ex);
    setValue(`exercises.${index}.exercise_id`, ex.id, { shouldValidate: true });
  }

  function clearExercise() {
    setExercise(null);
    setValue(`exercises.${index}.exercise_id`, '', { shouldValidate: true });
  }

  const setsId = `routine-ex-${index}-sets`;
  const repsMinId = `routine-ex-${index}-reps-min`;
  const repsMaxId = `routine-ex-${index}-reps-max`;
  const restId = `routine-ex-${index}-rest`;
  const rpeId = `routine-ex-${index}-rpe`;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      {/* Header: display name + reorder/remove controls */}
      <div className="flex items-center justify-between gap-2">
        {exercise ? (
          <span className="font-medium text-sm truncate flex-1">
            {exerciseDisplayName(exercise, lang)}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground flex-1">
            {t('block.pickExercise')}
          </span>
        )}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground"
            aria-label={t('routine.moveUp')}
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
            aria-label={t('routine.moveDown')}
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
            aria-label={t('routine.removeExercise')}
            onClick={onRemove}
          >
            ✕
          </Button>
        </div>
      </div>

      {/* Hidden field keeps the exercise_id in the form */}
      <input type="hidden" {...register(`exercises.${index}.exercise_id`)} />

      {/* Exercise picker */}
      <ExercisePicker
        selected={exercise}
        onSelect={pickExercise}
        onClear={clearExercise}
      />

      {/* Numeric fields */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={setsId} className="text-xs">
            {t('routine.targetSets')}
          </Label>
          <Input
            id={setsId}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            {...register(`exercises.${index}.target_sets`, { valueAsNumber: true })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={repsMinId} className="text-xs">
            {t('routine.repsMin')}
          </Label>
          <Input
            id={repsMinId}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            {...register(`exercises.${index}.target_reps_min`, { valueAsNumber: true })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={repsMaxId} className="text-xs">
            {t('routine.repsMax')}
          </Label>
          <Input
            id={repsMaxId}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            {...register(`exercises.${index}.target_reps_max`, { valueAsNumber: true })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={restId} className="text-xs">
            {t('routine.restSeconds')}
          </Label>
          <Input
            id={restId}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            {...register(`exercises.${index}.rest_seconds`, {
              setValueAs: (v) => {
                if (v === '' || v === null || v === undefined) return null;
                const n = Number(v);
                return Number.isFinite(n) ? n : null;
              },
            })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={rpeId} className="text-xs">
            {t('routine.targetRpe')}
          </Label>
          <Input
            id={rpeId}
            type="number"
            inputMode="decimal"
            min={6}
            max={10}
            step={0.5}
            {...register(`exercises.${index}.target_rpe`, {
              setValueAs: (v) => {
                if (v === '' || v === null || v === undefined) return null;
                const n = Number(v);
                return Number.isFinite(n) ? n : null;
              },
            })}
          />
        </div>
      </div>

      {/* Warmup sets */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{t('routine.warmupTitle')}</p>
        {warmups.fields.map((field, w) => (
          <div key={field.id} className="flex items-center gap-2">
            <div className="space-y-1 flex-1">
              <Label htmlFor={`routine-ex-${index}-warmup-${w}-pct`} className="text-xs sr-only">
                {t('routine.warmupPct')}
              </Label>
              <Input
                id={`routine-ex-${index}-warmup-${w}-pct`}
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                step={1}
                placeholder={t('routine.warmupPct')}
                aria-label={t('routine.warmupPct')}
                {...register(`exercises.${index}.warmup_sets.${w}.pct`, { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1 flex-1">
              <Label htmlFor={`routine-ex-${index}-warmup-${w}-reps`} className="text-xs sr-only">
                {t('routine.warmupReps')}
              </Label>
              <Input
                id={`routine-ex-${index}-warmup-${w}-reps`}
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                step={1}
                placeholder={t('routine.warmupReps')}
                aria-label={t('routine.warmupReps')}
                {...register(`exercises.${index}.warmup_sets.${w}.reps`, { valueAsNumber: true })}
              />
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              aria-label={t('routine.removeWarmup')}
              onClick={() => warmups.remove(w)}
            >
              ✕
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => warmups.append({ pct: 50, reps: 5 })}
        >
          <Plus className="h-3 w-3 mr-1" />
          {t('routine.addWarmup')}
        </Button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RoutineBuilder({ initial, initialExercises = {}, onSubmit, onSaved }: Props) {
  const { t } = useTranslation('entrenamiento');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const methods = useForm<RoutineFormValues>({
    resolver: zodResolver(routineSchema),
    defaultValues: deriveInitialForm(initial),
  });
  const { control, handleSubmit, register } = methods;

  const exercises = useFieldArray({ control, name: 'exercises' });

  // Stable keys for ExerciseRow — mirrors SessionEditor's stableBlockKeys.
  // RHF regenerates field.id when setValue touches a path inside the array
  // (e.g. exercises.0.exercise_id on pick) and on append, which unmounts+
  // remounts every ExerciseRow. Stable keys keep each row's React identity
  // (and its local exercise state) alive across those operations.
  const rowKeyCounter = useRef(0);
  const stableRowKeys = useRef<string[]>(
    deriveInitialForm(initial).exercises.map((_, i) => `row-init-${i}`),
  );

  useEffect(() => {
    const next = deriveInitialForm(initial);
    methods.reset(next);
    stableRowKeys.current = next.exercises.map((_, i) => `row-init-${i}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const onValid: SubmitHandler<RoutineFormValues> = async (values) => {
    setError(null);
    setSubmitting(true);
    try {
      const payload: SaveRoutinePayload = {
        routineId: initial?.id ?? null,
        name: values.name,
        notes: values.notes ?? null,
        exercises: values.exercises.map((ex, i) => ({
          exercise_id: ex.exercise_id,
          position: i + 1,
          target_sets: ex.target_sets,
          target_reps_min: ex.target_reps_min,
          target_reps_max: ex.target_reps_max,
          rest_seconds: ex.rest_seconds ?? null,
          target_rpe: ex.target_rpe ?? null,
          warmup_sets: ex.warmup_sets ?? [],
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
        <div className="space-y-1.5">
          <Label htmlFor="routine-name">{t('routine.name')}</Label>
          <Input
            id="routine-name"
            placeholder={t('routine.namePlaceholder')}
            {...register('name')}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="routine-notes">{t('routine.notes')}</Label>
          <Textarea
            id="routine-notes"
            rows={2}
            placeholder={t('routine.notesPlaceholder')}
            {...register('notes')}
          />
        </div>

        <div className="space-y-3">
          {exercises.fields.map((field, i) => (
            <ExerciseRow
              key={stableRowKeys.current[i] ?? field.id}
              index={i}
              totalCount={exercises.fields.length}
              initialExercise={initialExercises[field.exercise_id] ?? null}
              onRemove={() => {
                exercises.remove(i);
                stableRowKeys.current.splice(i, 1);
              }}
              onMoveUp={() => {
                exercises.swap(i, i - 1);
                const tmp = stableRowKeys.current[i];
                stableRowKeys.current[i] = stableRowKeys.current[i - 1];
                stableRowKeys.current[i - 1] = tmp;
              }}
              onMoveDown={() => {
                exercises.swap(i, i + 1);
                const tmp = stableRowKeys.current[i];
                stableRowKeys.current[i] = stableRowKeys.current[i + 1];
                stableRowKeys.current[i + 1] = tmp;
              }}
            />
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => {
            exercises.append(newExerciseRow());
            stableRowKeys.current.push(`row-append-${++rowKeyCounter.current}`);
          }}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-1" />
          {t('routine.addExercise')}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="sticky bottom-0 bg-background pt-2 pb-3 border-t flex justify-end gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? t('routine.saving') : t('routine.save')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
