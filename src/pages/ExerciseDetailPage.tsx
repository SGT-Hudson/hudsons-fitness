import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ExerciseDetail } from '@/features/training/components/ExerciseDetail';
import { useExercise } from '@/features/training/exercises/hooks';

export function ExerciseDetailPage() {
  const { t } = useTranslation('entrenamiento');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useExercise(id);

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        className="gap-2 -ml-2"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/exercises'))}
      >
        <ArrowLeft className="h-4 w-4" />
        {t('browse.back')}
      </Button>

      {isLoading ? (
        <div role="status" className="space-y-3">
          <Skeleton className="aspect-4/3 w-full" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : isError || !data ? (
        <div className="space-y-3 py-10 text-center">
          <h1 className="text-lg font-semibold">{t('browse.notFound.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('browse.notFound.body')}</p>
          <Button asChild variant="outline"><Link to="/exercises">{t('browse.notFound.back')}</Link></Button>
        </div>
      ) : (
        <ExerciseDetail exercise={data} density="full" />
      )}
    </div>
  );
}
