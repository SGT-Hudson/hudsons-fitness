/**
 * Pure runner state model (spec §2, §3). No clock, no I/O — callers pass
 * `nowMs`/ISO dates and persist the returned state. Timer remaining-time is
 * derived from a start timestamp + target (spec §3.3) so a backgrounded tab
 * shows correct time on return.
 */

import { warmupWeightKg } from './programs';
import type { SaveWorkoutSet } from '@/features/training/api';

export interface TimerView {
  isCountUp: boolean;
  elapsedSeconds: number;
  remainingSeconds: number;
  overSeconds: number;
  done: boolean;
}

/** Timer view from a start timestamp + optional target (null ⇒ count-up). */
export function computeTimerView(
  startedAtMs: number,
  targetSeconds: number | null,
  nowMs: number,
): TimerView {
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  if (targetSeconds == null) {
    return { isCountUp: true, elapsedSeconds, remainingSeconds: 0, overSeconds: 0, done: false };
  }
  const remainingSeconds = Math.max(0, targetSeconds - elapsedSeconds);
  const overSeconds = Math.max(0, elapsedSeconds - targetSeconds);
  return {
    isCountUp: false,
    elapsedSeconds,
    remainingSeconds,
    overSeconds,
    done: elapsedSeconds >= targetSeconds,
  };
}

export type ExerciseStatus = 'pending' | 'active' | 'partial' | 'done' | 'skipped';
export type RunnerPhase = 'ready' | 'resting' | 'exercise-complete' | 'finishing';

export interface RunnerSet {
  setIndex: number;            // 1-based, contiguous per exercise (warm-ups first)
  isWarmup: boolean;
  pct: number | null;          // warm-up: % of working weight; null for working sets
  reps: number;
  weightKg: number;            // 0 when unknown/blank
  rpe: number | null;          // working sets only
  recorded: boolean;
  /** The "expected" reps/weight shown when the set loaded (the prefill = last
   *  time / suggestion). Used to colour the logged value: more → up, equal →
   *  neutral, less → down. null when there's nothing to compare against
   *  (warm-ups, or no history). */
  baselineReps: number | null;
  baselineWeightKg: number | null;
}

export interface RunnerExercise {
  exerciseId: string;
  position: number;            // 1-based fixed routine order
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number | null;
  targetRpe: number | null;
  defaultIncrementKg: number;  // weight stepper increment
  workingWeightKg: number;     // editable anchor (0 = unknown)
  warmupPrescriptions: { pct: number; reps: number }[];
  sets: RunnerSet[];
  status: ExerciseStatus;
}

export interface RunnerState {
  programId: string | null;
  routineId: string | null;
  routineName: string;
  performedOn: string;         // ISO date
  startedAtMs: number;
  savedAtMs: number;           // last activity (for "X min ago")
  exercises: RunnerExercise[];
  currentExerciseIndex: number;
  currentSetIndex: number;
  phase: RunnerPhase;
  restStartedAtMs: number | null;
  restTargetSeconds: number | null; // null ⇒ count-up
}

export interface RunnerInputExercise {
  exerciseId: string;
  position: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number | null;
  targetRpe: number | null;
  defaultIncrementKg: number;
  warmupSets: { pct: number; reps: number }[];
  lastWorkingWeightKg: number | null;
  workingSetPrefill: { reps: number; weightKg: number | null }[];
}

export interface RunnerInput {
  programId: string | null;
  routineId: string | null;
  routineName: string;
  performedOn: string;
  nowMs: number;
  exercises: RunnerInputExercise[];
}

function buildSets(ex: RunnerInputExercise, workingWeightKg: number, incrementKg: number): RunnerSet[] {
  const sets: RunnerSet[] = [];
  let idx = 1;
  for (const w of ex.warmupSets) {
    sets.push({
      setIndex: idx++,
      isWarmup: true,
      pct: w.pct,
      reps: w.reps,
      weightKg: workingWeightKg > 0 ? warmupWeightKg(workingWeightKg, w.pct, incrementKg) : 0,
      rpe: null,
      recorded: false,
      baselineReps: null,      // warm-ups aren't graded for progression
      baselineWeightKg: null,
    });
  }
  ex.workingSetPrefill.forEach((p) => {
    sets.push({
      setIndex: idx++,
      isWarmup: false,
      pct: null,
      reps: p.reps,
      weightKg: p.weightKg ?? 0,
      rpe: ex.targetRpe,
      recorded: false,
      baselineReps: p.reps,
      baselineWeightKg: p.weightKg,  // null when no history → no weight colouring
    });
  });
  return sets;
}

/** The runner-exercise shape a caller adds mid-workout: same as a routine
 *  exercise minus the position, which the reducer assigns. */
export type AddedExerciseInput = Omit<RunnerInputExercise, 'position'>;

function buildRunnerExercise(
  ex: RunnerInputExercise,
  status: ExerciseStatus,
): RunnerExercise {
  const workingWeightKg = ex.lastWorkingWeightKg ?? 0;
  const defaultIncrementKg = ex.defaultIncrementKg > 0 ? ex.defaultIncrementKg : 2.5;
  return {
    exerciseId: ex.exerciseId,
    position: ex.position,
    targetSets: ex.targetSets,
    targetRepsMin: ex.targetRepsMin,
    targetRepsMax: ex.targetRepsMax,
    restSeconds: ex.restSeconds,
    targetRpe: ex.targetRpe,
    defaultIncrementKg,
    workingWeightKg,
    warmupPrescriptions: ex.warmupSets,
    sets: buildSets(ex, workingWeightKg, defaultIncrementKg),
    status,
  } satisfies RunnerExercise;
}

export function buildRunnerState(input: RunnerInput): RunnerState {
  const exercises: RunnerExercise[] = [...input.exercises]
    .sort((a, b) => a.position - b.position)
    .map((ex, i) => buildRunnerExercise(ex, i === 0 ? 'active' : 'pending'));

  return {
    programId: input.programId,
    routineId: input.routineId,
    routineName: input.routineName,
    performedOn: input.performedOn,
    startedAtMs: input.nowMs,
    savedAtMs: input.nowMs,
    exercises,
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    phase: 'ready',
    restStartedAtMs: null,
    restTargetSeconds: null,
  };
}

// ---------------------------------------------------------------------------
// Reducer — Task 4 (edit/weight/rest/record) + Task 5 stubs
// ---------------------------------------------------------------------------

export type RunnerAction =
  | { type: 'SET_WORKING_WEIGHT'; weightKg: number }
  | { type: 'EDIT_CURRENT_SET'; patch: Partial<Pick<RunnerSet, 'reps' | 'weightKg' | 'rpe'>> }
  | { type: 'START_REST'; nowMs: number }
  | { type: 'RECORD_SET'; nowMs: number }
  | { type: 'ADD_SET'; nowMs: number }
  | { type: 'ADD_EXERCISE'; exercise: AddedExerciseInput; nowMs: number }
  | { type: 'CONTINUE'; nowMs: number }
  | { type: 'JUMP_TO'; exerciseIndex: number; nowMs: number }
  | { type: 'SKIP_CURRENT'; nowMs: number }
  | { type: 'END_EXERCISE'; nowMs: number }
  | { type: 'FINISH_EARLY'; nowMs: number }
  | { type: 'ADJUST_REST'; deltaSeconds: number }
  | { type: 'CLEAR_REST' };

function replaceExercise(
  state: RunnerState,
  index: number,
  fn: (ex: RunnerExercise) => RunnerExercise,
): RunnerExercise[] {
  return state.exercises.map((ex, i) => (i === index ? fn(ex) : ex));
}

function recomputeWarmups(ex: RunnerExercise): RunnerExercise {
  return {
    ...ex,
    sets: ex.sets.map((s) =>
      s.isWarmup && s.pct != null && !s.recorded
        ? { ...s, weightKg: ex.workingWeightKg > 0 ? warmupWeightKg(ex.workingWeightKg, s.pct, ex.defaultIncrementKg) : 0 }
        : s,
    ),
  };
}

function actionNow(action: RunnerAction, fallback: number): number {
  return 'nowMs' in action ? action.nowMs : fallback;
}

export function nextPendingIndex(state: RunnerState): number {
  return state.exercises.findIndex((e) => e.status === 'pending');
}

export function skippedUndoneIndices(state: RunnerState): number[] {
  return state.exercises
    .map((e, i) => (e.status === 'skipped' ? i : -1))
    .filter((i) => i >= 0);
}

/** The exercise the user is about to perform: the active one when a set is in
 *  progress, otherwise the next pending exercise (e.g. on the completion card,
 *  the current exercise is already done — focus is the up-next). -1 when none
 *  remain. "Skip current" and the overview highlight both follow this so they
 *  never target a finished exercise. */
export function focusIndex(state: RunnerState): number {
  const cur = state.exercises[state.currentExerciseIndex];
  if (cur && cur.status === 'active') return state.currentExerciseIndex;
  return nextPendingIndex(state);
}

function activate(state: RunnerState, index: number): RunnerState {
  if (index < 0 || index >= state.exercises.length) return state;
  const leavingIdx = state.currentExerciseIndex;
  const exercises = state.exercises.map((e, i) => {
    if (i === index) return { ...e, status: 'active' as ExerciseStatus };
    // Demote the exercise we're leaving so it stays reachable (was a bug: it
    // stayed 'active' → showed "jump" but wasn't clickable). If real work was
    // logged it's 'partial' (resume later); otherwise back to 'pending'.
    if (i === leavingIdx && e.status === 'active') {
      const startedRealWork = e.sets.some((s) => s.recorded && !s.isWarmup);
      return { ...e, status: (startedRealWork ? 'partial' : 'pending') as ExerciseStatus };
    }
    return e;
  });
  const firstUnrecorded = Math.max(0, exercises[index].sets.findIndex((s) => !s.recorded));
  return {
    ...state,
    exercises,
    currentExerciseIndex: index,
    currentSetIndex: firstUnrecorded,
    phase: 'ready',
    restStartedAtMs: null,
    restTargetSeconds: null,
  };
}

function advanceOrFinish(state: RunnerState): RunnerState {
  const idx = nextPendingIndex(state);
  if (idx >= 0) return activate(state, idx);
  return { ...state, phase: 'finishing' };
}

function navigationReducer(
  state: RunnerState,
  action: RunnerAction,
  touch: (s: RunnerState) => RunnerState,
): RunnerState {
  const ci = state.currentExerciseIndex;
  switch (action.type) {
    case 'ADD_SET': {
      const ex = state.exercises[ci];
      const lastWorking = [...ex.sets].reverse().find((s) => !s.isWarmup);
      const newReps = lastWorking?.reps ?? ex.targetRepsMin;
      const newWeight = lastWorking && lastWorking.weightKg > 0 ? lastWorking.weightKg : ex.workingWeightKg;
      const newSet: RunnerSet = {
        setIndex: ex.sets.length + 1,
        isWarmup: false,
        pct: null,
        reps: newReps,
        weightKg: newWeight,
        rpe: ex.targetRpe,
        recorded: false,
        baselineReps: newReps,
        baselineWeightKg: newWeight > 0 ? newWeight : null,
      };
      const exercises = replaceExercise(state, ci, (e) => ({
        ...e,
        status: 'active',
        sets: [...e.sets, newSet],
      }));
      return touch({ ...state, exercises, currentSetIndex: ex.sets.length, phase: 'ready' });
    }
    case 'ADD_EXERCISE': {
      // Session-only (spec decision 1): the routine behind the workout is never
      // touched. Duplicates are refused because workout_sets is unique on
      // (session_id, exercise_id, set_index) — a second block would restart
      // set_index at 1 and fail the whole end-of-workout save.
      if (state.exercises.some((e) => e.exerciseId === action.exercise.exerciseId)) return state;
      // max + 1, not length + 1: routine positions are 1-based but not
      // guaranteed contiguous, and position is what the overview panel shows.
      const position = state.exercises.reduce((m, e) => Math.max(m, e.position), 0) + 1;
      const added = buildRunnerExercise({ ...action.exercise, position }, 'pending');
      return touch({ ...state, exercises: [...state.exercises, added] });
    }
    case 'CONTINUE':
      return touch(advanceOrFinish(state));
    case 'JUMP_TO':
      return touch(activate(state, action.exerciseIndex));
    case 'SKIP_CURRENT': {
      // Skip the exercise the user is about to do — never a finished one. On the
      // completion card the "current" exercise is already done, so this targets
      // the up-next exercise instead (fixes skipping the just-completed one).
      const ti = focusIndex(state);
      if (ti < 0) return touch({ ...state, phase: 'finishing' });
      const exercises = replaceExercise(state, ti, (e) => ({ ...e, status: 'skipped' }));
      return touch(advanceOrFinish({ ...state, exercises }));
    }
    case 'END_EXERCISE': {
      // Finish the current exercise early, keeping the sets already recorded
      // (unrecorded remaining sets are simply never saved). Lands on the
      // completion card. Used when the user decides not to do the next set.
      const exercises = replaceExercise(state, ci, (e) => ({ ...e, status: 'done' }));
      return touch({ ...state, exercises, phase: 'exercise-complete', restStartedAtMs: null, restTargetSeconds: null });
    }
    case 'FINISH_EARLY':
      return touch({ ...state, phase: 'finishing' });
    case 'ADJUST_REST': {
      if (state.restTargetSeconds == null) return state;
      const next = Math.max(0, state.restTargetSeconds + action.deltaSeconds);
      return { ...state, restTargetSeconds: next };
    }
    case 'CLEAR_REST':
      return { ...state, restStartedAtMs: null, restTargetSeconds: null };
    default:
      return state;
  }
}

/** Recorded sets of non-skipped exercises, re-indexed contiguously per
 *  exercise. Skipped exercises are excluded entirely (spec §0.9). */
export function toSaveWorkoutSets(state: RunnerState): SaveWorkoutSet[] {
  const rows: SaveWorkoutSet[] = [];
  for (const ex of state.exercises) {
    if (ex.status === 'skipped') continue;
    let idx = 1;
    for (const s of ex.sets) {
      if (!s.recorded) continue;
      rows.push({
        exercise_id: ex.exerciseId,
        set_index: idx++,
        reps: s.reps,
        weight_kg: s.weightKg,
        rpe: s.isWarmup ? null : s.rpe,
        is_warmup: s.isWarmup,
      });
    }
  }
  return rows;
}

export function runnerReducer(state: RunnerState, action: RunnerAction): RunnerState {
  const ci = state.currentExerciseIndex;
  const si = state.currentSetIndex;
  const touch = (next: RunnerState): RunnerState => ({ ...next, savedAtMs: actionNow(action, next.savedAtMs) });

  switch (action.type) {
    case 'SET_WORKING_WEIGHT': {
      const exercises = replaceExercise(state, ci, (ex) =>
        recomputeWarmups({ ...ex, workingWeightKg: Math.max(0, action.weightKg) }),
      );
      return touch({ ...state, exercises });
    }
    case 'EDIT_CURRENT_SET': {
      const exercises = replaceExercise(state, ci, (ex) => ({
        ...ex,
        sets: ex.sets.map((s, i) => (i === si ? { ...s, ...action.patch } : s)),
      }));
      return touch({ ...state, exercises });
    }
    case 'START_REST': {
      const cur = state.exercises[ci].sets[si];
      const target = cur.isWarmup ? null : state.exercises[ci].restSeconds;
      return touch({ ...state, phase: 'resting', restStartedAtMs: action.nowMs, restTargetSeconds: target });
    }
    case 'RECORD_SET': {
      const ex = state.exercises[ci];
      const exercises = replaceExercise(state, ci, (e) => ({
        ...e,
        sets: e.sets.map((s, i) => (i === si ? { ...s, recorded: true } : s)),
      }));
      const isLast = si >= ex.sets.length - 1;
      if (isLast) {
        const done = replaceExercise({ ...state, exercises }, ci, (e) => ({ ...e, status: 'done' }));
        return touch({ ...state, exercises: done, phase: 'exercise-complete' });
        // rest timer intentionally left running (spec 0.21)
      }
      return touch({ ...state, exercises, currentSetIndex: si + 1, phase: 'ready' });
    }
    default:
      return navigationReducer(state, action, touch);
  }
}


