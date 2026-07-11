import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog';
import { useExercise } from '../exercises/hooks';
import { ExerciseDetail } from './ExerciseDetail';
import type { Exercise } from '../exercises/api';

interface Props {
  /** Pass a ready Exercise (picker / editors) … */
  exercise?: Exercise;
  /** … or an id to fetch on demand (the runner has no full object). */
  exerciseId?: string;
}

/**
 * The in-workout detail affordance: an Info icon-button that opens the exercise
 * detail in a responsive shell (Drawer on mobile, Dialog on desktop). Resolves
 * its data from a passed `exercise`, or fetches by `exerciseId` only while open.
 * Always render this as a SIBLING of a row's primary action — never nested in
 * another button — and it stops event propagation so it never triggers that
 * action or the picker's outside-click close.
 */
export function ExerciseInfoButton({ exercise, exerciseId }: Props) {
  const { t } = useTranslation('entrenamiento');
  const [open, setOpen] = useState(false);

  const query = useExercise(exerciseId, { enabled: open && !exercise && !!exerciseId });
  const resolved = exercise ?? query.data;

  const body = resolved ? (
    <ExerciseDetail exercise={resolved} density="compact" />
  ) : query.isError ? (
    <div className="space-y-3 py-4 text-center">
      <p className="text-sm text-muted-foreground">{t('exerciseDetail.loadError')}</p>
      <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
        {t('exerciseDetail.retry')}
      </Button>
    </div>
  ) : (
    <div role="status" className="space-y-3">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="aspect-4/3 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );

  // h-11 w-11 = 44px (WCAG min tap target); shadcn size="icon" is only 40px.
  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={t('exerciseDetail.openAria')}
      className="h-11 w-11 shrink-0 text-muted-foreground"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
    >
      <Info className="h-4 w-4" />
    </Button>
  );

  return (
    <>
      {trigger}
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={t('exerciseDetail.title')}
        variant="centered"
        className="h-auto max-h-[85vh] overflow-y-auto p-4 md:p-6"
      >
        {body}
      </ResponsiveDialog>
    </>
  );
}
