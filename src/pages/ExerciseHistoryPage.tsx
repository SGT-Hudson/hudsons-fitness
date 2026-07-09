import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { PageShell } from '@/components/layout/PageShell';
import { ExerciseHistory } from '@/features/training/components/ExerciseHistory';
import { exerciseDisplayName, type Exercise } from '@/features/training/exercises/api';
import { supabase } from '@/lib/supabase';

export function ExerciseHistoryPage() {
  const { i18n } = useTranslation('entrenamiento');
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';
  const { id } = useParams<{ id: string }>();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void supabase
      .from('exercises')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        setExercise((data as Exercise | null) ?? null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return null;

  return (
    <PageShell title={exercise ? exerciseDisplayName(exercise, lang) : ''} back="/training">
      {loading ? (
        <Skeleton className="h-32" />
      ) : (
        <ExerciseHistory
          exerciseId={id}
          exerciseName={exercise ? exerciseDisplayName(exercise, lang) : ''}
        />
      )}
    </PageShell>
  );
}
