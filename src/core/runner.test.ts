import { describe, it, expect } from 'vitest';
import { computeTimerView, buildRunnerState, runnerReducer, nextPendingIndex, focusIndex, skippedUndoneIndices, toSaveWorkoutSets, type RunnerInput } from './runner';
import { warmupWeightKg } from './programs';

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

  it('ADD_SET with last working weight=0 falls back to ex.workingWeightKg', () => {
    let s = buildRunnerState(baseInput);
    // Edit the current set (set 0, warmup) weight to 0 then record it
    s = runnerReducer(s, { type: 'EDIT_CURRENT_SET', patch: { weightKg: 0 } });
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 1 }); // advance to working set 1
    // Edit working set weight to 0 then record
    s = runnerReducer(s, { type: 'EDIT_CURRENT_SET', patch: { weightKg: 0 } });
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 2 }); // advance to set 2
    s = runnerReducer(s, { type: 'EDIT_CURRENT_SET', patch: { weightKg: 0 } });
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 3 }); // exercise-complete
    s = runnerReducer(s, { type: 'ADD_SET', nowMs: 4 });
    const newSet = s.exercises[0].sets[3];
    // last working set has weightKg=0, so fallback to ex.workingWeightKg (80)
    expect(newSet.weightKg).toBe(80);
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

// ---------------------------------------------------------------------------
// New tests — Fix 1 / Fix 2 / edge cases
// ---------------------------------------------------------------------------

const increment5Input: RunnerInput = {
  ...baseInput,
  exercises: [
    {
      ...baseInput.exercises[0],
      defaultIncrementKg: 5,
      warmupSets: [{ pct: 50, reps: 5 }],
      lastWorkingWeightKg: 84,
      workingSetPrefill: [{ reps: 5, weightKg: 84 }],
    },
  ],
};

describe('warm-up weight rounds to exercise increment', () => {
  it('non-2.5 increment: 50% of 84 kg on a 5 kg grid snaps to warmupWeightKg(84,50,5)', () => {
    const expected = warmupWeightKg(84, 50, 5); // Math.round(42/5)*5 = 40
    expect(expected).toBe(40);
    const s = buildRunnerState(increment5Input);
    expect(s.exercises[0].sets[0].weightKg).toBe(expected);
  });

  it('SET_WORKING_WEIGHT recomputes warm-up on a 5 kg grid after weight change', () => {
    const s = buildRunnerState(increment5Input);
    const updated = runnerReducer(s, { type: 'SET_WORKING_WEIGHT', weightKg: 90 });
    const expected = warmupWeightKg(90, 50, 5); // Math.round(45/5)*5 = 45
    expect(expected).toBe(45);
    expect(updated.exercises[0].sets[0].weightKg).toBe(expected);
  });

  it('recorded warm-up weight is frozen on SET_WORKING_WEIGHT; unrecorded warm-up recomputes', () => {
    // Start with two warm-ups: one to record, one to leave unrecorded
    const twoWarmupInput: RunnerInput = {
      ...baseInput,
      exercises: [
        {
          ...baseInput.exercises[0],
          defaultIncrementKg: 2.5,
          warmupSets: [
            { pct: 40, reps: 10 },
            { pct: 60, reps: 5 },
          ],
          lastWorkingWeightKg: 80,
          workingSetPrefill: [{ reps: 8, weightKg: 80 }],
        },
      ],
    };
    let s = buildRunnerState(twoWarmupInput);
    const originalWarmup0Weight = s.exercises[0].sets[0].weightKg; // 40% of 80 = 32
    expect(originalWarmup0Weight).toBe(warmupWeightKg(80, 40, 2.5));

    // Record the first warm-up
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 1 });
    // Now change working weight
    s = runnerReducer(s, { type: 'SET_WORKING_WEIGHT', weightKg: 100 });

    // Recorded warm-up (index 0) must stay at original weight
    expect(s.exercises[0].sets[0].weightKg).toBe(originalWarmup0Weight);
    // Unrecorded warm-up (index 1) must recompute to 60% of 100
    expect(s.exercises[0].sets[1].weightKg).toBe(warmupWeightKg(100, 60, 2.5));
  });
});

describe('activate edge cases', () => {
  it('JUMP_TO an already-done exercise reactivates it at set 0 (override done status)', () => {
    let s = buildRunnerState(twoEx);
    // Complete all sets of ex0 to mark it done
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 1 }); // warm-up
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 2 }); // working 1
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 3 }); // working 2 → ex0 done
    expect(s.exercises[0].status).toBe('done');
    // JUMP_TO ex0 (done exercise)
    s = runnerReducer(s, { type: 'JUMP_TO', exerciseIndex: 0, nowMs: 10 });
    expect(s.exercises[0].status).toBe('active');
    expect(s.currentExerciseIndex).toBe(0);
    expect(s.currentSetIndex).toBe(0);
  });

  it('JUMP_TO out-of-range index is a no-op (returns unchanged state)', () => {
    const s = buildRunnerState(twoEx);
    const after = runnerReducer(s, { type: 'JUMP_TO', exerciseIndex: -1, nowMs: 99 });
    // currentExerciseIndex unchanged; phase unchanged
    expect(after.currentExerciseIndex).toBe(s.currentExerciseIndex);
    expect(after.phase).toBe(s.phase);
  });
});

describe('toSaveWorkoutSets — zero-recorded-sets exercise', () => {
  it('excludes exercises with zero recorded sets; surviving exercise set_index starts at 1', () => {
    // twoEx: ex0=bench (has warmup+working), ex1=incline (no warmup, 1 working)
    // Record nothing for ex0, record the one set for ex1
    let s = buildRunnerState(twoEx);
    // Jump to ex1 (position 2) and record its single working set
    s = runnerReducer(s, { type: 'JUMP_TO', exerciseIndex: 1, nowMs: 5 });
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 6 }); // ex1 working set recorded
    const rows = toSaveWorkoutSets(s);
    // ex0 has no recorded sets and is not skipped — but toSaveWorkoutSets only emits recorded sets
    expect(rows.every((r) => r.exercise_id !== 'bench')).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].exercise_id).toBe('incline');
    expect(rows[0].set_index).toBe(1);
  });
});

describe('runnerReducer — CLEAR_REST', () => {
  it('CLEAR_REST after START_REST nulls both restStartedAtMs and restTargetSeconds', () => {
    let s = buildRunnerState(baseInput);
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 1 }); // advance to working set
    s = runnerReducer(s, { type: 'START_REST', nowMs: 2_000_000 });
    expect(s.restStartedAtMs).toBe(2_000_000);
    expect(s.restTargetSeconds).toBe(90);
    s = runnerReducer(s, { type: 'CLEAR_REST' });
    expect(s.restStartedAtMs).toBeNull();
    expect(s.restTargetSeconds).toBeNull();
  });
});

describe('runnerReducer — ADJUST_REST', () => {
  it('ADJUST_REST changes only the current rest target, floored at 0 (warm-up = count-up, unaffected)', () => {
    let s = buildRunnerState(baseInput);
    s = runnerReducer(s, { type: 'START_REST', nowMs: 1 }); // warm-up → count-up (null target)
    s = runnerReducer(s, { type: 'ADJUST_REST', deltaSeconds: -15 });
    expect(s.restTargetSeconds).toBeNull(); // warm-up = count-up, unaffected
  });

  it('ADJUST_REST on a working set adjusts the target and floors at 0', () => {
    let s = buildRunnerState(baseInput);
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 1 }); // record warm-up, advance to working set
    s = runnerReducer(s, { type: 'START_REST', nowMs: 2 }); // working rest target = 90
    expect(s.restTargetSeconds).toBe(90);
    s = runnerReducer(s, { type: 'ADJUST_REST', deltaSeconds: -15 });
    expect(s.restTargetSeconds).toBe(75);
    s = runnerReducer(s, { type: 'ADJUST_REST', deltaSeconds: -100 });
    expect(s.restTargetSeconds).toBe(0); // floored at 0
  });
});

describe('computeTimerView — exact boundary', () => {
  it('elapsed === target → done=true, remainingSeconds=0, overSeconds=0', () => {
    const start = 1_000_000;
    const target = 90;
    const result = computeTimerView(start, target, start + target * 1000);
    expect(result).toEqual({
      isCountUp: false,
      elapsedSeconds: 90,
      remainingSeconds: 0,
      overSeconds: 0,
      done: true,
    });
  });
});

describe('savedAtMs', () => {
  it('bumps savedAtMs to the action nowMs on any dispatched action', () => {
    const s = buildRunnerState(baseInput);
    expect(s.savedAtMs).toBe(1_000_000);
    const nowMs = 9_999_999;
    const after = runnerReducer(s, { type: 'START_REST', nowMs });
    expect(after.savedAtMs).toBe(nowMs);
  });
});

describe('focusIndex + SKIP_CURRENT target the exercise to do, not a finished one', () => {
  function completeFirstExercise() {
    let s = buildRunnerState(twoEx);
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 1 }); // warm-up
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 2 }); // working 1
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 3 }); // working 2 (last) → ex0 done, exercise-complete
    return s;
  }

  it('focusIndex is the active exercise mid-set', () => {
    expect(focusIndex(buildRunnerState(twoEx))).toBe(0);
  });

  it('focusIndex is the up-next when the current exercise is done (completion card)', () => {
    const s = completeFirstExercise();
    expect(s.phase).toBe('exercise-complete');
    expect(s.exercises[0].status).toBe('done');
    expect(focusIndex(s)).toBe(1);
  });

  it('SKIP_CURRENT on the completion card skips the up-next, preserving the finished exercise', () => {
    let s = completeFirstExercise();
    s = runnerReducer(s, { type: 'SKIP_CURRENT', nowMs: 4 });
    expect(s.exercises[0].status).toBe('done');     // NOT skipped — recorded sets preserved
    expect(s.exercises[1].status).toBe('skipped');  // the up-next is the one skipped
    // and the finished exercise's sets still make it into the save payload
    expect(toSaveWorkoutSets(s).some((r) => r.exercise_id === 'bench')).toBe(true);
  });

  it('SKIP_CURRENT mid-set still skips the active exercise', () => {
    let s = buildRunnerState(twoEx);
    s = runnerReducer(s, { type: 'SKIP_CURRENT', nowMs: 1 });
    expect(s.exercises[0].status).toBe('skipped');
  });
});
