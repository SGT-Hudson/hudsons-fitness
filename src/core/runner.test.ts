import { describe, it, expect } from 'vitest';
import { computeTimerView, buildRunnerState, runnerReducer, nextPendingIndex, skippedUndoneIndices, toSaveWorkoutSets, type RunnerInput } from './runner';

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

function fresh() {
  return buildRunnerState(baseInput);
}

describe('runnerReducer — set editing / weight / rest / record', () => {
  it('SET_WORKING_WEIGHT recomputes warm-up weights, leaves working sets', () => {
    const s = runnerReducer(fresh(), { type: 'SET_WORKING_WEIGHT', weightKg: 100 });
    expect(s.exercises[0].workingWeightKg).toBe(100);
    expect(s.exercises[0].sets[0].weightKg).toBe(50); // 50% of 100
    expect(s.exercises[0].sets[1].weightKg).toBe(80); // working set untouched
  });

  it('EDIT_CURRENT_SET updates the current set only', () => {
    const s = runnerReducer(fresh(), { type: 'EDIT_CURRENT_SET', patch: { reps: 10, weightKg: 82.5, rpe: 9 } });
    expect(s.exercises[0].sets[0]).toMatchObject({ reps: 10, weightKg: 82.5, rpe: 9 });
  });

  it('START_REST on a working set sets resting phase + target seconds', () => {
    let s = fresh();
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 2_000_000 }); // record warm-up (set 0), advance to set 1 working
    s = runnerReducer(s, { type: 'START_REST', nowMs: 3_000_000 });
    expect(s.phase).toBe('resting');
    expect(s.restStartedAtMs).toBe(3_000_000);
    expect(s.restTargetSeconds).toBe(90);
  });

  it('START_REST on a warm-up uses count-up (null target)', () => {
    const s = runnerReducer(fresh(), { type: 'START_REST', nowMs: 3_000_000 });
    expect(s.restTargetSeconds).toBeNull();
  });

  it('RECORD_SET marks recorded, advances to next set, keeps the timer running', () => {
    let s = fresh();
    s = runnerReducer(s, { type: 'START_REST', nowMs: 3_000_000 });
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 3_010_000 });
    expect(s.exercises[0].sets[0].recorded).toBe(true);
    expect(s.currentSetIndex).toBe(1);
    expect(s.phase).toBe('ready');
    expect(s.restStartedAtMs).toBe(3_000_000); // NOT reset — rest keeps running (spec 0.21)
  });

  it('RECORD_SET on the last set marks the exercise done + exercise-complete phase', () => {
    let s = fresh();
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 1 }); // set 0 (warm-up)
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 2 }); // set 1 (working)
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 3 }); // set 2 (last working)
    expect(s.exercises[0].status).toBe('done');
    expect(s.phase).toBe('exercise-complete');
  });
});

const twoEx: RunnerInput = {
  ...baseInput,
  exercises: [
    baseInput.exercises[0],
    { ...baseInput.exercises[0], exerciseId: 'incline', position: 2, warmupSets: [], workingSetPrefill: [{ reps: 10, weightKg: 30 }] },
  ],
};

describe('runnerReducer — navigation + selectors', () => {
  it('SKIP_CURRENT marks skipped and activates the next pending exercise', () => {
    let s = buildRunnerState(twoEx);
    s = runnerReducer(s, { type: 'SKIP_CURRENT', nowMs: 5 });
    expect(s.exercises[0].status).toBe('skipped');
    expect(s.exercises[1].status).toBe('active');
    expect(s.currentExerciseIndex).toBe(1);
    expect(s.phase).toBe('ready');
  });

  it('CONTINUE from a completed exercise advances to the next pending', () => {
    let s = buildRunnerState(twoEx);
    s = runnerReducer(s, { type: 'CONTINUE', nowMs: 9 });
    expect(s.currentExerciseIndex).toBe(1);
    expect(s.exercises[1].status).toBe('active');
  });

  it('JUMP_TO activates a chosen exercise at its first unrecorded set', () => {
    let s = buildRunnerState(twoEx);
    s = runnerReducer(s, { type: 'JUMP_TO', exerciseIndex: 1, nowMs: 7 });
    expect(s.currentExerciseIndex).toBe(1);
    expect(s.currentSetIndex).toBe(0);
    expect(s.exercises[1].status).toBe('active');
  });

  it('ADD_SET appends a working set prefilled from the last working set, READY on it', () => {
    let s = buildRunnerState(baseInput);
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 1 });
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 2 });
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 3 }); // exercise-complete
    s = runnerReducer(s, { type: 'ADD_SET', nowMs: 4 });
    const ex = s.exercises[0];
    expect(ex.sets).toHaveLength(4);
    expect(ex.sets[3]).toMatchObject({ isWarmup: false, recorded: false, weightKg: 80 });
    expect(ex.status).toBe('active');
    expect(s.currentSetIndex).toBe(3);
    expect(s.phase).toBe('ready');
  });

  it('CONTINUE with no pending but skipped-undone goes to finishing', () => {
    let s = buildRunnerState(twoEx);
    s = runnerReducer(s, { type: 'SKIP_CURRENT', nowMs: 1 }); // skip ex0 → ex1 active
    s = runnerReducer(s, { type: 'SKIP_CURRENT', nowMs: 2 }); // skip ex1 → none pending
    expect(s.phase).toBe('finishing');
    expect(skippedUndoneIndices(s)).toEqual([0, 1]);
  });

  it('nextPendingIndex skips done + skipped in fixed order', () => {
    const s = buildRunnerState(twoEx);
    const marked = { ...s, exercises: s.exercises.map((e, i) => (i === 0 ? { ...e, status: 'done' as const } : e)) };
    expect(nextPendingIndex(marked)).toBe(1);
  });

  it('toSaveWorkoutSets emits recorded sets only, re-indexed per exercise, skipped excluded', () => {
    let s = buildRunnerState(twoEx);
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 1 }); // warm-up recorded
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 2 }); // working set 1
    s = runnerReducer(s, { type: 'SKIP_CURRENT', nowMs: 3 }); // ex0 still has 2 recorded; mark... (skip applies to current = ex0)
    const rows = toSaveWorkoutSets(s);
    // ex0 was skipped AFTER recording → skipped exercises are excluded entirely
    expect(rows.every((r) => r.exercise_id !== 'bench')).toBe(true);
  });

  it('toSaveWorkoutSets keeps recorded sets of non-skipped exercises with is_warmup + rpe', () => {
    let s = buildRunnerState(baseInput);
    s = runnerReducer(s, { type: 'EDIT_CURRENT_SET', patch: { reps: 8, weightKg: 40 } });
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 1 }); // warm-up
    s = runnerReducer(s, { type: 'EDIT_CURRENT_SET', patch: { reps: 8, weightKg: 80, rpe: 8 } });
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 2 }); // working
    const rows = toSaveWorkoutSets(s);
    expect(rows).toEqual([
      { exercise_id: 'bench', set_index: 1, reps: 8, weight_kg: 40, rpe: null, is_warmup: true },
      { exercise_id: 'bench', set_index: 2, reps: 8, weight_kg: 80, rpe: 8, is_warmup: false },
    ]);
  });
});
