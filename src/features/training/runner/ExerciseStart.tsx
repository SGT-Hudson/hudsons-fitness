import { useTranslation } from 'react-i18next';
import { Minus, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDecimalDraft } from '@/components/ui/useDecimalDraft';
import { evaluateCoach, type CoachContext } from '@/core/training';
import { useNum } from '@/hooks/useNum';
import type { RunnerExercise } from '@/core/runner';

interface Props {
  exercise: RunnerExercise;
  exerciseName: string;
  coachContext: CoachContext | null;  // null until history resolves
  onSetWorkingWeight: (kg: number) => void;
  onBegin: () => void;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Exercise-start screen: large name, editable working-weight anchor (borderless
 *  stepper), ONE quiet coach line, the plan with prominent sets×reps, and the
 *  Begin button pinned to the bottom. (spec §2 frame 2, §5.2) */
export function ExerciseStart({ exercise, exerciseName, coachContext, onSetWorkingWeight, onBegin }: Props) {
  const { t } = useTranslation('entrenamiento');
  const num = useNum();
  const tc = useTranslation('coach').t;
  const top = coachContext ? evaluateCoach(coachContext)[0] ?? null : null;
  const warmups = exercise.sets.filter((s) => s.isWarmup);
  const working = exercise.sets.filter((s) => !s.isWarmup);
  const inc = exercise.defaultIncrementKg;
  const ww = exercise.workingWeightKg;
  // `ww || ''` keeps the anchor blank at 0 rather than showing a bare "0".
  const weight = useDecimalDraft(ww ? String(ww) : '', (n) => onSetWorkingWeight(Math.max(0, n)));
  const reps =
    exercise.targetRepsMin === exercise.targetRepsMax
      ? `${exercise.targetRepsMin}`
      : `${exercise.targetRepsMin}–${exercise.targetRepsMax}`;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h2 className="text-center text-xl font-extrabold">{exerciseName}</h2>

      {/* Working weight — borderless stepper. Tap the number to type, ±/+ step by increment. */}
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('runner.workingWeight')}</div>
        <div className="mt-1 flex items-center justify-center gap-4">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-10 w-10 rounded-full"
            aria-label={`${t('runner.workingWeight')} −`}
            onClick={() => onSetWorkingWeight(Math.max(0, round(ww - inc)))}
          >
            <Minus className="h-5 w-5" />
          </Button>
          <div className="flex items-baseline gap-1">
            {/* The working weight is a decimal, so it must be `type="text"
                inputMode="decimal"` — a `type="number"` element strips a typed
                comma and would turn `82,5` into 825 kg. It stays a raw <input>
                rather than a `NumberField`: this is the borderless 4xl anchor,
                baseline-aligned with the "kg" beside it, and NumberField's
                wrapper + shadcn Input styling exist for form rows, not for this.
                The boundary that matters — `parseDecimalInput`, via
                `useDecimalDraft` — is the shared one either way. */}
            <input
              type="text"
              inputMode="decimal"
              aria-label={t('runner.workingWeight')}
              {...weight}
              className="w-24 border-0 bg-transparent p-0 text-center text-4xl font-bold tabular-nums focus:outline-hidden focus:ring-0"
            />
            <span className="text-lg font-medium text-muted-foreground">kg</span>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-10 w-10 rounded-full"
            aria-label={`${t('runner.workingWeight')} +`}
            onClick={() => onSetWorkingWeight(round(ww + inc))}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {top && (
        <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-2 text-xs">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span>{tc(top.headline, top.detail)}</span>
        </div>
      )}

      {warmups.length > 0 && (
        <div className="space-y-1">
          {warmups.map((w) => (
            <div key={w.setIndex} className="flex justify-between rounded-md bg-muted/40 px-2 py-1 text-sm">
              <span>{t('runner.warmup')} · {w.weightKg ? num.qty(w.weightKg) : '—'} kg</span>
              <span>× {w.reps}</span>
            </div>
          ))}
        </div>
      )}

      {/* Plan — prominent sets × reps */}
      <div className="flex items-center justify-center gap-8 py-1">
        <div className="text-center">
          <div className="text-3xl font-bold tabular-nums">{working.length}</div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('runner.seriesShort')}</div>
        </div>
        <div className="h-9 w-px bg-border" />
        <div className="text-center">
          <div className="text-3xl font-bold tabular-nums">{reps}</div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('runner.repsShort')}</div>
        </div>
      </div>

      <div className="mt-auto">
        <Button type="button" className="w-full" onClick={onBegin}>{t('runner.begin')}</Button>
      </div>
    </div>
  );
}
