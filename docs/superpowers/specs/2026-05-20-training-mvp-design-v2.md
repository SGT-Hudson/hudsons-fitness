# Training Module — MVP Design Spec (v2)

> Status: **FOR REVIEW — do not merge until approved** (2026-05-20).
> Supersedes the 2026-05-19 spec in PR #49
> (`docs/superpowers/specs/2026-05-19-training-mvp-design.md`). Re-uses every
> structural decision from v1 and integrates the 2026-05-20 brainstorm
> outcomes:
> - all v1 §6 open questions resolved (see §0);
> - #1 "Repeat last working set" prefill added (§6);
> - #2 narrow rule-based coach added (§7), with a four-rule starter catalog
>   that will be expanded in a 2026-05-21 brainstorm.
>
> The PR #49 companion `2026-05-19-post-v1-feature-direction.md` remains the
> backlog-level context for the rest of the post-V1 work; this spec only
> describes the Training MVP.

---

## 0. Defaults & open items at-a-glance

Read this first; everything below assumes these are locked unless flagged.

| # | Item | Decision | Status |
|---|---|---|---|
| 0.1 | `exercises` shared pool gated behind R-01 | yes — born into the final lifecycle model | settled |
| 0.2 | RPE-only column (RIR derived for display only) | one column, RPE 6.0–10.0 in 0.5 steps | settled |
| 0.3 | One vs many workout sessions per day | many allowed (no unique on `(user_id, performed_on)`) | settled |
| 0.4 | e1RM default formula | Epley headline, Brzycki via a per-user toggle | settled |
| 0.5 | `workout_sets.user_id` denormalisation | **no** — RLS via join to `workout_sessions` (mirrors `recipe_ingredients`) | settled by codebase, see §4.3 |
| 0.6 | Migration ordering | timestamped after the latest applied; `if not exists`-guarded; regen `database.ts` | mechanical |
| 0.7 | Repeat-last semantics | prefill the **last working set** only (not the whole sequence; not warmups) | settled |
| 0.8 | Coach approach | transparent rules over the user's own data; **no LLM, ever** — permanent product decision (see §2.2) | settled |
| 0.9 | Coach rules in MVP | four-rule starter catalog (§7); catalog expands in 2026-05-21 brainstorm | starter set settled; full catalog **open** |
| 0.10 | Section split / home redesign / onboarding / desktop layout | **out of MVP scope** — each its own spec (§11) | settled |

---

## 1. Goal & non-goals

**Goal:** the smallest training-logging feature genuinely useful to *you* in
the gym — pick an exercise, punch in your sets, and see your history,
strength trend, and a transparent next-step suggestion for that exercise
over time.

**In scope (MVP / v1):**

- Shared **exercise library** (crowdsourced, mirrors the ingredient model,
  gated behind R-01).
- **Workout sessions** (one dated session, ad-hoc — no pre-planned routine).
- **Set logs** per exercise within a session: reps, weight, RPE, warmup flag.
- **Per-exercise history** (every past set, newest first).
- **Repeat-last prefill** for the next set of an exercise you've trained
  before (§6).
- **Derived progression info**: estimated 1RM, working-set volume, PRs —
  all *computed on render, never stored*.
- **Rule-based coach suggestions** (§7) — four transparent rules in MVP,
  always shown with their reasoning.

**Explicitly out of scope (later waves, do not build in v1):**

- Routines / programmed training (planner-style template↔session duality)
  → v2 (item P in the direction doc).
- Bodyweight / assisted / cardio modelling → v2.
- Auto-progression / fatigue-aware programming beyond the four MVP rules
  → v3, possibly never (direction doc item Q).
- Social feed, sharing, PR celebrations beyond a quiet badge.
- Wearable / Health-platform integration.
- LLM / AI "coach narration" or any model-driven coach output —
  **permanently out of scope**, see §2.
- Section split (Dieta / Entreno), home redesign, in-app onboarding,
  desktop layout — see §11.

## 2. Non-negotiable architectural decisions

Two structural guardrails that shape every downstream choice in this
module. Both are to be recorded in `docs/decisions.md` as new D-ids when
this is planned.

### 2.1 Training logging MUST NOT feed the TDEE filter

Signed off in the 2026-05-19 brainstorm and unchanged here.

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
column and no FK into `tdee_*`, `daily_nutrition_history`, or `phases`.** The
coach (§7) does not read those tables either — it reads training data only.

### 2.2 The coach is rule-based; no LLM, ever

Signed off in the 2026-05-20 brainstorm. Hard "no" — not "not yet", not
"v3", not "narration layer". This is a permanent product decision, not a
sequencing decision.

- Every coach suggestion is a pure function (a `CoachRule.evaluate`,
  §7.2) over the user's own logged sets. Inputs in, suggestion (or
  `null`) out. Deterministic, testable, explainable.
- **No model is ever invoked** — not for headline narration, not for
  threshold tuning, not for rephrasing rule output, not as a "fallback
  when no rule fires." If a behaviour can't be expressed as a transparent
  rule the user can read, it doesn't ship.
- Rationale: the value of this surface is the lifter's *trust* that the
  number on screen comes from their own data via a rule they can read.
  Any model-mediated text breaks that contract — hallucinations,
  silently-shifting recommendations, opaque "why," ongoing cost surface
  for a solo dev. None of those are acceptable trades for narrative
  polish.

This constraint shapes the engine surface: `evaluateCoach` and every
`CoachRule` are synchronous, pure, dependency-free — no async, no network
client, no fetcher type in the module. New rules land as more pure
functions; the engine signature never grows a "model client" parameter.

## 3. R-01 prerequisite

`exercises` is the *third* instance of the shared-pool pattern (ingredients,
recipes, exercises). R-01 (★ Library Contribution & Lifecycle Model,
`docs/superpowers/specs/2026-05-18-library-model-phase1-design.md`) replaces
per-user hard-delete with the reference-row hide + anon-ownership transfer
model. The Training MVP **MUST land after R-01 ships**, so `exercises` is
born into the final library model rather than migrated twice.

Concretely, the implementation plan generated from this spec will declare
R-01 as a hard blocker. Anything in §4 that references R-01 RLS semantics
(e.g. "reference row vs pool item", "creator-hide transfers ownership") uses
R-01's final shape, not today's pre-R-01 ingredient pattern.

## 4. Data model

Two new user-owned tables + one shared-pool table. The shared-pool table
adopts the **R-01-finalised** shared-pool semantics for ingredients/recipes,
applied to exercises.

### 4.1 `exercises` (shared crowdsourced pool — mirrors post-R-01 `ingredients`)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `name` | text not null | trigram-indexed (reuse `pg_trgm`, already enabled) |
| `primary_muscle` | text null | controlled vocab (`chest`/`back`/`quads`/…); CHECK constraint, not enum (same stance as `kcal_mode`) |
| `equipment` | text null | `barbell`/`dumbbell`/`machine`/`cable`/`bodyweight`/`other` |
| `is_verified` | bool not null default false | curated-quality flag, same as ingredients |
| `created_by_user_id` | uuid null | `null` ⇒ immutable system seed; non-null ⇒ creator (R-01 anon-ownership applies on creator hide) |
| `source` | text not null default `'manual'` | `manual` / `system` |
| `created_at` / `updated_at` | timestamptz | |

**RLS — copied from the post-R-01 `ingredients` policies verbatim** (no new
pattern). Reference rows (per-user "I use this exercise") are a separate
join table if R-01 splits them out for ingredients; if R-01 keeps the simpler
single-table form for ingredients, `exercises` does too. The plan synchronises
with whatever R-01 actually ships — that is the whole point of the
R-01-prerequisite decision.

**Seed migration:** ~30–40 common lifts as system rows
(`created_by_user_id = null`, `source = 'system'`, `is_verified = true`) —
squat/bench/deadlift/OHP/row variants, the standard machine/dumbbell
accessories. Idempotent insert (same pattern as the proposed BEDCA seed,
direction doc item K).

### 4.2 `workout_sessions` (user-owned, one per logical workout)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid not null | RLS owner |
| `performed_on` | date not null | the gym day (`todayInTZ()` Europe/Madrid default, same convention as meal logs) |
| `title` | text null | optional ("Push A", "Leg day") |
| `notes` | text null | freeform, editable forever (same stance as phase notes) |
| `created_at` / `updated_at` | timestamptz | |

**No unique constraint on `(user_id, performed_on)`** — multiple sessions
per day are allowed (settled in §0.3).

**RLS:** standard owner-only (`user_id = auth.uid()` for all of
SELECT/INSERT/UPDATE/DELETE) — identical to `meal_logs` / `recipes`.

### 4.3 `workout_sets` (user-owned, the actual logged data)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `session_id` | uuid not null | FK → `workout_sessions` `ON DELETE CASCADE` (a set cannot outlive its session — the safe cascade direction, unlike `recipe_ingredients`) |
| `exercise_id` | uuid not null | FK → `exercises` `ON DELETE RESTRICT` (mirrors `recipe_ingredients`→`ingredients`: never silently lose what you lifted) |
| `set_index` | int not null | 1-based ordering within (session, exercise) |
| `reps` | int not null | |
| `weight_kg` | numeric not null | metric-only invariant (#1); 0 allowed for unloaded (bodyweight v2) |
| `rpe` | numeric null | 6.0–10.0, 0.5 steps; nullable (you won't always rate). DB CHECK enforces range AND `rpe * 2 = floor(rpe * 2)` for 0.5 granularity. RIR is derived as `10 − RPE` for display only (§0.2). |
| `is_warmup` | bool not null default false | warmup sets excluded from PR/volume/coach math |
| `created_at` | timestamptz | |

Plus `unique (session_id, exercise_id, set_index)` to keep set ordering
integrity at the DB level (the RPC orders inputs, the constraint is the
backstop).

**No `user_id` column** — settled in §0.5. RLS goes through the parent
session, exactly like `recipe_ingredients`:

```sql
create policy "Users see own workout sets" on public.workout_sets for select
  using (exists (
    select 1 from public.workout_sessions s
    where s.id = workout_sets.session_id and s.user_id = auth.uid()
  ));
-- … same shape for insert/update/delete.
```

This is the established pattern (verified against
`supabase/migrations/20260508080000_r00_baseline_schema.sql:712–720`); we do
not invent a third child-table RLS shape.

No `e1rm`, no `volume`, **no kcal** column — all derived (see §5) per
invariant #5 and the §2 guardrail.

### 4.4 `save_workout` RPC

`>1-table atomic mutation` rule (invariant #3): "log a whole session"
(session + N sets in one call) and "edit a session's sets"
(replace-children) are multi-table atomic writes → an RPC, `SECURITY
INVOKER` + `set search_path = public`, exactly like `save_recipe`. Name:
`save_workout`. Single-set quick edits (e.g. correcting a typo on one row)
can stay direct table writes (like `updateWeekSlot`).

## 5. Derived metrics — `src/core/training.ts`

A new pure module `src/core/training.ts`, dependency-free, camelCase, same
constitution as `core/macros.ts` / `core/tdee.ts`. Numeric inputs accept
`number | string` (PostgREST coerces numerics to strings; the
client/edge both import this core directly). Vitest Tier-1 golden vectors —
R-16 "new pure logic ships with tests".

Exposed functions and types:

```ts
export type Numeric = number | string;
export type E1rmFormula = 'epley' | 'brzycki';

export interface CoreSet {
  reps: Numeric;
  weightKg: Numeric;
  rpe: Numeric | null;
  isWarmup: boolean;
}

export interface CoreSessionSet extends CoreSet {
  sessionId: string;
  exerciseId: string;
  performedOn: string; // ISO date (YYYY-MM-DD)
  setIndex: number;
}

// ── Single-set derivations ─────────────────────────────────────────────────
export function estimatedOneRepMax(
  reps: number, weightKg: number, formula?: E1rmFormula
): number;

// ── Aggregations over sets ─────────────────────────────────────────────────
export function workingSetVolume(sets: CoreSet[]): number;          // Σ reps·kg, non-warmup
export function bestE1rmInSets(sets: CoreSet[], formula?: E1rmFormula): number | null;

// ── History walks ──────────────────────────────────────────────────────────
export interface E1rmTrendPoint { performedOn: string; e1rm: number; }
export function e1rmTrendForExercise(
  history: CoreSessionSet[],            // all logged sets for one exercise across sessions
  formula?: E1rmFormula,
): E1rmTrendPoint[];                    // one point per session (best non-warmup e1RM that session)

export interface PRPoint { performedOn: string; sessionId: string; e1rm: number; reps: number; weightKg: number; }
export function detectPRsForExercise(
  history: CoreSessionSet[],
  formula?: E1rmFormula,
): PRPoint[];                           // monotonically-increasing e1RM milestones

// ── Repeat-last lookup (§6) ────────────────────────────────────────────────
export function lastWorkingSetForExercise(
  history: CoreSessionSet[],
): CoreSessionSet | null;               // most recent non-warmup set; null if none
```

Formulas:
- **Epley** (default headline): `e1RM = w · (1 + reps/30)`.
- **Brzycki**: `e1RM = w · 36 / (37 − reps)`. Returns `+Infinity` /
  invalid at `reps ≥ 37`; the function clamps and the UI flags
  `reps > ~10` as unreliable regardless of formula (§4 of the v1 spec).
- Reps ≤ 0 or weight ≤ 0 → `0` (consistent with `macros.ingredientMacros`
  zero-on-invalid stance).

All derived per render. Never persisted (invariant #5).

## 6. "Repeat last working set" prefill (NEW)

The friction kill from #1. The data shape:
`lastWorkingSetForExercise(history)` (§5) returns the most recent non-warmup
set for the chosen exercise across all the user's past sessions.

**UX:** when the user picks an exercise in the session editor and the lookup
returns a value, render the *next* set row with the last working set's
values as **greyed placeholder text** (`8 × 70 kg @ 7`). One tap on any
field commits the placeholder to a real value (still editable); a single
"Copy last set" button is the fallback affordance for users who don't
notice the placeholders.

This is the Hevy/Strong pattern, intentionally chosen because it's faster
than a button-only path (no extra tap) and self-explanatory (the values
visibly *are* the prior numbers).

**Scope decisions:**
- Prefill is the **last single working set**, not the whole prior session's
  set sequence. The lifter remains in charge of how many sets they're doing
  today.
- Warmups are **never prefilled** — they're load-, fatigue-, and
  feel-dependent. Bodyweight/cardio remains out of MVP.
- The lookup is across all the user's sessions, not just the most recent
  one — handles "I did bench 10 days ago, then deadlifts last session"
  gracefully.

## 7. Rule-based coach (NEW)

The narrow, transparent answer to #2. Every suggestion shows the rule and
the inputs that triggered it ("3 sets at 8 × 70 kg, RPE ≤ 7 over your last
3 bench sessions → try 72.5 kg"). No LLM, no model, no opaque score. The
shape mirrors the adaptive-TDEE coaching surface (post-V1 direction doc
item A) — surface an engine you already have over the user's own data.

### 7.1 The four MVP rules (starter catalog)

**Catalog will be expanded in a 2026-05-21 brainstorm** (§0.9, §12).
These four anchor the surface and prove the design:

1. **Double progression.** *Trigger:* the last `N` (default 3) sessions
   containing this exercise have a working set that hit the target reps
   (default 8) at RPE ≤ `rpeMax` (default 7), at the same `weight_kg`.
   *Suggestion:* "+`increment` kg next time" (default +2.5 kg barbell,
   +1.0 kg dumbbell — equipment-aware).
2. **Flat e1RM → deload nudge.** *Trigger:* the per-exercise e1RM trend
   slope is within ±`flatBand` (default ±1 kg) over the last
   `flatWindow` sessions (default 4) for this exercise. *Suggestion:*
   "consider a deload week on this lift; e1RM hasn't moved in 4 sessions."
3. **RPE-climbing fatigue.** *Trigger:* across the last `N` sessions
   (default 3) for this exercise, comparing each session's *top working
   set at the same exact `weight_kg`*, RPE is strictly increasing
   (e.g. 70 kg @ 8 → 70 kg @ 9 → 70 kg @ 10). Sessions with no working
   set at that weight don't reset the chain — they're skipped, so a
   variation week doesn't mask the pattern. *Suggestion:* "fatigue
   accumulating; consider dropping load 10% next session."
4. **Days since muscle group.** *Trigger:* `daysSinceMuscle(primaryMuscle)`
   ≥ `muscleNudgeDays` (default 10). *Suggestion:* "haven't trained
   `primaryMuscle` in N days."

### 7.2 Engine shape

A pluggable rule list, evaluated per (user, exercise) or per (user, muscle)
at render time:

```ts
// in src/core/training.ts (continuation)
export interface CoachContext {
  exerciseId: string;
  primaryMuscle: string | null;
  equipment: string | null;
  history: CoreSessionSet[]; // all of this user's sets for THIS exercise
  todayISO: string;          // caller provides — no clock
}

export interface CoachSuggestion {
  ruleId: string;                  // 'double-progression' | 'flat-e1rm-deload' | …
  severity: 'info' | 'nudge' | 'warn';
  headline: string;                // localised key, not raw string (UI resolves)
  detail: Record<string, string | number>; // params for the headline template
}

export interface CoachRule {
  id: string;
  evaluate(ctx: CoachContext): CoachSuggestion | null;
}

export const MVP_COACH_RULES: CoachRule[]; // the four rules above
export function evaluateCoach(
  ctx: CoachContext, rules?: CoachRule[]
): CoachSuggestion[];
```

The engine itself is pure (no clock, no DB). Each rule is a small pure
function over its own slice of history. Adding a rule = adding a file under
`src/core/training-rules/` (decided at plan time whether to split or keep
inline) and appending to `MVP_COACH_RULES`. The 2026-05-21 brainstorm
output drops in as more rules with zero engine changes.

### 7.3 Surface

Suggestions appear **inline on the session editor**, next to the picked
exercise — the moment the lifter would act on a "+2.5 kg" or "drop 10%"
recommendation is when they're about to enter the set, not on a dashboard
they'd visit weekly.

i18n: rule headlines are keys (`coach.rules.doubleProgression.headline`,
…) resolved with the `detail` params by the UI. Both ES + EN ship complete
(no English fallback strings — project i18n rule).

**No configurability in MVP** — rules are on by default, no per-user
toggles, no thresholds editable in UI. If the defaults are wrong for
specific lifters we revisit on usage data. (Adding toggles later is a
small change; adding them prematurely is a UX/code tax for unclear win.)

## 8. UI surface (feature-shaped, no visual redesign)

New route `/entrenamiento` (ES primary, consistent with `/objetivos`,
`/diario`, `/progreso`), added to `router.tsx` + `AppLayout` nav:

- **Session list** — sessions newest-first; "＋ Registrar entreno" opens a
  session editor.
- **Session editor** — date, title/notes, then per-exercise blocks; each
  block has:
  - an exercise autocomplete (reuse the `IngredientAutocomplete` pattern
    against `exercises`),
  - **coach suggestions** rendered above the set rows (§7.3),
  - an add-set row (reps / kg / RPE / warmup), with the **last working set
    rendered as placeholder** when history exists (§6).
  - RHF + zod, schema co-located in `features/training/schema.ts`
    (project convention R-09).
- **Exercise history view** — pick an exercise → every past set grouped by
  session date + the e1RM/volume trend cards (reuse `TrendChart` +
  `interpolateSeries` + `TimeRangePills` from `features/measurements`).
- i18n: new `entrenamiento` + `coach` namespaces, ES + EN, both complete.

Components stay small and single-purpose (one file per: `SessionList`,
`SessionEditor`, `ExercisePicker`, `ExerciseHistory`, `SetRow`,
`CoachSuggestions`; the trend cards reuse existing chart components).

**No nav restructure** — `/entrenamiento` sits alongside the existing
routes. The Dieta/Entreno section split is its own future spec (§11).

## 9. Testing & rollout

- **Tier-1 Vitest** on `core/training.ts` (e1RM both formulas, volume,
  PR-from-history, warmup exclusion, repeat-last lookup, every rule
  trigger/no-trigger pair, degenerate reps/weight) — golden vectors,
  deterministic. The four coach rules each get their own focused
  describe-block.
- **Tier-2 component test** on the session editor (RHF submit →
  `save_workout` payload shape; placeholder commit flow; coach suggestion
  rendering), same jsdom setup R-09/R-16 established.
- **Tier-3 (RLS/RPC)** is gated behind R-16-Tier-3 / R-00 like everything
  else — document the gap honestly, don't claim coverage that doesn't
  exist.
- Ships as its own branch → PR → CI → review, **not** auto-merged blind:
  it's a schema change and a new domain, so it wants an explicit human
  merge, unlike the migration-free friction batch (PR #46/#47/#48).

## 10. Why this is lower-risk than its size suggests

Every structural piece is the *third instance* of a pattern already built,
debugged, and live in this codebase:

| Training piece | Reuses proven pattern |
|---|---|
| `exercises` pool + RLS | post-R-01 `ingredients` (verbatim policy) |
| exercise autocomplete | `IngredientAutocomplete` |
| `save_workout` RPC | `save_recipe` (INVOKER, replace-children) |
| `workout_sets` RLS via parent join | `recipe_ingredients` (verbatim policy shape) |
| e1RM/volume/PR derived, never stored | `estimatedBmr` / `computeTargetWeightKg` |
| e1RM trend chart | `TrendChart` + `interpolateSeries` + `TimeRangePills` |
| RHF+zod session form | R-09 form convention |
| pure tested core | `core/macros.ts` / `core/tdee.ts` constitution |
| transparent rules over user data | post-V1 direction doc item A (adaptive-TDEE coach) |

The genuinely new surface is small: **3 tables, 1 RPC, 1 pure module
(with a four-rule starter catalog), 1 route, ~7 components**. No new
architectural concept. That is why a solo dev can ship the MVP without it
becoming a quagmire — provided v2/v3 scope stays parked.

## 11. Deferred (explicit non-scope of this spec)

The 2026-05-20 brainstorm raised four cross-app ideas. Each is real and
each becomes its own spec, sequenced after the training launch. Listing
here so they aren't lost:

1. **Section split — Dieta / Entreno** (toggle, colour-coded sections).
   Strong UX intuition; nav-system change touching every page. Adding
   `/entrenamiento` inside today's nav first, then specifying the split as
   the next UX project. Recommended toggle: segmented control at top
   *and* logo-tap shortcut (logo-tap-only is undiscoverable).
2. **Richer home page + diet-completion calendar.** Overlaps heavily with
   post-V1 direction doc item A (weekly check-in / adaptive-TDEE coaching
   surface). The home redesign and item A want to be the same project: a
   real Diet dashboard with calendar (green/yellow/red days based on a
   single quality score: kcal-in-range and protein-met), the adaptive-TDEE
   check-in, and the goal-date ETA that #47 already shipped.
3. **In-app onboarding.** `OnboardingPage.tsx` already covers profile/goals
   setup; the gap is *feature discovery*. Recommended minimum: contextual
   empty states with explanation + CTA, plus one short welcome modal when
   the section split (item 1) ships. Skip multi-screen wizards.
4. **Responsive desktop layout.** Per-feature density modes, not global
   redesign. Mobile-first is fine through friends-and-family; defer to
   public-launch prep.

## 12. Open items for the 2026-05-21 brainstorm

1. **Expand the coach rule catalog.** The §7.1 four are the starter set.
   Brainstorm targets: 1RM-cycle suggestions (working up to a heavy single
   when fresh), volume-landmark progressions, exercise rotation prompts,
   pre-workout "you've been logging X for 12 weeks, swap variant?" nudges,
   bar-speed/RPE-mismatch detection (RPE going down at same load = grow
   load). Each new rule lands as a `CoachRule` (§7.2) — engine doesn't
   change.
2. **Rule default thresholds.** The four MVP rule defaults are reasonable
   first guesses; we should pressure-test them against your own logged
   sessions once data accumulates (post-launch, not pre-).
3. **Coach severity thresholds.** When a fatigue warning becomes a
   `warn` vs a `nudge` — currently a guess.

## 13. Next step

On approval this becomes a `writing-plans` implementation plan (its own
spec→plan→execute cycle, separate from R-01). Until then, the only code
already in motion is the pure `core/training.ts` module + Vitest tests
(authorised tonight as overnight work; depends on nothing — no DB, no R-01,
no rule catalog finalisation).
