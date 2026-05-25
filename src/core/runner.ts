/**
 * Pure runner state model (spec §2, §3). No clock, no I/O — callers pass
 * `nowMs`/ISO dates and persist the returned state. Timer remaining-time is
 * derived from a start timestamp + target (spec §3.3) so a backgrounded tab
 * shows correct time on return.
 */

import { warmupWeightKg } from './programs';

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

export type ExerciseStatus = 'pending' | 'active' | 'done' | 'skipped';
export type RunnerPhase = 'ready' | 'resting' | 'exercise-complete' | 'finishing';

export interface RunnerSet {
  setIndex: number;            // 1-based, contiguous per exercise (warm-ups first)
  isWarmup: boolean;
  pct: number | null;          // warm-up: % of working weight; null for working sets
  reps: number;
  weightKg: number;            // 0 when unknown/blank
  rpe: number | null;          // working sets only
  recorded: boolean;
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

function buildSets(ex: RunnerInputExercise, workingWeightKg: number): RunnerSet[] {
  const sets: RunnerSet[] = [];
  let idx = 1;
  for (const w of ex.warmupSets) {
    sets.push({
      setIndex: idx++,
      isWarmup: true,
      pct: w.pct,
      reps: w.reps,
      weightKg: workingWeightKg > 0 ? warmupWeightKg(workingWeightKg, w.pct) : 0,
      rpe: null,
      recorded: false,
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
    });
  });
  return sets;
}

export function buildRunnerState(input: RunnerInput): RunnerState {
  const exercises: RunnerExercise[] = [...input.exercises]
    .sort((a, b) => a.position - b.position)
    .map((ex, i) => {
      const workingWeightKg = ex.lastWorkingWeightKg ?? 0;
      return {
        exerciseId: ex.exerciseId,
        position: ex.position,
        targetSets: ex.targetSets,
        targetRepsMin: ex.targetRepsMin,
        targetRepsMax: ex.targetRepsMax,
        restSeconds: ex.restSeconds,
        targetRpe: ex.targetRpe,
        defaultIncrementKg: ex.defaultIncrementKg > 0 ? ex.defaultIncrementKg : 2.5,
        workingWeightKg,
        warmupPrescriptions: ex.warmupSets,
        sets: buildSets(ex, workingWeightKg),
        status: i === 0 ? 'active' : 'pending',
      } satisfies RunnerExercise;
    });

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

