import { describe, expect, it } from 'vitest';
import { exerciseBlockSchema, sessionSchema, setSchema } from './schema';

describe('setSchema', () => {
  const valid = { set_index: 1, reps: 8, weight_kg: 70, rpe: 7, is_warmup: false };

  it('accepts a valid set', () => {
    expect(setSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects RPE outside 6.0–10.0', () => {
    expect(setSchema.safeParse({ ...valid, rpe: 5.5 }).success).toBe(false);
    expect(setSchema.safeParse({ ...valid, rpe: 10.5 }).success).toBe(false);
  });

  it('rejects RPE not in 0.5 steps (DB CHECK enforces this)', () => {
    expect(setSchema.safeParse({ ...valid, rpe: 6.3 }).success).toBe(false);
    expect(setSchema.safeParse({ ...valid, rpe: 7.25 }).success).toBe(false);
  });

  it('accepts RPE in 0.5 steps', () => {
    expect(setSchema.safeParse({ ...valid, rpe: 6.5 }).success).toBe(true);
    expect(setSchema.safeParse({ ...valid, rpe: 9 }).success).toBe(true);
  });

  it('accepts null RPE (un-rated set)', () => {
    expect(setSchema.safeParse({ ...valid, rpe: null }).success).toBe(true);
  });

  it('rejects negative reps and negative weight', () => {
    expect(setSchema.safeParse({ ...valid, reps: -1 }).success).toBe(false);
    expect(setSchema.safeParse({ ...valid, weight_kg: -10 }).success).toBe(false);
  });

  it('rejects non-integer reps', () => {
    expect(setSchema.safeParse({ ...valid, reps: 8.5 }).success).toBe(false);
  });

  it('rejects set_index < 1', () => {
    expect(setSchema.safeParse({ ...valid, set_index: 0 }).success).toBe(false);
  });
});

describe('exerciseBlockSchema', () => {
  it('requires at least one set', () => {
    expect(
      exerciseBlockSchema.safeParse({
        exercise_id: '00000000-0000-0000-0000-000000000001',
        sets: [],
      }).success,
    ).toBe(false);
  });

  it('requires a uuid exercise_id', () => {
    expect(
      exerciseBlockSchema.safeParse({
        exercise_id: 'not-a-uuid',
        sets: [{ set_index: 1, reps: 5, weight_kg: 60, rpe: null, is_warmup: false }],
      }).success,
    ).toBe(false);
  });
});

describe('sessionSchema', () => {
  const validBlock = {
    exercise_id: '00000000-0000-0000-0000-000000000001',
    sets: [{ set_index: 1, reps: 8, weight_kg: 70, rpe: 7, is_warmup: false }],
  };

  it('requires at least one exercise block', () => {
    expect(
      sessionSchema.safeParse({
        performed_on: '2026-05-22',
        title: null,
        notes: null,
        blocks: [],
      }).success,
    ).toBe(false);
  });

  it('rejects malformed performed_on', () => {
    expect(
      sessionSchema.safeParse({
        performed_on: '22/05/2026',
        title: null,
        notes: null,
        blocks: [validBlock],
      }).success,
    ).toBe(false);
  });

  it('accepts a complete valid session', () => {
    expect(
      sessionSchema.safeParse({
        performed_on: '2026-05-22',
        title: 'Push day',
        notes: 'felt strong',
        blocks: [validBlock],
      }).success,
    ).toBe(true);
  });
});
