import { describe, it, expect } from 'vitest';
import {
  cycleDayForDate,
  scheduledSlotForDate,
  projectCycle,
  prefillSetsFromRoutine,
  type ProgramDaySlot,
  type RoutineExercisePrescription,
} from './programs';

const slots: ProgramDaySlot[] = [
  { dayIndex: 0, isRest: false, routineId: 'push' },
  { dayIndex: 1, isRest: false, routineId: 'pull' },
  { dayIndex: 2, isRest: false, routineId: 'legs' },
  { dayIndex: 3, isRest: true, routineId: null },
  { dayIndex: 4, isRest: true, routineId: null },
];

describe('cycleDayForDate', () => {
  it('anchor day is index 0', () => {
    expect(cycleDayForDate('2026-05-24', '2026-05-24', 5)).toBe(0);
  });
  it('advances one per day', () => {
    expect(cycleDayForDate('2026-05-24', '2026-05-25', 5)).toBe(1);
    expect(cycleDayForDate('2026-05-24', '2026-05-28', 5)).toBe(4);
  });
  it('wraps at cycle length', () => {
    expect(cycleDayForDate('2026-05-24', '2026-05-29', 5)).toBe(0);
    expect(cycleDayForDate('2026-05-24', '2026-06-03', 5)).toBe(0);
  });
  it('handles dates before the anchor with a floored modulo', () => {
    expect(cycleDayForDate('2026-05-24', '2026-05-23', 5)).toBe(4);
    expect(cycleDayForDate('2026-05-24', '2026-05-19', 5)).toBe(0);
  });
  it('a 7-day cycle behaves like a weekday offset', () => {
    expect(cycleDayForDate('2026-05-24', '2026-05-31', 7)).toBe(0);
  });
});

describe('scheduledSlotForDate', () => {
  it('returns the routine slot for a training day', () => {
    expect(scheduledSlotForDate(slots, '2026-05-24', '2026-05-25')?.routineId).toBe('pull');
  });
  it('returns the rest slot on a rest day', () => {
    const slot = scheduledSlotForDate(slots, '2026-05-24', '2026-05-27');
    expect(slot?.isRest).toBe(true);
    expect(slot?.routineId).toBeNull();
  });
  it('returns null when the program has no days', () => {
    expect(scheduledSlotForDate([], '2026-05-24', '2026-05-25')).toBeNull();
  });
});

describe('projectCycle', () => {
  it('projects N consecutive days from a start date', () => {
    const proj = projectCycle(slots, '2026-05-24', '2026-05-24', 3);
    expect(proj.map((p) => p.dateISO)).toEqual(['2026-05-24', '2026-05-25', '2026-05-26']);
    expect(proj.map((p) => p.slot?.routineId)).toEqual(['push', 'pull', 'legs']);
  });
});

describe('prefillSetsFromRoutine', () => {
  const exercises: RoutineExercisePrescription[] = [
    { exerciseId: 'bench', position: 1, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, restSeconds: 120, targetRpe: 8 },
    { exerciseId: 'row', position: 2, targetSets: 2, targetRepsMin: 10, targetRepsMax: 10, restSeconds: null, targetRpe: null },
  ];
  it('expands target_sets into that many empty set rows per exercise, ordered by position', () => {
    const out = prefillSetsFromRoutine(exercises);
    expect(out).toHaveLength(2);
    expect(out[0].exerciseId).toBe('bench');
    expect(out[0].sets).toHaveLength(3);
    expect(out[1].sets).toHaveLength(2);
  });
  it('carries rep-range / rest / rpe targets and leaves weight blank', () => {
    const out = prefillSetsFromRoutine(exercises);
    expect(out[0].sets[0]).toEqual({ setIndex: 1, targetRepsMin: 8, targetRepsMax: 12, restSeconds: 120, targetRpe: 8 });
    expect(out[1].sets[1]).toEqual({ setIndex: 2, targetRepsMin: 10, targetRepsMax: 10, restSeconds: null, targetRpe: null });
  });
});
