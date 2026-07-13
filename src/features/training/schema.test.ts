import { describe, expect, it } from 'vitest';
import { exerciseBlockSchema, sessionSchema, setSchema } from './schema';

describe('setSchema', () => {
  // `weight_kg` is STRING-in (the raw `<input>` value) since it moved to
  // NumberField/`type="text"`; reps, set_index and rpe are still `valueAsNumber`
  // numbers — they are integers, where a decimal separator has no meaning.
  const valid = { set_index: 1, reps: 8, weight_kg: '70', rpe: 7, is_warmup: false };

  it('accepts a valid set', () => {
    expect(setSchema.safeParse(valid).success).toBe(true);
  });

  it('parses weight_kg from its input string into a number', () => {
    const parsed = setSchema.parse(valid);
    expect(parsed.weight_kg).toBe(70);
  });

  it('accepts a decimal comma in weight_kg (82,4 → 82.4)', () => {
    const parsed = setSchema.parse({ ...valid, weight_kg: '82,4' });
    expect(parsed.weight_kg).toBeCloseTo(82.4, 10);
    expect(setSchema.parse({ ...valid, weight_kg: '82.4' }).weight_kg).toBeCloseTo(82.4, 10);
  });

  it('rejects a blank or unparseable weight_kg', () => {
    expect(setSchema.safeParse({ ...valid, weight_kg: '' }).success).toBe(false);
    expect(setSchema.safeParse({ ...valid, weight_kg: 'abc' }).success).toBe(false);
    // Ambiguity is rejected, never guessed (no thousands-separator inference).
    expect(setSchema.safeParse({ ...valid, weight_kg: '1,234.5' }).success).toBe(false);
  });

  it('rejects RPE outside 6–10', () => {
    expect(setSchema.safeParse({ ...valid, rpe: 5 }).success).toBe(false);
    expect(setSchema.safeParse({ ...valid, rpe: 11 }).success).toBe(false);
  });

  it('rejects a fractional RPE — RPE is an integer everywhere', () => {
    expect(setSchema.safeParse({ ...valid, rpe: 6.5 }).success).toBe(false);
    expect(setSchema.safeParse({ ...valid, rpe: 6.3 }).success).toBe(false);
    expect(setSchema.safeParse({ ...valid, rpe: 7.25 }).success).toBe(false);
  });

  it('accepts a whole-number RPE', () => {
    expect(setSchema.safeParse({ ...valid, rpe: 6 }).success).toBe(true);
    expect(setSchema.safeParse({ ...valid, rpe: 9 }).success).toBe(true);
  });

  it('accepts null RPE (un-rated set)', () => {
    expect(setSchema.safeParse({ ...valid, rpe: null }).success).toBe(true);
  });

  it('rejects negative reps and negative weight', () => {
    expect(setSchema.safeParse({ ...valid, reps: -1 }).success).toBe(false);
    expect(setSchema.safeParse({ ...valid, weight_kg: '-10' }).success).toBe(false);
  });

  it('rejects a weight above the 1000 kg bound (the gate the DOM used to own)', () => {
    expect(setSchema.safeParse({ ...valid, weight_kg: '1001' }).success).toBe(false);
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
        sets: [{ set_index: 1, reps: 5, weight_kg: '60', rpe: null, is_warmup: false }],
      }).success,
    ).toBe(false);
  });
});

describe('sessionSchema', () => {
  const validBlock = {
    exercise_id: '00000000-0000-0000-0000-000000000001',
    sets: [{ set_index: 1, reps: 8, weight_kg: '70', rpe: 7, is_warmup: false }],
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
