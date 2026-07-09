import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { PageShell } from '@/components/layout/PageShell';
import { RoutineBuilder } from '@/features/training/components/RoutineBuilder';
import { useRoutine, useSaveRoutine } from '@/features/training/routines/hooks';
import { supabase } from '@/lib/supabase';
import type { Exercise } from '@/features/training/exercises/api';

export function RoutineEditorPage() {
  const { t } = useTranslation('entrenamiento');
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const routine = useRoutine(isEdit ? id : null);
  const save = useSaveRoutine();
  const [exerciseMap, setExerciseMap] = useState<Record<string, Exercise>>({});

  // Resolve each routine_exercise.exercise_id to a full Exercise row so
  // RoutineBuilder can display exercise names in edit mode.
  useEffect(() => {
    const exercises = routine.data?.routine_exercises;
    if (!exercises || exercises.length === 0) return;
    const ids = Array.from(new Set(exercises.map((re) => re.exercise_id)));
    if (ids.length === 0) return;
    let cancelled = false;
    void supabase
      .from('exercises')
      .select('*')
      .in('id', ids)
      .then(({ data }) => {
        if (cancelled) return;
        const map: Record<string, Exercise> = {};
        for (const ex of data ?? []) map[ex.id] = ex as Exercise;
        setExerciseMap(map);
      });
    return () => {
      cancelled = true;
    };
  }, [routine.data]);

  if (isEdit && routine.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <PageShell title={isEdit ? t('routine.editTitle') : t('routine.newTitle')} back="/routine">
      <RoutineBuilder
        initial={routine.data ?? null}
        initialExercises={exerciseMap}
        onSubmit={(payload) => save.mutateAsync(payload)}
        onSaved={() => navigate('/routine')}
      />
    </PageShell>
  );
}
