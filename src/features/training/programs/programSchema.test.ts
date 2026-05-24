import { describe, it, expect } from 'vitest';
import { programSchema, programDaySchema } from './programSchema';

const routineDay = { day_index: 0, is_rest: false, routine_id: '11111111-1111-1111-1111-111111111111' };
const restDay = { day_index: 1, is_rest: true, routine_id: null };

describe('programDaySchema', () => {
  it('accepts a routine day with a routine_id', () => {
    expect(programDaySchema.safeParse(routineDay).success).toBe(true);
  });
  it('accepts a rest day with null routine_id', () => {
    expect(programDaySchema.safeParse(restDay).success).toBe(true);
  });
  it('rejects a rest day that also has a routine_id', () => {
    expect(programDaySchema.safeParse({ ...restDay, routine_id: routineDay.routine_id }).success).toBe(false);
  });
  it('rejects a training day with no routine_id', () => {
    expect(programDaySchema.safeParse({ day_index: 0, is_rest: false, routine_id: null }).success).toBe(false);
  });
});

describe('programSchema', () => {
  it('requires at least one day', () => {
    expect(programSchema.safeParse({ name: 'PPL', days: [] }).success).toBe(false);
  });
});
