import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild size="icon" variant="ghost" aria-label={t('routine.back')}>
          <Link to="/routine">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isEdit ? t('routine.editTitle') : t('routine.newTitle')}
        </h1>
      </div>

      <RoutineBuilder
        initial={routine.data ?? null}
        initialExercises={exerciseMap}
        onSubmit={(payload) => save.mutateAsync(payload)}
        onSaved={() => navigate('/routine')}
      />
    </div>
  );
}
