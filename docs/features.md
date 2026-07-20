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

The `/progress` page leads with a **`LatestMeasurementCard`** whose weight
headline is the **smoothed (5-day-avg) trend weight** (`latestMa5`) rather
than the raw weigh-in. Alongside it a **rate per week** (`smoothedRatePerWeek`
— kg/week over a 7-day lookback on the smoothed series) is shown in
phase-aware color. A secondary line shows **since-start** (`latestMa5 −
profile.initial_weight_kg`) and **to-goal** (`latestMa5 − targetWeightKg`) —
this line and the to-goal clause render only when the data exists (since-start
requires `initial_weight_kg` on the profile; to-goal additionally requires a
derivable target weight). The **target weight** is computed on render by
`computeTargetWeightKg` from `goal.target_body_fat_pct` + the latest
`body_fat_pct`/`weight_kg` (fat-free-mass method — assuming fat loss only);
it is never stored. **Estimated BMR** (Mifflin-St Jeor) is shown as a quiet,
delta-free line — it is a deterministic function of current weight, so a
BMR "Δ" would merely restate the weight trend.

Below the weight headline the card shows body-fat, muscle, and water
percentages with a **≥7-day delta** (`compositionDelta`, same 7-day lookback)
colored by `deltaTone`: **phase-aware** — weight and body-fat are colored
toward the active phase's goal (cut: down=good; bulk: up=good for weight;
body-fat down is always good when any phase is set); muscle up is always good;
water is always neutral; **everything is neutral when no active phase is set**.
`ProgresoPage` reads the active phase via `useActivePhase()` and the user's
goal via `useGoal()` read-only for this coloring and target-weight derivation
— no writes.

The weight chart (raw + smoothed) draws a **dashed reference line** at the
derived target weight, but only when it is computable (requires
`goal.target_body_fat_pct` + current `body_fat_pct` + `weight_kg`). All of
the above is **derived/presentational only** — never stored, never feeds
protein/TDEE/targets; no schema, RPC, or edge function was added or changed.

The composition chart's main view is **three independent, non-stacked
lines** — grasa, músculo, and agua (`body_fat_pct`, `muscle_pct`,
`water_pct`) — each with per-series linear interpolation between measurements
(`connectNulls`, no extrapolation past the first/last point) and a filled
end-dot terminating each line. They are deliberately **not** stacked into a
fat/lean partition: water is distributed within lean tissue, so the three are
not disjoint ratios and stacking them together would be false. Because there
is no 100% partition to anchor to, the Y-axis **domain is padded to the data**
(±10% of the value range, clamped to `[0, 100]` in % mode) rather than the old
hard `0–100` axis — three narrow-range series would drown in a full 0–100
scale. Below the main chart the same three series are repeated as a responsive
grid of compact per-series **trend cards** (`TrendChart`). A per-chart-local
`%`↔`kg` toggle (component `useState`, no URL/persistence — same pattern as the
time-range pills) switches both the main chart and the trend cards to a
kilogram decomposition derived on the frontend from the stored `weight_kg`
(`pctToKg` in `composition.ts`); the Y-axis auto-scales (unclamped) in kg mode.
This whole view is **presentational only** — it reads measurements for display
and never feeds protein/TDEE/targets.

## Recipes

Recipes are per-user private rows referencing the shared ingredient library
(schema in `data-model.md`). Each recipe has a `servings` count, an optional
`prep_time_minutes`, a list of ingredient lines (`quantity` in grams or units
per the ingredient's `unit_type`), and an ordered list of **preparation
steps**. Steps are structured rows in their own `recipe_steps` table (R-36),
not a free-text blob — the old `recipes.instructions` column was dropped when
they landed. In the editor they are a reorderable field array (↑/↓ buttons over
the array's `swap()`, not drag-and-drop); on the detail page they render as a
numbered list. The recipe editor is a two-column layout: the ingredient list on
one side and a **live macros panel** on the other that recomputes as quantities
change — it always shows "Totales" and "Por ración" side by side, with no
single-column variant. Persistence is atomic via the `save_recipe` RPC (UPSERT
recipe + replace its `recipe_ingredients` and `recipe_steps` in one
transaction).

Steps belong to the shared recipe row, so only the recipe's real creator may
write them. A **private note** is the counterpart: free text stored on
`user_recipe_refs.note` (never on the pooled `recipes` row — it is PII), shown
on the detail page. It saves on an explicit button, and the card marks itself
unsaved while the text differs from what is stored — the note used to save on
blur, which made it the one field in the app that wrote itself and gave no sign
when work was still pending. It exists for any recipe in my library, including
one someone else created and I cannot edit but can still annotate.

Per-ingredient scaling honors the `per_serving` flag: a normal line's quantity
is divided across `servings`, but a `per_serving = true` line is added fresh
*per serving served* (the batch-cooked-curry trick — the stew's macros divide
by 5 servings while the 70 g of rice is counted per plate).

The Recetas list switches presentation by breakpoint, not by user choice:
under `md` it renders dense `RecipeRow` rows, at `md` and above a responsive
grid of `RecipeCard`s (photo or initials placeholder, name, kcal/serving,
ingredient-count badge) — both lists are always in the DOM, one hidden by a
responsive class. There is no view toggle and nothing persisted.
Recipes are part of the ★ Library Contribution & Lifecycle Model
(`data-model.md#library-model`): the pool is shared, "my library" is the set
of my `user_recipe_refs` rows, and "delete" = `hide_owned_recipe` (drops my
ref, and if I was the real owner, transfers pool ownership to the reserved
anon sentinel).

## Ingredients (shared library & OFF import)

The ingredient library is shared across all users under the ★ Library
Contribution & Lifecycle Model (`data-model.md#library-model`): anyone reads
the whole pool, anyone inserts (tagged with `created_by_user_id` = self), only
the real owner edits/deletes their own rows (anon-sentinel-owned and `null`
seed rows are immutable), and "delete" = `hide_owned_ingredient` (drops my
`user_ingredient_refs` row and, if I was the real owner, transfers pool
ownership to the anon sentinel). Macros are stored per 100 g, or per unit when
`unit_type = 'unit'` (eggs, egg whites, protein scoops). `pg_trgm` trigram
indexes back fuzzy name/brand search (so "yogur" matches "yogures", "yogurt",
and typos).

Library search is **local only**. The Ingredientes list, the full-screen
`/recipes/ingredients/search` takeover and the recipe editor's autocomplete all
run the same server search over the shared pool (ordering verified rows first)
and never touch the network beyond Supabase — there is no auto-probe, no
result-count threshold and no query-length trigger. **OpenFoodFacts** is
queried from exactly one place: the explicit search panel the user opens on the
method page (`/recipes/ingredients/new`), plus the barcode lookup described
below. It is a text search, no API key, CORS-friendly, queried directly from
the browser and debounced; results missing an energy value are filtered out.
Picking an OFF result carries the whole product into the manual editor, and
saving inserts it into the shared library tagged `source = 'openfoodfacts'`
with the OFF barcode as `external_id`; the `unique (source, external_id)`
constraint makes imports race-safe across concurrent users — a unique-violation on insert means another
user already imported that barcode, so the existing row is fetched and reused
instead.

Creating and editing an ingredient are **routes**, not a modal (R-33 wave 6).
`/recipes/ingredients/new` is a method chooser: a pure navigation screen asking
how you want to add it — search OpenFoodFacts, scan a barcode, or type it by
hand. Every method ends at `/recipes/ingredients/new/manual`, the one editor
form, carrying what it learned in router state: the whole OFF product on the
search and barcode paths (that object is what makes the save an *import* —
`source = 'openfoodfacts'` + `external_id` — rather than an anonymous manual
row), or a bare EAN when OFF does not know the code, since a manual row cannot
hold an `external_id` (the `ingredients_external_consistency` CHECK).
`/recipes/ingredients/scan` is the camera scanner (native `BarcodeDetector`
with a lazy `@zxing/browser` fallback, R-20) and `/recipes/ingredients/:id/edit`
mounts the same editor over an existing row. The barcode method is two
different affordances by pointer: the camera is gated behind
`(pointer: coarse)`, so touch devices get "abrir cámara" → the scanner route
while a desktop pointer gets an inline typed-EAN field and a plain statement
that scanning is mobile-only — a webcam is useless against a product barcode.
A `?q=` param rides through the whole detour, so the search the user was in
survives it and also seeds the name on the manual method.

`IngredientDialog` survives as a **create-only** dialog with just the manual
form (the same `IngredientEditorForm` the routes mount — there is one editor,
not two), kept for the single job the routes cannot do: create-then-select in
place. You are filling a recipe row, the ingredient does not exist, you create
it here and it is selected straight into the row you were filling — so its
callers are only the recipe editor's `IngredientAutocomplete` and, on mobile,
`AddIngredientSheet`. It returns the created row to whoever opened it.
Ingredient duplicates are tolerated in
Phase 1; the ★ model's Phase-2 reaper (R-01) is the structural resolution
(gated on the deferred ratings/voting signal), not a dedicated dedup feature.

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
toggle) and the active basis is labelled in the UI (PhaseEditorForm help,
ObjetivosPage phase summary, Diario targets). Existing phases keep their
stored `protein_g_per_kg`; only new phases get table defaults at create
time. The mild fallback under-target for a bf%-less cutter is a deliberate
nudge to log a body-fat %.

The Diario's **DayTotalsCard** leads with a phase-aware kcal-remaining hero:
on `cut` and `maintenance` it shows a remaining **budget** (target minus
consumed); on `bulk` it shows a **to-goal** figure (how far the user still
needs to eat). Consumed and target kcal appear underneath the hero, and a
low/medium TDEE-confidence badge sits directly below it when the active phase
uses `tdee_delta` mode. Below the hero a **2×2 macro grid** covers protein,
carbs, fat, and fiber. Per-macro semantics reflect dietary intent: protein and
fiber are **floors** — meeting or exceeding the target is success-colored
(extra protein is never flagged red; fiber below its minimum is amber); kcal
over target on a non-bulk phase is the sole red "over budget" state; carbs and
fat are informational/neutral only. The card is **presentational only** — it
reads logged totals and the active phase's targets and feeds nothing back (no
protein/TDEE/target writes). The active phase is resolved as "today's phase
only" — no consumer reconstructs which phase was active on a past date.
Editing a past phase's macros therefore changes nothing downstream: past
phases are computationally **inert**. `/progress/goals` lists and manages all
phases.

Past phases follow a **grace-window** model (D-A5), not a hard
freeze-at-`end_date` cliff. The grace constant is
`PHASE_EDIT_GRACE_DAYS = 7` in `src/features/phases/status.ts`:

- **In grace** (`end_date` passed, but ≤ 7 days ago): the card renders as a
  normal editable card — name, dates, macros, and notes are all editable and
  the phase is still deletable. Only the status badge is `end_date`-based
  (it already reads "past"); the freeze/dim is grace-based, not badge-based.
- **Frozen** (`end_date` more than 7 days in the past): edit/delete
  affordances are hidden and the card dims (`opacity-60`).
- **Notes editable forever:** even on a frozen phase the `notes` field stays
  editable via a notes-only affordance — the `PhaseEditorPage` route
  (`/progress/goals/phases/:id/edit`) renders `PhaseEditorForm` in `notesOnly`
  mode (every other field read-only/disabled, only `notes` saveable).
  `notesOnly` is not a route flag but is derived inside the page from the
  freeze rule (`isPhaseFrozen`), so a deep link cannot bypass it.
  Retrospective annotations affect no computation, so this is always allowed.

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

The planner derives a **shopping list** from the active week (opened from the
Planificador, redesigned into the R-33 panel by R-35). The aggregation is pure
and dependency-free (`src/features/planner/shopping.ts`, Tier-1 unit-tested):
you cook a recipe in whole batches — a 5-serving curry cannot be cooked
2/5ths — so for each recipe it sums the servings planned across the week,
divides by the recipe's yield, rounds **up** to whole batches, and shops for
that many full recipes, reporting the leftover servings that rounding buys you.
Per-batch ingredient amounts follow the same `per_serving` rule as the macro
core. The panel shows the result either aggregated by ingredient or broken down
by recipe, with per-item check-off, "always have it" staples hidden across
weeks, and free-text extras appended for the trip; a plain-text export goes out
via the Web Share sheet or the clipboard (`shoppingExport.ts`). Nothing here is
persisted server-side — check-off, staples and extras are `localStorage` (the
first and last keyed per week, staples global), and no schema, RPC or edge
function backs the list.

## Diario & materialization

The Diario logging UX groups entries by meal. The four canonical sections —
Breakfast, Lunch, Snack, and Dinner — **always render**, even when empty; the
`other` fallback bucket appears only when it has entries. Each section header
shows the meal's **kcal subtotal** (or a "— sin registros / — nothing logged"
label when empty) alongside an add ("+") button that opens the **`AddToDaySheet`**
(R-33 wave 2), a two-step responsive sheet: an *explore* step that searches
recipes and loose ingredients (or takes a custom typed-macros entry with no
library item behind it), then a *ración* step for the quantity. It doubles as
the edit surface — opened on an existing entry it goes straight to the ración
step, locked to that entry's kind and pre-filled, where confirming updates it
and deleting removes it. Openers that already know what you meant (the Recetas
list's "+ añadir al diario") skip the explore step. Below any logged entries, a **quick-add chip strip** lists
recent and most-frequent recipes derived from the user's `meal_logs` — recent
entries (logged within ~14 days) first, then backfilled by most-logged frequency over a ~60-day history, capped to a short list (≈6).
Tapping a chip logs **1 serving** of that recipe to the section's meal type
instantly (via `createMealLog`) and fires an **undo toast** ("Deshacer /
Undo") that calls `deleteMealLog` on the just-created entry and invalidates
the query, reverting as if the tap never happened. This is presentational and
logging UX only — no schema, RPC, or edge function was added or changed for
this layer.

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

Materialization is a single `materialize_plan_for_date` RPC (SECURITY
INVOKER, `set search_path = public`) called by both the client and the Deno
snapshot edge function — the prior hand-mirrored two-runtime copies are
deleted (R-12 / D-D6). DB-level idempotency comes from the partial unique
index `meal_logs (user_id, plan_week_slot_id) where plan_week_slot_id is not
null` + `INSERT … ON CONFLICT DO NOTHING` (fixes the race-prone app-level
read-then-write). An in-RPC `date <= today` guard (Europe/Madrid, same
canonical "today" as `previousDayInTZ()`) makes opening
`/diary/<future-date>` a no-op instead of materializing future slots. Live
in prod since 2026-05-18 (migration applied, then calling code merged).

## TDEE

TDEE is estimated by the `recalculate-tdee` edge function (cron). The model
is an **adaptive expenditure filter** (R-07 / D-B4): a 2-state linear Kalman
filter on `[trend_weight, expenditure]` with persistent per-user state
(`tdee_state`). Each day it predicts the smoothed weight change from
`intake − expenditure`, compares it to the observed raw weigh-in, and the
residual self-corrects expenditure (the Kalman gain's expenditure component).
7700 kcal/kg survives only as an internal conversion prior, not the headline
formula; the old `14d / 10d / ±3d` window gating is retired. Filter variance
maps to a low/medium/high UI **confidence** band (surfaced on `/diary` and
`/progress` when the active phase is `tdee_delta`). The frontend still reads
the latest `tdee_estimates` row (Sprint-17 contract unchanged — additive
`confidence`/`is_warmup` only), so `kcal_mode = 'tdee_delta'` phases resolve
their kcal target from that estimate. The pure, deterministic filter math
lives in `src/core/tdee.ts` (dual-runtime, unit tested). Spec:
`docs/superpowers/specs/2026-05-18-adaptive-tdee-design.md`.
`body_measurements_smoothed` is retained for chart/display use but is no
longer the TDEE path's input (the filter maintains its own superior trend
weight — spec §8).

Live in prod since 2026-05-18: the `tdee_state` table +
`tdee_estimates.confidence`/`is_warmup` migration is applied and the
rewritten `recalculate-tdee` edge function is deployed.

## Entrenamiento (training)

The training area (`/training` "Hoy" planner, `/routine` + child builder routes)
lets the user define routines, schedule them as a cycle, and run a workout
guided. `/exercises` is a full browse/catalog page (`ExercisesPage` — debounced
search + equipment/category/level/muscle filters + pagination + `ExerciseCard`
grid) and `/exercises/:id` is a real detail page (`ExerciseDetailPage`).
Exercise creation and muscle tagging also happen via the `ExercisePicker` →
`ExerciseDialog` flow inside the routine/session editors.

- **Exercise pool & sessions (R-19 MVP).** A shared, bilingual `exercises` library
  (per-exercise `default_increment_kg`, `primary_muscles` — an array of fine
  muscle codes — and equipment) backs ad-hoc
  session logging (`workout_sessions` / `workout_sets`, saved via the `save_workout`
  RPC). A rule-based **coach** (`MVP_COACH_RULES` in `src/core/training.ts`:
  double-/rep-progression, flat-e1rm-deload, rpe-climbing-fatigue, muscle-recency)
  turns history into suggestions; e1RM / volume / PR derivations are pure.

- **Routines & cyclic planner (F-2 / R-22).** Two layers: **routines** (reusable
  named exercise templates — target sets, rep-range, rest, optional RPE, warm-up
  sets as % of working weight) and **programs** (a day-ordered cycle referencing
  routines, rest days allowed). `/training` shows **today's slot**, computed on the
  fly from `anchor_date + day_index mod cycle_length` (no materialization); "start
  from today" re-anchors. One active program per user. See R-22 / D-F8.

- **Guided active-workout runner (F-3 / R-23).** Tapping today's slot launches the
  runner (`/training/run`): it walks the routine one exercise at a time — warm-ups
  then working sets — with a **rest timer**, **per-set prefill from last time**, and
  inline logging, then one atomic save at the end. Per exercise you set today's
  **working weight** (warm-up loads derive from it); per set you log reps/weight
  (coloured green/white/amber vs. the expected value) and optional **RPE** (whole
  numbers, with a reps-in-reserve explainer). Rest carries between sets; the READY
  button reads "Empezar serie" while a rest runs (stops it) then "Iniciar descanso".
  Escape hatches: **jump** to any exercise, **skip** (drops it, recoverable at
  finish), **end exercise early** (keeps the sets you did — no fake 0/0), **add a
  set**. Leaving an exercise mid-way keeps it **partial** and resumable. The whole
  workout is held in a pure reducer mirrored to `localStorage` (resume prompt on
  reopen; Screen Wake Lock keeps the alarm alive), with **no DB writes until
  finish** and no cross-device resume. See R-23 / D-F9 and
  `architecture.md#runner-state-model`. *(The runner needs no schema change — it
  reuses `save_workout`.)*

- **Muscle activity heatmap (F-4 / R-24).** Embedded inline on `/training` (between
  today's plan and the recent-sessions list — no separate route): a front+back body
  shaded **grey→amber→red** by how much each muscle has been trained, alongside a
  `Muscle · N sets` ranked list. Volume is computed by the pure
  `computeMuscleVolume` (`src/core/muscleVolume.ts`) over your working sets — each
  **primary mover earns 1.0 set and each secondary mover 0.5**
  (`SECONDARY_SET_WEIGHT`; multiple primaries each earn 1.0 — stimulus is not
  conserved across a set), warm-ups are excluded, and whole-body lifts are footnoted
  as full-body rather than shading everything. A window selector (7d / 30d / 6mo /
  all, default 30d) bounds it. The body art is male/female, auto-picked from
  `profiles.sex` (follows the profile once it loads) with a manual toggle. The
  artwork is a swappable **body-art skin** (v1 = vendored MIT art); `computeMuscleVolume`
  stays pure and emits volume per **fine code**, and the render layer (`MuscleBody.tsx`)
  sums fine→body-region slug via `codesForBodyRegion(slug)` from `src/core/muscles.ts`.
  The ranked list renders at fine resolution even where the current art co-shades.
  See R-24 / D-F10.

- **Fine muscle taxonomy (R-26 / D-F11, Project A — #155).** Muscles are a
  **24-code fine taxonomy** in 6 groups plus a special `full_body`: shoulders
  (`delt_front`, `delt_side`, `delt_rear`); chest (`pec_upper`, `pec_lower`); back
  (`lat`, `trap`, `rhomboids`, `lower_back`, `neck`); arms (`biceps`, `tri_long`,
  `tri_lateral`, `forearms`); core (`abs_upper`, `abs_lower`, `obliques`); legs
  (`quads`, `hamstrings`, `glutes`, `adductors`, `calves`, `tibialis`,
  `abductors`). The codes
  live in a read-only **`muscles` dictionary table** (`code` PK, `muscle_group`,
  `body_region_slug`, `display_order`, `is_full_body`; one `muscles_select_all`
  policy, no write policy; 25 seed rows = 24 shadeable codes + `full_body`) that
  mirrors `src/core/muscles.ts`, the canonical structural source — a pgTAP
  anti-drift test guards the two against divergence. Each exercise carries
  **`primary_muscles` text[]** (one or more primary movers) and
  **`secondary_muscles` text[]** (fine codes); `full_body` is footnoted, never
  shades, and is not a valid secondary. A `trg_validate_exercise_muscles` trigger
  (function `validate_exercise_muscles`, `SECURITY INVOKER`) asserts both arrays are
  subsets of `muscles.code` (secondaries excluding `full_body`), since a CHECK
  cannot reference another table. Tagging happens in `ExerciseDialog` via
  **`MuscleTagField`** — a single grouped tri-state pill list under the 6 group
  headers (tap cycles neutral → Primary → Secondary → remove), yielding
  `primary_muscles[]` + `secondary_muscles[]`; the `ExercisePicker` muscle filter is
  `<optgroup>`'d by the 6 groups and filters by a specific fine code (PostgREST
  `primary_muscles.cs.{<code>}`). All 34 system exercise rows were re-tagged to fine
  codes in #155, with a follow-up anatomical-review migration
  (`20260604130000_fine_taxonomy_retag_review_fixes.sql`) correcting 3 rows. See
  R-26 / D-F11. *(Schema changes in #155: a new read-only `muscles` table;
  `exercises.primary_muscles` text[] added; the singular `exercises.primary_muscle`
  dropped; `secondary_muscles` retained as fine codes. The earlier additive
  `exercises.secondary_muscles` column landed 2026-05-26 with F-4. No backfill — the
  system seed was re-tagged in place.)*

- **Exercise detail popup (R-27 / Project B2b).** An `Info` button on exercise
  rows in the runner overview, the exercise picker, and the session + routine
  editors opens a bilingual step-by-step instruction panel with a start/end
  image loop. The reusable `ExerciseDetail` component adapts to a `density`
  prop (`compact` in the popup; `full` is mounted/live in `ExerciseDetailPage`
  — B2c, #167). The responsive shell is a shadcn `Drawer` (bottom-sheet) on
  mobile and a Radix `Dialog` on desktop. No schema or RPC change.

## Product ideas (uncommitted)

Future-feature suggestions distilled from the original spreadsheet's §5 and
the retired architecture spec's post-MVP roadmap. These are **uncommitted
product ideas, not on the roadmap** and carry no R-id; stale or obsolete
entries from the sources have been dropped. (Decided, scheduled work lives in
`roadmap.md` with an R-id — not here.)

- **Nutrition:** import recipes from a URL with auto-computed macros (JSON-LD +
  LLM ingredient mapping); dynamic serving rescaling (scale a recipe to N people or a target
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
- **Goals UX:** a body-fat-goal visual reference on `/progress/goals` — reference
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
