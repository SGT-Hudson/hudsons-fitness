# Training — Routines & Cyclic Planner Design Spec (F-2)

> Status: **FOR REVIEW — do not merge until approved** (2026-05-24).
> Originates from the 2026-05-23 notes triage item **F-2**
> (`docs/superpowers/specs/2026-05-23-notes-triage.md`). Builds directly on
> the shipped Training MVP (R-19,
> `docs/superpowers/specs/2026-05-20-training-mvp-design-v2.md`): the
> `exercises` pool, `workout_sessions`, `workout_sets`, the `save_workout`
> RPC, `src/core/training.ts`, and the `/training` surface all already exist.
>
> This is the **keystone** of the training refactor. The guided active-workout
> runner (**F-3**), the muscle browse/heatmap (**F-4**), and the app-wide
> visual pass (**U-8**) are sequenced after this and each gets its own spec.

---

## 0. Defaults & decisions at-a-glance

Read this first; everything below assumes these are locked unless flagged.

| # | Item | Decision | Status |
|---|---|---|---|
| 0.1 | Conceptual model | **Two layers:** a reusable **routine** (one workout-day's plan) + a **program** (repeating cycle of slots that reference routines). | settled |
| 0.2 | Routine prescription | Per-exercise: `position`, `target_sets`, `target_reps_min`/`max` (a **range**), `rest_seconds?`, `target_rpe?`. **No prescribed weight** — load comes from runtime (repeat-last + coach). | settled |
| 0.3 | Set-level prescription | **Uniform** across an exercise's sets (all N sets share the rep-range/rest). Per-set / pyramid / drop-set prescriptions are out of scope. | settled |
| 0.4 | Program scheduling | **Cycle of slots**, each slot a routine or a rest day, anchored by a date. "Today's slot" computed on the fly: `day_index == (today − anchor) mod cycleLength`. A 7-day cycle subsumes a week. | settled |
| 0.5 | Drift behaviour | **Calendar-anchored** (every date maps to a fixed slot). Missed days simply show as missed; the calendar marches on. **"Restart from today"** rewrites the anchor. No advancing/queue state. | settled |
| 0.6 | Materialization | **None.** No pre-created per-date rows (unlike `meal_plan_week_slots`). The cycle is fully determined by `anchor + program` and computed at render. Actuals are normal `workout_sessions`. | settled |
| 0.7 | Active program | **One active program per user** (partial unique). Programs are reusable saved artifacts; switching = activate another (sets its anchor). | settled |
| 0.8 | Session stamping | `workout_sessions` gains two nullable columns: `program_id`, `routine_id` (what drove the session; null = ad-hoc). Only change to existing tables. | settled |
| 0.9 | F-2 / F-3 boundary | F-2 delivers planner → **pre-filled manual `SessionEditor`** (the MVP editor). F-3 later adds the *guided* runner (rest timer, step-through, `log-sets` sheet) over the same session data. | settled |
| 0.10 | IA / nav | Fill the **already-reserved** `entreno` nav slots: `/routine` (builders) + `/training` "Hoy" (planner-execute). `/exercises` left for F-4. **Design-vs-do split** mirrors nutrition (planner = design, diario = do). | settled |
| 0.11 | B-2 bug | Root-cause **and fix** the add-exercise bug on `/training/new` as part of this work (we rework that exact surface for prefill). | settled |
| 0.12 | `set_active_program` RPC | Single-table (only `programs`), which invariant #3 permits client-side — but implemented as a tiny RPC so the active-flip is atomic and can't transiently violate the one-active partial unique index. | settled |

---

## 1. Goal & non-goals

**Goal:** let the user design reusable training routines and assemble them into
a repeating, non-week-based program, then have the app tell them what they're
scheduled to train today and pre-fill a workout from that routine — while
ad-hoc workouts continue to work alongside the plan.

**In scope (F-2):**

- **Routine builder** — create / edit / delete reusable routines (ordered
  exercises with target sets × rep-range, rest, optional RPE).
- **Program builder** — assemble an ordered cycle of slots (routine or rest
  day), set the anchor date, activate.
- **Planner ("Hoy")** — today's scheduled routine, the current cycle / upcoming
  days, "restart from today", switch active program.
- **The handoff** — "Start / Log" creates a `workout_session` pre-filled from
  the routine, edited via the **existing** MVP `SessionEditor`, saved via the
  **existing** `save_workout`, stamped with `program_id` + `routine_id`.
- **B-2 fix** — the broken add-exercise flow on the session editor.

**Explicitly out of scope (sequenced after F-2):**

- **F-3** — guided active-workout runner: rest timer, step-through, the
  `log-sets` set-logging sheet, prefill-from-last inside the runner.
- **F-4** — muscle browse screen (`/exercises`) + body-activity heatmap.
- **U-8** — app-wide visual treatment. F-2 ships functional, on-pattern UI;
  pixel-level styling lands with the visual pass.
- Per-set / pyramid / drop-set prescriptions.
- Prescribed weights stored in a routine.
- Multiple routines per program-day slot (ad-hoc covers extra same-day work).
- Advancing/queue scheduling (completion-driven cycle advancement).

## 2. Relationship to existing architecture

This spec reuses, never duplicates, the MVP and nutrition-planner patterns:

| F-2 piece | Reuses proven pattern |
|---|---|
| `routines` owner-only RLS | `recipes` / `workout_sessions` |
| `routine_exercises` RLS via parent join | `recipe_ingredients` / `workout_sets` (verbatim shape) |
| `programs` "one active" partial unique | new, but mirrors the "one active week" intent of `meal_plan_weeks` |
| `save_routine` / `save_program` RPCs | `save_recipe` / `save_workout` (INVOKER, replace-children) |
| pre-filled `SessionEditor` → `save_workout` | the existing MVP editor + RPC, unchanged contract |
| exercise picker in the builder | the MVP `ExercisePicker` (locale-aware, against `exercises`) |
| pure cycle math + tests | `core/training.ts` / `core/macros.ts` constitution |

**Guardrail inheritance.** The two MVP guardrails still hold: training data
**never feeds the TDEE filter** (spec §2.1) and there is **no LLM** anywhere
(spec §2.2). Nothing in F-2 reads `phases` / `tdee_*` / `daily_nutrition_history`,
and the cycle/prefill logic is pure deterministic code.

## 3. Data model

Four new tables. The only change to existing tables is two nullable columns on
`workout_sessions`.

### 3.1 `routines` (user-owned)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid not null | RLS owner → `auth.users(id) on delete cascade` |
| `name` | text not null | "Push A", "Leg day" |
| `notes` | text null | freeform, editable forever |
| `created_at` / `updated_at` | timestamptz | |

**RLS:** standard owner-only (SELECT/INSERT/UPDATE/DELETE on
`auth.uid() = user_id`), identical to `recipes` / `workout_sessions`.

### 3.2 `routine_exercises` (child of `routines`)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `routine_id` | uuid not null | FK → `routines` `ON DELETE CASCADE` |
| `exercise_id` | uuid not null | FK → `exercises` `ON DELETE RESTRICT` (never lose a referenced exercise; mirrors `recipe_ingredients`→`ingredients`) |
| `position` | int not null | 1-based ordering within the routine |
| `target_sets` | int not null | `CHECK (target_sets > 0)` |
| `target_reps_min` | int not null | `CHECK (target_reps_min > 0)` |
| `target_reps_max` | int not null | `CHECK (target_reps_max >= target_reps_min)` (fixed target ⇒ min = max) |
| `rest_seconds` | int null | `CHECK (rest_seconds is null or rest_seconds >= 0)`; rest between sets — the F-3 timer source |
| `target_rpe` | numeric null | `CHECK (target_rpe is null or (target_rpe between 6.0 and 10.0 and target_rpe * 2 = floor(target_rpe * 2)))` — identical to `workout_sets.rpe` |

Plus `unique (routine_id, position)`.

**No `user_id` column** — RLS routes through the parent routine (the established
child-table pattern, verbatim from `workout_sets` / `recipe_ingredients`):

```sql
create policy "Users see own routine exercises" on public.routine_exercises for select
  using (exists (
    select 1 from public.routines r
    where r.id = routine_exercises.routine_id and r.user_id = auth.uid()
  ));
-- … same shape for insert/update/delete.
```

### 3.3 `programs` (user-owned)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid not null | RLS owner |
| `name` | text not null | "PPL", "Upper/Lower 4-day" |
| `is_active` | bool not null default false | exactly one true per user |
| `anchor_date` | date null | the date `day_index = 0` maps to; set on activation |
| `created_at` / `updated_at` | timestamptz | |

Constraints:
- Partial unique: `create unique index programs_one_active_uidx on public.programs (user_id) where is_active;` — one active program per user.
- `CHECK (not is_active or anchor_date is not null)` — an active program must have an anchor.

**RLS:** standard owner-only.

### 3.4 `program_days` (child of `programs`) — the cycle slots

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `program_id` | uuid not null | FK → `programs` `ON DELETE CASCADE` |
| `day_index` | int not null | 0-based position in the cycle; `CHECK (day_index >= 0)` |
| `is_rest` | bool not null default false | rest-day slot |
| `routine_id` | uuid null | FK → `routines` `ON DELETE RESTRICT` (never lose a routine a program points at) |

Constraints:
- `unique (program_id, day_index)`.
- `CHECK ((is_rest and routine_id is null) or (not is_rest and routine_id is not null))` — a slot is exactly one of rest or a routine.

**Cycle length** = `count(*)` of a program's `program_days`. **Today's slot** =
the row whose `day_index = mod(today − anchor_date, cycleLength)` (computed in
pure code, §5; the DB stores no per-date rows).

**RLS:** via join to the parent program (same shape as §3.2).

### 3.5 `workout_sessions` — two new nullable columns

| column | type | notes |
|---|---|---|
| `program_id` | uuid null | FK → `programs` `ON DELETE SET NULL` — which program drove this session; null = ad-hoc |
| `routine_id` | uuid null | FK → `routines` `ON DELETE SET NULL` — which routine it came from; null = ad-hoc |

These are **purely provenance** — they let the planner show adherence
("today's scheduled *Pull* is done") by matching a session's `routine_id` to the
date's scheduled slot, and enable future analytics. `ON DELETE SET NULL` so a
logged session survives the deletion of the routine/program that spawned it
(the session is the canonical record of what was lifted; invariant: never
orphan-destroy logged data).

## 4. RPCs

All user-callable RPCs are `SECURITY INVOKER` + `set search_path = public`
(invariant #3 / D-C5).

### 4.1 `save_routine` (multi-table atomic, replace-children)

`save_routine(p_routine_id uuid, p_name text, p_notes text, p_exercises jsonb)
returns uuid`. Mirrors `save_recipe` / `save_workout`: upsert the routine
(insert when `p_routine_id is null`, else update with an ownership guard), then
**replace** all `routine_exercises` from the JSONB array. Routine + its exercise
list is a >1-table atomic mutation → an RPC.

### 4.2 `save_program` (multi-table atomic, replace-children)

`save_program(p_program_id uuid, p_name text, p_days jsonb) returns uuid`.
Same shape: upsert the program (preserving `is_active` / `anchor_date` — those
are owned by §4.3, not this RPC), then replace all `program_days`. Each day in
`p_days` carries `day_index`, `is_rest`, and `routine_id` (null iff rest); the
RPC validates the XOR before insert.

### 4.3 `set_active_program` (atomic active-flip)

`set_active_program(p_program_id uuid, p_anchor_date date) returns void`.
Deactivates the user's currently-active program and activates the target with
the given anchor, in one statement-pair inside the function so the one-active
partial unique index is never transiently violated:

```sql
update public.programs set is_active = false, updated_at = now()
  where user_id = auth.uid() and is_active and id <> p_program_id;
update public.programs set is_active = true, anchor_date = coalesce(p_anchor_date, current_date), updated_at = now()
  where id = p_program_id and user_id = auth.uid();
```

This touches a **single table**, which invariant #3 permits client-side; it is
nonetheless an RPC so the flip is atomic (§0.12). **"Restart from today"** is the
same call with `p_anchor_date = today` (Europe/Madrid `todayInTZ()`), on the
already-active program.

## 5. Pure core — `src/core/programs.ts`

A new dependency-free module, sibling to `core/training.ts` (which stays focused
on performance metrics + coach). Numeric/date inputs are plain values; the
caller supplies "today" (no clock in the module). Tier-1 Vitest golden vectors
(R-16).

```ts
export interface ProgramDaySlot {
  dayIndex: number;
  isRest: boolean;
  routineId: string | null;
}

export interface RoutineExercisePrescription {
  exerciseId: string;
  position: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number | null;
  targetRpe: number | null;
}

/** 0-based position in the cycle for a date. Pure modular arithmetic over
 *  whole days; handles dates before the anchor via a non-negative mod. */
export function cycleDayForDate(
  anchorISO: string, dateISO: string, cycleLength: number,
): number; // 0..cycleLength-1

/** The slot scheduled for a date, or null if the program has no days. */
export function scheduledSlotForDate(
  days: ProgramDaySlot[], anchorISO: string, dateISO: string,
): ProgramDaySlot | null;

/** Project the cycle onto a date window for the "upcoming" view. */
export interface ProjectedDay { dateISO: string; slot: ProgramDaySlot | null; }
export function projectCycle(
  days: ProgramDaySlot[], anchorISO: string, fromISO: string, count: number,
): ProjectedDay[];

/** Expand a routine's prescriptions into empty set rows for the SessionEditor:
 *  targetSets rows per exercise, rep-range / rest / RPE carried as targets,
 *  weight left blank (filled at runtime). Returns the editor's initial shape. */
export function prefillSetsFromRoutine(
  exercises: RoutineExercisePrescription[],
): Array<{
  exerciseId: string;
  sets: Array<{ setIndex: number; targetRepsMin: number; targetRepsMax: number; restSeconds: number | null; targetRpe: number | null }>;
}>;
```

`cycleDayForDate` uses a floored modulo so dates before the anchor still map
into `0..cycleLength-1`. `cycleLength <= 0` → callers treat the program as
unscheduled (no slot).

## 6. Surfaces

No new nav entries — the `entreno` group already reserves the slots (§0.10).

### 6.1 `/routine` ("Rutinas") — the design surface

Two tabs (or a list with a programs sub-section; decided at impl):

- **Rutinas tab** — list of the user's routines; "＋ Nueva rutina" opens the
  **routine builder**: name, notes, and a RHF field-array of exercise rows.
  Each row: the MVP `ExercisePicker` (locale-aware, against `exercises`) +
  `target_sets`, `target_reps_min`–`max`, `rest_seconds`, `target_rpe`.
  Reorder by `position`. Submit → `save_routine`. Schema co-located in
  `features/training/routineSchema.ts` (R-09).
- **Programas tab** — list of programs (active one badged); "＋ Nuevo programa"
  opens the **program builder**: name + an ordered list of cycle slots, each a
  routine-pick or a rest day. Shows the computed cycle length. Submit →
  `save_program`. An "Activar" action (with an anchor-date picker, default
  today) calls `set_active_program`.

### 6.2 `/training` ("Hoy") — the execute surface (planner-first)

Currently the bare MVP session list. Becomes planner-first:

- **Top: today's plan.** If an active program exists, show the scheduled slot
  for today (`scheduledSlotForDate`): the routine name + its exercise summary
  and a **Start / Log** CTA; or a rest-day card. A small **"Reiniciar ciclo
  hoy"** action (re-anchor). If no active program, an empty-state CTA to build
  one. An **"Upcoming"** strip projects the next few days (`projectCycle`).
- **Start / Log** → navigates to the existing `SessionEditor` seeded from
  `prefillSetsFromRoutine` (N empty set rows per exercise, rep-range/rest/RPE
  shown as targets, weight blank). On save → existing `save_workout`, with
  `program_id` + `routine_id` stamped. A **"Registrar entreno libre"** path
  opens the editor empty (ad-hoc, stamps null) — unchanged from MVP.
- **Below: recent sessions** — the existing `SessionList`, secondary.

### 6.3 `SessionEditor` changes (minimal)

The MVP editor gains an optional `prefill` prop (the §5 shape) and threads
`program_id` / `routine_id` into the `save_workout` payload when present.
**B-2 fix (§0.11):** while here, root-cause and fix the add-exercise flow on the
editor (the broken `ExerciseBlock`/picker add interaction). Existing repeat-last
placeholder and coach behaviour are untouched.

## 7. i18n

Extend the existing `entrenamiento` namespace (ES + EN, both complete — no
English fallback strings) with: routine-builder labels, program-builder labels,
rest-day / cycle terms, planner "today"/"upcoming"/"restart cycle" strings, and
the free-workout CTA. The reserved `nav` keys (`routine`, `exercises`) already
exist. No new namespace needed.

## 8. Testing & rollout

- **Tier-1 Vitest** on `core/programs.ts`: `cycleDayForDate` (incl. mod
  wraparound and pre-anchor dates), `scheduledSlotForDate` (rest vs routine,
  empty program), `projectCycle`, `prefillSetsFromRoutine` (row counts,
  targets carried, weight blank). Golden vectors, deterministic.
- **Tier-2 component** (jsdom + RTL, R-09/R-16 setup): routine builder submit →
  `save_routine` payload shape; program builder submit → `save_program` payload;
  planner "Hoy" renders the correct scheduled slot for a mocked anchor + Start
  prefill flow. **Note the `component-test-supabase-env` trap** — mock the data
  hooks in any `.test.tsx` that renders supabase-importing components, or it goes
  green-local / red-CI.
- **Tier-3 (RLS/RPC)** gated behind R-16-Tier-3 like everything else — document
  the gap, don't fake coverage. When it ships: owner-only on routines/programs,
  RLS-via-join on the two child tables, `save_routine`/`save_program`
  replace-children correctness, `set_active_program` one-active invariant,
  cross-user isolation.
- **Migrations are STAGED, Wave-3 discipline** (same as R-01 / R-19). **Rollout
  dependency:** the R-19 MVP tables (#74) are still draft/pending their Wave-3
  prod apply, so F-2's migrations stack on top and apply in the same (or the
  next) Wave-3 ceremony — **F-2 is blocked-by R-19's prod apply**. New SQL
  objects: 4 tables + their RLS + 3 RPCs + the `workout_sessions` ALTER.
- Ships as its own branch → PR → CI → review, not auto-merged blind (schema
  change + new domain).

## 9. File / decomposition map (for the plan)

| Path | Responsibility |
|---|---|
| `supabase/migrations/…_routines.sql` | `routines` + `routine_exercises` + RLS |
| `supabase/migrations/…_programs.sql` | `programs` + `program_days` + RLS + one-active index |
| `supabase/migrations/…_workout_sessions_stamps.sql` | ALTER `workout_sessions` add `program_id` / `routine_id` |
| `supabase/migrations/…_routine_program_rpcs.sql` | `save_routine`, `save_program`, `set_active_program` |
| `src/core/programs.ts` (+ test) | pure cycle math + prefill (§5) |
| `src/types/database.ts` | hand-edit: 4 tables, 2 new columns, 3 RPCs (interim until R-04 regen) |
| `src/features/training/routines/{api,hooks,routineSchema}.ts` | routine CRUD + `save_routine` |
| `src/features/training/programs/{api,hooks,programSchema}.ts` | program CRUD + `save_program` + `set_active_program` |
| `src/features/training/components/RoutineBuilder.tsx` | routine builder form |
| `src/features/training/components/ProgramBuilder.tsx` | program builder (cycle slots) |
| `src/features/training/components/TodayPlan.tsx` | planner "Hoy" card + upcoming strip + Start/re-anchor |
| `src/features/training/components/SessionEditor.tsx` (modify) | `prefill` prop + stamp columns; **B-2 fix** |
| `src/pages/RoutinePage.tsx` | `/routine` (Rutinas + Programas tabs) |
| `src/pages/EntrenamientoPage.tsx` (modify) | planner-first "Hoy" |
| `src/app/router.tsx` (modify) | add `/routine` (+ child create/edit routes) |
| `src/i18n/{es,en}/entrenamiento.json` (modify) | new strings, ES + EN parity |

## 10. Open items / for the plan

- **Tab vs sub-section** layout of `/routine` (Rutinas + Programas) — a UI call,
  decided at impl.
- **Reorder UX** for routine exercises and program days (drag vs up/down) —
  impl detail; up/down buttons are the low-risk default.
- **Adherence display depth** on "Hoy" — MVP shows only "today done/not done" by
  matching `routine_id`; richer streak/calendar adherence is a later polish, not
  F-2.
- A new **D-id** in `docs/decisions.md` for the routine/program model + the
  calendar-anchored-with-re-anchor scheduling decision, recorded at plan time.

## 11. Next step

On approval this becomes a `writing-plans` implementation plan (its own
spec→plan→execute cycle). F-3 (guided runner) and F-4 (muscle browse + heatmap)
follow as separate specs built on the routines/programs/stamps this delivers.
