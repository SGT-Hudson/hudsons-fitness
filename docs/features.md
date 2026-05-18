# Features

What the app does today, per domain. Schema lives in `data-model.md`;
internal flows (materialization, edge/cron jobs) in `architecture.md`;
the *why* behind decided-but-unbuilt changes in `decisions.md` (queued in
`roadmap.md`). A `> ⚠ Changing` callout marks current behavior that a
decision will replace — it describes reality now, not the target design.

## Contents

- [Background (origin)](#background-origin)
- [Body composition & measurements](#body-composition--measurements)
- [Recipes](#recipes)
- [Ingredients (shared library & OFF import)](#ingredients-shared-library--off-import)
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
composition chart. The composition chart's main view is a **2-series stacked
area** of `fat%` + `lean%` (`lean% ≡ 100 − body_fat_pct`), fat at the bottom,
with per-series linear interpolation between measurements (no extrapolation
past the first/last point). fat%/lean% is a true disjoint partition that sums
to exactly 100%, so the hard `0–100` Y-axis is correct and never clips.
`muscle_pct`, `water_pct` and a `body_fat_pct` trend are rendered **below the
stack as independent non-stacked trend charts** (a responsive grid of compact
line cards), never folded into the 100% partition — water is distributed
within lean tissue, so fat/muscle/water are not disjoint ratios and must not
be stacked together. A per-chart-local `%`↔`kg` toggle (component `useState`,
no URL/persistence — same pattern as the time-range pills) switches both the
stack and the trends to a kilogram decomposition derived on the frontend from
the stored `weight_kg` (`fat_kg = body_fat_pct/100 × weight`,
`lean_kg = weight − fat_kg`, `muscle_kg`/`water_kg` analogously); the stack's
Y-axis auto-scales in kg mode. This whole view is **presentational only** — it
reads measurements for display and never feeds protein/TDEE/targets.

## Recipes

Recipes are per-user private rows referencing the shared ingredient library
(schema in `data-model.md`). Each recipe has a `servings` count and a list of
ingredient lines (`quantity` in grams or units per the ingredient's
`unit_type`). The recipe editor is a two-column layout: the ingredient list on
one side and a **live macros panel** on the other that recomputes as quantities
change — when `servings === 1` it shows a single "Macros" column, otherwise it
shows "Totales" and "Por ración" side by side. Persistence is atomic via the
`save_recipe` RPC (UPSERT recipe + replace its `recipe_ingredients` in one
transaction).

Per-ingredient scaling honors the `per_serving` flag: a normal line's quantity
is divided across `servings`, but a `per_serving = true` line is added fresh
*per serving served* (the batch-cooked-curry trick — the stew's macros divide
by 5 servings while the 70 g of rice is counted per plate).

The Recetas list offers a grid/list view toggle persisted to `localStorage`:
the grid shows recipe cards (photo or initials placeholder, name, kcal/serving,
ingredient-count badge); the list shows dense rows with the same fields. Recipe
deletion is currently a soft delete (`deleted_at` + partial unique index where
`deleted_at is null`).

> ⚠ Changing — see R-01 (D-A2/D-A3/D-A4). Recipes fold into the ★ Library
> Contribution & Lifecycle Model (shared pool + per-user reference rows;
> "delete" = drop your reference); the interim `deleted_at` soft-delete is
> replaced by that structure. See `data-model.md#library-model`.

## Ingredients (shared library & OFF import)

The ingredient library is shared across all users (the crowdsourced model in
`data-model.md`): anyone reads the whole pool, anyone inserts (tagged with
`created_by_user_id`), only the creator edits/deletes their own rows, and
`created_by_user_id = null` rows are immutable system seeds. Macros are stored
per 100 g, or per unit when `unit_type = 'unit'` (eggs, egg whites, protein
scoops). `pg_trgm` trigram indexes back fuzzy name/brand search (so "yogur"
matches "yogures", "yogurt", and typos).

Search (on the Ingredientes page and inside the recipe editor's autocomplete)
is **local-first**: it queries the shared library, ordering verified rows
first. Only when local results are thin (fewer than ~5) **and** the query is at
least 3 characters does it also probe **OpenFoodFacts** (text search, no API
key, CORS-friendly, queried directly from the browser). OFF results missing an
energy value are filtered out. Picking an OFF result inserts it into the shared
library tagged `source = 'openfoodfacts'` with the OFF barcode as
`external_id`; the `unique (source, external_id)` constraint makes imports
race-safe across concurrent users — a unique-violation on insert means another
user already imported that barcode, so the existing row is fetched and reused
instead.

The Create Ingredient modal (opened from "+ Nuevo" on Ingredientes or the
recipe editor's sticky "+ Crear nuevo" autocomplete item) has a debounced
OpenFoodFacts search tab and a manual-entry tab; a barcode-import tab is a
disabled placeholder (a future product idea, below). On save it returns the new
`ingredient_id` to whatever opened it. Ingredient duplicates are tolerated (no
dedup in the MVP).

> ⚠ Changing — see R-01 (D-A2/D-A3/D-A4). Ingredients fold into the same ★
> Library Contribution & Lifecycle Model; tolerated duplicates are structurally
> resolved by that model's Phase-2 reaper, not a dedicated dedup feature.

## Macros & phases

A **phase** is a dated nutrition block of type `cut`, `maintenance`, or
`bulk`. Its calorie target is set either as an absolute value
(`kcal_mode = 'absolute'`) or as a delta from estimated TDEE
(`kcal_mode = 'tdee_delta'`). Fat is stored as a fraction of kcal
(`fat_pct_of_kcal`, 0.10–0.60), converted to/from a percent only at the form
boundary. Fiber is set per a fiber mode. Protein is computed on a phase-aware
lean-mass basis (D-B1): the canonical `computeDailyMacroTargets` owns the
rule. When the latest measurement has a body-fat %, protein =
`lean × phase.protein_g_per_kg`, where `lean = weight × (1 − bf%/100)` and
`protein_g_per_kg` is the per-phase override pre-filled at create time from
the phase-aware lean-mass table `PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM`
(`cut 2.4 / maintenance 2.0 / bulk 1.8` g/kg LBM, in `src/lib/macros.ts`).
When no body-fat % is logged it falls back to
`weight × PROTEIN_FALLBACK_G_PER_KG_BODYWEIGHT` (1.6 g/kg of total
bodyweight) — the basis switches automatically on bf% presence (no manual
toggle) and the active basis is labelled in the UI (PhaseDialog help,
ObjetivosPage phase summary, Diario targets). Existing phases keep their
stored `protein_g_per_kg`; only new phases get table defaults at create
time. The mild fallback under-target for a bf%-less cutter is a deliberate
nudge to log a body-fat %.

The Diario shows the active phase's daily macro targets (kcal, protein,
carbs, fat, fiber) against what was consumed. The active phase is resolved
as "today's phase only" — no consumer reconstructs which phase was active on
a past date. Editing a past phase's macros therefore changes nothing
downstream: past phases are computationally **inert**. `/objetivos` lists and
manages all phases.

Past phases follow a **grace-window** model (D-A5), not a hard
freeze-at-`end_date` cliff. The grace constant is
`PHASE_EDIT_GRACE_DAYS = 7` in `src/pages/ObjetivosPage.tsx`:

- **In grace** (`end_date` passed, but ≤ 7 days ago): the card renders as a
  normal editable card — name, dates, macros, and notes are all editable and
  the phase is still deletable. Only the status badge is `end_date`-based
  (it already reads "past"); the freeze/dim is grace-based, not badge-based.
- **Frozen** (`end_date` more than 7 days in the past): edit/delete
  affordances are hidden and the card dims (`opacity-60`).
- **Notes editable forever:** even on a frozen phase the `notes` field stays
  editable via a notes-only affordance (the `PhaseDialog` opened in
  `notesOnly` mode — every other field read-only/disabled, only `notes`
  saveable). Retrospective annotations affect no computation, so this is
  always allowed.

The freeze is a UX stance ("history is closed"), **not** a data invariant —
the inert-past-phases finding (no consumer reconstructs a historical active
phase) means it protects nothing integrity-critical, which is why a forgiving
late-correction window and forever-editable notes are safe and the change is
UI-only with no DB backstop.

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

TDEE is estimated by the `recalculate-tdee` edge function (cron). The model
is an **adaptive expenditure filter** (R-07 / D-B4): a 2-state linear Kalman
filter on `[trend_weight, expenditure]` with persistent per-user state
(`tdee_state`). Each day it predicts the smoothed weight change from
`intake − expenditure`, compares it to the observed raw weigh-in, and the
residual self-corrects expenditure (the Kalman gain's expenditure component).
7700 kcal/kg survives only as an internal conversion prior, not the headline
formula; the old `14d / 10d / ±3d` window gating is retired. Filter variance
maps to a low/medium/high UI **confidence** band (surfaced on `/diario` and
`/progreso` when the active phase is `tdee_delta`). The frontend still reads
the latest `tdee_estimates` row (Sprint-17 contract unchanged — additive
`confidence`/`is_warmup` only), so `kcal_mode = 'tdee_delta'` phases resolve
their kcal target from that estimate. The pure, deterministic filter math
lives in `src/core/tdee.ts` (dual-runtime, unit tested). Spec:
`docs/superpowers/specs/2026-05-18-adaptive-tdee-design.md`.
`body_measurements_smoothed` is retained for chart/display use but is no
longer the TDEE path's input (the filter maintains its own superior trend
weight — spec §8).

> ⚠ Changing — see R-07 (D-B4). Adaptive model implemented; schema
> (`tdee_state` table + `tdee_estimates.confidence`/`is_warmup`) + edge
> deploy pending Wave-3. The staged migration
> (`20260518020000_r07_adaptive_tdee_state.sql`) is NOT applied by its PR
> and the rewritten edge function is NOT deployed — the live model only
> switches at the Wave-3 prod checkpoint.

## Product ideas (uncommitted)

Future-feature suggestions distilled from the original spreadsheet's §5 and
the retired architecture spec's post-MVP roadmap. These are **uncommitted
product ideas, not on the roadmap** and carry no R-id; stale or obsolete
entries from the sources have been dropped. (Decided, scheduled work lives in
`roadmap.md` with an R-id — not here.)

- **Nutrition:** barcode scanner / external food databases for ingredient
  entry; import recipes from a URL with auto-computed macros (JSON-LD +
  LLM ingredient mapping); an automatic shopping list derived from the planned
  week; dynamic serving rescaling (scale a recipe to N people or a target
  kcal); a **BEDCA seed** of ~100 generic Spanish staples (huevos, pollo,
  arroz blanco, leche entera, aceite de oliva, …) inserted idempotently as
  system rows to improve autocomplete for genéricos OpenFoodFacts covers
  poorly.
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
- **Goals UX:** a body-fat-goal visual reference on `/objetivos` — reference
  body images at e.g. 8/12/15/20/25/30 % paired with educational copy on the
  healthy / sustainable / athletic / minimum ranges per sex (men ~10–20 %
  healthy, ~6 % essential floor; women ~18–28 % healthy, ~12 % essential
  floor), sources cited (ACE / ACSM).
- **Notifications:** a `daily-summary` edge function / push that tells the
  user how many kcal they have left for the day (also: weigh-in reminders,
  daily deficit/surplus pings).
- **Account:** a "Start fresh" reset in Settings that clears the active phase,
  active meal plan, and (future) workout state **without** deleting historical
  data (`body_measurements`, `meal_logs`, `daily_nutrition_history`,
  `tdee_estimates` all preserved) — for returning after a long break. Also: a
  GDPR "Download all my data" self-service export (the only built GDPR action
  today is account deletion — see `operations.md#auth--privacy`).
- **Moderation:** ingredient moderation tooling — flagging, duplicate merging,
  verification badges, an admin dashboard. (Partly subsumed by the ★ Library
  model's Phase-2 reaper, R-01; the human-facing moderation UX is the
  uncommitted part.)
- **Platform:** native iOS/Android (Capacitor) alongside web with cloud sync;
  offline mode with deferred sync; push notifications and share-sheet
  integration; sharing routines/recipes and a coach↔client role system; CSV
  export/import and backup (including importing the original spreadsheet); a
  configurable widget dashboard; biometric login for encrypted health data.
