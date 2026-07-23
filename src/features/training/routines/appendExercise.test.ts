import { describe, it, expect } from 'vitest';
import { buildAppendExercisePayload } from './appendExercise';
import type { RoutineWithExercises } from './api';

function routine(overrides: Partial<RoutineWithExercises> = {}): RoutineWithExercises {
  return {
    id: 'r1',
    user_id: 'u1',
    name: 'Torso A',
    notes: 'ojo con el hombro',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    routine_exercises: [
      {
        id: 're1',
        routine_id: 'r1',
        exercise_id: 'ex-bench',
        position: 1,
        target_sets: 4,
        target_reps_min: 6,
        target_reps_max: 8,
        rest_seconds: 150,
        target_rpe: 8,
        warmup_sets: [{ pct: 50, reps: 8 }],
      },
    ],
    ...overrides,
  } as unknown as RoutineWithExercises;
}

const entry = {
  exercise_id: 'ex-row',
  target_sets: 3,
  target_reps_min: 8,
  target_reps_max: 12,
};

describe('buildAppendExercisePayload', () => {
  it('appends the new exercise after the last position', () => {
    const payload = buildAppendExercisePayload(routine(), entry);
    expect(payload.exercises).toHaveLength(2);
    expect(payload.exercises[1]).toMatchObject({ exercise_id: 'ex-row', position: 2 });
  });

  it('keeps the routine name and notes (save_routine overwrites them with no coalesce)', () => {
    const payload = buildAppendExercisePayload(routine(), entry);
    expect(payload.routineId).toBe('r1');
    expect(payload.name).toBe('Torso A');
    expect(payload.notes).toBe('ojo con el hombro');
  });

  it('resends every existing child field verbatim, warm-ups included', () => {
    const payload = buildAppendExercisePayload(routine(), entry);
    expect(payload.exercises[0]).toEqual({
      exercise_id: 'ex-bench',
      position: 1,
      target_sets: 4,
      target_reps_min: 6,
      target_reps_max: 8,
      rest_seconds: 150,
      target_rpe: 8,
      warmup_sets: [{ pct: 50, reps: 8 }],
    });
  });

  it('starts at position 1 for an empty routine', () => {
    const payload = buildAppendExercisePayload(routine({ routine_exercises: [] }), entry);
    expect(payload.exercises).toEqual([
      {
        exercise_id: 'ex-row',
        position: 1,
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 12,
        rest_seconds: null,
        target_rpe: null,
        warmup_sets: [],
      },
    ]);
  });

  it('appends after the highest position even when children arrive unsorted', () => {
    const unsorted = routine({
      routine_exercises: [
        { position: 5, exercise_id: 'a', target_sets: 3, target_reps_min: 8, target_reps_max: 12, rest_seconds: null, target_rpe: null, warmup_sets: null },
        { position: 2, exercise_id: 'b', target_sets: 3, target_reps_min: 8, target_reps_max: 12, rest_seconds: null, target_rpe: null, warmup_sets: null },
      ] as unknown as RoutineWithExercises['routine_exercises'],
    });
    const payload = buildAppendExercisePayload(unsorted, entry);
    expect(payload.exercises.map((e) => e.position)).toEqual([2, 5, 6]);
  });

  it('normalizes a null warmup_sets column to an empty array', () => {
    const nullWarmups = routine({
      routine_exercises: [
        { position: 1, exercise_id: 'a', target_sets: 3, target_reps_min: 8, target_reps_max: 12, rest_seconds: null, target_rpe: null, warmup_sets: null },
      ] as unknown as RoutineWithExercises['routine_exercises'],
    });
    expect(buildAppendExercisePayload(nullWarmups, entry).exercises[0].warmup_sets).toEqual([]);
  });
});
