import { useEffect, useState, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CoachContext } from '@/core/training';
import {
  runnerReducer,
  nextPendingIndex,
  focusIndex,
  skippedUndoneIndices,
  toSaveWorkoutSets,
  type RunnerState,
  type RunnerExercise,
} from '@/core/runner';
import type { SaveWorkoutPayload } from '../api';
import { useRestTimer } from './useRestTimer';
import { useWakeLock } from './useWakeLock';
import { useRunnerDraftMirror } from './useRunnerDraft';
import { fireRestAlarm } from './alarm';
import { SetView } from './SetView';
import { ExerciseStart } from './ExerciseStart';
import { CompletionCard } from './CompletionCard';
import { ExerciseOverview } from './ExerciseOverview';
import { SkipRecovery } from './SkipRecovery';
import { ReviewScreen } from './ReviewScreen';

interface Props {
  initialState: RunnerState;
  names: Record<string, string>;
  coachContextByExercise: Record<string, CoachContext>;
  lastTimeByExercise: Record<string, string | null>; // "8 × 80 kg" reference per exercise
  onSave: (payload: SaveWorkoutPayload) => Promise<unknown>;
  onExit: () => void; // back out without saving
  onSaved: () => void; // after a successful save (clears draft + navigates)
}

function planLabel(ex: RunnerExercise): string {
  const reps = ex.targetRepsMin === ex.targetRepsMax ? `${ex.targetRepsMin}` : `${ex.targetRepsMin}–${ex.targetRepsMax}`;
  return `${ex.targetSets} × ${reps}`;
}

export function Runner({
  initialState, names, coachContextByExercise, lastTimeByExercise, onSave, onExit, onSaved,
}: Props) {
  const { t } = useTranslation('entrenamiento');
  const [state, dispatch] = useReducer(runnerReducer, initialState);
  const [begun, setBegun] = useState(false); // exercise-start gate (per active exercise)
  const [skipAck, setSkipAck] = useState(false); // user chose to save without remaining skipped
  const [showOverview, setShowOverview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useRunnerDraftMirror(state);
  useWakeLock(state.phase !== 'finishing');

  const timer = useRestTimer(state.restStartedAtMs, state.restTargetSeconds, fireRestAlarm);

  const ex = state.exercises[state.currentExerciseIndex];
  const set = ex?.sets[state.currentSetIndex];

  // Reset the begin-gate whenever a different exercise becomes active. Each
  // newly-activated exercise re-shows ExerciseStart until the user taps Begin.
  useEffect(() => {
    setBegun(false);
  }, [state.currentExerciseIndex]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        sessionId: null,
        performedOn: state.performedOn,
        title: null,
        notes: null,
        sets: toSaveWorkoutSets(state),
        programId: state.programId,
        routineId: state.routineId,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <div className="flex items-center justify-between">
      <Button type="button" size="icon" variant="ghost" aria-label={t('runner.exit')} onClick={onExit}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm text-muted-foreground">{state.routineName}</span>
      <Button type="button" size="sm" variant="ghost" onClick={() => setShowOverview(true)}>
        {t('runner.exercisesShort', { current: state.currentExerciseIndex + 1, total: state.exercises.length })}
      </Button>
    </div>
  );

  if (showOverview) {
    return (
      <div className="flex min-h-[calc(100dvh-12rem)] flex-col gap-3">
        {header}
        <ExerciseOverview
          exercises={state.exercises}
          currentIndex={focusIndex(state) >= 0 ? focusIndex(state) : state.currentExerciseIndex}
          names={names}
          onJump={(i) => { dispatch({ type: 'JUMP_TO', exerciseIndex: i, nowMs: Date.now() }); setShowOverview(false); }}
          onSkipCurrent={() => { dispatch({ type: 'SKIP_CURRENT', nowMs: Date.now() }); setShowOverview(false); }}
          onFinishEarly={() => { dispatch({ type: 'FINISH_EARLY', nowMs: Date.now() }); setShowOverview(false); }}
          onClose={() => setShowOverview(false)}
        />
      </div>
    );
  }

  if (state.phase === 'finishing') {
    const skipped = skippedUndoneIndices(state).map((i) => state.exercises[i]);
    if (skipped.length > 0 && !skipAck) {
      return (
        <div className="flex min-h-[calc(100dvh-12rem)] flex-col gap-3">
          {header}
          <SkipRecovery
            skipped={skipped}
            names={names}
            indexOf={(e) => state.exercises.indexOf(e)}
            onDoExercise={(i) => { dispatch({ type: 'JUMP_TO', exerciseIndex: i, nowMs: Date.now() }); setSkipAck(false); }}
            onProceed={() => setSkipAck(true)}
          />
        </div>
      );
    }
    return (
      <div className="flex min-h-[calc(100dvh-12rem)] flex-col gap-3">
        {header}
        <ReviewScreen
          exercises={state.exercises}
          names={names}
          routineName={state.routineName}
          saving={saving}
          onSave={handleSave}
        />
        {error && <p className="text-center text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  if (state.phase === 'exercise-complete') {
    const nextIdx = nextPendingIndex(state);
    const next = nextIdx >= 0 ? state.exercises[nextIdx] : null;
    return (
      <div className="flex min-h-[calc(100dvh-12rem)] flex-col gap-3">
        {header}
        <CompletionCard
          exercise={ex}
          exerciseName={names[ex.exerciseId] ?? ex.exerciseId}
          nextExerciseName={next ? names[next.exerciseId] ?? next.exerciseId : null}
          nextExercisePlan={next ? planLabel(next) : null}
          onAddSet={() => dispatch({ type: 'ADD_SET', nowMs: Date.now() })}
          onOpenOverview={() => setShowOverview(true)}
          onContinue={() => dispatch({ type: 'CONTINUE', nowMs: Date.now() })}
        />
      </div>
    );
  }

  // ready / resting on a set
  if (!begun) {
    return (
      <div className="flex min-h-[calc(100dvh-12rem)] flex-col gap-3">
        {header}
        <ExerciseStart
          exercise={ex}
          exerciseName={names[ex.exerciseId] ?? ex.exerciseId}
          coachContext={coachContextByExercise[ex.exerciseId] ?? null}
          onSetWorkingWeight={(kg) => dispatch({ type: 'SET_WORKING_WEIGHT', weightKg: kg })}
          onBegin={() => setBegun(true)}
        />
      </div>
    );
  }

  // Defensive: the state machine guarantees ex/set are defined in ready/resting,
  // but guard against any out-of-range cursor from a hydrated draft.
  if (!ex || !set) return null;

  // ordinal within warm-ups or working sets
  const sameKind = ex.sets.filter((s) => s.isWarmup === set.isWarmup);
  const ordinal = sameKind.findIndex((s) => s.setIndex === set.setIndex) + 1;

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col gap-3">
      {header}
      <SetView
        exercise={ex}
        set={set}
        setOrdinal={{ current: ordinal, total: sameKind.length }}
        phase={state.phase === 'resting' ? 'resting' : 'ready'}
        timer={timer}
        lastTimeLabel={!set.isWarmup ? lastTimeByExercise[ex.exerciseId] ?? null : null}
        onStartRest={() => dispatch({ type: 'START_REST', nowMs: Date.now() })}
        onRecord={() => dispatch({ type: 'RECORD_SET', nowMs: Date.now() })}
        onEdit={(patch) => dispatch({ type: 'EDIT_CURRENT_SET', patch })}
        onSkipRest={() => dispatch({ type: 'RECORD_SET', nowMs: Date.now() })}
        onAdjustRest={(delta) => dispatch({ type: 'ADJUST_REST', deltaSeconds: delta })}
        onClearRest={() => dispatch({ type: 'CLEAR_REST' })}
      />
    </div>
  );
}
