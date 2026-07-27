# R-46 — add an exercise mid-workout

**Date:** 2026-07-26
**Thread:** training runner (R-46)
**Type:** new feature — reducer action + runner UI + one read query
**Schema/RLS:** none. No migration, no RPC, no new write path.

## The problem

The runner freezes its exercise list at `buildRunnerState`. Once a session
starts there is no way to say "today I also feel like doing some curls" — the
only options are to abandon the workout or do the extra work untracked.

## Decisions (converged with Gonzalo, 2026-07-26)

1. **Session-only. The routine behind the workout is never touched.** The added
   exercise is logged in today's session like any other, but the routine keeps
   its original list. Rationale: the real case is a one-off impulse, not a
   change of training plan; mid-workout — sweating, timer running — is the wrong
   moment to commit to a permanent program change; and technically it keeps the
   feature to a single read, since the runner already persists everything
   through one `save_workout` call at the end.

   Counterpoint acknowledged: someone who adds the same exercise three weeks in
   a row must add it to the routine separately. That path already exists — R-31
   (PR #227) ships "add an exercise to a routine" from the exercise detail page.
   If usage shows the pattern repeating, a "save to the routine too" checkbox
   can be added later; it is deliberately **not** in v1 because it would require
   fetching the full `RoutineWithExercises` aggregate mid-workout and only works
   when the session came from a routine at all.

2. **The added exercise goes at the end of the list.** `advanceOrFinish` already
   walks to the next `pending` exercise, so it comes up when its turn arrives.
   Wanting it *now* is already covered: the same overview panel offers "jump to"
   on any pending exercise. Inserting after the current exercise would mean
   re-indexing `position` and moving `currentExerciseIndex` for no user-visible
   gain.

3. **No duplicates — this is a hard constraint, not a preference.**
   `workout_sets` carries `unique (session_id, exercise_id, set_index)`
   (`20260522120010_training_sessions_sets.sql`). Two blocks of the same
   exercise each restart `set_index` at 1, so the save at the end of the workout
   would fail *entirely*. The picker hides exercises already in the session, and
   the reducer refuses a duplicate defensively. More sets of an exercise already
   done is what `ADD_SET` is for.

4. **Working weight prefills from the last logged session; 0 kg on any
   failure.** Starting every added exercise at 0 kg is real friction for
   anything done regularly. The cost is that this becomes the runner's first
   database read — in a gym, possibly offline. Accepted, with a hard rule: any
   failure (offline, error, no history, slow network) degrades silently to
   0 kg rather than blocking. See §Failure behaviour.

## Architecture

### Reducer — `src/core/runner.ts`

One new action, pure, no I/O:

```
{ type: 'ADD_EXERCISE'; exercise: RunnerInputExercise; nowMs: number }
```

The payload is the **existing** `RunnerInputExercise` shape, so the component
resolves the data and the reducer just builds state — the same contract
`buildRunnerState` consumes, and `buildSets` is reused unchanged.

Behaviour:

- If `state.exercises` already contains `exercise.exerciseId`, return `state`
  untouched (defence in depth behind the picker filter — decision 3).
- Append a `RunnerExercise` built exactly as `buildRunnerState` builds one:
  `workingWeightKg = lastWorkingWeightKg ?? 0`, `defaultIncrementKg` falling
  back to 2.5, `sets: buildSets(...)`.
- `position = max(existing positions) + 1`. **Not** `length + 1`: routine
  positions are 1-based but not guaranteed contiguous, and `position` is what
  the overview panel displays.
- `status: 'pending'`. Adding never steals focus — `currentExerciseIndex`,
  `currentSetIndex` and `phase` are all unchanged. The user reaches it via
  Continue (through `advanceOrFinish`) or an explicit jump.
- Goes through `touch` so `savedAtMs` advances like every other action.

There is no interaction with the finish/review flow: the header control that
opens the overview panel is hidden when `phase === 'finishing'`
(`Runner.tsx:111`), so the add button is unreachable once the user has chosen to
finish. Adding is possible only while the workout is still running.

### Data resolution — `RunnerPage`, not `Runner`

`Runner` performs no I/O today; every piece of data arrives as a prop from
`RunnerPage` via router state. That boundary is kept. `RunnerPage` gains a
callback prop:

```
onLoadExercise: (exercise: Exercise) => Promise<RunnerInputExercise>
```

`RunnerPage` implements it with `useAuth()` + the existing
`fetchExerciseHistory(userId, exerciseId)` — the same function
`EntrenamientoPage.startWorkout` already uses per routine exercise. From the
returned history it derives, with the existing pure core helpers:

- `lastWorkingWeightKg` ← `lastWorkingSetForExercise(history)`
- `workingSetPrefill` ← `prefillSetsForExercise(history, 3, 8)`

and from the `Exercise` row the picker hands back (name, `default_increment_kg`,
`primary_muscles`, `equipment`) it also builds the display name, the "last time"
hint and the `CoachContext` — all free once the history is in hand, so the added
exercise behaves like a routine exercise rather than a second-class one.

Keeping the query in `RunnerPage` also keeps `Runner` free of Supabase imports,
which matters for Tier-2 tests (see §Testing).

### Plan defaults

The added exercise has no routine row, so:

| field | value |
|---|---|
| `targetSets` | 3 |
| `targetRepsMin` / `targetRepsMax` | 8 / 12 |
| `restSeconds` | `null` → count-up rest timer, no prescribed countdown |
| `targetRpe` | `null` |
| `warmupSets` | `[]` — no warm-up for an improvised exercise |
| `defaultIncrementKg` | from the catalogue row, else 2.5 |

All adjustable with controls that already exist: `ADD_SET` for a fourth set, the
working-weight stepper for load, per-set editing for reps/RPE.

### UI

- **`ExerciseOverview.tsx`** gains an `onAddExercise` prop and an "add exercise"
  button in the bottom action stack, above "skip current" / "finish early"
  (secondary styling — it is an addition, not a destructive action).
- **`Runner.tsx`** owns the dialog: a shadcn `Dialog` (matching the existing
  `pendingJump` dialog in the same file) containing `ExercisePicker`, whose
  catalogue results are filtered to exclude `state.exercises` ids. On select it
  awaits `onLoadExercise`, dispatches `ADD_EXERCISE`, closes the dialog and
  returns to the overview panel with the new exercise visible at the bottom.
- **Local extras state.** `names`, `lastTimeByExercise` and
  `coachContextByExercise` are fixed props keyed by exercise id, so an added
  exercise would fall through every lookup. `Runner` keeps one local
  `Record<string, { name; lastTime; coach }>` for added exercises and merges it
  over the props with `useMemo` — one piece of state, not three, and the
  existing `names[id] ?? id` fallbacks stay as the last line of defence.

Copy is added to the `entrenamiento` i18n namespace in both languages, per the
usual convention.

## Failure behaviour

The prefill query is best-effort. Every one of these lands the exercise at
**0 kg with default reps**, with no error toast — the exercise is still added:

- offline or network error → the promise rejects, it is caught
- the user has never done that exercise → empty history, existing helpers
  already return `null` / plain defaults
- **slow or hanging request** → the call races a **4-second timeout**. This is
  the case that actually matters: with no signal, supabase-js can hang rather
  than fail fast, and a spinner that never resolves in the middle of a gym set
  is worse than a wrong starting weight.

The dialog shows a brief pending state while resolving so the tap feels
acknowledged, but it can never block longer than the timeout.

## What deliberately does not change

- **No migration, no RPC, no new write path.** The added exercise lives inside
  `RunnerState`, so the existing localStorage draft (`hf:runner:draft:v1`)
  persists it across an app close for free, and `toSaveWorkoutSets` +
  `save_workout` save its sets with all the others at the end.
- **The routine, the program and their provenance columns** on
  `workout_sessions` are untouched.
- **Session-only means session-only:** re-running the same routine tomorrow
  shows the original list.

## Testing

**Tier-1 — `src/core/runner.test.ts`** (pure reducer):

- appends at the end and leaves `currentExerciseIndex` / `currentSetIndex` /
  `phase` untouched
- `position` is `max(position) + 1`, proven against a state with non-contiguous
  positions (e.g. 1, 2, 5 → 6)
- a duplicate `exerciseId` returns the state unchanged
- sets are built from `workingSetPrefill` when history exists, and land at
  0 kg / defaults when it does not
- after `CONTINUE` from the last routine exercise, `advanceOrFinish` activates
  the added exercise
- `toSaveWorkoutSets` emits the added exercise's recorded sets with a contiguous
  per-exercise `set_index`

**Tier-2 — `src/features/training/runner/Runner.test.tsx`** (flow):

- the overview panel shows the add button and the dialog opens
- exercises already in the session are absent from the picker
- selecting one adds it to the overview list with its name resolved
- a rejecting/hanging `onLoadExercise` still adds the exercise at 0 kg

The exercise-catalogue hook behind `ExercisePicker` **must be mocked** in the
Tier-2 test: it imports supabase, and an unmocked render passes locally but
fails in CI, which has no Supabase env (see memory
[[component-test-supabase-env]]). The mock must be module-stable to avoid the
infinite-render hang documented in [[orphaned-test-workers]].

**Every assertion above is verified red before green** — written against
deliberately broken code first, per [[prove-assertions-bite-by-mutation]], where
four R-36 tests passed against code that was wrong.

**Manual pass in a real browser** at mobile width before merge: jsdom cannot see
CSS, and the dialog + picker combination is exactly the shape that shipped a
clipped, unusable dropdown before ([[jsdom-cannot-see-css]]).

## Out of scope

- "Save to the routine too" checkbox (decision 1).
- Choosing sets/reps for the added exercise in the dialog — `ADD_SET` and the
  existing editors cover it.
- Removing an exercise from a running session (`SKIP_CURRENT` covers the need).
- Reordering the session list.
