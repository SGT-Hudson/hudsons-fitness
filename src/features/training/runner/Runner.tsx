import { useEffect, useMemo, useState, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Replace } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
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
import { ExercisePicker } from '../components/ExercisePicker';
import type { Exercise } from '../exercises/api';
import type { AddedExerciseData } from './loadAddedExercise';
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
  /** Resolves an added exercise's plan + prefill. Contractually never rejects
   *  (see loadAddedExercise) — failures come back as a 0 kg fallback. */
  onLoadExercise: (exercise: Exercise) => Promise<AddedExerciseData>;
}

function planLabel(ex: RunnerExercise): string {
  const reps = ex.targetRepsMin === ex.targetRepsMax ? `${ex.targetRepsMin}` : `${ex.targetRepsMin}–${ex.targetRepsMax}`;
  return `${ex.targetSets} × ${reps}`;
}

export function Runner({
  initialState, names, coachContextByExercise, lastTimeByExercise, onSave, onExit, onSaved, onLoadExercise,
}: Props) {
  const { t } = useTranslation('entrenamiento');
  const [state, dispatch] = useReducer(runnerReducer, initialState);
  const [begun, setBegun] = useState(false); // exercise-start gate (per active exercise)
  const [skipAck, setSkipAck] = useState(false); // user chose to save without remaining skipped
  const [showOverview, setShowOverview] = useState(false);
  const [pendingJump, setPendingJump] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  // Added exercises aren't in the props keyed by id, so keep their display data
  // here and merge it over the props. One record, not three parallel maps.
  const [extras, setExtras] = useState<
    Record<string, { name: string; lastTime: string | null; coach: CoachContext }>
  >({});

  const mergedNames = useMemo(() => {
    const out = { ...names };
    for (const [id, e] of Object.entries(extras)) out[id] = e.name;
    return out;
  }, [names, extras]);
  const mergedLastTime = useMemo(() => {
    const out = { ...lastTimeByExercise };
    for (const [id, e] of Object.entries(extras)) out[id] = e.lastTime;
    return out;
  }, [lastTimeByExercise, extras]);
  const mergedCoach = useMemo(() => {
    const out = { ...coachContextByExercise };
    for (const [id, e] of Object.entries(extras)) out[id] = e.coach;
    return out;
  }, [coachContextByExercise, extras]);

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

  function doJump(i: number) {
    dispatch({ type: 'JUMP_TO', exerciseIndex: i, nowMs: Date.now() });
    setShowOverview(false);
    setPendingJump(null);
  }

  async function handleAddExercise(exercise: Exercise) {
    setAdding(true);
    try {
      const data = await onLoadExercise(exercise);
      setExtras((prev) => ({
        ...prev,
        [exercise.id]: { name: data.name, lastTime: data.lastTimeLabel, coach: data.coachContext },
      }));
      dispatch({ type: 'ADD_EXERCISE', exercise: data.input, nowMs: Date.now() });
    } finally {
      setAdding(false);
      setAddOpen(false);
    }
  }

  // Jumping away from an in-progress exercise with logged work-sets warns first
  // (the sets are kept and it's resumable, but it's worth a heads-up). Otherwise
  // jump straight away.
  function requestJump(i: number) {
    const leaving = state.exercises[state.currentExerciseIndex];
    const partial = leaving?.status === 'active' && leaving.sets.some((s) => s.recorded && !s.isWarmup);
    if (partial) setPendingJump(i);
    else doJump(i);
  }

  // The change-exercise button is available throughout the workout (so a
  // mis-tapped jump is always recoverable) but hidden on the final review/skip
  // screens, where the user has already decided to finish.
  const showChange = state.phase !== 'finishing' && !showOverview;
  const header = (
    <div className="flex items-center justify-between gap-2">
      <Button type="button" size="icon" variant="ghost" aria-label={t('runner.exit')} onClick={onExit}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-0 flex-1 truncate text-center text-sm text-muted-foreground">
        {state.routineName} · {t('runner.exercisesShort', { current: state.currentExerciseIndex + 1, total: state.exercises.length })}
      </div>
      {showChange ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="shrink-0"
          aria-label={t('runner.jumpToExercise')}
          onClick={() => setShowOverview(true)}
        >
          <Replace className="mr-1 h-4 w-4" />
          {t('runner.switchExercise')}
        </Button>
      ) : (
        <div className="w-9 shrink-0" />
      )}
    </div>
  );

  if (showOverview) {
    return (
      <div className="flex min-h-[calc(100dvh-12rem)] flex-col gap-3">
        {header}
        <ExerciseOverview
          exercises={state.exercises}
          currentIndex={focusIndex(state) >= 0 ? focusIndex(state) : state.currentExerciseIndex}
          names={mergedNames}
          onJump={requestJump}
          onSkipCurrent={() => { dispatch({ type: 'SKIP_CURRENT', nowMs: Date.now() }); setShowOverview(false); }}
          onFinishEarly={() => { dispatch({ type: 'FINISH_EARLY', nowMs: Date.now() }); setShowOverview(false); }}
          onClose={() => setShowOverview(false)}
          onAddExercise={() => setAddOpen(true)}
        />
        <Dialog open={pendingJump !== null} onOpenChange={(o) => { if (!o) setPendingJump(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('runner.leavePartialTitle')}</DialogTitle>
              <DialogDescription>
                {t('runner.leavePartialBody', { name: mergedNames[ex.exerciseId] ?? ex.exerciseId })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPendingJump(null)}>
                {t('runner.cancel')}
              </Button>
              <Button type="button" onClick={() => { if (pendingJump !== null) doJump(pendingJump); }}>
                {t('runner.switchExercise')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={addOpen} onOpenChange={(o) => { if (!adding) setAddOpen(o); }}>
          <DialogContent className="overflow-visible">
            <DialogHeader>
              <DialogTitle>{t('runner.addExerciseTitle')}</DialogTitle>
              <DialogDescription>{t('runner.addExerciseBody')}</DialogDescription>
            </DialogHeader>
            {adding ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t('runner.addExerciseLoading')}
              </p>
            ) : (
              <ExercisePicker
                selected={null}
                onSelect={handleAddExercise}
                onClear={() => {}}
                excludeIds={state.exercises.map((e) => e.exerciseId)}
              />
            )}
          </DialogContent>
        </Dialog>
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
            names={mergedNames}
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
          names={mergedNames}
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
          exerciseName={mergedNames[ex.exerciseId] ?? ex.exerciseId}
          nextExerciseName={next ? mergedNames[next.exerciseId] ?? next.exerciseId : null}
          nextExercisePlan={next ? planLabel(next) : null}
          onAddSet={() => dispatch({ type: 'ADD_SET', nowMs: Date.now() })}
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
          exerciseName={mergedNames[ex.exerciseId] ?? ex.exerciseId}
          coachContext={mergedCoach[ex.exerciseId] ?? null}
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
        lastTimeLabel={!set.isWarmup ? mergedLastTime[ex.exerciseId] ?? null : null}
        onStartRest={() => dispatch({ type: 'START_REST', nowMs: Date.now() })}
        onRecord={() => dispatch({ type: 'RECORD_SET', nowMs: Date.now() })}
        onEdit={(patch) => dispatch({ type: 'EDIT_CURRENT_SET', patch })}
        onSkipRest={() => dispatch({ type: 'RECORD_SET', nowMs: Date.now() })}
        onAdjustRest={(delta) => dispatch({ type: 'ADJUST_REST', deltaSeconds: delta })}
        onClearRest={() => dispatch({ type: 'CLEAR_REST' })}
        onEndExercise={() => dispatch({ type: 'END_EXERCISE', nowMs: Date.now() })}
      />
    </div>
  );
}
