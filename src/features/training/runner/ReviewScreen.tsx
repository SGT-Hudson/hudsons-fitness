import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RunnerExercise } from '@/core/runner';

interface Props {
  exercises: RunnerExercise[];
  names: Record<string, string>;
  routineName: string;
  saving: boolean;
  onSave: () => void;
}

/** Pre-save review (spec §0.15). Skipped flagged; warm-ups included in saved
 *  sets but the per-exercise count shows working+warm-up recorded. */
export function ReviewScreen({ exercises, names, routineName, saving, onSave }: Props) {
  const { t } = useTranslation('entrenamiento');
  return (
    <div className="flex min-h-[60vh] flex-col gap-2">
      <h2 className="text-center text-base font-bold">{routineName}</h2>
      {exercises.map((ex) => {
        const recorded = ex.sets.filter((s) => s.recorded).length;
        const skipped = ex.status === 'skipped';
        return (
          <div
            key={ex.exerciseId}
            className={cn('flex justify-between rounded-md px-3 py-2 text-sm',
              skipped ? 'bg-muted/30 text-muted-foreground' : 'bg-muted/40')}
          >
            <span>{names[ex.exerciseId] ?? ex.exerciseId}</span>
            <span>{skipped ? t('runner.skipped') : t('runner.setsLogged', { count: recorded })}</span>
          </div>
        );
      })}
      <p className="text-center text-xs text-muted-foreground">{t('runner.reviewNote')}</p>
      <div className="mt-auto">
        <Button type="button" className="w-full" disabled={saving} onClick={onSave}>
          {saving ? t('runner.saving') : t('runner.saveWorkout')}
        </Button>
      </div>
    </div>
  );
}
