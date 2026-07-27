import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RunnerExercise } from '@/core/runner';
import { ExerciseInfoButton } from '@/features/training/components/ExerciseInfoButton';

interface Props {
  exercises: RunnerExercise[];
  currentIndex: number;
  names: Record<string, string>;
  onJump: (index: number) => void;
  onSkipCurrent: () => void;
  onFinishEarly: () => void;
  onClose: () => void;
  onAddExercise: () => void;
}

/** Jump / skip / finish-early (spec §2 frame 9). Jump targets any
 *  remaining/skipped exercise. */
export function ExerciseOverview({
  exercises, currentIndex, names, onJump, onSkipCurrent, onFinishEarly, onClose, onAddExercise,
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
        const partial = ex.status === 'partial';
        const isCurrent = i === currentIndex;
        const canJump = !isCurrent && (ex.status === 'pending' || skipped || partial);
        return (
          <div key={ex.exerciseId} className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canJump}
              onClick={() => canJump && onJump(i)}
              className={cn(
                'flex flex-1 items-center justify-between rounded-md px-3 py-2 text-sm text-left',
                done && 'bg-muted/40 text-muted-foreground',
                skipped && 'bg-amber-soft text-amber-ink',
                partial && 'bg-gym-soft text-gym-ink',
                isCurrent && 'border border-primary/50 bg-primary/10',
                !done && !skipped && !partial && !isCurrent && 'bg-muted/30',
              )}
            >
              <span>{ex.position} · {names[ex.exerciseId] ?? ex.exerciseId}</span>
              <span>
                {done
                  ? '✓'
                  : isCurrent
                    ? t('runner.now')
                    : skipped
                      ? t('runner.skippedDoIt')
                      : partial
                        ? t('runner.partialDoIt')
                        : t('runner.jump')}
              </span>
            </button>
            <ExerciseInfoButton exerciseId={ex.exerciseId} />
          </div>
        );
      })}
      <div className="mt-auto flex flex-col gap-2">
        <Button type="button" variant="secondary" className="w-full" onClick={onAddExercise}>
          {t('runner.addExercise')}
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={onSkipCurrent}>{t('runner.skipCurrent')}</Button>
        <Button type="button" variant="destructive" className="w-full" onClick={onFinishEarly}>{t('runner.finishEarly')}</Button>
      </div>
    </div>
  );
}
