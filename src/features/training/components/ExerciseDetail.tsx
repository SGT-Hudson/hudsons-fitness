import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ExerciseImageLoop } from './ExerciseImageLoop';
import { exerciseDisplayName, exerciseInstructions, type Exercise } from '../exercises/api';

interface Props {
  exercise: Exercise;
  density: 'compact' | 'full';
}

/**
 * Reusable, presentational exercise detail. `compact` is steps-first (in-workout
 * popup); `full` is visual-first (B2c browse/detail page). Pure — receives a ready
 * Exercise and fetches nothing. Shared B2b→B2c via the `density` prop.
 */
export function ExerciseDetail({ exercise, density }: Props) {
  const { t, i18n } = useTranslation('entrenamiento');
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';
  const name = exerciseDisplayName(exercise, lang);
  const steps = exerciseInstructions(exercise, lang);

  const header = (
    <div className="space-y-1.5">
      <h2 className="text-lg font-semibold leading-tight">{name}</h2>
      <div className="flex flex-wrap gap-1">
        {exercise.primary_muscles.map((code) => (
          <Badge key={code} variant="secondary">
            {t(`exerciseDialog.muscle.${code}`)}
          </Badge>
        ))}
        {exercise.equipment && (
          <Badge variant="secondary">{t(`exerciseDialog.equipment.${exercise.equipment}`)}</Badge>
        )}
        {density === 'full' &&
          exercise.secondary_muscles.map((code) => (
            <Badge key={`sec-${code}`} variant="outline">
              {t(`exerciseDialog.muscle.${code}`)}
            </Badge>
          ))}
        {density === 'full' && exercise.level && (
          <Badge variant="outline">{exercise.level}</Badge>
        )}
      </div>
    </div>
  );

  const imageLoop = (
    <ExerciseImageLoop images={exercise.images} name={name} density={density} />
  );

  const instructions = (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">
        {t('exerciseDetail.instructions')}
      </h3>
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('exerciseDetail.noInstructions')}</p>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}
    </div>
  );

  return (
    <div className={cn('flex flex-col', density === 'compact' ? 'gap-3' : 'gap-4')}>
      {density === 'compact' ? (
        <>
          {header}
          {imageLoop}
          {instructions}
        </>
      ) : (
        <>
          {imageLoop}
          {header}
          {instructions}
        </>
      )}
    </div>
  );
}
