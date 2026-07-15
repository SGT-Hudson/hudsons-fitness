import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { RunnerExercise } from '@/core/runner';

interface Props {
  skipped: RunnerExercise[];
  names: Record<string, string>;
  onDoExercise: (index: number) => void;
  indexOf: (ex: RunnerExercise) => number;
  onProceed: () => void;
}

/** Finish-time prompt surfacing undone skipped exercises (spec §0.23). */
export function SkipRecovery({ skipped, names, onDoExercise, indexOf, onProceed }: Props) {
  const { t } = useTranslation('entrenamiento');
  return (
    <div className="flex flex-1 flex-col gap-3">
      <h2 className="text-center text-lg font-bold">{t('runner.finishQuestion')}</h2>
      <p className="text-center text-xs text-muted-foreground">{t('runner.skippedCount', { count: skipped.length })}</p>
      <div className="space-y-1">
        {skipped.map((ex) => (
          <div key={ex.exerciseId} className="flex justify-between rounded-md bg-amber-soft px-3 py-2 text-sm">
            <span>{names[ex.exerciseId] ?? ex.exerciseId}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => onDoExercise(indexOf(ex))}>
              {t('runner.doNow')}
            </Button>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">{t('runner.skippedNotSaved')}</p>
      <div className="mt-auto">
        <Button type="button" className="w-full" onClick={onProceed}>{t('runner.saveWithout')}</Button>
      </div>
    </div>
  );
}
