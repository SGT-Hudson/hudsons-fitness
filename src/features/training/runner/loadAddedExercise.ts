/**
 * Resolves everything the runner needs to add an exercise mid-workout (R-46).
 * Best-effort by design: the working-weight prefill is a nice-to-have, so any
 * failure — offline, error, or a request that never settles in a gym basement —
 * degrades to 0 kg rather than blocking the addition. Never rejects.
 */

import {
  lastWorkingSetForExercise,
  prefillSetsForExercise,
  type CoachContext,
  type CoreSessionSet,
} from '@/core/training';
import type { AddedExerciseInput } from '@/core/runner';
import { exerciseDisplayName, type Exercise } from '../exercises/api';

/** An improvised exercise has no routine row, so it gets a plain default plan;
 *  everything is adjustable in the runner (ADD_SET, the weight stepper). */
export const ADDED_EXERCISE_DEFAULTS = {
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 12,
} as const;

/** A hanging request is the case that matters: with no signal supabase-js can
 *  stall instead of failing, and a spinner that never resolves mid-set is worse
 *  than a wrong starting weight. */
export const HISTORY_TIMEOUT_MS = 4000;

export interface AddedExerciseData {
  input: AddedExerciseInput;
  name: string;
  lastTimeLabel: string | null;
  coachContext: CoachContext;
}

export interface LoadAddedExerciseOptions {
  exercise: Exercise;
  lang: 'es' | 'en';
  todayISO: string;
  /** Injected so this module stays free of Supabase and testable with a fake. */
  fetchHistory: (exerciseId: string) => Promise<CoreSessionSet[]>;
  /** Locale-aware number formatting for the "last time" hint. */
  formatWeight: (kg: number) => string;
  timeoutMs?: number;
}

/** Resolves to `fallback` if `promise` rejects or outlives `ms`. */
function settleOrFallback<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

export async function loadAddedExercise({
  exercise, lang, todayISO, fetchHistory, formatWeight, timeoutMs = HISTORY_TIMEOUT_MS,
}: LoadAddedExerciseOptions): Promise<AddedExerciseData> {
  let pending: Promise<CoreSessionSet[]>;
  try {
    pending = Promise.resolve(fetchHistory(exercise.id));
  } catch {
    pending = Promise.resolve([]); // a synchronous throw must not escape either
  }
  const history = await settleOrFallback(pending, timeoutMs, []);

  const last = lastWorkingSetForExercise(history);
  const { targetSets, targetRepsMin, targetRepsMax } = ADDED_EXERCISE_DEFAULTS;

  const input: AddedExerciseInput = {
    exerciseId: exercise.id,
    targetSets,
    targetRepsMin,
    targetRepsMax,
    restSeconds: null,   // count-up rest timer, no prescribed countdown
    targetRpe: null,
    defaultIncrementKg: exercise.default_increment_kg ?? 2.5,
    warmupSets: [],
    lastWorkingWeightKg: last != null ? Number(last.weightKg) : null,
    workingSetPrefill: prefillSetsForExercise(history, targetSets, targetRepsMin),
  };

  return {
    input,
    name: exerciseDisplayName(exercise, lang),
    lastTimeLabel: last ? `${last.reps} × ${formatWeight(Number(last.weightKg))} kg` : null,
    coachContext: {
      exerciseId: exercise.id,
      primaryMuscles: exercise.primary_muscles ?? [],
      equipment: exercise.equipment ?? null,
      defaultIncrementKg: exercise.default_increment_kg ?? null,
      history,
      todayISO,
    },
  };
}
