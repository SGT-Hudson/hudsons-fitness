import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageShell } from '@/components/layout/PageShell';
import { QueryErrorState } from '@/components/QueryErrorState';
import { ExerciseDetail } from '@/features/training/components/ExerciseDetail';
import {
  AddExerciseSheet,
  type AddExerciseEntry,
  type AddExerciseRoutineOption,
} from '@/features/training/components/AddExerciseSheet';
import { useExercise } from '@/features/training/exercises/hooks';
import { exerciseDisplayName } from '@/features/training/exercises/api';
import { useRoutines, useSaveRoutine } from '@/features/training/routines/hooks';
import { useActiveProgram } from '@/features/training/programs/hooks';
import { buildAppendExercisePayload } from '@/features/training/routines/appendExercise';
import { nextScheduledRoutine, prefillSetsFromRoutine } from '@/core/programs';
import { todayInTZ } from '@/lib/dates';

export function ExerciseDetailPage() {
  const { t, i18n } = useTranslation('entrenamiento');
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useExercise(id);

  const [addOpen, setAddOpen] = useState(false);
  const routines = useRoutines();
  const activeProgram = useActiveProgram();
  const saveRoutine = useSaveRoutine();

  // Routine options with the one the active program trains next on top, so
  // "add it to what I do next" is the default without inventing a session.
  const routineOptions: AddExerciseRoutineOption[] = useMemo(() => {
    const rows = routines.data ?? [];
    const program = activeProgram.data;
    const next = program
      ? nextScheduledRoutine(
          program.program_days.map((d) => ({
            dayIndex: d.day_index,
            isRest: d.is_rest,
            routineId: d.routine_id,
          })),
          program.anchor_date ?? todayInTZ(),
          todayInTZ(),
          new Set(rows.map((r) => r.id)),
        )
      : null;
    const options = rows.map((r) => ({
      id: r.id,
      name: r.name,
      daysAhead: next && next.routineId === r.id ? next.daysAhead : null,
    }));
    return options.sort((a, b) => Number(b.daysAhead !== null) - Number(a.daysAhead !== null));
  }, [routines.data, activeProgram.data]);

  function handleAddToRoutine(routineId: string, entry: AddExerciseEntry) {
    const routine = (routines.data ?? []).find((r) => r.id === routineId);
    if (!routine || !data) return;
    saveRoutine.mutate(
      buildAppendExercisePayload(routine, { exercise_id: data.id, ...entry }),
      { onSuccess: () => setAddOpen(false) },
    );
  }

  function handleTrainNow(entry: AddExerciseEntry) {
    if (!data) return;
    const exercises = prefillSetsFromRoutine([
      {
        exerciseId: data.id,
        position: 1,
        targetSets: entry.target_sets,
        targetRepsMin: entry.target_reps_min,
        targetRepsMax: entry.target_reps_max,
        restSeconds: null,
        targetRpe: null,
        warmupSets: [],
        lastWorkingWeightKg: null,
      },
    ]);
    setAddOpen(false);
    navigate('/training/new', {
      state: {
        prefill: { programId: null, routineId: null, exercises, exercisesById: { [data.id]: data } },
      },
    });
  }

  const notFoundState = (
    <div className="space-y-3 py-10 text-center">
      <h1 className="text-lg font-semibold">{t('browse.notFound.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('browse.notFound.body')}</p>
      <Button asChild variant="outline"><Link to="/exercises">{t('browse.notFound.back')}</Link></Button>
    </div>
  );

  return (
    <PageShell
      title={t('exerciseDetail.title')}
      back={() => (window.history.length > 1 ? navigate(-1) : navigate('/exercises'))}
    >
      {isLoading ? (
        <div role="status" className="space-y-3">
          <Skeleton className="aspect-4/3 w-full" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : isError ? (
        <QueryErrorState error={error} notFound={notFoundState} onRetry={() => void refetch()} />
      ) : !data ? (
        notFoundState
      ) : (
        <div className="space-y-4">
          <ExerciseDetail exercise={data} density="full" />
          <Button className="w-full sm:w-auto" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            {t('addFromDetail.open')}
          </Button>
          <AddExerciseSheet
            open={addOpen}
            onOpenChange={setAddOpen}
            exerciseName={exerciseDisplayName(data, lang)}
            routines={routineOptions}
            isSaving={saveRoutine.isPending}
            onAddToRoutine={handleAddToRoutine}
            onTrainNow={handleTrainNow}
          />
        </div>
      )}
    </PageShell>
  );
}
