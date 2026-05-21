import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ExerciseHistory } from '@/features/training/components/ExerciseHistory';
import { exerciseDisplayName, type Exercise } from '@/features/training/exercises/api';
import { supabase } from '@/lib/supabase';

export function ExerciseHistoryPage() {
  const { t, i18n } = useTranslation('entrenamiento');
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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild size="icon" variant="ghost" aria-label={t('editor.back')}>
          <Link to="/training">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      {loading ? (
        <Skeleton className="h-32" />
      ) : (
        <ExerciseHistory
          exerciseId={id}
          exerciseName={exercise ? exerciseDisplayName(exercise, lang) : ''}
        />
      )}
    </div>
  );
}
