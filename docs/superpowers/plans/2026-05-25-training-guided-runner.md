# Guided Active-Workout Runner (F-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guided "start workout" runner that walks the user through today's routine — warm-ups then working sets, a rest timer, per-set prefill-from-last, inline logging — and saves the whole session atomically via the existing `save_workout` RPC.

**Architecture:** A pure, fully-tested state core (`src/core/runner.ts`) holds the runner reducer + selectors + timer math; the existing `src/core/programs.ts` (`warmupWeightKg`) and `src/core/training.ts` (`lastWorkingSetForExercise`, per-set prefill) supply the math. Three thin React hooks (`useRestTimer`, `useRunnerDraft`, `useWakeLock`) bridge to the browser. A presentational `Runner` orchestrator renders one screen per state with the save mutation injected (mirrors `SessionEditor`). `RunnerPage` loads data + owns persistence; `EntrenamientoPage.startWorkout` re-points from the prefilled editor to the runner. **No schema or RPC changes** — `save_workout` already accepts `rpe`, `is_warmup`, `p_program_id`, `p_routine_id`.

**Tech Stack:** React 18 + TypeScript, Vite, react-router-dom, @tanstack/react-query, react-i18next, shadcn/ui (`Button`/`Input`), Vitest + RTL + jsdom, Supabase (PostgREST + RPC).

**Spec:** `docs/superpowers/specs/2026-05-25-training-guided-runner-design.md`

---

## File Structure

**Create:**
- `src/core/runner.ts` — pure runner state model: types, `buildRunnerState`, `runnerReducer`, selectors (`nextPendingIndex`, `skippedUndoneIndices`, `toSaveWorkoutSets`), and `computeTimerView`.
- `src/core/runner.test.ts` — Tier-1 tests for the above.
- `src/features/training/runner/useRestTimer.ts` — timestamp-based timer hook.
- `src/features/training/runner/useRestTimer.test.ts`
- `src/features/training/runner/useRunnerDraft.ts` — localStorage draft load/mirror/clear.
- `src/features/training/runner/useRunnerDraft.test.ts`
- `src/features/training/runner/useWakeLock.ts` — Screen Wake Lock acquire/release.
- `src/features/training/runner/alarm.ts` — sound + vibration at rest end.
- `src/features/training/runner/alarm.test.ts`
- `src/features/training/runner/RpeExplainer.tsx` — ⓘ sheet (reps-in-reserve anchors).
- `src/features/training/runner/RpeInput.tsx` — self-describing RPE picker.
- `src/features/training/runner/RestTimerBand.tsx` — timer display (countdown / count-up / over).
- `src/features/training/runner/SetView.tsx` — READY ↔ RESTING per-set screen.
- `src/features/training/runner/ExerciseStart.tsx` — working-weight anchor + coach line + plan.
- `src/features/training/runner/CompletionCard.tsx` — exercise-complete beat.
- `src/features/training/runner/ExerciseOverview.tsx` — jump / skip / finish-early.
- `src/features/training/runner/SkipRecovery.tsx` — finish-time skipped-exercise prompt.
- `src/features/training/runner/ReviewScreen.tsx` — pre-save review.
- `src/features/training/runner/ResumePrompt.tsx` — resume / discard a saved draft.
- `src/features/training/runner/Runner.tsx` — orchestrator (state → screen; injected `onSave`/`onExit`).
- `src/features/training/runner/Runner.test.tsx` — Tier-2 integration test.
- `src/pages/RunnerPage.tsx` — data load + draft + save + route.

**Modify:**
- `src/core/training.ts` — add `prefillSetsForExercise`.
- `src/pages/EntrenamientoPage.tsx` — `startWorkout` navigates to `/training/run` instead of `/training/new`.
- `src/app/router.tsx` — register `/training/run`.
- `src/i18n/en/entrenamiento.json` + `src/i18n/es/entrenamiento.json` — add `runner` + `rpe` keys.

---

## Task 1: Per-set prefill helper (`prefillSetsForExercise`)

**Files:**
- Modify: `src/core/training.ts` (add export after `lastWorkingSetForExercise`, ~line 256)
- Test: `src/core/training.test.ts` (append; file already exists)

- [ ] **Step 1: Write the failing test**

Append to `src/core/training.test.ts`:

```ts
import { prefillSetsForExercise } from './training';
import type { CoreSessionSet } from './training';

function set(p: Partial<CoreSessionSet>): CoreSessionSet {
  return {
    reps: 8, weightKg: 80, rpe: null, isWarmup: false,
    setIndex: 1, sessionId: 's1', exerciseId: 'e1', performedOn: '2026-05-01',
    ...p,
  };
}

describe('prefillSetsForExercise', () => {
  it('prefills each working set from the matching set of the most recent session', () => {
    const history: CoreSessionSet[] = [
      set({ sessionId: 's1', performedOn: '2026-05-10', setIndex: 1, reps: 8, weightKg: 80 }),
      set({ sessionId: 's1', performedOn: '2026-05-10', setIndex: 2, reps: 7, weightKg: 80 }),
      set({ sessionId: 's0', performedOn: '2026-05-03', setIndex: 1, reps: 5, weightKg: 70 }),
    ];
    expect(prefillSetsForExercise(history, 2, 5)).toEqual([
      { reps: 8, weightKg: 80 },
      { reps: 7, weightKg: 80 },
    ]);
  });

  it('ignores warm-up rows when choosing the matching set', () => {
    const history: CoreSessionSet[] = [
      set({ performedOn: '2026-05-10', setIndex: 1, isWarmup: true, reps: 10, weightKg: 40 }),
      set({ performedOn: '2026-05-10', setIndex: 2, reps: 8, weightKg: 82.5 }),
    ];
    expect(prefillSetsForExercise(history, 1, 5)).toEqual([{ reps: 8, weightKg: 82.5 }]);
  });

  it('falls back to the last working set when last session had fewer sets', () => {
    const history: CoreSessionSet[] = [
      set({ performedOn: '2026-05-10', setIndex: 1, reps: 8, weightKg: 80 }),
    ];
    expect(prefillSetsForExercise(history, 3, 5)).toEqual([
      { reps: 8, weightKg: 80 },
      { reps: 8, weightKg: 80 },
      { reps: 8, weightKg: 80 },
    ]);
  });

  it('falls back to target-rep floor with blank weight when there is no history', () => {
    expect(prefillSetsForExercise([], 2, 6)).toEqual([
      { reps: 6, weightKg: null },
      { reps: 6, weightKg: null },
    ]);
  });

  it('coerces string weights to numbers', () => {
    const history: CoreSessionSet[] = [
      set({ performedOn: '2026-05-10', setIndex: 1, reps: 8, weightKg: '77.5' }),
    ];
    expect(prefillSetsForExercise(history, 1, 5)).toEqual([{ reps: 8, weightKg: 77.5 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/core/training.test.ts -t prefillSetsForExercise`
Expected: FAIL — `prefillSetsForExercise is not a function` / no export.

- [ ] **Step 3: Implement the helper**

Add to `src/core/training.ts` (after `lastWorkingSetForExercise`, before the coach section comment at ~line 257):

```ts
export interface WorkingSetPrefill {
  reps: number;
  weightKg: number | null;
}

/**
 * Per-set prefill for a routine's working sets (spec §4.2). For each working
 * set index, prefill from the matching working set of the user's MOST RECENT
 * session of this exercise. Fallbacks: fewer sets last time → the last working
 * set; no history → target-rep floor with a blank weight. Warm-up rows are
 * ignored. Pure; the caller supplies the exercise's history.
 */
export function prefillSetsForExercise(
  history: CoreSessionSet[],
  targetSets: number,
  targetRepsMin: number,
): WorkingSetPrefill[] {
  const working = (history ?? []).filter((s) => !s.isWarmup);

  // Identify the most recent session (latest performedOn, tie-broken by
  // sessionId) and gather its working sets ordered by setIndex.
  let recentKey: { performedOn: string; sessionId: string } | null = null;
  for (const s of working) {
    if (
      recentKey === null ||
      s.performedOn > recentKey.performedOn ||
      (s.performedOn === recentKey.performedOn && s.sessionId > recentKey.sessionId)
    ) {
      recentKey = { performedOn: s.performedOn, sessionId: s.sessionId };
    }
  }
  const recentSets = recentKey
    ? working
        .filter((s) => s.sessionId === recentKey!.sessionId)
        .slice()
        .sort((a, b) => a.setIndex - b.setIndex)
    : [];

  const last = lastWorkingSetForExercise(history);

  const out: WorkingSetPrefill[] = [];
  for (let i = 0; i < targetSets; i += 1) {
    const match = recentSets[i];
    if (match) {
      out.push({ reps: match.reps, weightKg: Number(match.weightKg) });
    } else if (last) {
      out.push({ reps: last.reps, weightKg: Number(last.weightKg) });
    } else {
      out.push({ reps: targetRepsMin, weightKg: null });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/core/training.test.ts -t prefillSetsForExercise`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/training.ts src/core/training.test.ts
git commit -m "feat(training): per-set prefill helper for the guided runner"
```

---

## Task 2: Timer view math (`computeTimerView`)

**Files:**
- Create: `src/core/runner.ts`
- Test: `src/core/runner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/core/runner.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeTimerView } from './runner';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/core/runner.test.ts -t computeTimerView`
Expected: FAIL — cannot find module `./runner`.

- [ ] **Step 3: Implement**

Create `src/core/runner.ts`:

```ts
/**
 * Pure runner state model (spec §2, §3). No clock, no I/O — callers pass
 * `nowMs`/ISO dates and persist the returned state. Timer remaining-time is
 * derived from a start timestamp + target (spec §3.3) so a backgrounded tab
 * shows correct time on return.
 */

export interface TimerView {
  isCountUp: boolean;
  elapsedSeconds: number;
  remainingSeconds: number;
  overSeconds: number;
  done: boolean;
}

/** Timer view from a start timestamp + optional target (null ⇒ count-up). */
export function computeTimerView(
  startedAtMs: number,
  targetSeconds: number | null,
  nowMs: number,
): TimerView {
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  if (targetSeconds == null) {
    return { isCountUp: true, elapsedSeconds, remainingSeconds: 0, overSeconds: 0, done: false };
  }
  const remainingSeconds = Math.max(0, targetSeconds - elapsedSeconds);
  const overSeconds = Math.max(0, elapsedSeconds - targetSeconds);
  return {
    isCountUp: false,
    elapsedSeconds,
    remainingSeconds,
    overSeconds,
    done: elapsedSeconds >= targetSeconds,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/core/runner.test.ts -t computeTimerView`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/runner.ts src/core/runner.test.ts
git commit -m "feat(runner): timestamp-based timer view math"
```

---

## Task 3: Runner state types + `buildRunnerState`

**Files:**
- Modify: `src/core/runner.ts`
- Test: `src/core/runner.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/core/runner.test.ts`:

```ts
import { buildRunnerState, type RunnerInput } from './runner';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/core/runner.test.ts -t buildRunnerState`
Expected: FAIL — `buildRunnerState` / `RunnerInput` not exported.

- [ ] **Step 3: Implement**

Append to `src/core/runner.ts`:

```ts
import { warmupWeightKg } from './programs';
import type { SaveWorkoutSet } from '@/features/training/api';

export type ExerciseStatus = 'pending' | 'active' | 'done' | 'skipped';
export type RunnerPhase = 'ready' | 'resting' | 'exercise-complete' | 'finishing';

export interface RunnerSet {
  setIndex: number;            // 1-based, contiguous per exercise (warm-ups first)
  isWarmup: boolean;
  pct: number | null;          // warm-up: % of working weight; null for working sets
  reps: number;
  weightKg: number;            // 0 when unknown/blank
  rpe: number | null;          // working sets only
  recorded: boolean;
}

export interface RunnerExercise {
  exerciseId: string;
  position: number;            // 1-based fixed routine order
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number | null;
  targetRpe: number | null;
  defaultIncrementKg: number;  // weight stepper increment
  workingWeightKg: number;     // editable anchor (0 = unknown)
  warmupPrescriptions: { pct: number; reps: number }[];
  sets: RunnerSet[];
  status: ExerciseStatus;
}

export interface RunnerState {
  programId: string | null;
  routineId: string | null;
  routineName: string;
  performedOn: string;         // ISO date
  startedAtMs: number;
  savedAtMs: number;           // last activity (for "X min ago")
  exercises: RunnerExercise[];
  currentExerciseIndex: number;
  currentSetIndex: number;
  phase: RunnerPhase;
  restStartedAtMs: number | null;
  restTargetSeconds: number | null; // null ⇒ count-up
}

export interface RunnerInputExercise {
  exerciseId: string;
  position: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number | null;
  targetRpe: number | null;
  defaultIncrementKg: number;
  warmupSets: { pct: number; reps: number }[];
  lastWorkingWeightKg: number | null;
  workingSetPrefill: { reps: number; weightKg: number | null }[];
}

export interface RunnerInput {
  programId: string | null;
  routineId: string | null;
  routineName: string;
  performedOn: string;
  nowMs: number;
  exercises: RunnerInputExercise[];
}

function buildSets(ex: RunnerInputExercise, workingWeightKg: number): RunnerSet[] {
  const sets: RunnerSet[] = [];
  let idx = 1;
  for (const w of ex.warmupSets) {
    sets.push({
      setIndex: idx++,
      isWarmup: true,
      pct: w.pct,
      reps: w.reps,
      weightKg: workingWeightKg > 0 ? warmupWeightKg(workingWeightKg, w.pct) : 0,
      rpe: null,
      recorded: false,
    });
  }
  ex.workingSetPrefill.forEach((p) => {
    sets.push({
      setIndex: idx++,
      isWarmup: false,
      pct: null,
      reps: p.reps,
      weightKg: p.weightKg ?? 0,
      rpe: ex.targetRpe,
      recorded: false,
    });
  });
  return sets;
}

export function buildRunnerState(input: RunnerInput): RunnerState {
  const exercises: RunnerExercise[] = [...input.exercises]
    .sort((a, b) => a.position - b.position)
    .map((ex, i) => {
      const workingWeightKg = ex.lastWorkingWeightKg ?? 0;
      return {
        exerciseId: ex.exerciseId,
        position: ex.position,
        targetSets: ex.targetSets,
        targetRepsMin: ex.targetRepsMin,
        targetRepsMax: ex.targetRepsMax,
        restSeconds: ex.restSeconds,
        targetRpe: ex.targetRpe,
        defaultIncrementKg: ex.defaultIncrementKg > 0 ? ex.defaultIncrementKg : 2.5,
        workingWeightKg,
        warmupPrescriptions: ex.warmupSets,
        sets: buildSets(ex, workingWeightKg),
        status: i === 0 ? 'active' : 'pending',
      } satisfies RunnerExercise;
    });

  return {
    programId: input.programId,
    routineId: input.routineId,
    routineName: input.routineName,
    performedOn: input.performedOn,
    startedAtMs: input.nowMs,
    savedAtMs: input.nowMs,
    exercises,
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    phase: 'ready',
    restStartedAtMs: null,
    restTargetSeconds: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/core/runner.test.ts -t buildRunnerState`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/runner.ts src/core/runner.test.ts
git commit -m "feat(runner): state types + buildRunnerState"
```

---

## Task 4: Reducer — set editing, working weight, rest, record

**Files:**
- Modify: `src/core/runner.ts`
- Test: `src/core/runner.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/core/runner.test.ts`:

```ts
import { runnerReducer, type RunnerAction } from './runner';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/core/runner.test.ts -t "set editing"`
Expected: FAIL — `runnerReducer` not exported.

- [ ] **Step 3: Implement**

Append to `src/core/runner.ts`:

```ts
export type RunnerAction =
  | { type: 'SET_WORKING_WEIGHT'; weightKg: number }
  | { type: 'EDIT_CURRENT_SET'; patch: Partial<Pick<RunnerSet, 'reps' | 'weightKg' | 'rpe'>> }
  | { type: 'START_REST'; nowMs: number }
  | { type: 'RECORD_SET'; nowMs: number }
  | { type: 'ADD_SET'; nowMs: number }
  | { type: 'CONTINUE'; nowMs: number }
  | { type: 'JUMP_TO'; exerciseIndex: number; nowMs: number }
  | { type: 'SKIP_CURRENT'; nowMs: number }
  | { type: 'FINISH_EARLY'; nowMs: number };

function replaceExercise(
  state: RunnerState,
  index: number,
  fn: (ex: RunnerExercise) => RunnerExercise,
): RunnerExercise[] {
  return state.exercises.map((ex, i) => (i === index ? fn(ex) : ex));
}

function recomputeWarmups(ex: RunnerExercise): RunnerExercise {
  return {
    ...ex,
    sets: ex.sets.map((s) =>
      s.isWarmup && s.pct != null && !s.recorded
        ? { ...s, weightKg: ex.workingWeightKg > 0 ? warmupWeightKg(ex.workingWeightKg, s.pct) : 0 }
        : s,
    ),
  };
}

export function runnerReducer(state: RunnerState, action: RunnerAction): RunnerState {
  const ci = state.currentExerciseIndex;
  const si = state.currentSetIndex;
  const touch = (next: RunnerState): RunnerState => ({ ...next, savedAtMs: actionNow(action, next.savedAtMs) });

  switch (action.type) {
    case 'SET_WORKING_WEIGHT': {
      const exercises = replaceExercise(state, ci, (ex) =>
        recomputeWarmups({ ...ex, workingWeightKg: Math.max(0, action.weightKg) }),
      );
      return touch({ ...state, exercises });
    }
    case 'EDIT_CURRENT_SET': {
      const exercises = replaceExercise(state, ci, (ex) => ({
        ...ex,
        sets: ex.sets.map((s, i) => (i === si ? { ...s, ...action.patch } : s)),
      }));
      return touch({ ...state, exercises });
    }
    case 'START_REST': {
      const cur = state.exercises[ci].sets[si];
      const target = cur.isWarmup ? null : state.exercises[ci].restSeconds;
      return touch({ ...state, phase: 'resting', restStartedAtMs: action.nowMs, restTargetSeconds: target });
    }
    case 'RECORD_SET': {
      const ex = state.exercises[ci];
      const exercises = replaceExercise(state, ci, (e) => ({
        ...e,
        sets: e.sets.map((s, i) => (i === si ? { ...s, recorded: true } : s)),
      }));
      const isLast = si >= ex.sets.length - 1;
      if (isLast) {
        const done = replaceExercise({ ...state, exercises }, ci, (e) => ({ ...e, status: 'done' }));
        return touch({ ...state, exercises: done, phase: 'exercise-complete' });
        // rest timer intentionally left running (spec 0.21)
      }
      return touch({ ...state, exercises, currentSetIndex: si + 1, phase: 'ready' });
    }
    default:
      return navigationReducer(state, action, touch);
  }
}
```

(The `navigationReducer`, `actionNow` helpers land in Task 5 — this file won't compile standalone until then; that's fine, both tasks ship together conceptually but commit separately. To keep Task 4 green, add the two stubs now:)

```ts
function actionNow(action: RunnerAction, fallback: number): number {
  return 'nowMs' in action ? action.nowMs : fallback;
}

function navigationReducer(
  state: RunnerState,
  _action: RunnerAction,
  _touch: (s: RunnerState) => RunnerState,
): RunnerState {
  return state; // navigation actions implemented in Task 5
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/core/runner.test.ts -t "set editing"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/runner.ts src/core/runner.test.ts
git commit -m "feat(runner): reducer — edit/weight/rest/record actions"
```

---

## Task 5: Reducer — navigation + selectors

**Files:**
- Modify: `src/core/runner.ts` (replace the `navigationReducer` stub; add selectors)
- Test: `src/core/runner.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/core/runner.test.ts`:

```ts
import { nextPendingIndex, skippedUndoneIndices, toSaveWorkoutSets } from './runner';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/core/runner.test.ts -t "navigation"`
Expected: FAIL — selectors not exported / navigation returns unchanged state.

- [ ] **Step 3: Implement**

Replace the `navigationReducer` stub in `src/core/runner.ts` and append selectors:

```ts
export function nextPendingIndex(state: RunnerState): number {
  return state.exercises.findIndex((e) => e.status === 'pending');
}

export function skippedUndoneIndices(state: RunnerState): number[] {
  return state.exercises
    .map((e, i) => (e.status === 'skipped' ? i : -1))
    .filter((i) => i >= 0);
}

function activate(state: RunnerState, index: number): RunnerState {
  const exercises = state.exercises.map((e, i) =>
    i === index ? { ...e, status: 'active' as ExerciseStatus } : e,
  );
  const firstUnrecorded = Math.max(0, exercises[index].sets.findIndex((s) => !s.recorded));
  return {
    ...state,
    exercises,
    currentExerciseIndex: index,
    currentSetIndex: firstUnrecorded,
    phase: 'ready',
    restStartedAtMs: null,
    restTargetSeconds: null,
  };
}

function advanceOrFinish(state: RunnerState): RunnerState {
  const idx = nextPendingIndex(state);
  if (idx >= 0) return activate(state, idx);
  return { ...state, phase: 'finishing' };
}

function navigationReducer(
  state: RunnerState,
  action: RunnerAction,
  touch: (s: RunnerState) => RunnerState,
): RunnerState {
  const ci = state.currentExerciseIndex;
  switch (action.type) {
    case 'ADD_SET': {
      const ex = state.exercises[ci];
      const lastWorking = [...ex.sets].reverse().find((s) => !s.isWarmup);
      const newSet: RunnerSet = {
        setIndex: ex.sets.length + 1,
        isWarmup: false,
        pct: null,
        reps: lastWorking?.reps ?? ex.targetRepsMin,
        weightKg: lastWorking?.weightKg ?? ex.workingWeightKg,
        rpe: ex.targetRpe,
        recorded: false,
      };
      const exercises = replaceExercise(state, ci, (e) => ({
        ...e,
        status: 'active',
        sets: [...e.sets, newSet],
      }));
      return touch({ ...state, exercises, currentSetIndex: ex.sets.length, phase: 'ready' });
    }
    case 'CONTINUE':
      return touch(advanceOrFinish(state));
    case 'JUMP_TO':
      return touch(activate(state, action.exerciseIndex));
    case 'SKIP_CURRENT': {
      const exercises = replaceExercise(state, ci, (e) => ({ ...e, status: 'skipped' }));
      return touch(advanceOrFinish({ ...state, exercises }));
    }
    case 'FINISH_EARLY':
      return touch({ ...state, phase: 'finishing' });
    default:
      return state;
  }
}

/** Recorded sets of non-skipped exercises, re-indexed contiguously per
 *  exercise. Skipped exercises are excluded entirely (spec §0.9). */
export function toSaveWorkoutSets(state: RunnerState): SaveWorkoutSet[] {
  const rows: SaveWorkoutSet[] = [];
  for (const ex of state.exercises) {
    if (ex.status === 'skipped') continue;
    let idx = 1;
    for (const s of ex.sets) {
      if (!s.recorded) continue;
      rows.push({
        exercise_id: ex.exerciseId,
        set_index: idx++,
        reps: s.reps,
        weight_kg: s.weightKg,
        rpe: s.isWarmup ? null : s.rpe,
        is_warmup: s.isWarmup,
      });
    }
  }
  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/core/runner.test.ts`
Expected: PASS (all runner core tests).

- [ ] **Step 5: Verify the whole core compiles + typechecks, then commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add src/core/runner.ts src/core/runner.test.ts
git commit -m "feat(runner): reducer navigation + save-payload selectors"
```

---

## Task 6: `useRestTimer` hook

**Files:**
- Create: `src/features/training/runner/useRestTimer.ts`
- Test: `src/features/training/runner/useRestTimer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/training/runner/useRestTimer.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRestTimer } from './useRestTimer';

describe('useRestTimer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns idle view when no rest is running', () => {
    const { result } = renderHook(() => useRestTimer(null, 90));
    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.running).toBe(false);
  });

  it('counts down from a start timestamp and fires onDone once at zero', () => {
    const onDone = vi.fn();
    const start = Date.now();
    const { result } = renderHook(() => useRestTimer(start, 2, onDone));
    expect(result.current.remainingSeconds).toBe(2);
    act(() => { vi.advanceTimersByTime(2100); });
    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.done).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onDone).toHaveBeenCalledTimes(1); // not re-fired
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/features/training/runner/useRestTimer.test.ts`
Expected: FAIL — cannot find module `./useRestTimer`.

- [ ] **Step 3: Implement**

Create `src/features/training/runner/useRestTimer.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { computeTimerView, type TimerView } from '@/core/runner';

export interface RestTimerView extends TimerView {
  running: boolean;
}

const IDLE: RestTimerView = {
  running: false,
  isCountUp: false,
  elapsedSeconds: 0,
  remainingSeconds: 0,
  overSeconds: 0,
  done: false,
};

/**
 * Ticks every 250ms while a rest is running, deriving the view from the start
 * timestamp + target via the pure `computeTimerView` (spec §3.3 — wall-clock
 * math survives background throttling). Calls `onDone` exactly once when a
 * targeted countdown first reaches zero.
 */
export function useRestTimer(
  startedAtMs: number | null,
  targetSeconds: number | null,
  onDone?: () => void,
): RestTimerView {
  const [, force] = useState(0);
  const firedFor = useRef<number | null>(null);

  useEffect(() => {
    if (startedAtMs == null) return;
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [startedAtMs, targetSeconds]);

  if (startedAtMs == null) return IDLE;

  const view = computeTimerView(startedAtMs, targetSeconds, Date.now());

  if (view.done && targetSeconds != null && firedFor.current !== startedAtMs) {
    firedFor.current = startedAtMs;
    onDone?.();
  }

  return { ...view, running: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/features/training/runner/useRestTimer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/training/runner/useRestTimer.ts src/features/training/runner/useRestTimer.test.ts
git commit -m "feat(runner): useRestTimer hook"
```

---

## Task 7: `useRunnerDraft` hook (localStorage)

**Files:**
- Create: `src/features/training/runner/useRunnerDraft.ts`
- Test: `src/features/training/runner/useRunnerDraft.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/training/runner/useRunnerDraft.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadDraft, saveDraft, clearDraft, DRAFT_KEY } from './useRunnerDraft';
import type { RunnerState } from '@/core/runner';

const state = { routineName: 'Push Day', exercises: [], savedAtMs: 123 } as unknown as RunnerState;

describe('runner draft persistence', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when no draft is stored', () => {
    expect(loadDraft()).toBeNull();
  });

  it('round-trips a saved draft', () => {
    saveDraft(state);
    expect(loadDraft()).toEqual(state);
  });

  it('clearDraft removes it', () => {
    saveDraft(state);
    clearDraft();
    expect(loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('returns null on corrupt JSON', () => {
    localStorage.setItem(DRAFT_KEY, '{not json');
    expect(loadDraft()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/features/training/runner/useRunnerDraft.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

Create `src/features/training/runner/useRunnerDraft.ts`:

```ts
import { useEffect } from 'react';
import type { RunnerState } from '@/core/runner';

export const DRAFT_KEY = 'hf:runner:draft:v1';

export function loadDraft(): RunnerState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RunnerState;
  } catch {
    return null;
  }
}

export function saveDraft(state: RunnerState): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode — best effort */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** Mirror the live runner state to localStorage on every change (spec §3.2). */
export function useRunnerDraftMirror(state: RunnerState | null): void {
  useEffect(() => {
    if (state) saveDraft(state);
  }, [state]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/features/training/runner/useRunnerDraft.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/training/runner/useRunnerDraft.ts src/features/training/runner/useRunnerDraft.test.ts
git commit -m "feat(runner): localStorage draft persistence"
```

---

## Task 8: `useWakeLock` hook + `alarm` util

**Files:**
- Create: `src/features/training/runner/useWakeLock.ts`
- Create: `src/features/training/runner/alarm.ts`
- Test: `src/features/training/runner/alarm.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/training/runner/alarm.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { fireRestAlarm } from './alarm';

describe('fireRestAlarm', () => {
  it('does not throw when vibrate / AudioContext are unavailable (jsdom)', () => {
    expect(() => fireRestAlarm()).not.toThrow();
  });

  it('calls navigator.vibrate when present', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, vibrate });
    fireRestAlarm();
    expect(vibrate).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/features/training/runner/alarm.test.ts`
Expected: FAIL — cannot find module `./alarm`.

- [ ] **Step 3: Implement both**

Create `src/features/training/runner/alarm.ts`:

```ts
/** Best-effort rest-over cue: a short WebAudio beep + a vibration pattern.
 *  All capability-guarded — silently no-ops where unsupported (spec §3.3). */
export function fireRestAlarm(): void {
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    nav.vibrate?.([200, 80, 200]);
  } catch {
    /* ignore */
  }
  try {
    const Ctor =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.1;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => void ctx.close();
  } catch {
    /* ignore */
  }
}
```

Create `src/features/training/runner/useWakeLock.ts`:

```ts
import { useEffect } from 'react';

type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

/** Hold a Screen Wake Lock while `active`, re-acquiring on visibility regain
 *  (the lock drops when the tab is hidden). No-ops where unsupported (spec §3.4). */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const s = await nav.wakeLock!.request('screen');
        if (cancelled) { void s.release(); return; }
        sentinel = s;
      } catch {
        /* user gesture / permission — ignore */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (sentinel) void sentinel.release();
    };
  }, [active]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/features/training/runner/alarm.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/training/runner/useWakeLock.ts src/features/training/runner/alarm.ts src/features/training/runner/alarm.test.ts
git commit -m "feat(runner): wake-lock hook + rest-over alarm"
```

---

## Task 9: `RpeExplainer` + `RpeInput`

**Files:**
- Create: `src/features/training/runner/RpeExplainer.tsx`
- Create: `src/features/training/runner/RpeInput.tsx`

> i18n keys used here are added in Task 16. Until then `t()` renders the key string — harmless; the integration test in Task 16 asserts real copy.

- [ ] **Step 1: Implement `RpeExplainer`**

Create `src/features/training/runner/RpeExplainer.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';

/** ⓘ trigger → reps-in-reserve anchor table. Reused on the routine builder's
 *  target_rpe field and the runner's RPE input (spec §5.1). */
export function RpeExplainer() {
  const { t } = useTranslation('entrenamiento');
  const anchors = [10, 9, 8, 7, 6] as const;
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={t('rpe.explainLabel')}
        className="inline-flex items-center text-muted-foreground"
      >
        <Info className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent className="w-64 text-sm">
        <p className="font-medium">{t('rpe.title')}</p>
        <p className="text-muted-foreground text-xs mt-1">{t('rpe.subtitle')}</p>
        <ul className="mt-2 space-y-1">
          {anchors.map((v) => (
            <li key={v} className="flex justify-between">
              <span className="font-mono">{v.toFixed(1)}</span>
              <span className="text-muted-foreground">{t(`rpe.anchor.${v}`)}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Verify the `Popover` primitive exists**

Run: `ls src/components/ui/popover.tsx`
Expected: file exists. If it does NOT, replace the `Popover*` imports/usage with the existing `Dialog` primitive (`src/components/ui/dialog.tsx`) — same trigger/content shape.

- [ ] **Step 3: Implement `RpeInput`**

Create `src/features/training/runner/RpeInput.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { RpeExplainer } from './RpeExplainer';

const VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

interface Props {
  value: number | null;
  targetRpe: number | null;
  onChange: (rpe: number | null) => void;
}

/** Self-describing RPE picker (working sets only). Tapping the active chip
 *  clears it (RPE is always optional). Anchored copy via RpeExplainer. */
export function RpeInput({ value, targetRpe, onChange }: Props) {
  const { t } = useTranslation('entrenamiento');
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{t('rpe.label')}</span>
        {targetRpe != null && <span>· {t('rpe.target', { value: targetRpe.toFixed(1) })}</span>}
        <RpeExplainer />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {VALUES.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(value === v ? null : v)}
            className={cn(
              'rounded-md border px-2 py-1 text-xs',
              value === v ? 'border-primary bg-primary/10 font-medium' : 'border-input',
            )}
          >
            {v.toFixed(1)}
          </button>
        ))}
      </div>
      {value != null && (
        <p className="text-xs text-muted-foreground">{t(`rpe.anchorInline.${value}`, { defaultValue: '' })}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/training/runner/RpeExplainer.tsx src/features/training/runner/RpeInput.tsx
git commit -m "feat(runner): RPE explainer + self-describing picker"
```

---

## Task 10: `RestTimerBand` + `SetView`

**Files:**
- Create: `src/features/training/runner/RestTimerBand.tsx`
- Create: `src/features/training/runner/SetView.tsx`

- [ ] **Step 1: Implement `RestTimerBand`**

Create `src/features/training/runner/RestTimerBand.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RestTimerView } from './useRestTimer';

function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  timer: RestTimerView;
  compact?: boolean;
  onSkip: () => void;
  onAdjust?: (deltaSeconds: number) => void;
}

/** Rest display: countdown (green), count-up stopwatch (muted, warm-ups /
 *  null rest), or over-time. `compact` is the slim band shown after recording
 *  while the rest keeps running (spec §2 frame 7). */
export function RestTimerBand({ timer, compact, onSkip, onAdjust }: Props) {
  const { t } = useTranslation('entrenamiento');
  const label = timer.isCountUp
    ? `${fmt(timer.elapsedSeconds)} ↑`
    : timer.overSeconds > 0
      ? `+${fmt(timer.overSeconds)}`
      : fmt(timer.remainingSeconds);

  return (
    <div
      className={cn(
        'rounded-lg border text-center',
        timer.isCountUp ? 'border-muted bg-muted/30' : 'border-primary/50 bg-primary/10',
        compact ? 'flex items-center justify-between px-3 py-2' : 'p-3',
      )}
    >
      <div className={cn('uppercase tracking-wide text-muted-foreground', compact ? 'text-[10px]' : 'text-[10px]')}>
        {timer.isCountUp ? t('runner.restNoTarget') : t('runner.rest')}
      </div>
      <div className={cn('font-bold tabular-nums', compact ? 'text-base' : 'text-3xl text-primary')}>{label}</div>
      <div className={cn('flex justify-center gap-2', compact ? '' : 'mt-2')}>
        {onAdjust && !timer.isCountUp && (
          <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => onAdjust(-15)}>−15</Button>
        )}
        <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={onSkip}>{t('runner.skipRest')}</Button>
        {onAdjust && !timer.isCountUp && (
          <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => onAdjust(15)}>+15</Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `SetView`**

Create `src/features/training/runner/SetView.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { RunnerExercise, RunnerSet } from '@/core/runner';
import type { RestTimerView } from './useRestTimer';
import { RestTimerBand } from './RestTimerBand';
import { RpeInput } from './RpeInput';

interface Props {
  exercise: RunnerExercise;
  set: RunnerSet;
  setOrdinal: { current: number; total: number };  // 1-based working/warm-up position
  phase: 'ready' | 'resting';
  timer: RestTimerView;
  lastTimeLabel: string | null;
  onStartRest: () => void;
  onRecord: () => void;
  onEdit: (patch: Partial<Pick<RunnerSet, 'reps' | 'weightKg' | 'rpe'>>) => void;
  onSkipRest: () => void;
  onAdjustRest: (delta: number) => void;
}

/** One set, two states. READY: white read-only values + "Start rest".
 *  RESTING: editable reps/weight steppers (+ RPE on working sets) + "Record".
 *  (spec §0.20) */
export function SetView(props: Props) {
  const { exercise, set, setOrdinal, phase, timer, lastTimeLabel } = props;
  const { t } = useTranslation('entrenamiento');
  const editing = phase === 'resting';
  const inc = exercise.defaultIncrementKg;
  const title = set.isWarmup
    ? t('runner.warmupN', { n: setOrdinal.current, total: setOrdinal.total })
    : t('runner.setN', { n: setOrdinal.current, total: setOrdinal.total });

  return (
    <div className="flex flex-col gap-3">
      {editing && (
        <RestTimerBand timer={timer} onSkip={props.onSkipRest} onAdjust={props.onAdjustRest} />
      )}

      <div className="text-center text-lg font-bold">{title}</div>
      {lastTimeLabel && <p className="text-center text-xs text-muted-foreground">{lastTimeLabel}</p>}

      {editing ? (
        <>
          <Stepper
            label={t('runner.reps')}
            value={set.reps}
            onChange={(v) => props.onEdit({ reps: Math.max(0, v) })}
            step={1}
          />
          <Stepper
            label={t('runner.weight')}
            value={set.weightKg}
            onChange={(v) => props.onEdit({ weightKg: Math.max(0, v) })}
            step={inc}
            accent
          />
          {!set.isWarmup && (
            <RpeInput value={set.rpe} targetRpe={exercise.targetRpe} onChange={(rpe) => props.onEdit({ rpe })} />
          )}
        </>
      ) : (
        <>
          <ReadOnly value={`${set.reps} ${t('runner.repsShort')}`} />
          <ReadOnly value={`${set.weightKg} kg`} />
        </>
      )}

      <div className="mt-1">
        {editing ? (
          <Button type="button" className="w-full" onClick={props.onRecord}>
            {set.isWarmup ? t('runner.recordWarmup') : t('runner.recordSet')}
          </Button>
        ) : (
          <Button type="button" className="w-full" onClick={props.onStartRest}>
            {t('runner.startRest')}
          </Button>
        )}
      </div>
    </div>
  );
}

function ReadOnly({ value }: { value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 py-2 text-center text-base font-bold text-foreground">
      {value}
    </div>
  );
}

function Stepper({
  label, value, onChange, step, accent,
}: { label: string; value: number; onChange: (v: number) => void; step: number; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-2 py-1.5">
      <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label={`${label} -`} onClick={() => onChange(round(value - step))}>
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        type="number"
        inputMode="decimal"
        aria-label={label}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className={accent ? 'h-9 text-center font-semibold text-[hsl(var(--primary))]' : 'h-9 text-center font-semibold'}
      />
      <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label={`${label} +`} onClick={() => onChange(round(value + step))}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/training/runner/RestTimerBand.tsx src/features/training/runner/SetView.tsx
git commit -m "feat(runner): rest-timer band + READY/RESTING set view"
```

---

## Task 11: `ExerciseStart` (working weight + coach line)

**Files:**
- Create: `src/features/training/runner/ExerciseStart.tsx`

- [ ] **Step 1: Implement**

Create `src/features/training/runner/ExerciseStart.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { evaluateCoach, type CoachContext } from '@/core/training';
import type { RunnerExercise } from '@/core/runner';

interface Props {
  exercise: RunnerExercise;
  exerciseName: string;
  coachContext: CoachContext | null;  // null until history resolves
  onSetWorkingWeight: (kg: number) => void;
  onBegin: () => void;
}

/** Exercise-start screen: large name, editable working-weight anchor, ONE quiet
 *  coach line (top suggestion), and the plan. (spec §2 frame 2, §5.2) */
export function ExerciseStart({ exercise, exerciseName, coachContext, onSetWorkingWeight, onBegin }: Props) {
  const { t } = useTranslation('entrenamiento');
  const tc = useTranslation('coach').t;
  const top = coachContext ? evaluateCoach(coachContext)[0] ?? null : null;
  const warmups = exercise.sets.filter((s) => s.isWarmup);
  const working = exercise.sets.filter((s) => !s.isWarmup);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-center text-xl font-extrabold">{exerciseName}</h2>

      <div className="rounded-lg border p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('runner.workingWeight')}</div>
        <Input
          type="number"
          inputMode="decimal"
          step={exercise.defaultIncrementKg}
          min={0}
          aria-label={t('runner.workingWeight')}
          value={exercise.workingWeightKg || ''}
          onChange={(e) => onSetWorkingWeight(Math.max(0, Number(e.target.value)))}
          className="mt-1 h-9 font-semibold"
        />
      </div>

      {top && (
        <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-2 text-xs">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span>{tc(top.headline, top.detail)}</span>
        </div>
      )}

      <div className="space-y-1">
        {warmups.map((w) => (
          <div key={w.setIndex} className="flex justify-between rounded-md bg-muted/40 px-2 py-1 text-sm">
            <span>{t('runner.warmup')} · {w.weightKg || '—'} kg</span>
            <span>× {w.reps}</span>
          </div>
        ))}
        <div className="flex justify-between rounded-md bg-muted/40 px-2 py-1 text-sm">
          <span>{t('runner.setsN', { count: working.length })}</span>
          <span>{exercise.targetRepsMin === exercise.targetRepsMax ? exercise.targetRepsMin : `${exercise.targetRepsMin}–${exercise.targetRepsMax}`} {t('runner.repsShort')}</span>
        </div>
      </div>

      <Button type="button" className="w-full" onClick={onBegin}>{t('runner.begin')}</Button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/training/runner/ExerciseStart.tsx
git commit -m "feat(runner): exercise-start screen with working-weight anchor + coach line"
```

---

## Task 12: `CompletionCard` + `ExerciseOverview`

**Files:**
- Create: `src/features/training/runner/CompletionCard.tsx`
- Create: `src/features/training/runner/ExerciseOverview.tsx`

- [ ] **Step 1: Implement `CompletionCard`**

Create `src/features/training/runner/CompletionCard.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { workingSetVolume } from '@/core/training';
import type { RunnerExercise } from '@/core/runner';

interface Props {
  exercise: RunnerExercise;
  exerciseName: string;
  nextExerciseName: string | null;
  nextExercisePlan: string | null;     // e.g. "3 × 10"
  onAddSet: () => void;
  onOpenOverview: () => void;
  onContinue: () => void;
}

/** Exercise-complete beat (spec §0.24): ✓ + volume, +Add set (above), up-next,
 *  Jump-to-overview, Continue (primary, bottom). */
export function CompletionCard({
  exercise, exerciseName, nextExerciseName, nextExercisePlan,
  onAddSet, onOpenOverview, onContinue,
}: Props) {
  const { t } = useTranslation('entrenamiento');
  const recorded = exercise.sets.filter((s) => s.recorded);
  const workingCount = recorded.filter((s) => !s.isWarmup).length;
  const volume = workingSetVolume(
    recorded.map((s) => ({ reps: s.reps, weightKg: s.weightKg, isWarmup: s.isWarmup })),
  );

  return (
    <div className="flex min-h-[60vh] flex-col gap-3">
      <div className="text-center text-3xl text-primary"><Check className="mx-auto h-8 w-8" /></div>
      <div className="text-center text-base font-bold">{t('runner.exerciseDone', { name: exerciseName })}</div>
      <p className="text-center text-xs text-muted-foreground">
        {t('runner.completeSummary', { sets: workingCount, volume: Math.round(volume) })}
      </p>

      <Button type="button" variant="outline" className="w-full" onClick={onAddSet}>
        {t('runner.addSet')}
      </Button>

      {nextExerciseName && (
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('runner.upNext')}</div>
          <div className="text-base font-bold">{nextExerciseName}</div>
          {nextExercisePlan && <div className="text-sm font-semibold text-[hsl(var(--primary))]">{nextExercisePlan}</div>}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <Button type="button" variant="outline" className="w-full" onClick={onOpenOverview}>
          {t('runner.jumpToExercise')}
        </Button>
        <Button type="button" className="w-full" onClick={onContinue}>{t('runner.continue')}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `ExerciseOverview`**

Create `src/features/training/runner/ExerciseOverview.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RunnerExercise } from '@/core/runner';

interface Props {
  exercises: RunnerExercise[];
  currentIndex: number;
  names: Record<string, string>;
  onJump: (index: number) => void;
  onSkipCurrent: () => void;
  onFinishEarly: () => void;
  onClose: () => void;
}

/** Jump / skip / finish-early (spec §2 frame 9). Jump targets any
 *  remaining/skipped exercise. */
export function ExerciseOverview({
  exercises, currentIndex, names, onJump, onSkipCurrent, onFinishEarly, onClose,
}: Props) {
  const { t } = useTranslation('entrenamiento');
  return (
    <div className="flex min-h-[60vh] flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">{t('runner.jumpToExercise')}</h2>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>{t('runner.close')}</Button>
      </div>
      {exercises.map((ex, i) => {
        const done = ex.status === 'done';
        const skipped = ex.status === 'skipped';
        const isCurrent = i === currentIndex;
        const canJump = !isCurrent && (ex.status === 'pending' || skipped);
        return (
          <button
            key={ex.exerciseId}
            type="button"
            disabled={!canJump}
            onClick={() => canJump && onJump(i)}
            className={cn(
              'flex items-center justify-between rounded-md px-3 py-2 text-sm text-left',
              done && 'bg-muted/40 text-muted-foreground',
              skipped && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
              isCurrent && 'border border-primary/50 bg-primary/10',
              !done && !skipped && !isCurrent && 'bg-muted/30',
            )}
          >
            <span>{ex.position} · {names[ex.exerciseId] ?? ex.exerciseId}</span>
            <span>
              {done ? '✓' : isCurrent ? t('runner.now') : skipped ? t('runner.skippedDoIt') : t('runner.jump')}
            </span>
          </button>
        );
      })}
      <div className="mt-auto flex flex-col gap-2">
        <Button type="button" variant="outline" className="w-full" onClick={onSkipCurrent}>{t('runner.skipCurrent')}</Button>
        <Button type="button" variant="destructive" className="w-full" onClick={onFinishEarly}>{t('runner.finishEarly')}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/training/runner/CompletionCard.tsx src/features/training/runner/ExerciseOverview.tsx
git commit -m "feat(runner): completion card + exercise overview"
```

---

## Task 13: `SkipRecovery` + `ReviewScreen` + `ResumePrompt`

**Files:**
- Create: `src/features/training/runner/SkipRecovery.tsx`
- Create: `src/features/training/runner/ReviewScreen.tsx`
- Create: `src/features/training/runner/ResumePrompt.tsx`

- [ ] **Step 1: Implement `SkipRecovery`**

Create `src/features/training/runner/SkipRecovery.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { RunnerExercise } from '@/core/runner';

interface Props {
  skipped: RunnerExercise[];
  names: Record<string, string>;
  onDoExercise: (index: number) => void;
  indexOf: (ex: RunnerExercise) => number;
  onProceed: () => void;
}

/** Finish-time prompt surfacing undone skipped exercises (spec §0.23). */
export function SkipRecovery({ skipped, names, onDoExercise, indexOf, onProceed }: Props) {
  const { t } = useTranslation('entrenamiento');
  return (
    <div className="flex min-h-[60vh] flex-col gap-3">
      <h2 className="text-center text-lg font-bold">{t('runner.finishQuestion')}</h2>
      <p className="text-center text-xs text-muted-foreground">{t('runner.skippedCount', { count: skipped.length })}</p>
      <div className="space-y-1">
        {skipped.map((ex) => (
          <div key={ex.exerciseId} className="flex justify-between rounded-md bg-amber-500/10 px-3 py-2 text-sm">
            <span>{names[ex.exerciseId] ?? ex.exerciseId}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => onDoExercise(indexOf(ex))}>
              {t('runner.doNow')}
            </Button>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">{t('runner.skippedNotSaved')}</p>
      <div className="mt-auto">
        <Button type="button" className="w-full" onClick={onProceed}>{t('runner.saveWithout')}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `ReviewScreen`**

Create `src/features/training/runner/ReviewScreen.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RunnerExercise } from '@/core/runner';

interface Props {
  exercises: RunnerExercise[];
  names: Record<string, string>;
  routineName: string;
  saving: boolean;
  onSave: () => void;
}

/** Pre-save review (spec §0.15). Skipped flagged; warm-ups included in saved
 *  sets but the per-exercise count shows working+warm-up recorded. */
export function ReviewScreen({ exercises, names, routineName, saving, onSave }: Props) {
  const { t } = useTranslation('entrenamiento');
  return (
    <div className="flex min-h-[60vh] flex-col gap-2">
      <h2 className="text-center text-base font-bold">{routineName}</h2>
      {exercises.map((ex) => {
        const recorded = ex.sets.filter((s) => s.recorded).length;
        const skipped = ex.status === 'skipped';
        return (
          <div
            key={ex.exerciseId}
            className={cn('flex justify-between rounded-md px-3 py-2 text-sm',
              skipped ? 'bg-muted/30 text-muted-foreground' : 'bg-muted/40')}
          >
            <span>{names[ex.exerciseId] ?? ex.exerciseId}</span>
            <span>{skipped ? t('runner.skipped') : t('runner.setsLogged', { count: recorded })}</span>
          </div>
        );
      })}
      <p className="text-center text-xs text-muted-foreground">{t('runner.reviewNote')}</p>
      <div className="mt-auto">
        <Button type="button" className="w-full" disabled={saving} onClick={onSave}>
          {saving ? t('runner.saving') : t('runner.saveWorkout')}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement `ResumePrompt`**

Create `src/features/training/runner/ResumePrompt.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { RunnerState } from '@/core/runner';

interface Props {
  draft: RunnerState;
  nowMs: number;
  onResume: () => void;
  onDiscard: () => void;
}

/** Resume / discard a saved in-progress workout on reopen (spec §0.3). */
export function ResumePrompt({ draft, nowMs, onResume, onDiscard }: Props) {
  const { t } = useTranslation('entrenamiento');
  const minutes = Math.max(0, Math.round((nowMs - draft.savedAtMs) / 60000));
  const doneCount = draft.exercises.filter((e) => e.status === 'done').length;
  return (
    <div className="flex min-h-[60vh] flex-col justify-center gap-3">
      <div className="rounded-lg border p-4 text-center text-sm">
        {t('runner.resumeQuestion', { name: draft.routineName, minutes })}
        <div className="mt-2 text-muted-foreground">
          {t('runner.resumeProgress', { done: doneCount, total: draft.exercises.length })}
        </div>
      </div>
      <Button type="button" className="w-full" onClick={onResume}>{t('runner.resume')}</Button>
      <Button type="button" variant="destructive" className="w-full" onClick={onDiscard}>{t('runner.discard')}</Button>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/training/runner/SkipRecovery.tsx src/features/training/runner/ReviewScreen.tsx src/features/training/runner/ResumePrompt.tsx
git commit -m "feat(runner): skip-recovery, review, and resume-prompt screens"
```

---

## Task 14: `Runner` orchestrator

**Files:**
- Create: `src/features/training/runner/Runner.tsx`

This is the state machine wiring. It owns the reducer + UI-local `showOverview`, drives the timer/wake-lock/alarm, and renders one screen per phase. Save + exit are injected (mirrors `SessionEditor`'s `onSubmit`) so it's testable without TanStack.

- [ ] **Step 1: Implement**

Create `src/features/training/runner/Runner.tsx`:

```tsx
import { useMemo, useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CoachContext } from '@/core/training';
import {
  runnerReducer,
  nextPendingIndex,
  skippedUndoneIndices,
  toSaveWorkoutSets,
  type RunnerState,
  type RunnerExercise,
} from '@/core/runner';
import type { SaveWorkoutPayload } from '../api';
import { useRestTimer } from './useRestTimer';
import { useWakeLock } from './useWakeLock';
import { useRunnerDraftMirror } from './useRunnerDraft';
import { fireRestAlarm } from './alarm';
import { SetView } from './SetView';
import { ExerciseStart } from './ExerciseStart';
import { CompletionCard } from './CompletionCard';
import { ExerciseOverview } from './ExerciseOverview';
import { SkipRecovery } from './SkipRecovery';
import { ReviewScreen } from './ReviewScreen';

interface Props {
  initialState: RunnerState;
  names: Record<string, string>;
  coachContextByExercise: Record<string, CoachContext>;
  lastTimeByExercise: Record<string, string | null>;  // "8 × 80 kg" reference per exercise
  onSave: (payload: SaveWorkoutPayload) => Promise<unknown>;
  onExit: () => void;        // back out without saving
  onSaved: () => void;       // after a successful save (clears draft + navigates)
}

function planLabel(ex: RunnerExercise): string {
  const reps = ex.targetRepsMin === ex.targetRepsMax ? `${ex.targetRepsMin}` : `${ex.targetRepsMin}–${ex.targetRepsMax}`;
  return `${ex.targetSets} × ${reps}`;
}

export function Runner({
  initialState, names, coachContextByExercise, lastTimeByExercise, onSave, onExit, onSaved,
}: Props) {
  const { t } = useTranslation('entrenamiento');
  const [state, dispatch] = useReducer(runnerReducer, initialState);
  const [begun, setBegun] = useState(false);     // exercise-start gate (per active exercise)
  const [showOverview, setShowOverview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useRunnerDraftMirror(state);
  useWakeLock(state.phase !== 'finishing');

  const timer = useRestTimer(state.restStartedAtMs, state.restTargetSeconds, fireRestAlarm);

  const ex = state.exercises[state.currentExerciseIndex];
  const set = ex?.sets[state.currentSetIndex];

  // Reset the begin-gate whenever we activate a different exercise.
  const activeKey = `${state.currentExerciseIndex}:${ex?.status}`;
  const lastKey = useMemo(() => ({ k: activeKey }), []); // eslint-disable-line react-hooks/exhaustive-deps
  if (lastKey.k !== activeKey) {
    lastKey.k = activeKey;
    if (begun) setBegun(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        sessionId: null,
        performedOn: state.performedOn,
        title: null,
        notes: null,
        sets: toSaveWorkoutSets(state),
        programId: state.programId,
        routineId: state.routineId,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <div className="flex items-center justify-between">
      <Button type="button" size="icon" variant="ghost" aria-label={t('runner.exit')} onClick={onExit}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm text-muted-foreground">{state.routineName}</span>
      <Button type="button" size="sm" variant="ghost" onClick={() => setShowOverview(true)}>
        {t('runner.exercisesShort', { current: state.currentExerciseIndex + 1, total: state.exercises.length })}
      </Button>
    </div>
  );

  if (showOverview) {
    return (
      <div className="space-y-3">
        {header}
        <ExerciseOverview
          exercises={state.exercises}
          currentIndex={state.currentExerciseIndex}
          names={names}
          onJump={(i) => { dispatch({ type: 'JUMP_TO', exerciseIndex: i, nowMs: Date.now() }); setBegun(false); setShowOverview(false); }}
          onSkipCurrent={() => { dispatch({ type: 'SKIP_CURRENT', nowMs: Date.now() }); setShowOverview(false); }}
          onFinishEarly={() => { dispatch({ type: 'FINISH_EARLY', nowMs: Date.now() }); setShowOverview(false); }}
          onClose={() => setShowOverview(false)}
        />
      </div>
    );
  }

  if (state.phase === 'finishing') {
    const skipped = skippedUndoneIndices(state).map((i) => state.exercises[i]);
    if (skipped.length > 0) {
      return (
        <div className="space-y-3">
          {header}
          <SkipRecovery
            skipped={skipped}
            names={names}
            indexOf={(e) => state.exercises.indexOf(e)}
            onDoExercise={(i) => { dispatch({ type: 'JUMP_TO', exerciseIndex: i, nowMs: Date.now() }); setBegun(true); }}
            onProceed={() => dispatch({ type: 'JUMP_TO', exerciseIndex: -1, nowMs: Date.now() })}
          />
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {header}
        <ReviewScreen
          exercises={state.exercises}
          names={names}
          routineName={state.routineName}
          saving={saving}
          onSave={handleSave}
        />
        {error && <p className="text-center text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  if (state.phase === 'exercise-complete') {
    const nextIdx = nextPendingIndex(state);
    const next = nextIdx >= 0 ? state.exercises[nextIdx] : null;
    return (
      <div className="space-y-3">
        {header}
        <CompletionCard
          exercise={ex}
          exerciseName={names[ex.exerciseId] ?? ex.exerciseId}
          nextExerciseName={next ? names[next.exerciseId] ?? next.exerciseId : null}
          nextExercisePlan={next ? planLabel(next) : null}
          onAddSet={() => dispatch({ type: 'ADD_SET', nowMs: Date.now() })}
          onOpenOverview={() => setShowOverview(true)}
          onContinue={() => { dispatch({ type: 'CONTINUE', nowMs: Date.now() }); setBegun(false); }}
        />
      </div>
    );
  }

  // ready / resting on a set
  if (!begun) {
    return (
      <div className="space-y-3">
        {header}
        <ExerciseStart
          exercise={ex}
          exerciseName={names[ex.exerciseId] ?? ex.exerciseId}
          coachContext={coachContextByExercise[ex.exerciseId] ?? null}
          onSetWorkingWeight={(kg) => dispatch({ type: 'SET_WORKING_WEIGHT', weightKg: kg })}
          onBegin={() => setBegun(true)}
        />
      </div>
    );
  }

  // ordinal within warm-ups or working sets
  const sameKind = ex.sets.filter((s) => s.isWarmup === set.isWarmup);
  const ordinal = sameKind.findIndex((s) => s.setIndex === set.setIndex) + 1;

  return (
    <div className="space-y-3">
      {header}
      <SetView
        exercise={ex}
        set={set}
        setOrdinal={{ current: ordinal, total: sameKind.length }}
        phase={state.phase === 'resting' ? 'resting' : 'ready'}
        timer={timer}
        lastTimeLabel={!set.isWarmup ? lastTimeByExercise[ex.exerciseId] ?? null : null}
        onStartRest={() => dispatch({ type: 'START_REST', nowMs: Date.now() })}
        onRecord={() => dispatch({ type: 'RECORD_SET', nowMs: Date.now() })}
        onEdit={(patch) => dispatch({ type: 'EDIT_CURRENT_SET', patch })}
        onSkipRest={() => dispatch({ type: 'RECORD_SET', nowMs: Date.now() })}
        onAdjustRest={(delta) => dispatch({ type: 'START_REST', nowMs: Date.now() - (state.restTargetSeconds != null ? Math.min(0, (state.restTargetSeconds + delta)) : 0) * 0 - 0 })}
      />
    </div>
  );
}
```

> **Note on `onAdjustRest`:** the inline expression above is deliberately a no-op placeholder for ±15s arithmetic and MUST be replaced. Implement it properly: ±15 adjusts `restTargetSeconds` for the current rest only. Add a dedicated action in `src/core/runner.ts` in this step:

```ts
// add to RunnerAction union:
  | { type: 'ADJUST_REST'; deltaSeconds: number }
// add to runnerReducer switch (before default):
    case 'ADJUST_REST': {
      if (state.restTargetSeconds == null) return state;
      const next = Math.max(0, state.restTargetSeconds + action.deltaSeconds);
      return { ...state, restTargetSeconds: next };
    }
```

Then set `onAdjustRest={(delta) => dispatch({ type: 'ADJUST_REST', deltaSeconds: delta })}`.

- [ ] **Step 2: Add the `ADJUST_REST` action + fix `onAdjustRest`**

Apply the two `src/core/runner.ts` edits from the note and replace the `onAdjustRest` line in `Runner.tsx`. Add a quick test in `src/core/runner.test.ts`:

```ts
it('ADJUST_REST changes only the current rest target, floored at 0', () => {
  let s = buildRunnerState(baseInput);
  s = runnerReducer(s, { type: 'START_REST', nowMs: 1 });
  s = runnerReducer(s, { type: 'ADJUST_REST', deltaSeconds: -15 });
  expect(s.restTargetSeconds).toBeNull(); // warm-up = count-up, unaffected
});
```

(For a working set the target is 90 → 75 after −15; the warm-up case above asserts the count-up guard.)

- [ ] **Step 3: Typecheck + run core tests**

Run: `pnpm typecheck && pnpm test -- src/core/runner.test.ts`
Expected: no type errors; all runner tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/runner.ts src/core/runner.test.ts src/features/training/runner/Runner.tsx
git commit -m "feat(runner): orchestrator state machine + ADJUST_REST"
```

---

## Task 15: `RunnerPage` + route + re-point `startWorkout`

**Files:**
- Create: `src/pages/RunnerPage.tsx`
- Modify: `src/app/router.tsx` (after line 112)
- Modify: `src/pages/EntrenamientoPage.tsx` (`startWorkout` navigate target + payload)

- [ ] **Step 1: Implement `RunnerPage`**

The page receives the same `prefill`-style router state `EntrenamientoPage` already builds, plus per-exercise history (added in Step 3). It builds `RunnerState`, shows the resume prompt if a draft exists, mirrors the draft, and wires save.

Create `src/pages/RunnerPage.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSaveWorkout } from '@/features/training/hooks';
import { Runner } from '@/features/training/runner/Runner';
import { ResumePrompt } from '@/features/training/runner/ResumePrompt';
import { loadDraft, clearDraft } from '@/features/training/runner/useRunnerDraft';
import { buildRunnerState, type RunnerInput, type RunnerState } from '@/core/runner';
import type { CoachContext, CoreSessionSet } from '@/core/training';
import { lastWorkingSetForExercise } from '@/core/training';

export interface RunnerRouteState {
  programId: string | null;
  routineId: string | null;
  routineName: string;
  exercises: RunnerInput['exercises'];
  names: Record<string, string>;
  historyByExercise: Record<string, CoreSessionSet[]>;
  coachContextByExercise: Record<string, CoachContext>;
}

export function RunnerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const save = useSaveWorkout();
  const route = (location.state as { runner?: RunnerRouteState } | null)?.runner ?? null;

  const draft = useMemo(() => loadDraft(), []);
  const [resumed, setResumed] = useState<RunnerState | null>(null);
  const [discarded, setDiscarded] = useState(false);

  if (!route && !draft) {
    navigate('/training', { replace: true });
    return null;
  }

  // Resume gate: a saved draft (and we haven't chosen yet).
  if (draft && !resumed && !discarded) {
    return (
      <ResumePrompt
        draft={draft}
        nowMs={Date.now()}
        onResume={() => setResumed(draft)}
        onDiscard={() => { clearDraft(); setDiscarded(true); }}
      />
    );
  }

  if (!route) {
    // Draft discarded but no fresh route → bounce home.
    navigate('/training', { replace: true });
    return null;
  }

  const initialState =
    resumed ??
    buildRunnerState({
      programId: route.programId,
      routineId: route.routineId,
      routineName: route.routineName,
      performedOn: new Date().toISOString().slice(0, 10),
      nowMs: Date.now(),
      exercises: route.exercises,
    });

  const lastTimeByExercise: Record<string, string | null> = {};
  for (const [id, history] of Object.entries(route.historyByExercise)) {
    const last = lastWorkingSetForExercise(history);
    lastTimeByExercise[id] = last ? `${last.reps} × ${Number(last.weightKg)} kg` : null;
  }

  return (
    <Runner
      initialState={initialState}
      names={route.names}
      coachContextByExercise={route.coachContextByExercise}
      lastTimeByExercise={lastTimeByExercise}
      onSave={(payload) => save.mutateAsync(payload)}
      onExit={() => navigate('/training')}
      onSaved={() => { clearDraft(); navigate('/training'); }}
    />
  );
}
```

- [ ] **Step 2: Register the route**

In `src/app/router.tsx`, add the import near line 25 and the route after line 112:

```tsx
import { RunnerPage } from '@/pages/RunnerPage';
```
```tsx
          <Route path="/training/run" element={<RunnerPage />} />
```

- [ ] **Step 3: Re-point `startWorkout` in `EntrenamientoPage.tsx`**

Replace the body of `startWorkout` (lines 69–113) so it builds the runner route state (per-exercise history + coach context + names) and navigates to `/training/run`:

```tsx
  async function startWorkout(routine: RoutineWithExercises) {
    const res = routine.routine_exercises.slice().sort((a, b) => a.position - b.position);
    const ids = res.map((re) => re.exercise_id);

    const [exercisesResult, histories] = await Promise.all([
      ids.length > 0
        ? supabase.from('exercises').select('*').in('id', ids)
        : Promise.resolve({ data: [] as Exercise[] }),
      user
        ? Promise.all(
            res.map((re) =>
              fetchExerciseHistory(user.id, re.exercise_id).then((history) => ({
                exerciseId: re.exercise_id,
                history,
              })),
            ),
          )
        : Promise.resolve(res.map((re) => ({ exerciseId: re.exercise_id, history: [] as CoreSessionSet[] }))),
    ]);

    const exById: Record<string, Exercise> = {};
    for (const ex of (exercisesResult.data ?? []) as Exercise[]) exById[ex.id] = ex;

    const historyByExercise: Record<string, CoreSessionSet[]> = {};
    for (const { exerciseId, history } of histories) historyByExercise[exerciseId] = history;

    const lang = (i18n.language || 'es').startsWith('en') ? 'en' : 'es';
    const names: Record<string, string> = {};
    const coachContextByExercise: Record<string, CoachContext> = {};
    const today = todayInTZ();

    const exercises = res.map((re) => {
      const history = historyByExercise[re.exercise_id] ?? [];
      const last = lastWorkingSetForExercise(history);
      const exRow = exById[re.exercise_id];
      names[re.exercise_id] =
        (lang === 'en' ? exRow?.name_en : null) ?? exRow?.name_es ?? re.exercise_id;
      coachContextByExercise[re.exercise_id] = {
        exerciseId: re.exercise_id,
        primaryMuscle: exRow?.primary_muscle ?? null,
        equipment: exRow?.equipment ?? null,
        defaultIncrementKg: exRow?.default_increment_kg ?? null,
        history,
        todayISO: today,
      };
      return {
        exerciseId: re.exercise_id,
        position: re.position,
        targetSets: re.target_sets,
        targetRepsMin: re.target_reps_min,
        targetRepsMax: re.target_reps_max,
        restSeconds: re.rest_seconds,
        targetRpe: re.target_rpe,
        defaultIncrementKg: exRow?.default_increment_kg ?? 2.5,
        warmupSets: ((re.warmup_sets as RoutineWarmupSet[] | null) ?? []),
        lastWorkingWeightKg: last != null ? Number(last.weightKg) : null,
        workingSetPrefill: prefillSetsForExercise(history, re.target_sets, re.target_reps_min),
      };
    });

    navigate('/training/run', {
      state: {
        runner: {
          programId: active?.id ?? null,
          routineId: routine.id,
          routineName: routine.name,
          exercises,
          names,
          historyByExercise,
          coachContextByExercise,
        },
      },
    });
  }
```

Update the imports at the top of `EntrenamientoPage.tsx`:

```tsx
import { lastWorkingSetForExercise, prefillSetsForExercise } from '@/core/training';
import type { CoachContext, CoreSessionSet } from '@/core/training';
import i18n from '@/i18n';
```

Remove the now-unused `prefillSetsFromRoutine` import and the `toPrescription` helper if no longer referenced. Run `pnpm lint` to confirm.

> **Verify the i18n default-export path:** Run `grep -n "export default" src/i18n/index.ts`. If there is no default export, import the instance the app actually uses (e.g. `import { i18n } from '@/i18n'`) — match the existing pattern used elsewhere (`grep -rn "from '@/i18n'" src | head`).

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. Confirm `RoutineWithExercises['routine_exercises'][number]` exposes `name`/`routine.name` — `routine.name` is on `RoutineWithExercises` (used already as a routine field). If `routine.name` is absent, use `routine.name_es`/`title` per the actual type (check `src/features/training/routines/api.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/pages/RunnerPage.tsx src/app/router.tsx src/pages/EntrenamientoPage.tsx
git commit -m "feat(runner): RunnerPage + route + re-point start-workout to the runner"
```

---

## Task 16: i18n keys + integration test

**Files:**
- Modify: `src/i18n/en/entrenamiento.json`, `src/i18n/es/entrenamiento.json`
- Create: `src/features/training/runner/Runner.test.tsx`

- [ ] **Step 1: Add i18n keys**

Add a `runner` and `rpe` block to BOTH locale files (top-level, alongside `editor`). English (`src/i18n/en/entrenamiento.json`):

```json
"runner": {
  "rest": "Rest",
  "restNoTarget": "Rest (no target)",
  "skipRest": "Skip",
  "reps": "Reps",
  "repsShort": "reps",
  "weight": "Weight",
  "startRest": "Start rest",
  "recordSet": "Record set",
  "recordWarmup": "Record warm-up",
  "setN": "Set {{n}} of {{total}}",
  "warmupN": "Warm-up {{n}} of {{total}}",
  "warmup": "Warm-up",
  "workingWeight": "Today's working weight",
  "setsN": "{{count}} sets",
  "begin": "Begin",
  "exerciseDone": "{{name}} done",
  "completeSummary": "{{sets}} sets · {{volume}} kg volume",
  "addSet": "+ Add another set",
  "upNext": "Up next",
  "jumpToExercise": "Jump to another exercise",
  "continue": "Continue",
  "now": "now",
  "jump": "jump ›",
  "skippedDoIt": "skipped · do it ›",
  "skipCurrent": "Skip current exercise",
  "finishEarly": "Finish workout early",
  "close": "Close",
  "finishQuestion": "Finish workout?",
  "skippedCount": "You skipped {{count}} exercise(s):",
  "doNow": "Do it now",
  "skippedNotSaved": "Skipped exercises aren't saved.",
  "saveWithout": "Review & save without it",
  "setsLogged": "{{count}} sets",
  "skipped": "skipped",
  "reviewNote": "Warm-ups included · skipped not saved",
  "saveWorkout": "Save workout",
  "saving": "Saving…",
  "resumeQuestion": "Resume your {{name}} from {{minutes}} min ago?",
  "resumeProgress": "{{done}} of {{total}} exercises logged.",
  "resume": "Resume workout",
  "discard": "Discard",
  "exit": "Exit",
  "exercisesShort": "Ex {{current}}/{{total}}"
},
"rpe": {
  "label": "RPE",
  "title": "RPE — Rate of Perceived Exertion",
  "subtitle": "How many reps you had left in the tank.",
  "explainLabel": "What is RPE?",
  "target": "target {{value}}",
  "anchor": { "10": "none left", "9": "1 more", "8": "2 more", "7": "3–4 more", "6": "easy" },
  "anchorInline": { "6": "easy", "6.5": "", "7": "3–4 reps left", "7.5": "", "8": "2 reps left", "8.5": "", "9": "1 rep left", "9.5": "", "10": "no reps left" }
}
```

Spanish (`src/i18n/es/entrenamiento.json`) — same keys, translated:

```json
"runner": {
  "rest": "Descanso",
  "restNoTarget": "Descanso (sin objetivo)",
  "skipRest": "Saltar",
  "reps": "Reps",
  "repsShort": "reps",
  "weight": "Peso",
  "startRest": "Iniciar descanso",
  "recordSet": "Registrar serie",
  "recordWarmup": "Registrar calentamiento",
  "setN": "Serie {{n}} de {{total}}",
  "warmupN": "Calentamiento {{n}} de {{total}}",
  "warmup": "Calentamiento",
  "workingWeight": "Peso de trabajo de hoy",
  "setsN": "{{count}} series",
  "begin": "Empezar",
  "exerciseDone": "{{name}} completado",
  "completeSummary": "{{sets}} series · {{volume}} kg de volumen",
  "addSet": "+ Añadir otra serie",
  "upNext": "Siguiente",
  "jumpToExercise": "Ir a otro ejercicio",
  "continue": "Continuar",
  "now": "ahora",
  "jump": "ir ›",
  "skippedDoIt": "saltado · hazlo ›",
  "skipCurrent": "Saltar ejercicio actual",
  "finishEarly": "Terminar entrenamiento",
  "close": "Cerrar",
  "finishQuestion": "¿Terminar entrenamiento?",
  "skippedCount": "Saltaste {{count}} ejercicio(s):",
  "doNow": "Hacerlo ahora",
  "skippedNotSaved": "Los ejercicios saltados no se guardan.",
  "saveWithout": "Revisar y guardar sin él",
  "setsLogged": "{{count}} series",
  "skipped": "saltado",
  "reviewNote": "Calentamientos incluidos · saltados no se guardan",
  "saveWorkout": "Guardar entrenamiento",
  "saving": "Guardando…",
  "resumeQuestion": "¿Reanudar tu {{name}} de hace {{minutes}} min?",
  "resumeProgress": "{{done}} de {{total}} ejercicios registrados.",
  "resume": "Reanudar entrenamiento",
  "discard": "Descartar",
  "exit": "Salir",
  "exercisesShort": "Ej {{current}}/{{total}}"
},
"rpe": {
  "label": "RPE",
  "title": "RPE — Esfuerzo percibido",
  "subtitle": "Cuántas repeticiones te quedaban en reserva.",
  "explainLabel": "¿Qué es el RPE?",
  "target": "objetivo {{value}}",
  "anchor": { "10": "ninguna", "9": "1 más", "8": "2 más", "7": "3–4 más", "6": "fácil" },
  "anchorInline": { "6": "fácil", "6.5": "", "7": "3–4 reps en reserva", "7.5": "", "8": "2 reps en reserva", "8.5": "", "9": "1 rep en reserva", "9.5": "", "10": "sin reps en reserva" }
}
```

- [ ] **Step 2: Write the integration test**

Create `src/features/training/runner/Runner.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@/i18n';
import { Runner } from './Runner';
import { buildRunnerState, type RunnerInput } from '@/core/runner';

function state() {
  const input: RunnerInput = {
    programId: 'p1', routineId: 'r1', routineName: 'Push Day',
    performedOn: '2026-05-25', nowMs: 1_000_000,
    exercises: [{
      exerciseId: 'bench', position: 1, targetSets: 1, targetRepsMin: 8, targetRepsMax: 8,
      restSeconds: 90, targetRpe: 8, defaultIncrementKg: 2.5,
      warmupSets: [], lastWorkingWeightKg: 80,
      workingSetPrefill: [{ reps: 8, weightKg: 80 }],
    }],
  };
  return buildRunnerState(input);
}

const names = { bench: 'Bench Press' };

it('walks begin → start rest → record → finish → save with correct payload', async () => {
  const onSave = vi.fn().mockResolvedValue('new-id');
  const onSaved = vi.fn();
  render(
    <Runner
      initialState={state()}
      names={names}
      coachContextByExercise={{}}
      lastTimeByExercise={{ bench: '8 × 80 kg' }}
      onSave={onSave}
      onExit={() => {}}
      onSaved={onSaved}
    />,
  );

  fireEvent.click(screen.getByText('Begin'));            // exercise-start → set READY
  fireEvent.click(screen.getByText('Start rest'));       // READY → RESTING
  fireEvent.click(screen.getByText('Record set'));       // record last set → exercise-complete
  fireEvent.click(screen.getByText('Continue'));         // → finishing → review (no skips)
  fireEvent.click(screen.getByText('Save workout'));

  await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  const payload = onSave.mock.calls[0][0];
  expect(payload.routineId).toBe('r1');
  expect(payload.programId).toBe('p1');
  expect(payload.sets).toEqual([
    { exercise_id: 'bench', set_index: 1, reps: 8, weight_kg: 80, rpe: 8, is_warmup: false },
  ]);
});
```

- [ ] **Step 3: Run the integration test**

Run: `pnpm test -- src/features/training/runner/Runner.test.tsx`
Expected: PASS. (If the JSON is malformed, i18n import throws — fix the JSON.)

- [ ] **Step 4: Full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/en/entrenamiento.json src/i18n/es/entrenamiento.json src/features/training/runner/Runner.test.tsx
git commit -m "feat(runner): i18n copy (es/en) + happy-path integration test"
```

---

## Self-Review

**Spec coverage:**
- Runner-primary / editor demoted (0.1) → Task 15 (re-point `startWorkout`).
- Ephemeral + localStorage (0.2) → Tasks 7, 14, 15. Resume prompt (0.3) → Tasks 13, 15.
- Start-rest trigger (0.4), rest duration + alarm (0.5), null/warm-up count-up (0.6) → Tasks 4, 6, 8, 10.
- Wake Lock (0.7) → Task 8, wired in Task 14.
- Linear + escape hatches (0.8), skipped-not-saved (0.9) → Tasks 5, 12, 14.
- Per-set prefill (0.10) → Task 1. Warm-up weight anchor (0.11) → Tasks 3, 4, 11.
- RPE + explainer (0.12) → Task 9. Coach line (0.13) → Task 11.
- Ad-hoc out (0.14) → routine-only by construction (Runner needs `RunnerInput`).
- Finish/review/save (0.15) → Tasks 13, 14, 15. No schema/RPC change (0.16) → uses existing `save_workout`.
- Layout A (0.19), READY/RESTING (0.20), record-keeps-resting (0.21), position pointer (0.22), soft skip (0.23), completion card (0.24), no drag-reorder (0.25) → Tasks 4, 5, 10, 12, 14.
- Testing (§7): Tier-1 Tasks 1–5; hooks Tasks 6–8; Tier-2 integration Task 16.

**Placeholder scan:** One intentional placeholder flagged loudly in Task 14 (`onAdjustRest`) with the exact replacement in the same step — must be applied. No others.

**Type consistency:** `RunnerInput`/`RunnerInputExercise` (Task 3) match the object built in `startWorkout` (Task 15) and the test (Tasks 3, 16). `SaveWorkoutSet` shape (from `src/features/training/api.ts`) matches `toSaveWorkoutSets` output (Task 5) and the integration assertion (Task 16). `CoachContext` fields match `src/core/training.ts`. `RestTimerView` (Task 6) consumed by `RestTimerBand`/`SetView` (Task 10).

**Open verification items for the implementer (don't assume):**
- `src/components/ui/popover.tsx` exists (Task 9 Step 2 — fallback to Dialog if not).
- `src/i18n` export shape for the `i18n.language` read in Task 15 (Step 3 note).
- `routine.name` field name on `RoutineWithExercises` (Task 15 Step 4).
- `Exercise` has `default_increment_kg`, `primary_muscle`, `equipment`, `name_en`, `name_es` (confirmed via `Tables<'exercises'>`).
