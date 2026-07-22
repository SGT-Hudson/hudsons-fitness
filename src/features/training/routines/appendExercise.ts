import type { RoutineWithExercises, RoutineWarmupSet, SaveRoutinePayload } from './api';

export interface RoutineExerciseInput {
  exercise_id: string;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
}

/**
 * Payload that appends one exercise to the end of an existing routine.
 *
 * `save_routine` is a replace-children RPC: it deletes every child row and
 * reinserts what it is given, and it writes `name`/`notes` with no coalesce.
 * So "add one exercise" has to resend the whole aggregate — this builder is
 * what guarantees nothing (name, notes, warm-ups, rest, RPE) is dropped on
 * the way. R-31.
 */
export function buildAppendExercisePayload(
  routine: RoutineWithExercises,
  entry: RoutineExerciseInput,
): SaveRoutinePayload {
  const existing = [...routine.routine_exercises].sort((a, b) => a.position - b.position);
  const lastPosition = existing.reduce((max, re) => Math.max(max, re.position), 0);
  return {
    routineId: routine.id,
    name: routine.name,
    notes: routine.notes,
    exercises: [
      ...existing.map((re) => ({
        exercise_id: re.exercise_id,
        position: re.position,
        target_sets: re.target_sets,
        target_reps_min: re.target_reps_min,
        target_reps_max: re.target_reps_max,
        rest_seconds: re.rest_seconds ?? null,
        target_rpe: re.target_rpe ?? null,
        warmup_sets: ((re.warmup_sets as RoutineWarmupSet[] | null) ?? []),
      })),
      {
        exercise_id: entry.exercise_id,
        position: lastPosition + 1,
        target_sets: entry.target_sets,
        target_reps_min: entry.target_reps_min,
        target_reps_max: entry.target_reps_max,
        rest_seconds: null,
        target_rpe: null,
        warmup_sets: [],
      },
    ],
  };
}
