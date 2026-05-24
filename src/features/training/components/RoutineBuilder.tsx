import { useEffect, useState } from 'react';
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
  const { register, setValue } = useFormContext<RoutineFormValues>();
  const [exercise, setExercise] = useState<Exercise | null>(initialExercise ?? null);

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

  useEffect(() => {
    methods.reset(deriveInitialForm(initial));
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
              key={field.id}
              index={i}
              totalCount={exercises.fields.length}
              initialExercise={initialExercises[field.exercise_id] ?? null}
              onRemove={() => exercises.remove(i)}
              onMoveUp={() => exercises.swap(i, i - 1)}
              onMoveDown={() => exercises.swap(i, i + 1)}
            />
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => exercises.append(newExerciseRow())}
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
