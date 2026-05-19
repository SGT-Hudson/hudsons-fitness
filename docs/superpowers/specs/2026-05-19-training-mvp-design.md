# Training Module — MVP Design Spec

> Status: **FOR REVIEW — do not implement until approved** (2026-05-19).
> Scope signed off in the 2026-05-19 brainstorm: *"As proposed"* MVP +
> *"public crowdsourced day one"* exercise library. This spec exists so the
> flagship is ready to turn into an implementation plan once you've read it.
> Companion: `2026-05-19-post-v1-feature-direction.md` §4.

## 1. Goal & non-goals

**Goal:** the smallest training-logging feature that is genuinely useful to
*you* in the gym — pick an exercise, punch in your sets, and see your history
and strength trend for that exercise over time.

**In scope (MVP / v1):**

- Shared **exercise library** (crowdsourced, mirrors the ingredient model).
- **Workout sessions** (one dated session, ad-hoc — no pre-planned routine).
- **Set logs** per exercise within a session: reps, weight, RPE, warmup flag.
- **Per-exercise history** (every past set, newest first).
- **Derived progression info**: estimated 1RM, working-set volume, PRs —
  all *computed on render, never stored*.

**Explicitly out of scope (later waves, do not build in v1):**

- Routines / programmed training (the planner-style template↔session
  duality) → v2 (item P in the direction doc).
- Bodyweight / assisted / cardio modelling → v2.
- Auto-progression / fatigue-aware suggestions (Fitbod-style) → v3, maybe
  never (direction doc item Q).
- Social feed, sharing, PR celebrations beyond a quiet badge.
- Any wearable / Health-platform integration.

## 2. The one non-negotiable architectural decision

**Training logging MUST NOT feed the TDEE filter.** Signed off in the
brainstorm. Rationale, to be recorded in `docs/decisions.md` as a new D-id
when this is planned:

- The R-07 adaptive Kalman filter (`src/core/tdee.ts`) already absorbs *all*
  expenditure change implicitly through the weight/intake residual — that is
  the entire point of the model.
- R-08 deliberately **descaffolded** the old activity/NEAT/workout-kcal split
  for exactly this reason; re-introducing "workout calories" as a TDEE input
  would double-count and corrupt a filter that is currently correct.
- Therefore: the training tables are **never read by**
  `recalculate-tdee` or any TDEE/target/protein code path. Training data may
  be *displayed* next to body-comp/weight trends (read-only, presentational),
  never used as a model input. This mirrors the existing
  "derived, never-stored, never-feeds-targets" guardrail already applied to
  BMR and target-weight (project invariant #5).

This constraint shapes the data model: the training tables have **no kcal
column and no FK into `tdee_*`, `daily_nutrition_history`, or `phases`.**

## 3. Data model

Two new user-owned tables + one shared-pool table. The shared-pool table is a
**direct structural copy of the proven `ingredients` model** (same RLS shape,
same `created_by_user_id` semantics, same trigram search) — this is the
deliberate pattern-reuse that makes the flagship low-risk for a solo dev.

### 3.1 `exercises` (shared crowdsourced pool — mirrors `ingredients`)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `name` | text not null | trigram-indexed (reuse `pg_trgm`, already enabled) |
| `primary_muscle` | text null | free-ish controlled vocab (chest/back/quads/…); not an enum (same stance as `kcal_mode` — CHECK or plain) |
| `equipment` | text null | barbell/dumbbell/machine/cable/bodyweight/other |
| `is_verified` | bool not null default false | curated-quality flag, same as ingredients |
| `created_by_user_id` | uuid null | `null` ⇒ immutable system seed (same rule as ingredients) |
| `source` | text not null default `'manual'` | `manual` / `system` |
| `created_at` / `updated_at` | timestamptz | |

**RLS — copied verbatim from `ingredients`:** everyone `SELECT`s the whole
pool; any authenticated user `INSERT`s (stamped `created_by_user_id = auth.uid()`);
only the creator `UPDATE`/`DELETE`s their own rows; `created_by_user_id IS NULL`
rows are immutable system seeds. No new RLS *pattern* — same policy text as
the ingredient table, which is already reviewed and live.

Seed migration: ~30–40 common lifts as system rows (`created_by_user_id = null`,
`source = 'system'`, `is_verified = true`) — squat/bench/deadlift/OHP/row
variants, the standard machine/dumbbell accessories. Idempotent insert (same
pattern as the proposed BEDCA seed, direction doc item K).

> **R-01 interaction (must be reconciled at plan time):** the ★ Library
> Lifecycle Model (R-01) is reworking the shared-pool *delete/ownership*
> semantics for ingredients & recipes. `exercises` is the *third* instance of
> that same pool pattern. Decision for the plan: either (a) ship `exercises`
> with today's ingredient-style RLS and fold it into R-01's model when R-01
> lands, or (b) sequence `exercises` *after* R-01 so it is born into the
> final model. Recommendation: **(b)** — it avoids a second migration of the
> same kind and R-01 is already specced. Flag this explicitly for the
> sequencing decision.

### 3.2 `workout_sessions` (user-owned, one per logical workout)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid not null | RLS owner |
| `performed_on` | date not null | the gym day (Europe/Madrid `todayInTZ()` default, same convention as meal logs) |
| `title` | text null | optional ("Push A", "Leg day") |
| `notes` | text null | freeform, editable forever (same stance as phase notes) |
| `created_at` / `updated_at` | timestamptz | |

Open question (§6): one session per day vs. multiple. Default assumption for
the spec: **multiple allowed** (no unique constraint on `(user_id,
performed_on)`) — lifters do AM/PM splits; the meal-log "one logical record
per day" stance is a nutrition concern, not a training one.

**RLS:** standard owner-only (`user_id = auth.uid()` for all of
SELECT/INSERT/UPDATE/DELETE) — identical to `meal_logs` / `recipes`.

### 3.3 `workout_sets` (user-owned, the actual logged data)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid not null | RLS owner (denormalised for RLS simplicity, same as the app's other child tables — confirm against existing pattern at plan time) |
| `session_id` | uuid not null | FK → `workout_sessions` `ON DELETE CASCADE` (a set cannot outlive its session; this is the *safe* cascade direction — unlike `recipe_ingredients`, deleting a workout legitimately deletes its sets) |
| `exercise_id` | uuid not null | FK → `exercises` `ON DELETE RESTRICT` (mirrors `recipe_ingredients`→`ingredients`: never silently lose what you lifted) |
| `set_index` | int not null | 1-based ordering within (session, exercise) |
| `reps` | int not null | |
| `weight_kg` | numeric not null | metric-only invariant (#1); 0 allowed for unloaded — though bodyweight is a v2 concern |
| `rpe` | numeric null | 6.0–10.0, 0.5 steps; nullable (you won't always rate) |
| `is_warmup` | bool not null default false | warmup sets excluded from PR/volume math |
| `created_at` | timestamptz | |

No `e1rm`, no `volume`, **no kcal** column — all derived (see §4) per
invariant #5 and the §2 guardrail.

`>1-table atomic mutation` rule (invariant #3): "log a whole session"
(session + N sets in one go) and "edit a session's sets" (replace-children)
are multi-table atomic writes → an RPC, `SECURITY INVOKER` +
`set search_path = public`, exactly like `save_recipe`. Name: `save_workout`.
Single-set quick edits can stay direct table writes (like `updateWeekSlot`).

## 4. Derived metrics (pure core, never stored)

A new pure module `src/core/training.ts` (dependency-free, camelCase, same
constitution as `core/macros.ts` / `core/tdee.ts`; Vitest golden vectors —
this is the R-16 "new pure logic ships with tests" rule):

- **Estimated 1RM** — Epley `w·(1 + reps/30)` as primary; expose Brzycki
  `w·36/(37−reps)` too (Fitbod uses Brzycki; cheap to offer both, decide
  default at plan time). Reps ≥ ~12 get unreliable — flag, don't hide.
  Derived on render from `(reps, weight_kg)`, **never persisted** — identical
  rule to `estimatedBmr` / `computeTargetWeightKg`.
- **Working-set volume** — Σ `reps × weight_kg` over non-warmup sets, per
  session and per exercise.
- **e1RM trend** — best e1RM per session over time → a small line chart,
  reusing the existing `TrendChart` + `interpolateSeries` + `TimeRangePills`
  primitives from `features/measurements` (no new charting).
- **PR detection** — max e1RM (and/or max weight at reps) to date; a quiet
  `<Badge variant="primary">` on a new PR (reuse R-10's `badge.tsx`).

All of this is read-side and presentational — it cannot, by construction,
reach the TDEE/targets paths (§2).

## 5. UI surface (feature-shaped, no visual redesign)

New route `/entrenamiento` (ES primary, consistent with `/objetivos`,
`/diario`, `/progreso`), added to `router.tsx` + `AppLayout` nav:

- **Session list** — sessions newest-first; "＋ Registrar entreno" opens a
  session editor.
- **Session editor** — date, title/notes, then per-exercise blocks; each
  block has an exercise autocomplete (reuse the `IngredientAutocomplete`
  pattern against `exercises`) and an add-set row (reps / kg / RPE /
  warmup). RHF + zod, schema co-located in `features/training/schema.ts`
  (project convention R-09).
- **Exercise history view** — pick an exercise → every past set grouped by
  session date + the e1RM/volume trend cards.
- i18n: new `entrenamiento` namespace, ES + EN, both complete (no English
  fallback strings — project i18n rule).

Components stay small and single-purpose (one file per:
SessionList, SessionEditor, ExercisePicker, ExerciseHistory, the trend
cards reuse existing chart components).

## 6. Open questions to resolve at plan time

1. **R-01 sequencing** — ship `exercises` now with ingredient-style RLS, or
   gate behind R-01 so it's born into the final library model?
   (Spec recommends gating behind R-01.)
2. **RPE vs RIR** — store RPE only (derive RIR = 10−RPE for display), or a
   dedicated RIR field? (Spec assumes RPE-only.)
3. **One vs many sessions/day** — spec assumes many; confirm.
4. **e1RM default formula** — Epley or Brzycki as the headline number?
5. **`workout_sets.user_id` denormalisation** — confirm it matches the
   existing child-table RLS pattern in this codebase (some child tables may
   RLS via a join to the parent instead; match whatever `recipe_ingredients`
   does, do not invent a third pattern).
6. **Migration ordering** — must respect the R-00 baseline + Wave-3 ordering
   discipline; new migrations are timestamped after the latest applied one,
   `if not exists`-guarded, and the generated `database.ts` regenerated
   (R-04 workflow).

## 7. Testing & rollout

- Tier-1 Vitest on `core/training.ts` (e1RM both formulas, volume,
  PR-from-history, warmup exclusion, degenerate reps/weight) — golden
  vectors, deterministic.
- Tier-2 component test on the session editor (RHF submit → `save_workout`
  payload shape), same jsdom setup R-09/R-16 established.
- Tier-3 (RLS/RPC) is gated behind R-16-Tier-3 / R-00 like everything else —
  document the gap honestly, don't claim coverage that doesn't exist.
- Ships as its own branch → PR → CI → review, **not** auto-merged blind:
  it's a schema change and a new domain, so it wants an explicit human
  merge, unlike the migration-free friction batch.

## 8. Why this is lower-risk than its size suggests

Every structural piece is the *third instance* of a pattern already built,
debugged, and live in this codebase:

| Training piece | Reuses proven pattern |
|---|---|
| `exercises` pool + RLS | `ingredients` (verbatim policy) |
| exercise autocomplete | `IngredientAutocomplete` |
| `save_workout` RPC | `save_recipe` (INVOKER, replace-children) |
| e1RM/volume derived, never stored | `estimatedBmr` / `computeTargetWeightKg` |
| e1RM trend chart | `TrendChart` + `interpolateSeries` + `TimeRangePills` |
| RHF+zod session form | R-09 form convention |
| pure tested core | `core/macros.ts` / `core/tdee.ts` constitution |

The genuinely new surface is small: 3 tables, 1 RPC, 1 pure module, 1 route,
~5 components. No new architectural concept. That is why a solo dev can ship
the MVP without it becoming a quagmire — provided v2/v3 scope stays parked.

## 9. Next step

On approval this becomes a `writing-plans` implementation plan (its own
spec→plan→execute cycle, separate from the friction batch). Until then, no
training code is written.
