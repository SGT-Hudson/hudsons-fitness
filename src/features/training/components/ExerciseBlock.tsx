import { useEffect, useState } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  type CoachContext,
  lastWorkingSetForExercise,
} from '@/core/training';
import { useExerciseHistory } from '../hooks';
import { exerciseDisplayName, type Exercise } from '../exercises/api';
import { ExercisePicker } from './ExercisePicker';
import { ExerciseInfoButton } from './ExerciseInfoButton';
import { CoachSuggestions } from './CoachSuggestions';
import { SetRow } from './SetRow';
import type { SessionFormValues } from '../schema';

interface Props {
  blockIndex: number;
  /** Today's ISO date (Europe/Madrid) — threaded from SessionEditor to keep
   *  the coach core clock-free. */
  todayISO: string;
  /** Optional initial exercise (edit mode: parent resolves the pool row). */
  initialExercise?: Exercise | null;
  onRemoveBlock: () => void;
}

/**
 * Per-exercise sub-form: picker → coach → sets. Owns the picked-Exercise
 * object locally (because the form only stores the uuid) and queries the
 * exercise history once on pick so both the repeat-last placeholder
 * (§6) and the CoachContext (§7) come from one source of truth.
 */
export function ExerciseBlock({ blockIndex, todayISO, initialExercise, onRemoveBlock }: Props) {
  const { t, i18n } = useTranslation('entrenamiento');
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';
  const { control, setValue, getValues } = useFormContext<SessionFormValues>();
  const [exercise, setExercise] = useState<Exercise | null>(initialExercise ?? null);

  // Sync exercise display state when the parent resolves initialExercise
  // asynchronously (edit mode: exercises map arrives after the block mounts).
  // Guard on truthy so a later async-null never clobbers a user-picked exercise.
  useEffect(() => {
    if (initialExercise) setExercise(initialExercise);
  }, [initialExercise]);

  const sets = useFieldArray({
    control,
    name: `blocks.${blockIndex}.sets`,
  });

  const history = useExerciseHistory(exercise?.id);
  const placeholder = history.data ? lastWorkingSetForExercise(history.data) : null;

  const coachCtx: CoachContext | null = exercise
    ? {
        exerciseId: exercise.id,
        primaryMuscles: exercise.primary_muscles,
        equipment: exercise.equipment,
        defaultIncrementKg: exercise.default_increment_kg,
        history: history.data ?? [],
        todayISO,
      }
    : null;

  function pickExercise(ex: Exercise) {
    setExercise(ex);
    setValue(`blocks.${blockIndex}.exercise_id`, ex.id, { shouldValidate: true });
    // Seed with one empty set if the block has none yet (it shouldn't,
    // because SessionEditor appends a fresh block with one empty set —
    // but stay defensive).
    const current = getValues(`blocks.${blockIndex}.sets`);
    if (!current || current.length === 0) {
      sets.append({ set_index: 1, reps: 0, weight_kg: 0, rpe: null, is_warmup: false });
    }
  }

  function appendSet() {
    const next = sets.fields.length + 1;
    sets.append({ set_index: next, reps: 0, weight_kg: 0, rpe: null, is_warmup: false });
  }

  function applySuggestedLoad(nextWeightKg: number) {
    // Apply the suggested load to the LAST set row (the one the user is
    // about to commit). If all sets are already filled, append a new one.
    const all = getValues(`blocks.${blockIndex}.sets`);
    const targetIdx = (all?.length ?? 1) - 1;
    setValue(`blocks.${blockIndex}.sets.${targetIdx}.weight_kg`, nextWeightKg, {
      shouldValidate: true,
    });
  }

  if (!exercise) {
    return (
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            {t('block.pickExercise')}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground"
            aria-label={t('block.remove')}
            onClick={onRemoveBlock}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ExercisePicker selected={null} onSelect={pickExercise} onClear={() => undefined} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium truncate flex-1 min-w-0">{exerciseDisplayName(exercise, lang)}</h3>
        <div className="flex items-center gap-1 shrink-0">
          <ExerciseInfoButton exercise={exercise} />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground"
            aria-label={t('block.remove')}
            onClick={onRemoveBlock}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {coachCtx && (
        <CoachSuggestions context={coachCtx} onApplySuggestedLoad={applySuggestedLoad} />
      )}

      <div className="space-y-2">
        {sets.fields.map((field, i) => (
          <SetRow
            key={field.id}
            blockIndex={blockIndex}
            setIndex={i}
            placeholder={i === sets.fields.length - 1 ? placeholder : null}
            onRemove={() => sets.remove(i)}
            showRemove={sets.fields.length > 1}
          />
        ))}
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={appendSet}
        className="w-full"
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        {t('block.addSet')}
      </Button>
    </div>
  );
}
