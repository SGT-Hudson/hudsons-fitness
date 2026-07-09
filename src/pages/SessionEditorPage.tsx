import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { PageShell } from '@/components/layout/PageShell';
import { SessionEditor } from '@/features/training/components/SessionEditor';
import { useSaveWorkout, useSession } from '@/features/training/hooks';
import { supabase } from '@/lib/supabase';
import type { Exercise } from '@/features/training/exercises/api';
import type { PrefillExercise } from '@/core/programs';

export function SessionEditorPage() {
  const { t } = useTranslation('entrenamiento');
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const session = useSession(isEdit ? id : null);
  const save = useSaveWorkout();
  const [exerciseMap, setExerciseMap] = useState<Record<string, Exercise>>({});

  const prefill = (location.state as { prefill?: {
    programId: string | null;
    routineId: string | null;
    exercises: PrefillExercise[];
    exercisesById: Record<string, Exercise>;
  } } | null)?.prefill ?? null;

  // For edit mode: resolve every distinct exercise_id in the session to a
  // full Exercise row so ExerciseBlock can render the name + use the row
  // in the coach context. One query per page load.
  useEffect(() => {
    const sets = session.data?.workout_sets;
    if (!sets || sets.length === 0) return;
    const ids = Array.from(new Set(sets.map((s) => s.exercise_id)));
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
  }, [session.data]);

  if (isEdit && session.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <PageShell title={isEdit ? t('editor.editTitle') : t('editor.newTitle')} back="/training">
      <SessionEditor
        initial={session.data ?? null}
        initialExercises={exerciseMap}
        prefill={prefill}
        onSubmit={(payload) => save.mutateAsync(payload)}
        onSaved={() => navigate('/training')}
      />
    </PageShell>
  );
}
