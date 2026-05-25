import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { RunnerExercise, RunnerSet } from '@/core/runner';
import type { RestTimerView } from './useRestTimer';
import { RestTimerBand } from './RestTimerBand';
import { RpeInput } from './RpeInput';

interface Props {
  exercise: RunnerExercise;
  set: RunnerSet;
  setOrdinal: { current: number; total: number };  // 1-based working/warm-up position
  phase: 'ready' | 'resting';
  timer: RestTimerView;
  lastTimeLabel: string | null;
  onStartRest: () => void;
  onRecord: () => void;
  onEdit: (patch: Partial<Pick<RunnerSet, 'reps' | 'weightKg' | 'rpe'>>) => void;
  onSkipRest: () => void;
  onAdjustRest: (delta: number) => void;
}

/** One set, two states. READY: white read-only values + "Start rest".
 *  RESTING: editable reps/weight steppers (+ RPE on working sets) + "Record".
 *  (spec §0.20) */
export function SetView(props: Props) {
  const { exercise, set, setOrdinal, phase, timer, lastTimeLabel } = props;
  const { t } = useTranslation('entrenamiento');
  const editing = phase === 'resting';
  const inc = exercise.defaultIncrementKg;
  const title = set.isWarmup
    ? t('runner.warmupN', { n: setOrdinal.current, total: setOrdinal.total })
    : t('runner.setN', { n: setOrdinal.current, total: setOrdinal.total });

  return (
    <div className="flex flex-col gap-3">
      {editing && (
        <RestTimerBand timer={timer} onSkip={props.onSkipRest} onAdjust={props.onAdjustRest} />
      )}

      <div className="text-center text-lg font-bold">{title}</div>
      {lastTimeLabel && <p className="text-center text-xs text-muted-foreground">{lastTimeLabel}</p>}

      {editing ? (
        <>
          <Stepper
            label={t('runner.reps')}
            value={set.reps}
            onChange={(v) => props.onEdit({ reps: Math.max(0, v) })}
            step={1}
          />
          <Stepper
            label={t('runner.weight')}
            value={set.weightKg}
            onChange={(v) => props.onEdit({ weightKg: Math.max(0, v) })}
            step={inc}
            accent
          />
          {!set.isWarmup && (
            <RpeInput value={set.rpe} targetRpe={exercise.targetRpe} onChange={(rpe) => props.onEdit({ rpe })} />
          )}
        </>
      ) : (
        <>
          <ReadOnly value={`${set.reps} ${t('runner.repsShort')}`} />
          <ReadOnly value={`${set.weightKg} kg`} />
        </>
      )}

      <div className="mt-1">
        {editing ? (
          <Button type="button" className="w-full" onClick={props.onRecord}>
            {set.isWarmup ? t('runner.recordWarmup') : t('runner.recordSet')}
          </Button>
        ) : (
          <Button type="button" className="w-full" onClick={props.onStartRest}>
            {t('runner.startRest')}
          </Button>
        )}
      </div>
    </div>
  );
}

function ReadOnly({ value }: { value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 py-2 text-center text-base font-bold text-foreground">
      {value}
    </div>
  );
}

function Stepper({
  label, value, onChange, step, accent,
}: { label: string; value: number; onChange: (v: number) => void; step: number; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-2 py-1.5">
      <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label={`${label} -`} onClick={() => onChange(round(value - step))}>
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        type="number"
        inputMode="decimal"
        aria-label={label}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className={accent ? 'h-9 text-center font-semibold text-[hsl(var(--primary))]' : 'h-9 text-center font-semibold'}
      />
      <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label={`${label} +`} onClick={() => onChange(round(value + step))}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
