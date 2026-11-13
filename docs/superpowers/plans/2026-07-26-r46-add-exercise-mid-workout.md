# R-46 — Add an Exercise Mid-Workout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user add an exercise to a workout that is already running, logged in today's session only, with its working weight prefilled from the last time they did it.

**Architecture:** One new pure reducer action (`ADD_EXERCISE`) appends an exercise to `RunnerState`. The data it needs is resolved *outside* the reducer by a small module that fetches the exercise's history, races it against a timeout, and degrades to 0 kg on any failure. `RunnerPage` owns the Supabase call and hands `Runner` a `onLoadExercise` callback, so `Runner` stays free of I/O and of Supabase imports. No migration, no RPC, no new write path — the added exercise's sets ride along in the existing end-of-workout `save_workout` call.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + Testing Library, shadcn/ui (Dialog), i18next, Supabase JS.

**Spec:** `docs/superpowers/specs/2026-07-26-r46-add-exercise-mid-workout-design.md`

## Global Constraints

- **Metric only** — kilograms, no unit conversion anywhere in this feature.
- **No migration, no RPC, no schema change.** If you find yourself writing SQL, stop — you have left the plan.
- **The routine is never mutated.** No call to `save_routine`, no `routine_exercises` write.
- **No duplicate exercise in a session.** `workout_sets` has `unique (session_id, exercise_id, set_index)`; a duplicate makes the end-of-workout save fail outright.
- **`src/core/runner.ts` stays pure** — no clock, no I/O, no imports from `@/lib/supabase`. Timestamps arrive as `nowMs` on the action.
- **`Runner.tsx` must not import `@/lib/supabase`** (directly or transitively through a data hook it calls itself). Data arrives via props.
- **Routes/files in English, UI copy in Spanish and English.** Every new user-visible string gets a key in **both** `src/i18n/es/entrenamiento.json` and `src/i18n/en/entrenamiento.json`.
- **No AI/Claude attribution** in commits, code comments, or PR text. Plain conventional commits.
- **No prettier in this repo** — match the surrounding formatting by hand (2-space indent, single quotes, semicolons).
- Run tests with `pnpm test`. Full suite takes ~11–15 min; per-file runs during development: `pnpm vitest run <path>`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/core/runner.ts` | modify — `AddedExerciseInput` type, `buildRunnerExercise` helper, `ADD_EXERCISE` action | 1 |
| `src/core/runner.test.ts` | modify — Tier-1 reducer tests | 1 |
| `src/features/training/runner/loadAddedExercise.ts` | **create** — turn an `Exercise` row + a history fetcher into everything the runner needs, with timeout + fallback | 2 |
| `src/features/training/runner/loadAddedExercise.test.ts` | **create** — success / reject / timeout / no-history | 2 |
| `src/features/training/components/ExercisePicker.tsx` | modify — `excludeIds` prop | 3 |
| `src/features/training/components/ExercisePicker.test.tsx` | modify — exclusion test | 3 |
| `src/features/training/runner/ExerciseOverview.tsx` | modify — "add exercise" button | 4 |
| `src/features/training/runner/Runner.tsx` | modify — `onLoadExercise` prop, add dialog, merged extras maps | 4 |
| `src/features/training/runner/Runner.test.tsx` | modify — Tier-2 flow tests | 4 |
| `src/i18n/es/entrenamiento.json`, `src/i18n/en/entrenamiento.json` | modify — 4 new `runner.*` keys | 4 |
| `src/pages/RunnerPage.tsx` | modify — implement `onLoadExercise` with `useAuth` + `fetchExerciseHistory` | 5 |

---

## Task 1: `ADD_EXERCISE` reducer action

**Files:**
- Modify: `src/core/runner.ts` (`RunnerInput` types ~89–110, `buildRunnerState` 144–180, `RunnerAction` 186–198, `navigationReducer` 276–338)
- Test: `src/core/runner.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type AddedExerciseInput = Omit<RunnerInputExercise, 'position'>` — the payload shape Task 2 builds and Task 4 dispatches.
  - Action `{ type: 'ADD_EXERCISE'; exercise: AddedExerciseInput; nowMs: number }`.

**Why `Omit<..., 'position'>`:** the reducer decides the position (`max + 1`). Callers must not have to know or invent one.

- [ ] **Step 1: Write the failing tests**

Append to `src/core/runner.test.ts`. Note the helper builds a state with **non-contiguous** positions (1, 2, 5) on purpose — that is what proves `max + 1` rather than `length + 1`.

```ts
describe('ADD_EXERCISE', () => {
  function baseInput(): RunnerInput {
    return {
      programId: null, routineId: 'r1', routineName: 'Push', performedOn: '2026-07-26',
      nowMs: 1_000_000,
      exercises: [
        {
          exerciseId: 'bench', position: 1, targetSets: 1, targetRepsMin: 8, targetRepsMax: 8,
          restSeconds: 90, targetRpe: 8, defaultIncrementKg: 2.5, warmupSets: [],
          lastWorkingWeightKg: 80, workingSetPrefill: [{ reps: 8, weightKg: 80 }],
        },
        {
          exerciseId: 'fly', position: 5, targetSets: 1, targetRepsMin: 10, targetRepsMax: 12,
          restSeconds: 60, targetRpe: null, defaultIncrementKg: 2.5, warmupSets: [],
          lastWorkingWeightKg: 20, workingSetPrefill: [{ reps: 10, weightKg: 20 }],
        },
      ],
    };
  }

  const curls: AddedExerciseInput = {
    exerciseId: 'curl', targetSets: 3, targetRepsMin: 8, targetRepsMax: 12,
    restSeconds: null, targetRpe: null, defaultIncrementKg: 2.5, warmupSets: [],
    lastWorkingWeightKg: 14,
    workingSetPrefill: [{ reps: 12, weightKg: 14 }, { reps: 12, weightKg: 14 }, { reps: 10, weightKg: 14 }],
  };

  it('appends the exercise at the end with position max+1', () => {
    const s = runnerReducer(buildRunnerState(baseInput()), {
      type: 'ADD_EXERCISE', exercise: curls, nowMs: 2_000_000,
    });
    expect(s.exercises).toHaveLength(3);
    expect(s.exercises[2].exerciseId).toBe('curl');
    expect(s.exercises[2].position).toBe(6); // max(1,5) + 1, NOT length + 1
    expect(s.exercises[2].status).toBe('pending');
  });

  it('does not move the cursor or change the phase', () => {
    const before = buildRunnerState(baseInput());
    const s = runnerReducer(before, { type: 'ADD_EXERCISE', exercise: curls, nowMs: 2_000_000 });
    expect(s.currentExerciseIndex).toBe(before.currentExerciseIndex);
    expect(s.currentSetIndex).toBe(before.currentSetIndex);
    expect(s.phase).toBe(before.phase);
    expect(s.exercises[0]).toBe(before.exercises[0]); // untouched exercises are not rebuilt
  });

  it('builds sets from the prefill, with the working weight as the anchor', () => {
    const s = runnerReducer(buildRunnerState(baseInput()), {
      type: 'ADD_EXERCISE', exercise: curls, nowMs: 2_000_000,
    });
    const added = s.exercises[2];
    expect(added.workingWeightKg).toBe(14);
    expect(added.sets).toHaveLength(3);
    expect(added.sets.map((x) => x.setIndex)).toEqual([1, 2, 3]);
    expect(added.sets.every((x) => !x.isWarmup)).toBe(true);
    expect(added.sets[0]).toMatchObject({ reps: 12, weightKg: 14, baselineWeightKg: 14 });
  });

  it('lands at 0 kg with no baseline when there is no history', () => {
    const noHistory: AddedExerciseInput = {
      ...curls,
      lastWorkingWeightKg: null,
      workingSetPrefill: [{ reps: 8, weightKg: null }, { reps: 8, weightKg: null }, { reps: 8, weightKg: null }],
    };
    const s = runnerReducer(buildRunnerState(baseInput()), {
      type: 'ADD_EXERCISE', exercise: noHistory, nowMs: 2_000_000,
    });
    const added = s.exercises[2];
    expect(added.workingWeightKg).toBe(0);
    expect(added.sets.every((x) => x.weightKg === 0)).toBe(true);
    expect(added.sets.every((x) => x.baselineWeightKg === null)).toBe(true);
  });

  it('refuses an exercise already in the session, returning the same state', () => {
    const before = buildRunnerState(baseInput());
    const s = runnerReducer(before, {
      type: 'ADD_EXERCISE', exercise: { ...curls, exerciseId: 'bench' }, nowMs: 2_000_000,
    });
    expect(s).toBe(before);
  });

  it('is reachable by CONTINUE once the routine exercises are done', () => {
    let s = buildRunnerState(baseInput());
    s = runnerReducer(s, { type: 'ADD_EXERCISE', exercise: curls, nowMs: 2_000_000 });
    s = runnerReducer(s, { type: 'SKIP_CURRENT', nowMs: 2_000_001 }); // skip bench -> activates fly
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 2_000_002 });   // fly's only set -> exercise-complete
    s = runnerReducer(s, { type: 'CONTINUE', nowMs: 2_000_003 });
    expect(s.exercises[s.currentExerciseIndex].exerciseId).toBe('curl');
    expect(s.phase).toBe('ready');
  });

  it('saves the added exercise sets with a contiguous per-exercise set_index', () => {
    let s = buildRunnerState(baseInput());
    s = runnerReducer(s, { type: 'ADD_EXERCISE', exercise: curls, nowMs: 2_000_000 });
    s = runnerReducer(s, { type: 'JUMP_TO', exerciseIndex: 2, nowMs: 2_000_001 });
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 2_000_002 });
    s = runnerReducer(s, { type: 'RECORD_SET', nowMs: 2_000_003 });
    const rows = toSaveWorkoutSets(s).filter((r) => r.exercise_id === 'curl');
    expect(rows.map((r) => r.set_index)).toEqual([1, 2]);
  });
});
```

Add `AddedExerciseInput` to the existing `@/core/runner` import list at the top of the test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/core/runner.test.ts`
Expected: FAIL — TypeScript/runtime errors on the unknown `ADD_EXERCISE` action type and the missing `AddedExerciseInput` export.

- [ ] **Step 3: Extract the exercise builder**

`buildRunnerState` builds a `RunnerExercise` inline; `ADD_EXERCISE` needs the exact same logic. Extract it rather than duplicating. In `src/core/runner.ts`, directly **after** `buildSets` (ends line 142), insert:

```ts
/** The runner-exercise shape a caller adds mid-workout: same as a routine
 *  exercise minus the position, which the reducer assigns. */
export type AddedExerciseInput = Omit<RunnerInputExercise, 'position'>;

function buildRunnerExercise(
  ex: RunnerInputExercise,
  status: ExerciseStatus,
): RunnerExercise {
  const workingWeightKg = ex.lastWorkingWeightKg ?? 0;
  const defaultIncrementKg = ex.defaultIncrementKg > 0 ? ex.defaultIncrementKg : 2.5;
  return {
    exerciseId: ex.exerciseId,
    position: ex.position,
    targetSets: ex.targetSets,
    targetRepsMin: ex.targetRepsMin,
    targetRepsMax: ex.targetRepsMax,
    restSeconds: ex.restSeconds,
    targetRpe: ex.targetRpe,
    defaultIncrementKg,
    workingWeightKg,
    warmupPrescriptions: ex.warmupSets,
    sets: buildSets(ex, workingWeightKg, defaultIncrementKg),
    status,
  } satisfies RunnerExercise;
}
```

Then replace the body of `buildRunnerState`'s mapping (lines 145–164) with:

```ts
  const exercises: RunnerExercise[] = [...input.exercises]
    .sort((a, b) => a.position - b.position)
    .map((ex, i) => buildRunnerExercise(ex, i === 0 ? 'active' : 'pending'));
```

- [ ] **Step 4: Run the existing suite to prove the extraction changed nothing**

Run: `pnpm vitest run src/core/runner.test.ts`
Expected: every pre-existing test still PASSES; only the new `ADD_EXERCISE` block fails.

- [ ] **Step 5: Add the action**

In the `RunnerAction` union (line 191, next to `ADD_SET`), add:

```ts
  | { type: 'ADD_EXERCISE'; exercise: AddedExerciseInput; nowMs: number }
```

In `navigationReducer`, immediately after the `ADD_SET` case closes (line 305), add:

```ts
    case 'ADD_EXERCISE': {
      // Session-only (spec decision 1): the routine behind the workout is never
      // touched. Duplicates are refused because workout_sets is unique on
      // (session_id, exercise_id, set_index) — a second block would restart
      // set_index at 1 and fail the whole end-of-workout save.
      if (state.exercises.some((e) => e.exerciseId === action.exercise.exerciseId)) return state;
      // max + 1, not length + 1: routine positions are 1-based but not
      // guaranteed contiguous, and position is what the overview panel shows.
      const position = state.exercises.reduce((m, e) => Math.max(m, e.position), 0) + 1;
      const added = buildRunnerExercise({ ...action.exercise, position }, 'pending');
      return touch({ ...state, exercises: [...state.exercises, added] });
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run src/core/runner.test.ts`
Expected: PASS, all tests.

- [ ] **Step 7: Prove the assertions bite**

Do not skip this — four tests in R-36 passed against deliberately broken code. Temporarily break the implementation, one at a time, and confirm the *expected* test goes red:

1. Change `position` to `state.exercises.length + 1` → "appends the exercise at the end with position max+1" must FAIL.
2. Delete the duplicate guard line → "refuses an exercise already in the session" must FAIL.
3. Change `'pending'` to `'active'` → the status assertion must FAIL.

Revert each break before moving on. Run `pnpm vitest run src/core/runner.test.ts` after each.

- [ ] **Step 8: Typecheck and commit**

```bash
pnpm typecheck
git add src/core/runner.ts src/core/runner.test.ts
git commit -m "feat(runner): ADD_EXERCISE action for mid-workout additions (R-46)"
```

---

## Task 2: Resolve an added exercise's data (fetch + timeout + fallback)

**Files:**
- Create: `src/features/training/runner/loadAddedExercise.ts`
- Test: `src/features/training/runner/loadAddedExercise.test.ts`

**Interfaces:**
- Consumes: `AddedExerciseInput` (Task 1); the existing pure helpers `lastWorkingSetForExercise`, `prefillSetsForExercise`, types `CoreSessionSet` / `CoachContext` from `@/core/training`; `exerciseDisplayName` and type `Exercise` from `../exercises/api`.
- Produces:
  - `export interface AddedExerciseData { input: AddedExerciseInput; name: string; lastTimeLabel: string | null; coachContext: CoachContext }`
  - `export async function loadAddedExercise(opts: LoadAddedExerciseOptions): Promise<AddedExerciseData>` — **never rejects.**
  - `export const ADDED_EXERCISE_DEFAULTS` and `export const HISTORY_TIMEOUT_MS`.

This module takes a `fetchHistory` **function** rather than calling Supabase itself, which is what makes it testable with a fake and keeps `Runner` free of Supabase imports.

- [ ] **Step 1: Write the failing tests**

Create `src/features/training/runner/loadAddedExercise.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { CoreSessionSet } from '@/core/training';
import type { Exercise } from '../exercises/api';
import { loadAddedExercise, ADDED_EXERCISE_DEFAULTS } from './loadAddedExercise';

const curlRow = {
  id: 'curl', name_es: 'Curl de bíceps', name_en: 'Biceps Curl',
  default_increment_kg: 1.25, primary_muscles: ['biceps'], equipment: 'dumbbell',
} as unknown as Exercise;

function historySet(over: Partial<CoreSessionSet> = {}): CoreSessionSet {
  return {
    reps: 12, weightKg: 14, rpe: 8, isWarmup: false, setIndex: 1,
    sessionId: 's1', exerciseId: 'curl', performedOn: '2026-07-20',
    ...over,
  } as CoreSessionSet;
}

function opts(fetchHistory: () => Promise<CoreSessionSet[]>, timeoutMs?: number) {
  return {
    exercise: curlRow,
    lang: 'es' as const,
    todayISO: '2026-07-26',
    formatWeight: (kg: number) => String(kg),
    fetchHistory,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
}

afterEach(() => { vi.useRealTimers(); });

describe('loadAddedExercise', () => {
  it('prefills the working weight and reps from the last logged session', async () => {
    const history = [historySet(), historySet({ setIndex: 2, reps: 10 })];
    const data = await loadAddedExercise(opts(() => Promise.resolve(history)));
    expect(data.input.exerciseId).toBe('curl');
    expect(data.input.lastWorkingWeightKg).toBe(14);
    expect(data.input.workingSetPrefill).toHaveLength(ADDED_EXERCISE_DEFAULTS.targetSets);
    expect(data.input.workingSetPrefill[0]).toEqual({ reps: 12, weightKg: 14 });
    expect(data.lastTimeLabel).toBe('10 × 14 kg'); // last working set of that session
    expect(data.name).toBe('Curl de bíceps');
    expect(data.coachContext).toMatchObject({ exerciseId: 'curl', history, todayISO: '2026-07-26' });
  });

  it('applies the plan defaults regardless of history', async () => {
    const data = await loadAddedExercise(opts(() => Promise.resolve([historySet()])));
    expect(data.input).toMatchObject({
      targetSets: 3, targetRepsMin: 8, targetRepsMax: 12,
      restSeconds: null, targetRpe: null, warmupSets: [],
      defaultIncrementKg: 1.25,
    });
  });

  it('falls back to no weight when the fetch rejects', async () => {
    const data = await loadAddedExercise(opts(() => Promise.reject(new Error('offline'))));
    expect(data.input.lastWorkingWeightKg).toBeNull();
    expect(data.input.workingSetPrefill.every((p) => p.weightKg === null)).toBe(true);
    expect(data.lastTimeLabel).toBeNull();
    expect(data.coachContext.history).toEqual([]);
    expect(data.name).toBe('Curl de bíceps'); // the exercise is still added
  });

  it('falls back to no weight when the fetch never settles (timeout)', async () => {
    vi.useFakeTimers();
    const pending = loadAddedExercise(opts(() => new Promise<CoreSessionSet[]>(() => {}), 4000));
    await vi.advanceTimersByTimeAsync(4000);
    const data = await pending;
    expect(data.input.lastWorkingWeightKg).toBeNull();
    expect(data.lastTimeLabel).toBeNull();
  });

  it('falls back to no weight when the user has never done the exercise', async () => {
    const data = await loadAddedExercise(opts(() => Promise.resolve([])));
    expect(data.input.lastWorkingWeightKg).toBeNull();
    expect(data.lastTimeLabel).toBeNull();
  });

  it('uses the English name when lang is en', async () => {
    const data = await loadAddedExercise({ ...opts(() => Promise.resolve([])), lang: 'en' });
    expect(data.name).toBe('Biceps Curl');
  });

  it('falls back to a 2.5 kg increment when the catalogue row has none', async () => {
    const row = { ...curlRow, default_increment_kg: null } as unknown as Exercise;
    const data = await loadAddedExercise({ ...opts(() => Promise.resolve([])), exercise: row });
    expect(data.input.defaultIncrementKg).toBe(2.5);
    expect(data.coachContext.defaultIncrementKg).toBeNull(); // coach keeps "unset" distinct
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/features/training/runner/loadAddedExercise.test.ts`
Expected: FAIL — cannot resolve `./loadAddedExercise`.

- [ ] **Step 3: Write the implementation**

Create `src/features/training/runner/loadAddedExercise.ts`:

```ts
/**
 * Resolves everything the runner needs to add an exercise mid-workout (R-46).
 * Best-effort by design: the working-weight prefill is a nice-to-have, so any
 * failure — offline, error, or a request that never settles in a gym basement —
 * degrades to 0 kg rather than blocking the addition. Never rejects.
 */

import {
  lastWorkingSetForExercise,
  prefillSetsForExercise,
  type CoachContext,
  type CoreSessionSet,
} from '@/core/training';
import type { AddedExerciseInput } from '@/core/runner';
import { exerciseDisplayName, type Exercise } from '../exercises/api';

/** An improvised exercise has no routine row, so it gets a plain default plan;
 *  everything is adjustable in the runner (ADD_SET, the weight stepper). */
export const ADDED_EXERCISE_DEFAULTS = {
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 12,
} as const;

/** A hanging request is the case that matters: with no signal supabase-js can
 *  stall instead of failing, and a spinner that never resolves mid-set is worse
 *  than a wrong starting weight. */
export const HISTORY_TIMEOUT_MS = 4000;

export interface AddedExerciseData {
  input: AddedExerciseInput;
  name: string;
  lastTimeLabel: string | null;
  coachContext: CoachContext;
}

export interface LoadAddedExerciseOptions {
  exercise: Exercise;
  lang: 'es' | 'en';
  todayISO: string;
  /** Injected so this module stays free of Supabase and testable with a fake. */
  fetchHistory: (exerciseId: string) => Promise<CoreSessionSet[]>;
  /** Locale-aware number formatting for the "last time" hint. */
  formatWeight: (kg: number) => string;
  timeoutMs?: number;
}

/** Resolves to `fallback` if `promise` rejects or outlives `ms`. */
function settleOrFallback<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

export async function loadAddedExercise({
  exercise, lang, todayISO, fetchHistory, formatWeight, timeoutMs = HISTORY_TIMEOUT_MS,
}: LoadAddedExerciseOptions): Promise<AddedExerciseData> {
  let pending: Promise<CoreSessionSet[]>;
  try {
    pending = Promise.resolve(fetchHistory(exercise.id));
  } catch {
    pending = Promise.resolve([]); // a synchronous throw must not escape either
  }
  const history = await settleOrFallback(pending, timeoutMs, []);

  const last = lastWorkingSetForExercise(history);
  const { targetSets, targetRepsMin, targetRepsMax } = ADDED_EXERCISE_DEFAULTS;

  const input: AddedExerciseInput = {
    exerciseId: exercise.id,
    targetSets,
    targetRepsMin,
    targetRepsMax,
    restSeconds: null,   // count-up rest timer, no prescribed countdown
    targetRpe: null,
    defaultIncrementKg: exercise.default_increment_kg ?? 2.5,
    warmupSets: [],
    lastWorkingWeightKg: last != null ? Number(last.weightKg) : null,
    workingSetPrefill: prefillSetsForExercise(history, targetSets, targetRepsMin),
  };

  return {
    input,
    name: exerciseDisplayName(exercise, lang),
    lastTimeLabel: last ? `${last.reps} × ${formatWeight(Number(last.weightKg))} kg` : null,
    coachContext: {
      exerciseId: exercise.id,
      primaryMuscles: exercise.primary_muscles ?? [],
      equipment: exercise.equipment ?? null,
      defaultIncrementKg: exercise.default_increment_kg ?? null,
      history,
      todayISO,
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/features/training/runner/loadAddedExercise.test.ts`
Expected: PASS, all tests.

If the "last time" label assertion fails, read what `lastWorkingSetForExercise` actually returns for the fixture (it picks the latest `performedOn`, tie-broken by the highest `setIndex`) and fix the **fixture or the expectation**, not the helper — that helper is shipped and tested elsewhere.

- [ ] **Step 5: Prove the assertions bite**

Temporarily replace the `settleOrFallback` call with a bare `await pending` and confirm both the reject test and the timeout test go red (the timeout one will hang or fail, not pass). Revert.

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm typecheck
git add src/features/training/runner/loadAddedExercise.ts src/features/training/runner/loadAddedExercise.test.ts
git commit -m "feat(runner): resolve added-exercise prefill with offline fallback (R-46)"
```

---

## Task 3: `excludeIds` on the exercise picker

**Files:**
- Modify: `src/features/training/components/ExercisePicker.tsx` (props 20–24, body 35, results usage 131 + 136)
- Test: `src/features/training/components/ExercisePicker.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ExercisePicker` accepts an optional `excludeIds?: string[]`. Default `[]`, so the three existing call sites (routine builder, `AddExerciseSheet`, session editor) are unaffected.

- [ ] **Step 1: Write the failing test**

Append to `src/features/training/components/ExercisePicker.test.tsx`. The existing module mock at the top returns `data: []`, so this block needs its own results — restructure by hoisting a mutable fixture the mock reads.

At the top of the file, **replace** the `vi.mock('../exercises/hooks', ...)` block with:

```ts
const searchResults: { id: string; name_es: string; name_en: string; equipment: string | null }[] = [];
vi.mock('../exercises/hooks', () => ({
  useExerciseSearch: () => ({ data: searchResults, isLoading: false }),
  useCreateExercise: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useExercise: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));
```

`vi.mock` is hoisted above the `const`, so the factory must read `searchResults` lazily — it does, because it is only dereferenced when the hook is called during render. Reset it in the existing `beforeEach`:

```ts
beforeEach(async () => {
  await i18n.changeLanguage('es');
  searchResults.length = 0;
});
```

Then add:

```ts
describe('ExercisePicker excludeIds', () => {
  const rows = [
    { id: 'curl', name_es: 'Curl de bíceps', name_en: 'Biceps Curl', equipment: null },
    { id: 'bench', name_es: 'Press banca', name_en: 'Bench Press', equipment: null },
  ];

  it('lists every result when no ids are excluded', async () => {
    searchResults.push(...rows);
    render(<ExercisePicker selected={null} onSelect={() => {}} onClear={() => {}} />);
    await userEvent.click(screen.getByPlaceholderText(i18n.t('entrenamiento:picker.placeholder')));
    expect(screen.getByText('Curl de bíceps')).toBeInTheDocument();
    expect(screen.getByText('Press banca')).toBeInTheDocument();
  });

  it('hides excluded ids', async () => {
    searchResults.push(...rows);
    render(
      <ExercisePicker selected={null} onSelect={() => {}} onClear={() => {}} excludeIds={['bench']} />,
    );
    await userEvent.click(screen.getByPlaceholderText(i18n.t('entrenamiento:picker.placeholder')));
    expect(screen.getByText('Curl de bíceps')).toBeInTheDocument();
    expect(screen.queryByText('Press banca')).not.toBeInTheDocument();
  });

  it('shows the empty-results message when everything is excluded', async () => {
    searchResults.push(...rows);
    render(
      <ExercisePicker
        selected={null} onSelect={() => {}} onClear={() => {}}
        excludeIds={['bench', 'curl']}
      />,
    );
    const input = screen.getByPlaceholderText(i18n.t('entrenamiento:picker.placeholder'));
    await userEvent.click(input);
    await userEvent.type(input, 'x');
    expect(await screen.findByText(i18n.t('entrenamiento:picker.noResults'))).toBeInTheDocument();
  });
});
```

Add `import userEvent from '@testing-library/user-event';` to the imports if it is not already there.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/features/training/components/ExercisePicker.test.tsx`
Expected: the exclusion tests FAIL — `Press banca` is still rendered (the prop is ignored). The pre-existing group-option test must still PASS; if it broke, the mock restructure is wrong — fix that before continuing.

- [ ] **Step 3: Implement the prop**

In `src/features/training/components/ExercisePicker.tsx`, extend the props interface:

```ts
interface Props {
  selected: Exercise | null;
  onSelect: (exercise: Exercise) => void;
  onClear: () => void;
  /** Ids to hide from the results — e.g. exercises already in the running
   *  session, which the DB would reject at save time. */
  excludeIds?: string[];
}
```

Change the signature (line 35) to:

```ts
export function ExercisePicker({ selected, onSelect, onClear, excludeIds = [] }: Props) {
```

Immediately after the `useExerciseSearch(...)` call (after line 63), add:

```ts
  const results = (search.data ?? []).filter((ex) => !excludeIds.includes(ex.id));
```

Then replace the two `(search.data ?? [])` usages in the dropdown with `results`:

- line 131: `{!search.isLoading && results.length === 0 && query.trim() !== '' && (`
- line 136: `{results.map((ex) => {`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/features/training/components/ExercisePicker.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Verify the existing call sites still compile**

Run: `pnpm typecheck`
Expected: clean. The prop is optional, so `RoutineBuilder`, `AddExerciseSheet` and `SessionEditor` need no change.

- [ ] **Step 6: Commit**

```bash
git add src/features/training/components/ExercisePicker.tsx src/features/training/components/ExercisePicker.test.tsx
git commit -m "feat(training): let the exercise picker exclude ids (R-46)"
```

---

## Task 4: Runner UI — add button, dialog, and merged data for added exercises

**Files:**
- Modify: `src/features/training/runner/ExerciseOverview.tsx` (props 7–15, action stack 67–70)
- Modify: `src/features/training/runner/Runner.tsx` (props 30–38, state 49–55, overview block 138–171, every `names[...]` / `lastTimeByExercise[...]` / `coachContextByExercise[...]` lookup)
- Modify: `src/i18n/es/entrenamiento.json`, `src/i18n/en/entrenamiento.json`
- Test: `src/features/training/runner/Runner.test.tsx`

**Interfaces:**
- Consumes: `AddedExerciseInput` and the `ADD_EXERCISE` action (Task 1); `AddedExerciseData` (Task 2); `excludeIds` (Task 3).
- Produces: `Runner` requires a new prop
  `onLoadExercise: (exercise: Exercise) => Promise<AddedExerciseData>` — consumed by Task 5.

- [ ] **Step 1: Add the i18n keys**

In `src/i18n/es/entrenamiento.json`, inside the `runner` object, next to `"addSet"`:

```json
    "addExercise": "Añadir ejercicio",
    "addExerciseTitle": "Añadir un ejercicio",
    "addExerciseBody": "Se añade al final de la sesión de hoy. Tu rutina no cambia.",
    "addExerciseLoading": "Buscando tu último registro…",
```

The same keys in `src/i18n/en/entrenamiento.json`:

```json
    "addExercise": "Add exercise",
    "addExerciseTitle": "Add an exercise",
    "addExerciseBody": "It's added at the end of today's session. Your routine doesn't change.",
    "addExerciseLoading": "Looking up your last log…",
```

Keep the surrounding key order and trailing-comma discipline of each file.

- [ ] **Step 2: Write the failing tests**

In `src/features/training/runner/Runner.test.tsx`, first **extend the existing hooks mock** — `ExercisePicker` calls `useExerciseSearch` and always renders `ExerciseDialog`, whose body calls `useCreateExercise`. An unmocked hook is `undefined` and the render crashes. Replace the existing `vi.mock('@/features/training/exercises/hooks', ...)` with:

```ts
const searchResults: { id: string; name_es: string; name_en: string; equipment: string | null }[] = [];
vi.mock('@/features/training/exercises/hooks', () => ({
  useExercise: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useExerciseSearch: () => ({ data: searchResults, isLoading: false }),
  useCreateExercise: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
```

The mock factory must return a **stable** object per call site as written above — do not build a new query-result object inside a `useMemo`-less render path that changes identity every render, which is what caused the infinite-render hang that left vitest workers spinning at 100% CPU.

Then update `renderRunner` to pass the new prop, and add the tests:

The tests fake the loader entirely — do **not** import the real
`loadAddedExercise` here; `Runner` only sees it through the prop, and importing
it would pull `../exercises/api` (and therefore `@/lib/supabase`) into this test
for nothing.

```ts
const curlRow = {
  id: 'curl', name_es: 'Curl de bíceps', name_en: 'Biceps Curl',
  default_increment_kg: 1.25, primary_muscles: ['biceps'], equipment: null,
};

function fakeLoad(overrides = {}) {
  return vi.fn().mockResolvedValue({
    input: {
      exerciseId: 'curl', targetSets: 3, targetRepsMin: 8, targetRepsMax: 12,
      restSeconds: null, targetRpe: null, defaultIncrementKg: 1.25, warmupSets: [],
      lastWorkingWeightKg: 14,
      workingSetPrefill: [
        { reps: 12, weightKg: 14 }, { reps: 12, weightKg: 14 }, { reps: 10, weightKg: 14 },
      ],
    },
    name: 'Biceps Curl',
    lastTimeLabel: '10 × 14 kg',
    coachContext: {
      exerciseId: 'curl', primaryMuscles: ['biceps'], equipment: null,
      defaultIncrementKg: 1.25, history: [], todayISO: '2026-07-26',
    },
    ...overrides,
  });
}

async function openOverview() {
  await userEvent.click(screen.getByRole('button', { name: i18n.t('entrenamiento:runner.switchExercise') }));
}

it('adds an exercise from the overview panel', async () => {
  searchResults.length = 0;
  searchResults.push(curlRow);
  const onLoadExercise = fakeLoad();
  renderRunner(vi.fn(), onLoadExercise);

  await openOverview();
  await userEvent.click(screen.getByRole('button', { name: i18n.t('entrenamiento:runner.addExercise') }));
  await userEvent.click(screen.getByPlaceholderText(i18n.t('entrenamiento:picker.placeholder')));
  await userEvent.click(await screen.findByText('Biceps Curl'));

  expect(onLoadExercise).toHaveBeenCalledWith(expect.objectContaining({ id: 'curl' }));
  // back on the overview, listed last with its resolved name and position
  expect(await screen.findByText(/Biceps Curl/)).toBeInTheDocument();
});

it('hides exercises already in the session from the picker', async () => {
  searchResults.length = 0;
  searchResults.push(curlRow, { id: 'bench', name_es: 'Press banca', name_en: 'Bench Press', equipment: null });
  renderRunner(vi.fn(), fakeLoad());

  await openOverview();
  await userEvent.click(screen.getByRole('button', { name: i18n.t('entrenamiento:runner.addExercise') }));
  await userEvent.click(screen.getByPlaceholderText(i18n.t('entrenamiento:picker.placeholder')));

  expect(await screen.findByText('Biceps Curl')).toBeInTheDocument();
  // 'bench' is the routine's only exercise; it must not be offered again
  const options = screen.queryAllByText('Bench Press');
  expect(options).toHaveLength(0);
});

it('still adds the exercise when the prefill lookup fails', async () => {
  searchResults.length = 0;
  searchResults.push(curlRow);
  const onLoadExercise = fakeLoad({
    input: {
      exerciseId: 'curl', targetSets: 3, targetRepsMin: 8, targetRepsMax: 12,
      restSeconds: null, targetRpe: null, defaultIncrementKg: 2.5, warmupSets: [],
      lastWorkingWeightKg: null,
      workingSetPrefill: [
        { reps: 8, weightKg: null }, { reps: 8, weightKg: null }, { reps: 8, weightKg: null },
      ],
    },
    lastTimeLabel: null,
  });
  renderRunner(vi.fn(), onLoadExercise);

  await openOverview();
  await userEvent.click(screen.getByRole('button', { name: i18n.t('entrenamiento:runner.addExercise') }));
  await userEvent.click(screen.getByPlaceholderText(i18n.t('entrenamiento:picker.placeholder')));
  await userEvent.click(await screen.findByText('Biceps Curl'));

  expect(await screen.findByText(/Biceps Curl/)).toBeInTheDocument();
});
```

Update the existing `renderRunner` helper signature to:

```ts
function renderRunner(onSave = vi.fn().mockResolvedValue('new-id'), onLoadExercise = fakeLoad()) {
```

and pass `onLoadExercise={onLoadExercise}` into `<Runner ... />` alongside the existing props.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/features/training/runner/Runner.test.tsx`
Expected: FAIL — no "Añadir ejercicio"/"Add exercise" button exists, and `Runner` rejects the unknown `onLoadExercise` prop.

- [ ] **Step 4: Add the button to the overview panel**

In `src/features/training/runner/ExerciseOverview.tsx`, add to `Props`:

```ts
  onAddExercise: () => void;
```

Add it to the destructured parameter list (line 20), and put the button **above** the destructive actions in the bottom stack (replacing lines 67–70):

```tsx
      <div className="mt-auto flex flex-col gap-2">
        <Button type="button" variant="secondary" className="w-full" onClick={onAddExercise}>
          {t('runner.addExercise')}
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={onSkipCurrent}>{t('runner.skipCurrent')}</Button>
        <Button type="button" variant="destructive" className="w-full" onClick={onFinishEarly}>{t('runner.finishEarly')}</Button>
      </div>
```

- [ ] **Step 5: Wire the dialog and the merged maps into `Runner`**

In `src/features/training/runner/Runner.tsx`:

Add imports:

```ts
import { useMemo } from 'react';                       // extend the existing react import
import { ExercisePicker } from '../components/ExercisePicker';
import type { Exercise } from '../exercises/api';
import type { AddedExerciseData } from './loadAddedExercise';
```

Add to `Props`:

```ts
  /** Resolves an added exercise's plan + prefill. Contractually never rejects
   *  (see loadAddedExercise) — failures come back as a 0 kg fallback. */
  onLoadExercise: (exercise: Exercise) => Promise<AddedExerciseData>;
```

Add it to the destructured parameters on line 46.

Add state next to the existing `useState` calls:

```ts
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  // Added exercises aren't in the props keyed by id, so keep their display data
  // here and merge it over the props. One record, not three parallel maps.
  const [extras, setExtras] = useState<
    Record<string, { name: string; lastTime: string | null; coach: CoachContext }>
  >({});
```

Derive the merged maps right after (before `useRunnerDraftMirror`):

```ts
  const mergedNames = useMemo(() => {
    const out = { ...names };
    for (const [id, e] of Object.entries(extras)) out[id] = e.name;
    return out;
  }, [names, extras]);
  const mergedLastTime = useMemo(() => {
    const out = { ...lastTimeByExercise };
    for (const [id, e] of Object.entries(extras)) out[id] = e.lastTime;
    return out;
  }, [lastTimeByExercise, extras]);
  const mergedCoach = useMemo(() => {
    const out = { ...coachContextByExercise };
    for (const [id, e] of Object.entries(extras)) out[id] = e.coach;
    return out;
  }, [coachContextByExercise, extras]);
```

Add the handler next to `doJump`:

```ts
  async function handleAddExercise(exercise: Exercise) {
    setAdding(true);
    try {
      const data = await onLoadExercise(exercise);
      setExtras((prev) => ({
        ...prev,
        [exercise.id]: { name: data.name, lastTime: data.lastTimeLabel, coach: data.coachContext },
      }));
      dispatch({ type: 'ADD_EXERCISE', exercise: data.input, nowMs: Date.now() });
    } finally {
      setAdding(false);
      setAddOpen(false);
    }
  }
```

**Replace every consumer of the raw prop maps with the merged ones** — an added exercise is not present in the props and would otherwise render its raw UUID and lose its coach panel. The sites are:

| line | change |
|---|---|
| 145 | `<ExerciseOverview ... names={mergedNames}` |
| 156 | `t('runner.leavePartialBody', { name: mergedNames[ex.exerciseId] ?? ex.exerciseId })` |
| 180 | `<SkipRecovery ... names={mergedNames}` |
| 194 | `<ReviewScreen ... names={mergedNames}` |
| 212 | `exerciseName={mergedNames[ex.exerciseId] ?? ex.exerciseId}` |
| 213 | `nextExerciseName={next ? mergedNames[next.exerciseId] ?? next.exerciseId : null}` |
| 229 | `exerciseName={mergedNames[ex.exerciseId] ?? ex.exerciseId}` |
| 230 | `coachContext={mergedCoach[ex.exerciseId] ?? null}` |
| 255 | `lastTimeLabel={!set.isWarmup ? mergedLastTime[ex.exerciseId] ?? null : null}` |

Pass the new callback to the overview (in the `showOverview` block):

```tsx
          onAddExercise={() => setAddOpen(true)}
```

And add the dialog inside the same `showOverview` block, after the existing `pendingJump` `<Dialog>`:

```tsx
        <Dialog open={addOpen} onOpenChange={(o) => { if (!adding) setAddOpen(o); }}>
          <DialogContent className="overflow-visible">
            <DialogHeader>
              <DialogTitle>{t('runner.addExerciseTitle')}</DialogTitle>
              <DialogDescription>{t('runner.addExerciseBody')}</DialogDescription>
            </DialogHeader>
            {adding ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t('runner.addExerciseLoading')}
              </p>
            ) : (
              <ExercisePicker
                selected={null}
                onSelect={handleAddExercise}
                onClear={() => {}}
                excludeIds={state.exercises.map((e) => e.exerciseId)}
              />
            )}
          </DialogContent>
        </Dialog>
```

`overflow-visible` is a **starting point** for the picker's absolutely-positioned results dropdown, not a verified fix — jsdom cannot see CSS, so Step 8 checks it in a real browser.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run src/features/training/runner/Runner.test.tsx`
Expected: PASS, all tests including the pre-existing ones.

If a test hangs instead of failing, kill it immediately and check the mock factory for a new-object-per-render identity: `pkill -f 'vitest.*r46-add-exercise'`, then verify with `ps aux | grep vitest` that no detached workers are left spinning.

- [ ] **Step 7: Prove the assertions bite**

Temporarily remove `excludeIds` from the `<ExercisePicker>` call → "hides exercises already in the session from the picker" must FAIL. Temporarily revert line 145 to `names={names}` → "adds an exercise from the overview panel" must FAIL on the resolved name. Revert both.

- [ ] **Step 8: Verify in a real browser**

jsdom cannot see CSS, and this exact shape — an absolutely-positioned dropdown inside a dialog — is what previously shipped a clipped, unusable ingredient picker. Do not skip this.

```bash
pnpm dev
```

At mobile width (~390 px) **and** at desktop width, start a workout from a routine and check:
1. The overview panel's "add exercise" button is reachable without scrolling past the destructive buttons.
2. The picker's results dropdown is **fully visible** inside the dialog — not clipped, not behind the dialog edge, and scrollable. If it is clipped, fix it here (the `overflow-visible` above, a portal, or repositioning) and note what worked.
3. The added exercise appears at the bottom of the overview list with its real name and the next position number.
4. Jumping to it shows the working weight prefilled from the last session.

- [ ] **Step 9: Lint, typecheck and commit**

```bash
pnpm lint && pnpm typecheck
git add src/features/training/runner/ExerciseOverview.tsx src/features/training/runner/Runner.tsx src/features/training/runner/Runner.test.tsx src/i18n/es/entrenamiento.json src/i18n/en/entrenamiento.json
git commit -m "feat(runner): add an exercise mid-workout (R-46)"
```

---

## Task 5: Wire the real history fetch in `RunnerPage`

**Files:**
- Modify: `src/pages/RunnerPage.tsx` (imports 1–10, component body 22–27, render 71–81)

**Interfaces:**
- Consumes: `loadAddedExercise` / `AddedExerciseData` (Task 2), `Runner`'s `onLoadExercise` prop (Task 4).
- Produces: nothing — this is the top of the chain.

- [ ] **Step 1: Implement the callback**

In `src/pages/RunnerPage.tsx`, add imports:

```ts
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchExerciseHistory } from '@/features/training/api';
import { loadAddedExercise } from '@/features/training/runner/loadAddedExercise';
import { todayInTZ } from '@/lib/dates';
import type { Exercise } from '@/features/training/exercises/api';
```

Verify the export path of `fetchExerciseHistory` against how `src/pages/EntrenamientoPage.tsx` imports it and match that exactly.

In the component body, next to the existing `const num = useNum();`:

```ts
  const { user } = useAuth();
  const { i18n } = useTranslation();
```

These are hooks — they must sit **above** the early `return <Navigate ...>` guards on lines 33–52, alongside the other hooks, or React will throw on the conditional-hook rule.

Add the callback just before the `return (` (after the `lastTimeByExercise` loop):

```ts
  const lang: 'es' | 'en' = (i18n.language || 'es').startsWith('en') ? 'en' : 'es';

  function handleLoadExercise(exercise: Exercise) {
    return loadAddedExercise({
      exercise,
      lang,
      todayISO: todayInTZ(),
      formatWeight: (kg) => num.qty(kg),
      fetchHistory: (exerciseId) =>
        user ? fetchExerciseHistory(user.id, exerciseId) : Promise.resolve([]),
    });
  }
```

And pass it to the runner:

```tsx
      onLoadExercise={handleLoadExercise}
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. A "React Hook called conditionally" lint error means the `useAuth`/`useTranslation` calls landed below an early return — move them up.

- [ ] **Step 3: Verify end-to-end against the real database**

```bash
pnpm dev
```

With a routine that has real workout history:
1. Start a workout, open the overview, add an exercise **you have logged before** → its working weight must match your last session, and the "last time" hint must show on its set screen.
2. Add an exercise you have **never** done → 0 kg, 3 × 8, no crash.
3. Simulate offline (DevTools → Network → Offline), add an exercise → after at most ~4 s it is added at 0 kg with no error toast and no hung spinner.
4. Back online, record a set on the added exercise, finish the workout and save → **check the saved session actually contains the added exercise's sets**. This is the one thing no unit test covers: it exercises the real `save_workout` RPC against the real unique constraint.
5. Re-open the routine → its exercise list is **unchanged** (session-only, spec decision 1).

- [ ] **Step 4: Run the full suite yourself**

Do not trust a per-file green. Subagent-reported greens have previously hidden a red sibling test.

```bash
pnpm lint && pnpm build && pnpm test
git status --porcelain   # must be clean apart from intended changes
```

Expected: all three green, no stray files.

- [ ] **Step 5: Commit**

```bash
git add src/pages/RunnerPage.tsx
git commit -m "feat(runner): fetch the added exercise's history for prefill (R-46)"
```

---

## Task 6: Docs and PR

**Files:**
- Modify: `docs/roadmap.md` (R-46 entry), `docs/changelog.md`

- [ ] **Step 1: Update the roadmap**

Mark R-46 as shipped in `docs/roadmap.md`, following the exact format the neighbouring shipped entries use. Note explicitly that it is **session-only** and that "also save to the routine" was deliberately deferred, so the deferral is not rediscovered as a bug.

- [ ] **Step 2: Add a changelog entry**

Add an entry to `docs/changelog.md` in the format of the existing entries, referencing the PR number once it exists.

Do **not** touch `docs/data-model.md` (no schema change) or `docs/decisions.md` (no new D-xx — the design decisions live in the spec; add one only if a reviewer asks).

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin claude/r46-add-exercise
gh pr create --base develop \
  --title "feat(training): add an exercise mid-workout (R-46)" \
  --body "$(cat <<'EOF'
Adds an exercise to a workout that is already running, logged in today's session only.

- New pure `ADD_EXERCISE` reducer action; appends at `max(position) + 1`, never moves the cursor.
- Working weight prefills from the last logged session; any failure (offline, error, 4 s timeout, no history) degrades silently to 0 kg.
- The picker hides exercises already in the session — `workout_sets` is unique on `(session_id, exercise_id, set_index)`, so a duplicate would fail the end-of-workout save.
- The routine behind the workout is never modified.

No migration, no RPC, no new write path: the added exercise's sets ride the existing `save_workout` call.

Spec: `docs/superpowers/specs/2026-07-26-r46-add-exercise-mid-workout-design.md`
EOF
)"
```

**Do not enable auto-merge until every task above is complete and verified** — auto-merge ships the PR the instant CI turns green, and it has previously shipped half-finished work.

- [ ] **Step 4: Enable auto-merge once CI is green and the work is done**

```bash
gh pr merge --squash --auto
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Decision 1 — session-only, routine untouched | 1 (no routine write anywhere), 6 (documented) |
| Decision 2 — appended at the end, `max + 1` | 1 (steps 5, 7) |
| Decision 3 — no duplicates, DB constraint | 1 (reducer guard), 3 (picker filter), 5 (step 3.4 real save) |
| Decision 4 — prefill with 0 kg fallback | 2 (all four failure paths), 5 (step 3.3 offline) |
| Reducer contract (`AddedExerciseInput`, pure) | 1 |
| Data resolution in `RunnerPage`, not `Runner` | 2 (injected fetcher), 5 |
| Plan defaults table (3 × 8–12, no warm-up, count-up rest) | 2 (step 3), asserted in 2 (step 1) |
| UI — overview button, dialog, local extras merge | 4 |
| i18n both languages | 4 (step 1) |
| Failure behaviour incl. 4 s timeout | 2 (`settleOrFallback`, fake-timer test) |
| Draft persistence / `save_workout` unchanged | no code needed; verified in 5 (step 3.4) |
| Tier-1 tests | 1, 2 |
| Tier-2 tests + supabase-import mock | 4 (step 2) |
| Red-before-green proof | 1 (step 7), 2 (step 5), 4 (step 7) |
| Real-browser pass | 4 (step 8), 5 (step 3) |

**Type consistency:** `AddedExerciseInput` is defined once in Task 1 and consumed by name in Tasks 2 and 4. `AddedExerciseData` is defined in Task 2 and consumed in Tasks 4 and 5. `loadAddedExercise`'s option names (`exercise`, `lang`, `todayISO`, `fetchHistory`, `formatWeight`, `timeoutMs`) match between the definition in Task 2 and the call in Task 5. `onLoadExercise` has the same signature in Task 4's `Props` and Task 5's call site. `excludeIds` matches between Tasks 3 and 4.

**Known risk carried forward:** the picker's absolute dropdown inside a dialog is the one thing the test suite structurally cannot verify. Task 4 Step 8 is the gate; `overflow-visible` is a guess and may need replacing.
