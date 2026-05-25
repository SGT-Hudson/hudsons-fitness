import { describe, it, expect } from 'vitest';
import { computeTimerView, buildRunnerState, type RunnerInput } from './runner';

describe('computeTimerView', () => {
  const start = 1_000_000;

  it('counts down toward a target', () => {
    expect(computeTimerView(start, 90, start + 30_000)).toEqual({
      isCountUp: false, elapsedSeconds: 30, remainingSeconds: 60, overSeconds: 0, done: false,
    });
  });

  it('reports done and over-time past the target', () => {
    expect(computeTimerView(start, 90, start + 105_000)).toEqual({
      isCountUp: false, elapsedSeconds: 105, remainingSeconds: 0, overSeconds: 15, done: true,
    });
  });

  it('counts up with no target (warm-up / null rest)', () => {
    expect(computeTimerView(start, null, start + 24_000)).toEqual({
      isCountUp: true, elapsedSeconds: 24, remainingSeconds: 0, overSeconds: 0, done: false,
    });
  });

  it('never returns negative elapsed for a clock skew', () => {
    expect(computeTimerView(start, 90, start - 5_000).elapsedSeconds).toBe(0);
  });
});

const baseInput: RunnerInput = {
  programId: 'p1',
  routineId: 'r1',
  routineName: 'Push Day',
  performedOn: '2026-05-25',
  nowMs: 1_000_000,
  exercises: [
    {
      exerciseId: 'bench',
      position: 1,
      targetSets: 2,
      targetRepsMin: 8,
      targetRepsMax: 8,
      restSeconds: 90,
      targetRpe: 8,
      defaultIncrementKg: 2.5,
      warmupSets: [{ pct: 50, reps: 8 }],
      lastWorkingWeightKg: 80,
      workingSetPrefill: [
        { reps: 8, weightKg: 80 },
        { reps: 7, weightKg: 80 },
      ],
    },
  ],
};

describe('buildRunnerState', () => {
  it('builds warm-up rows (computed weight) then working rows (prefilled), contiguous setIndex', () => {
    const s = buildRunnerState(baseInput);
    const ex = s.exercises[0];
    expect(ex.workingWeightKg).toBe(80);
    expect(ex.sets).toEqual([
      { setIndex: 1, isWarmup: true, pct: 50, reps: 8, weightKg: 40, rpe: null, recorded: false },
      { setIndex: 2, isWarmup: false, pct: null, reps: 8, weightKg: 80, rpe: 8, recorded: false },
      { setIndex: 3, isWarmup: false, pct: null, reps: 7, weightKg: 80, rpe: 8, recorded: false },
    ]);
  });

  it('starts on the first exercise in READY phase with the first set current', () => {
    const s = buildRunnerState(baseInput);
    expect(s.currentExerciseIndex).toBe(0);
    expect(s.currentSetIndex).toBe(0);
    expect(s.phase).toBe('ready');
    expect(s.exercises[0].status).toBe('active');
  });

  it('blanks working weight + warm-up weights when there is no last working weight', () => {
    const s = buildRunnerState({
      ...baseInput,
      exercises: [{ ...baseInput.exercises[0], lastWorkingWeightKg: null, workingSetPrefill: [{ reps: 8, weightKg: null }, { reps: 8, weightKg: null }] }],
    });
    expect(s.exercises[0].workingWeightKg).toBe(0);
    expect(s.exercises[0].sets[0].weightKg).toBe(0); // warm-up, uncomputable
    expect(s.exercises[0].sets[1].weightKg).toBe(0); // working, blank prefill → 0
  });
});
