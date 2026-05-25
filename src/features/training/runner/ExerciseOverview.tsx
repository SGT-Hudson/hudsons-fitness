import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RunnerExercise } from '@/core/runner';

interface Props {
  exercises: RunnerExercise[];
  currentIndex: number;
  names: Record<string, string>;
  onJump: (index: number) => void;
  onSkipCurrent: () => void;
  onFinishEarly: () => void;
  onClose: () => void;
}

/** Jump / skip / finish-early (spec §2 frame 9). Jump targets any
 *  remaining/skipped exercise. */
export function ExerciseOverview({
  exercises, currentIndex, names, onJump, onSkipCurrent, onFinishEarly, onClose,
}: Props) {
  const { t } = useTranslation('entrenamiento');
  return (
    <div className="flex flex-1 flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">{t('runner.jumpToExercise')}</h2>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>{t('runner.close')}</Button>
      </div>
      {exercises.map((ex, i) => {
        const done = ex.status === 'done';
        const skipped = ex.status === 'skipped';
        const isCurrent = i === currentIndex;
        const canJump = !isCurrent && (ex.status === 'pending' || skipped);
        return (
          <button
            key={ex.exerciseId}
            type="button"
            disabled={!canJump}
            onClick={() => canJump && onJump(i)}
            className={cn(
              'flex items-center justify-between rounded-md px-3 py-2 text-sm text-left',
              done && 'bg-muted/40 text-muted-foreground',
              skipped && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
              isCurrent && 'border border-primary/50 bg-primary/10',
              !done && !skipped && !isCurrent && 'bg-muted/30',
            )}
          >
            <span>{ex.position} · {names[ex.exerciseId] ?? ex.exerciseId}</span>
            <span>
              {done ? '✓' : isCurrent ? t('runner.now') : skipped ? t('runner.skippedDoIt') : t('runner.jump')}
            </span>
          </button>
        );
      })}
      <div className="mt-auto flex flex-col gap-2">
        <Button type="button" variant="outline" className="w-full" onClick={onSkipCurrent}>{t('runner.skipCurrent')}</Button>
        <Button type="button" variant="destructive" className="w-full" onClick={onFinishEarly}>{t('runner.finishEarly')}</Button>
      </div>
    </div>
  );
}
