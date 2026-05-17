# Features

What the app does today, per domain. Schema lives in `data-model.md`;
internal flows (materialization, edge/cron jobs) in `architecture.md`;
the *why* behind decided-but-unbuilt changes in `decisions.md` (queued in
`roadmap.md`). A `> ⚠ Changing` callout marks current behavior that a
decision will replace — it describes reality now, not the target design.

## Contents

- [Background (origin)](#background-origin)
- [Body composition & measurements](#body-composition--measurements)
- [Macros & phases](#macros--phases)
- [Meal plans (templates ↔ active week)](#meal-plans-templates--active-week)
- [Diario & materialization](#diario--materialization)
- [TDEE](#tdee)
- [Product ideas (uncommitted)](#product-ideas-uncommitted)

## Background (origin)

The app replaces a personal training spreadsheet, `GYM Gonzalo.xlsx`, that
its sole user maintained day by day from July 2024. The workbook was three
interlinked sheets, and every app feature traces back to one of them — the
provenance below explains *why* each domain exists, not how it is built now
(the implementation has moved on; see `data-model.md` and `architecture.md`).

The **Metricas** sheet was a day-by-day body-composition diary: one row per
day recording scale weight plus body-fat, water, and muscle percentages,
with a 5-day moving average over weight to damp the daily noise from water,
glycogen, and sodium. The motivation was that a single weigh-in lies; only a
smoothed multi-year trend tells you whether composition is actually moving.
This is why the app tracks the same four measures, keeps a smoothed view,
and is built for long longitudinal history rather than single snapshots.

The **Resultados** sheet was the daily control panel. It derived a *target
weight* from a target body-fat percentage and current fat-free mass (rather
than picking an arbitrary goal weight — assuming all loss is fat), set
weight-dependent macro goals (protein scaled to bodyweight, fat as a share
of kcal, fixed fiber, carbs as the remainder), counted servings of each dish
eaten that day, and recalculated consumed calories and macros live. This is
the origin of the phase/target model, the Diario's consumed-vs-target view,
and the reusable recipe library (each recipe a mini-table of ingredients,
grams, and servings yielding per-serving macros).

The **Ingredientes** sheet was the nutrition database — macros per 100 g (or
per unit) for every food, reused across all recipes so a recipe's totals
recompute automatically when an ingredient changes. This is why the app has
a shared, crowdsourced ingredient library underpinning recipes and meal
logging. (The spreadsheet's §6 suggested data model is intentionally not
carried here — it is superseded by `data-model.md`.)

## Body composition & measurements

Users log measurements with `weight_kg` plus optional `body_fat_pct`,
`muscle_pct`, and `water_pct` (one logical record per day). The
`body_measurements_smoothed` view exposes a `weight_kg_5day_avg` (a 5-day
moving average; the first days use a shorter window) so trend consumers read
smoothed weight rather than raw weigh-ins.

The `/progreso` page renders a weight chart (raw + smoothed) and a
composition chart. The composition chart today is a **stacked area** of
`body_fat_pct` + `muscle_pct` + `water_pct` on a hard `0–100` Y-axis, with
body fat at the bottom of the stack and per-series linear interpolation
between measurements (no extrapolation past the first/last point).

> ⚠ Changing — see R-11 (D-D5). The three series are not a disjoint
> partition (water is distributed within lean tissue), so the stack is a
> category error whose sum routinely exceeds 100% and gets clipped. The
> redesign replaces it with a true `fat%` + `lean%` (`100 − bodyFat%`)
> 2-series stack, moves muscle%/water%/bodyFat% to independent trend
> charts, and adds a local `%`↔`kg` toggle computed frontend from the
> stored `weight_kg`.

## Macros & phases

A **phase** is a dated nutrition block of type `cut`, `maintenance`, or
`bulk`. Its calorie target is set either as an absolute value
(`kcal_mode = 'absolute'`) or as a delta from estimated TDEE
(`kcal_mode = 'tdee_delta'`). Fat is stored as a fraction of kcal
(`fat_pct_of_kcal`, 0.10–0.60), converted to/from a percent only at the form
boundary. Fiber is set per a fiber mode. Protein is currently computed on a
lean-mass basis (`lean = weight × (1 − bf%/100) × g/kg`), falling back to
total bodyweight when no body-fat % is available.

> ⚠ Changing — see R-05 (D-B1). The protein rule moves into the canonical
> `computeDailyMacroTargets`, re-anchored to a phase-aware lean-mass
> code-constant table (`cut 2.4 / maintenance 2.0 / bulk 1.8` g/kg LBM)
> with a `1.6 g/kg bodyweight` no-bf% fallback and a visible basis label;
> the current single-default + thin-wrapper housing is removed.

The Diario shows the active phase's daily macro targets (kcal, protein,
carbs, fat, fiber) against what was consumed. The active phase is resolved
as "today's phase only" — no consumer reconstructs which phase was active on
a past date. `/objetivos` lists and manages all phases. Past phases are
currently frozen the moment their `end_date` passes: the card becomes
read-only and dimmed (`opacity-60`), edit/delete hidden.

> ⚠ Changing — see R-02 (D-A5). The hard freeze-at-`end_date` cliff becomes
> a 7-day grace window (the phase stays fully editable and deletable for 7
> days past `end_date`, only then hard-freezing and dimming), and the
> `notes` field stays editable forever even on frozen phases.

## Meal plans (templates ↔ active week)

The planner has two layers. **Templates** are the reusable upstream:
named, freely edited, and snapshot-able at will via "Save as template".
The **active week** is the dynamic working copy materialized from a
template (`source_template_id` set, `has_diverged = false` on generation),
with multi-recipe slots editable directly.

When the user edits, inserts, or deletes a slot at `date >= today`, the
`trg_mark_week_diverged` DB trigger flips that week's
`meal_plan_weeks.has_diverged = true`. The **weekly rollover** edge function
(cron, every Monday, 03:00 CET) generates the new active week from the
previous week's source template; if the previous week had diverged, it is
first snapshotted into a new auto-generated template
(`is_auto_generated = true`, an editable auto-name) so the divergent state
is preserved before the new week is built. The rollover and the daily
snapshot crons also double as the keep-alive that prevents the free-tier
Supabase project from auto-pausing.

## Diario & materialization

The plan is the default truth of what was eaten. When a Diario date has no
`from_plan = true` `meal_logs` yet, the active-week slots for that date are
auto-materialized into `meal_logs` with `from_plan = true` and
`plan_week_slot_id` set to the originating slot — no confirmation. Dedup is
by `plan_week_slot_id` (already-materialized slots are skipped), so the
operation is idempotent. It is fired on two paths: when `DiarioPage` mounts
for a date (client), and by the `daily-nutrition-snapshot` edge function
(yesterday only). The user may edit servings, swap the recipe, or delete the
entry — `from_plan` stays only as an origin marker; manual additions remain
`from_plan = false`. Plan edits made *after* materialization do **not**
propagate back into already-logged entries (intentional: the diary records
what was actually eaten).

> ⚠ Changing — see R-12 (D-D6). Materialization is currently hand-mirrored
> in two runtimes (client TS + the Deno snapshot edge function), has no
> DB-level idempotency (app-level read-then-write, race-prone), and the
> client has no `date <= today` bound so opening `/diario/<future-date>`
> materializes future slots. The fix is a single
> `materialize_plan_for_date` RPC (SECURITY INVOKER) called by both, a
> partial unique index on `(user_id, plan_week_slot_id)` with
> `INSERT … ON CONFLICT DO NOTHING`, and an in-RPC `date <= today` guard.

## TDEE

TDEE is estimated by the `recalculate-tdee` edge function (cron). The
current model is a two-endpoint energy balance over a fixed 14-day window:
it requires at least 10 days of intake data, uses a 7700 kcal/kg fat-energy
constant, and picks the weigh-in closest to each window edge within a ±3-day
tolerance (`TDEE ≈ avgIntake − Δweight × 7700 / 14`). The frontend reads the
latest `tdee_estimates` row (wired in Sprint 17), so phases with
`kcal_mode = 'tdee_delta'` resolve their kcal target from that estimate
instead of returning `null`.

> ⚠ Changing — see R-07 (D-B4). The two-endpoint window model (and its
> 14d/10d/±3d/7700 gating) is replaced by a fully adaptive expenditure
> estimator (MacroFactor / Hacker's-Diet–Kalman lineage): persistent
> per-user state (trend weight + running expenditure + variance) updated
> daily by reconciling predicted vs observed smoothed weight change, with
> 7700 surviving only as an internal prior. It needs its own design spec
> before implementation.

## Product ideas (uncommitted)

Future-feature suggestions distilled from the original spreadsheet's §5.
These are **uncommitted product ideas, not on the roadmap** and carry no
R-id; stale or obsolete entries from the source have been dropped.

- **Nutrition:** barcode scanner / external food databases for ingredient
  entry; import recipes from a URL with auto-computed macros; an automatic
  shopping list derived from the planned week; dynamic serving rescaling
  (scale a recipe to N people or a target kcal).
- **Body composition:** smart-scale / health-platform integrations
  (Withings, Renpho, Garmin, Apple Health, Google Fit) to avoid manual
  entry; trend charts with regression, goal-date prediction, and plateau
  alerts.
- **Training (not in the original spreadsheet, expected for a gym app):**
  routines and training plans; set/rep/weight/RPE logging with per-exercise
  history; 1RM / volume / progression tracking; rest and superset timers;
  an exercise library; cardio / NEAT and step tracking via wearables.
- **Health & wellbeing:** sleep and mood logging correlated with
  performance; injury / niggle tracking with automatic exercise exclusion.
- **Platform:** native iOS/Android alongside web with cloud sync; offline
  mode with deferred sync; sharing routines/recipes and a coach↔client role
  system; CSV export/import and backup (including importing the original
  spreadsheet); reminders (weigh-in time, daily deficit/surplus); a
  configurable widget dashboard; biometric login for encrypted health data.
