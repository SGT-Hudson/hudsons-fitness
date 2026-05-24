import { describe, it, expect } from 'vitest';
import { routineSchema, routineExerciseSchema } from './routineSchema';

const validExercise = {
  exercise_id: '11111111-1111-1111-1111-111111111111',
  target_sets: 3, target_reps_min: 8, target_reps_max: 12, rest_seconds: 120, target_rpe: 8,
};

describe('routineExerciseSchema', () => {
  it('accepts a valid exercise', () => {
    expect(routineExerciseSchema.safeParse(validExercise).success).toBe(true);
  });
  it('rejects max reps < min reps', () => {
    expect(routineExerciseSchema.safeParse({ ...validExercise, target_reps_min: 12, target_reps_max: 8 }).success).toBe(false);
  });
  it('rejects RPE not in 0.5 steps', () => {
    expect(routineExerciseSchema.safeParse({ ...validExercise, target_rpe: 8.3 }).success).toBe(false);
  });
  it('accepts null rest and rpe', () => {
    expect(routineExerciseSchema.safeParse({ ...validExercise, rest_seconds: null, target_rpe: null }).success).toBe(true);
  });
});

describe('routineSchema', () => {
  it('requires at least one exercise', () => {
    expect(routineSchema.safeParse({ name: 'Push', notes: null, exercises: [] }).success).toBe(false);
  });
  it('requires a name', () => {
    expect(routineSchema.safeParse({ name: '', notes: null, exercises: [validExercise] }).success).toBe(false);
  });
});
