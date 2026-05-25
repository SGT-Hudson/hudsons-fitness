import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { evaluateCoach, type CoachContext } from '@/core/training';
import type { RunnerExercise } from '@/core/runner';

interface Props {
  exercise: RunnerExercise;
  exerciseName: string;
  coachContext: CoachContext | null;  // null until history resolves
  onSetWorkingWeight: (kg: number) => void;
  onBegin: () => void;
}

/** Exercise-start screen: large name, editable working-weight anchor, ONE quiet
 *  coach line (top suggestion), and the plan. (spec §2 frame 2, §5.2) */
export function ExerciseStart({ exercise, exerciseName, coachContext, onSetWorkingWeight, onBegin }: Props) {
  const { t } = useTranslation('entrenamiento');
  const tc = useTranslation('coach').t;
  const top = coachContext ? evaluateCoach(coachContext)[0] ?? null : null;
  const warmups = exercise.sets.filter((s) => s.isWarmup);
  const working = exercise.sets.filter((s) => !s.isWarmup);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-center text-xl font-extrabold">{exerciseName}</h2>

      <div className="rounded-lg border p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('runner.workingWeight')}</div>
        <Input
          type="number"
          inputMode="decimal"
          step={exercise.defaultIncrementKg}
          min={0}
          aria-label={t('runner.workingWeight')}
          value={exercise.workingWeightKg || ''}
          onChange={(e) => onSetWorkingWeight(Math.max(0, Number(e.target.value)))}
          className="mt-1 h-9 font-semibold"
        />
      </div>

      {top && (
        <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-2 text-xs">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span>{tc(top.headline, top.detail)}</span>
        </div>
      )}

      <div className="space-y-1">
        {warmups.map((w) => (
          <div key={w.setIndex} className="flex justify-between rounded-md bg-muted/40 px-2 py-1 text-sm">
            <span>{t('runner.warmup')} · {w.weightKg || '—'} kg</span>
            <span>× {w.reps}</span>
          </div>
        ))}
        <div className="flex justify-between rounded-md bg-muted/40 px-2 py-1 text-sm">
          <span>{t('runner.setsN', { count: working.length })}</span>
          <span>{exercise.targetRepsMin === exercise.targetRepsMax ? exercise.targetRepsMin : `${exercise.targetRepsMin}–${exercise.targetRepsMax}`} {t('runner.repsShort')}</span>
        </div>
      </div>

      <Button type="button" className="w-full" onClick={onBegin}>{t('runner.begin')}</Button>
    </div>
  );
}
