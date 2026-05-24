import { describe, it, expect } from 'vitest';
import {
  cycleDayForDate,
  scheduledSlotForDate,
  projectCycle,
  prefillSetsFromRoutine,
  warmupWeightKg,
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

describe('warmupWeightKg', () => {
  it('rounds 60 kg × 40 % to nearest 2.5 kg → 25', () => {
    expect(warmupWeightKg(60, 40)).toBe(25);
  });
  it('rounds 60 kg × 80 % to nearest 2.5 kg → 47.5', () => {
    expect(warmupWeightKg(60, 80)).toBe(47.5);
  });
  it('returns 50 for 100 kg × 50 %', () => {
    expect(warmupWeightKg(100, 50)).toBe(50);
  });
  it('returns 0 for non-positive working weight', () => {
    expect(warmupWeightKg(0, 80)).toBe(0);
  });
  it('returns 0 for non-positive pct', () => {
    expect(warmupWeightKg(60, 0)).toBe(0);
  });
});

describe('prefillSetsFromRoutine', () => {
  const exercises: RoutineExercisePrescription[] = [
    { exerciseId: 'bench', position: 1, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, restSeconds: 120, targetRpe: 8, warmupSets: [], lastWorkingWeightKg: null },
    { exerciseId: 'row', position: 2, targetSets: 2, targetRepsMin: 10, targetRepsMax: 10, restSeconds: null, targetRpe: null, warmupSets: [], lastWorkingWeightKg: null },
  ];
  it('expands target_sets into that many working set rows per exercise, ordered by position', () => {
    const out = prefillSetsFromRoutine(exercises);
    expect(out).toHaveLength(2);
    expect(out[0].exerciseId).toBe('bench');
    expect(out[0].sets).toHaveLength(3);
    expect(out[1].sets).toHaveLength(2);
  });
  it('carries rep-range / rest / rpe targets and marks working sets with isWarmup:false, reps/weightKg null', () => {
    const out = prefillSetsFromRoutine(exercises);
    expect(out[0].sets[0]).toEqual({
      setIndex: 1,
      isWarmup: false,
      reps: null,
      weightKg: null,
      targetRepsMin: 8,
      targetRepsMax: 12,
      restSeconds: 120,
      targetRpe: 8,
    });
    expect(out[1].sets[1]).toEqual({
      setIndex: 2,
      isWarmup: false,
      reps: null,
      weightKg: null,
      targetRepsMin: 10,
      targetRepsMax: 10,
      restSeconds: null,
      targetRpe: null,
    });
  });

  it('emits warmup sets before working sets, with computed weights, for known lastWorkingWeightKg', () => {
    const prescription: RoutineExercisePrescription = {
      exerciseId: 'squat',
      position: 1,
      targetSets: 3,
      targetRepsMin: 5,
      targetRepsMax: 5,
      restSeconds: 180,
      targetRpe: null,
      warmupSets: [{ pct: 40, reps: 5 }, { pct: 80, reps: 3 }],
      lastWorkingWeightKg: 60,
    };
    const out = prefillSetsFromRoutine([prescription]);
    expect(out).toHaveLength(1);
    const { sets } = out[0];
    expect(sets).toHaveLength(5); // 2 warmup + 3 working
    // setIndex is continuous 1..5
    expect(sets.map((s) => s.setIndex)).toEqual([1, 2, 3, 4, 5]);
    // first two are warmups
    expect(sets[0]).toEqual({ setIndex: 1, isWarmup: true, reps: 5, weightKg: 25, targetRepsMin: 5, targetRepsMax: 5, restSeconds: 180, targetRpe: null });
    expect(sets[1]).toEqual({ setIndex: 2, isWarmup: true, reps: 3, weightKg: 47.5, targetRepsMin: 5, targetRepsMax: 5, restSeconds: 180, targetRpe: null });
    // last three are working sets
    expect(sets[2]).toEqual({ setIndex: 3, isWarmup: false, reps: null, weightKg: null, targetRepsMin: 5, targetRepsMax: 5, restSeconds: 180, targetRpe: null });
    expect(sets[4].setIndex).toBe(5);
  });

  it('emits warmup sets with weightKg null when lastWorkingWeightKg is null', () => {
    const prescription: RoutineExercisePrescription = {
      exerciseId: 'deadlift',
      position: 1,
      targetSets: 2,
      targetRepsMin: 5,
      targetRepsMax: 5,
      restSeconds: null,
      targetRpe: null,
      warmupSets: [{ pct: 50, reps: 5 }],
      lastWorkingWeightKg: null,
    };
    const out = prefillSetsFromRoutine([prescription]);
    expect(out[0].sets[0]).toMatchObject({ isWarmup: true, reps: 5, weightKg: null });
  });
});
