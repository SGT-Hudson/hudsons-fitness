# F-3 — Guided active-workout runner (rest timer + inline logging)

> **Builds on shipped work.** F-2 / R-22 (`2026-05-24-training-routines-planner-design.md`)
> delivered routines, programs/cycles, the planner-first `/training`, and the
> `save_workout` provenance stamps. The Training MVP (R-19,
> `2026-05-20-training-mvp-design-v2.md`) delivered the `exercises` pool,
> `workout_sessions`, `workout_sets`, the `save_workout` RPC, `src/core/training.ts`
> (incl. `lastWorkingSetForExercise`, `evaluateCoach`), and the `/training` surface.
> F-2b (#128) added warm-up sets to routines (`{ pct, reps }` per exercise).
>
> F-3 is the **guided runner**: a "start workout" mode layered over that same session
> data — rest timer, step-through, the `log-sets` sheet, per-set prefill-from-last.
> It needs **no schema or RPC changes**.

---

## 0. Defaults & decisions at-a-glance

| # | Decision | Resolution | Status |
|---|----------|-----------|--------|
| 0.1 | Runner vs editor | Runner is the **primary** "do today's workout" path; tapping today's slot launches it. The manual `SessionEditor` demotes to edit-finished / ad-hoc logging. | settled |
| 0.2 | Persistence | **Ephemeral client state mirrored to `localStorage`** on every change (A′). No DB writes mid-workout; single atomic `save_workout` at finish. | settled |
| 0.3 | Crash/lock recovery | Reopening with a saved draft shows a **resume prompt** (Resume / Discard), not auto-jump. | settled |
| 0.4 | Rest-timer trigger | Explicit **"Start rest"** button per set → timer runs → reps/weight logged *during* the rest. | settled |
| 0.5 | Rest duration | From `routine_exercises.rest_seconds`. At zero: sound + vibration, counts past zero into "over". ±15 s + skip adjust this instance only. | settled |
| 0.6 | Null rest + warm-ups | Null `rest_seconds` and **all warm-up rests** → silent **count-up stopwatch**, no target, no alarm. | settled |
| 0.7 | Background alerts | **Screen Wake Lock** held while the runner is active so JS keeps running and the alarm fires. PWA cannot alert when manually locked — accepted. | settled |
| 0.8 | Step-through | **Linear with escape hatches**: jump to any exercise, skip, end-exercise-early, add a set beyond target. No on-the-fly reorder. | settled |
| 0.9 | Skipped exercise | **Not saved** — history reflects what was done, not what was planned. | settled |
| 0.10 | Prefill | **Per-set** from the last session of that exercise (set 1 ← set 1, …); fallbacks: last working set → target-rep floor + blank weight. | settled |
| 0.11 | Warm-up weight | Computed live as `pct% × today's working weight`, rounded to `exercises.default_increment_kg`. Working weight is a single editable anchor per exercise, prefilled from `lastWorkingSetForExercise`. | settled |
| 0.12 | RPE | Optional input on working sets only; ⓘ explainer sheet (reps-in-reserve anchors) + self-describing picker; same i18n explainer reused on the routine builder's `target_rpe` field. | settled |
| 0.13 | Coach | **One quiet, dismissible** suggestion line per exercise at the working-weight step, reusing `evaluateCoach`. Richer coaching deferred. | settled |
| 0.14 | Ad-hoc | Runner is **routine-only**. Spontaneous logging stays in the manual `SessionEditor`. | settled |
| 0.15 | Finish | **Review screen** (logged sets, warm-ups flagged) → one atomic `save_workout` stamped with `program_id` + `routine_id` → clear draft → navigate to the saved session. | settled |
| 0.16 | Schema / RPC | **No changes.** `save_workout` already accepts per-set `rpe` + `is_warmup` and the `p_program_id`/`p_routine_id` stamps. | settled |
| 0.17 | Visual polish | Functional, on-pattern UI only; pixel-level styling lands with U-8. | settled |
| 0.18 | Units | Metric only (kg) — invariant #1. The `log-sets` mockup's lb is just the source app. | settled |
| 0.19 | Core screen layout | **"Timer on top"** (single scrolling screen): rest timer pinned at top while resting, set inputs below, one primary button. Chosen over a bottom-sheet or focused-card layout. | settled |
| 0.20 | Per-set states | **Two-state loop per set: READY → RESTING.** READY shows the planned reps/weight as **white, read-only** values (no steppers), button **"Start rest"**. RESTING starts the timer and makes inputs editable (reps stepper + **weight stepper**, weight stepping by `default_increment_kg`, value also typable), button **"Record set"**. Warm-ups use the same two-state loop. | settled |
| 0.21 | Record vs rest | **"Record set" logs the set and advances to the next set's READY, but does NOT end the rest** — the timer keeps running (compact band) into the next READY; the 0:00 alarm is the cue to lift. Recording = "log what I did", not "end rest". | settled |
| 0.22 | "What's next" model | **Position pointer over the fixed routine order.** App tracks only done / skipped / remaining. "Continue" proposes the next exercise that is neither done nor skipped. Jumping just lets you do a *remaining* one early; no reorder state. | settled |
| 0.23 | Skip = soft | Skipping advances the pointer but **parks** the exercise as "skipped" — still listed in the overview ("do it ›"), jump-back-able until finish. At finish, undone skipped exercises are **surfaced** ("do it now / save without it"); if still undone → not saved (per 0.9). | settled |
| 0.24 | Exercise-complete beat | After the last set, a **completion card**: ✓ + volume, **"+ Add another set"** (above), the **up-next** exercise (name large, reps×weight emphasised), **"Jump to another exercise"** (→ overview), and **"Continue"** (primary, bottom). Action buttons bottom-aligned across runner screens. | settled |
| 0.25 | Drag-reorder | **Out of scope.** The overview lets you *jump/skip* (choose which remaining exercise is next), not drag-rearrange the saved routine. True reorder is a separate future feature. | settled |

---

## 1. Scope

**In scope:**

- A guided runner launched from **today's slot** on `/training`, walking the user
  through the active program's routine for today: ordered exercises, warm-ups
  first, then working sets, with a rest timer and inline per-set logging.
- Per-set **prefill from the last session** of each exercise + a "last time" reference line.
- **`localStorage` autosave** of the live workout + **resume prompt** on reopen.
- **Screen Wake Lock** + in-app sound/vibration alarm.
- Optional **RPE** logging with a discoverable explainer.
- A single **quiet coach line** per exercise.
- A **review screen** → atomic `save_workout`.
- The manual `SessionEditor` stays, demoted to edit/ad-hoc; today's-slot entry
  re-points from the prefilled editor to the runner.

**Explicitly out of scope:**

- Native (Capacitor) background timer notifications — future roadmap item.
- Richer in-runner coaching (multiple rules, inline accept/apply) — later sprint.
- Per-set / pyramid / drop-set prescriptions; prescribed weights stored in routines.
- On-the-fly exercise reordering mid-workout.
- Pixel-level visual treatment (U-8).
- **Cross-device mid-workout resume** — explicitly **not wanted**, now or later.

---

## 2. The runner loop (UX)

Single-screen **"timer on top"** layout (0.19), linear walk down the routine's
exercises with escape hatches. The screen sequence (validated via storyboard):

1. **Pre-workout** — tap today's slot → routine overview (exercises + est. time)
   → **"Start workout"**.
2. **Exercise start** — large exercise name, the editable **working-weight
   anchor** (prefilled from `lastWorkingSetForExercise`; editing recomputes warm-up
   weights live), a quiet **coach line** (§5.2), and the plan (warm-ups then sets)
   → **"Begin"**.
3. **Set flow (warm-ups first, then working sets)** — each set is a two-state loop:
   - **READY:** planned reps/weight shown as **white, read-only** values (no
     steppers). You physically do the set, then tap **"Start rest"**.
   - **RESTING:** the timer starts (§3); inputs become editable — a **reps
     stepper** and a **weight stepper** (steps by `default_increment_kg`, value
     also typable) — plus optional **RPE** on working sets. Tap **"Record set"**.
   - **Recorded:** the set checks off (✓ on its row) and you advance to the next
     set's READY — **the rest timer keeps running** in a compact band; the 0:00
     alarm is the cue to lift (0.21).
   - Warm-ups use the same loop with the silent count-up stopwatch (0.6) and a
     "Record warm-up" button; warm-up weight = `round(pct% × workingWeight,
     default_increment_kg)`.
4. **Exercise complete** — a completion card: ✓ + set count/volume,
   **"+ Add another set"**, the **up-next** exercise (name prominent), **"Jump to
   another exercise"** (→ overview), **"Continue"** (0.24).
5. **Finish → review → save** (§0.15, §4.3). If skipped exercises remain undone, a
   **skip-recovery** step first (0.23).

**"What's next" — position-pointer model (0.22):** the routine order is fixed; the
app tracks only **done / skipped / remaining**. "Continue" advances to the next
exercise that is neither done nor skipped. Jumping lets you do a *remaining*
exercise early; it never reshuffles the canonical order.

**Escape hatches** (the exercise overview + per-card affordances):

- **Jump** to any remaining/skipped exercise via the overview (machine taken, supersets).
- **Skip** — *soft and recoverable* (0.23): parks the exercise as "skipped", still
  jump-back-able; surfaced at finish; never saved if left undone.
- **Add a set** beyond `target_sets` (appends another working set, prefilled from
  the last working set).
- **Finish workout early** from the overview.

No on-the-fly **drag-reorder** (0.25 — jumping covers the need).

---

## 3. State, persistence & timer

### 3.1 Live state
The in-progress workout is a **client reducer/context** holding:

- the routine + computed plan (exercises, warm-ups, targets);
- a **cursor** (current exercise + set);
- per-exercise **today's working weight**;
- the **recorded sets** so far (reps, weight, rpe, is_warmup, set_index);
- the **active timer** (target timestamp, or count-up start), if running.

### 3.2 Persistence (A′)
Every state change is mirrored to **`localStorage`** under a single draft key
(one in-progress workout at a time). **No DB writes during the workout.**

- **Lock / brief background:** the page usually stays in memory — live state is
  simply still there. No restore needed.
- **OS tab eviction / refresh / crash / app reopen:** React state is gone; the
  `localStorage` mirror restores the full workout.

On mount, if a draft exists → **resume prompt**
("Resume your *{routine}* from *{n}* min ago? · Discard"). Resume rehydrates the
reducer; Discard clears the draft. No auto-jump.

### 3.3 Rest timer (`useRestTimer`)
- **Trigger:** explicit "Start rest" per set.
- **Duration:** `routine_exercises.rest_seconds`. Remaining time is computed from a
  stored **target timestamp** (`startedAt + rest_seconds`), never by decrementing a
  counter — so a locked/backgrounded phone shows correct remaining time on return
  (`setInterval` throttles in the background; wall-clock math doesn't).
- **At zero:** play sound + `navigator.vibrate`; the timer keeps counting **past
  zero** into "+0:15 over" so the user sees actual rest taken.
- **Adjust:** ±15 s and skip affect **this instance only**, never the prescription.
- **Null `rest_seconds` and all warm-up rests:** silent **count-up stopwatch** — no
  target, no alarm; the user goes when ready.

### 3.4 Wake Lock (`useWakeLock`)
While the runner is active, request a **Screen Wake Lock** so the screen stays on,
JS keeps running, and the alarm fires. Re-acquire on `visibilitychange` (the lock
is released when the page is hidden). Release on unmount / finish.

**Honest limitation:** wake lock only prevents *automatic* dimming/locking. A
deliberate power-button lock releases it and throttles JS — no alert then. Accepted
for F-3; true background notifications need the native wrapper (out of scope).

---

## 4. Data flow

### 4.1 On start (load)
Load the active program's routine for today + its exercises and warm-ups, plus each
exercise's **set history**, and compute prefill.

### 4.2 Prefill (new pure core helper)
`prefillSetsForExercise(history, targetSets, targetRepsMin)` in
`src/core/training.ts` — pure, clock-free, DB-free, unit-tested in isolation:

- For each working set index `i`, prefill from the **most recent session's set `i`**
  of that exercise.
- **Fallbacks:** if last time had fewer sets → use the last working set; if no
  history at all → reps = `target_reps_min`, weight = blank.
- Returns per-index `{ reps, weight }` suggestions; also surfaces the matching
  previous values for the **"last time: 5 × 80 kg"** reference line.

Warm-up weights are derived separately: `round(pct% × workingWeight,
default_increment_kg)`; warm-up reps come from the prescription.

### 4.3 On finish (save)
Review screen → a single **`save_workout`** call:

- `p_sets`: all recorded sets — warm-ups with `is_warmup = true`, working sets with
  `is_warmup = false`, each carrying `set_index`, `reps`, `weight_kg`, `rpe` (nullable).
- `p_program_id` + `p_routine_id`: the provenance stamps (the source program/routine).

On success: clear the `localStorage` draft, navigate to the saved session view.

**No schema/RPC changes** — `save_workout(uuid, date, text, text, jsonb, uuid, uuid)`
(migration `20260528120030_f2_rpcs.sql`) already accepts this exact payload.

---

## 5. RPE + coach

### 5.1 RPE
- Optional input on **working sets only** (never warm-ups); empty is always valid.
- A 6–10, 0.5-step scale (the routine schema already enforces the step).
- **ⓘ explainer sheet** with the reps-in-reserve anchor table:
  10 = none left · 9 = 1 more · 8 = 2 more · 7 = 3–4 more · 6 = easy.
- The **picker is self-describing** ("8 — 2 reps left") so the scale is learned by use.
- Surfaced more prominently when the exercise has a `target_rpe` ("target RPE 8").
- **Same i18n explainer reused** on the routine builder's `target_rpe` field, so the
  concept is consistent wherever RPE appears.

### 5.2 Coach
One **quiet, dismissible** suggestion line per exercise at the working-weight step,
reusing the existing `evaluateCoach` / `MVP_COACH_RULES` engine (top suggestion
only). Never blocks the flow. Richer coaching (multiple rules, inline apply) is a
later sprint.

---

## 6. Code surface

**Core (pure, Tier-1 tested):**

- `prefillSetsForExercise(...)` in `src/core/training.ts`.

**Runner feature (`src/features/training/runner/`, approx.):**

- A **reducer + context** for live workout state.
- A **`localStorage` draft hook** (load / mirror / clear, one draft key).
- **`useRestTimer`** — timestamp-based remaining/over-time + count-up mode.
- **`useWakeLock`** — acquire/re-acquire/release.
- Runner **page** + step components: pre-workout overview, exercise-start header
  (working-weight anchor + coach line + plan), the **set component** (READY ↔
  RESTING states, reps + weight steppers, RPE), the **completion card**
  (add-set / up-next / jump / continue), the **exercise overview** (jump / skip /
  finish-early), the **skip-recovery** prompt, and the **review** screen.
- A small **"what's next" selector** over the position-pointer state (done /
  skipped / remaining) — pure, in or beside the reducer, unit-testable.
- Small **RPE explainer** component (shared with the routine builder).

**Wiring:**

- Re-point **today's-slot** entry on `/training` from the prefilled `SessionEditor`
  to the runner.

**i18n (ES/EN):** RPE explainer + scale labels, runner controls (start rest, skip,
add set, end early, finish), resume prompt, coach line wrapper, review screen.

---

## 7. Testing

**Tier-1 (pure):**

- `prefillSetsForExercise` — per-set match, fewer-sets fallback, no-history fallback,
  ordering by recency.
- Rest-timer remaining-time math — timestamp-based remaining, past-zero "over",
  count-up mode.
- Warm-up weight rounding to `default_increment_kg`.

**Tier-2 (component, Vitest + RTL + jsdom — mock the data hook to avoid the
env-less-CI trap):**

- Runner loop happy path: warm-up → working sets → finish.
- READY ↔ RESTING transitions: Record set checks the row off, advances, and leaves
  the rest timer running (0.21).
- "What's next" position pointer: jump out of order, return, Continue proposes the
  next done/skipped-excluded exercise (0.22).
- Skip is recoverable: skipped exercise stays jump-back-able; the skip-recovery
  step surfaces it at finish; left undone → not saved (0.23).
- Escape hatches: jump, add-set, finish-early.
- Resume prompt: restore rehydrates; discard clears the draft.
- Save payload shape: `is_warmup` / `rpe` / `set_index` / stamps correct.

**No E2E** — out of scope per the tier model.

---

## 8. Out of scope / future roadmap

- **Native (Capacitor) wrapper** for true background timer notifications (fires when
  the phone is manually locked / app backgrounded). Logged as a roadmap item if the
  wake-lock experience proves annoying in real gym use.
- **Richer in-runner coaching** — multiple rules, inline accept/apply.
- **Per-set / pyramid / drop-set prescriptions; prescribed weights** in routines.
- **On-the-fly reorder** mid-workout.
- App-wide **visual treatment** (U-8).

*(Cross-device mid-workout resume is **not** a future item — explicitly unwanted.)*
