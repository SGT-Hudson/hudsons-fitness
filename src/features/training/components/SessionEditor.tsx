import { useEffect, useState } from 'react';
import {
  FormProvider,
  useFieldArray,
  useForm,
  type SubmitHandler,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { todayInTZ } from '@/lib/dates';
import { ExerciseBlock } from './ExerciseBlock';
import type { Exercise } from '../exercises/api';
import { sessionSchema, type SessionFormValues } from '../schema';
import type { SaveWorkoutPayload, SessionWithSets } from '../api';

interface Props {
  /** Session being edited; null for a fresh session. */
  initial: SessionWithSets | null;
  /**
   * Map exercise_id → Exercise for any blocks present in `initial`. The
   * page that owns the editor pre-resolves these (one query per id) so
   * the editor itself doesn't need to know how to fetch them.
   */
  initialExercises?: Record<string, Exercise>;
  /**
   * Save mutation injected as a prop (mirrors `PhaseDialog.onSave`) — keeps
   * the editor unit-testable without mocking TanStack hooks.
   */
  onSubmit: (payload: SaveWorkoutPayload) => Promise<unknown>;
  /** Called after a successful save (e.g. to navigate back to the list). */
  onSaved?: (sessionId: string | null) => void;
}

function newBlock() {
  return {
    exercise_id: '',
    sets: [{ set_index: 1, reps: 0, weight_kg: 0, rpe: null, is_warmup: false }],
  } satisfies SessionFormValues['blocks'][number];
}

function deriveInitialForm(
  initial: SessionWithSets | null,
): SessionFormValues {
  if (!initial) {
    return {
      performed_on: todayInTZ(),
      title: null,
      notes: null,
      blocks: [newBlock()],
    };
  }
  // Group sets by exercise_id, preserving set_index order.
  const grouped = new Map<string, SessionWithSets['workout_sets']>();
  for (const s of initial.workout_sets ?? []) {
    const arr = grouped.get(s.exercise_id) ?? [];
    arr.push(s);
    grouped.set(s.exercise_id, arr);
  }
  const blocks = Array.from(grouped.entries()).map(([exercise_id, rows]) => ({
    exercise_id,
    sets: rows
      .slice()
      .sort((a, b) => a.set_index - b.set_index)
      .map((r) => ({
        set_index: r.set_index,
        reps: r.reps,
        weight_kg: Number(r.weight_kg),
        rpe: r.rpe === null ? null : Number(r.rpe),
        is_warmup: r.is_warmup,
      })),
  }));
  return {
    performed_on: initial.performed_on,
    title: initial.title,
    notes: initial.notes,
    blocks: blocks.length > 0 ? blocks : [newBlock()],
  };
}

/**
 * Top-level session editor: date + title + notes + a field array of
 * exercise blocks. On submit, flattens blocks → flat `sets[]` (re-indexed
 * within each exercise so `set_index` is contiguous from 1) and hands
 * the payload to the injected `onSubmit`.
 */
export function SessionEditor({ initial, initialExercises = {}, onSubmit, onSaved }: Props) {
  const { t } = useTranslation('entrenamiento');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const todayISO = todayInTZ();

  const methods = useForm<SessionFormValues>({
    resolver: zodResolver(sessionSchema),
    defaultValues: deriveInitialForm(initial),
  });
  const { control, handleSubmit, register } = methods;

  const blocks = useFieldArray({ control, name: 'blocks' });

  useEffect(() => {
    methods.reset(deriveInitialForm(initial));
    // We intentionally don't depend on methods (stable across renders);
    // reset on initial-row identity change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const onValid: SubmitHandler<SessionFormValues> = async (values) => {
    setError(null);
    setSubmitting(true);
    try {
      const flatSets: SaveWorkoutPayload['sets'] = [];
      for (const block of values.blocks) {
        const filtered = block.sets.filter(
          (s) => Number.isFinite(s.reps) && Number.isFinite(s.weight_kg),
        );
        filtered.forEach((s, idx) => {
          flatSets.push({
            exercise_id: block.exercise_id,
            set_index: idx + 1,
            reps: s.reps,
            weight_kg: s.weight_kg,
            rpe: s.rpe ?? null,
            is_warmup: s.is_warmup,
          });
        });
      }
      const newId = await onSubmit({
        sessionId: initial?.id ?? null,
        performedOn: values.performed_on,
        title: values.title ?? null,
        notes: values.notes ?? null,
        sets: flatSets,
      });
      onSaved?.(typeof newId === 'string' ? newId : initial?.id ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onValid)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="session-date">{t('editor.date')}</Label>
            <Input
              id="session-date"
              type="date"
              {...register('performed_on')}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="session-title">{t('editor.title')}</Label>
            <Input
              id="session-title"
              placeholder={t('editor.titlePlaceholder')}
              {...register('title')}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="session-notes">{t('editor.notes')}</Label>
          <Textarea
            id="session-notes"
            rows={2}
            placeholder={t('editor.notesPlaceholder')}
            {...register('notes')}
          />
        </div>

        <div className="space-y-3">
          {blocks.fields.map((field, i) => (
            <ExerciseBlock
              key={field.id}
              blockIndex={i}
              todayISO={todayISO}
              initialExercise={initialExercises[field.exercise_id] ?? null}
              onRemoveBlock={() => blocks.remove(i)}
            />
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => blocks.append(newBlock())}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-1" />
          {t('editor.addExercise')}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="sticky bottom-0 bg-background pt-2 pb-3 border-t flex justify-end gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? t('editor.saving') : t('editor.save')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
