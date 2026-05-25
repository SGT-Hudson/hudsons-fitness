import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { workingSetVolume } from '@/core/training';
import type { RunnerExercise } from '@/core/runner';

interface Props {
  exercise: RunnerExercise;
  exerciseName: string;
  nextExerciseName: string | null;
  nextExercisePlan: string | null;     // e.g. "3 × 10"
  onAddSet: () => void;
  onOpenOverview: () => void;
  onContinue: () => void;
}

/** Exercise-complete beat (spec §0.24): ✓ + volume, +Add set (above), up-next,
 *  Jump-to-overview, Continue (primary, bottom). */
export function CompletionCard({
  exercise, exerciseName, nextExerciseName, nextExercisePlan,
  onAddSet, onOpenOverview, onContinue,
}: Props) {
  const { t } = useTranslation('entrenamiento');
  const recorded = exercise.sets.filter((s) => s.recorded);
  const workingCount = recorded.filter((s) => !s.isWarmup).length;
  const volume = workingSetVolume(
    recorded.map((s) => ({ reps: s.reps, weightKg: s.weightKg, rpe: s.rpe, isWarmup: s.isWarmup })),
  );

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="text-center text-3xl text-primary"><Check className="mx-auto h-8 w-8" /></div>
      <div className="text-center text-base font-bold">{t('runner.exerciseDone', { name: exerciseName })}</div>
      <p className="text-center text-xs text-muted-foreground">
        {t('runner.completeSummary', { sets: workingCount, volume: Math.round(volume) })}
      </p>

      <Button type="button" variant="outline" className="w-full" onClick={onAddSet}>
        {t('runner.addSet')}
      </Button>

      {nextExerciseName && (
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('runner.upNext')}</div>
          <div className="text-base font-bold">{nextExerciseName}</div>
          {nextExercisePlan && <div className="text-sm font-semibold text-[hsl(var(--primary))]">{nextExercisePlan}</div>}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <Button type="button" variant="outline" className="w-full" onClick={onOpenOverview}>
          {t('runner.jumpToExercise')}
        </Button>
        <Button type="button" className="w-full" onClick={onContinue}>{t('runner.continue')}</Button>
      </div>
    </div>
  );
}
