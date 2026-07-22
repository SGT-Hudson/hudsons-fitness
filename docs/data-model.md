# Data Model

## Contents
- [Overview](#overview)
- [Tables](#tables)
- [Row-Level Security](#row-level-security)
- [RPCs](#rpcs)
- [Views](#views)
- [Extensions](#extensions)
- [Storage](#storage)
- [Library Contribution & Lifecycle Model](#library-contribution--lifecycle-model)
- [Type definitions & caveats](#type-definitions--caveats)

## Overview

Hudson's Fitness has 28 base tables in prod, all RLS-enabled — the original 15, the R-07 `tdee_state` adaptive-filter memory table, the 3 Training MVP tables added by R-19 and applied 2026-05-21 (`exercises`, `workout_sessions`, `workout_sets`), the 4 F-2 training tables (`routines`, `routine_exercises`, `programs`, `program_days`, live in prod since v2026-06-03 / #122), the 2 R-01 per-user reference tables (`user_ingredient_refs`, `user_recipe_refs`), the R-26 read-only `muscles` reference dictionary (#155), and the R-36 `recipe_steps` child table — plus a 28th that is not part of the app's model: `_r01_recipes_owner_backup`, the R-01 rollback snapshot deliberately left in place after the backfill (RLS enabled with no policies, so it is deny-all to every app role — see `operations.md`). The `body_measurements_smoothed` view sits on top of `body_measurements` (see Views). Per-user tables follow the standard `auth.uid() = user_id` pattern so a user only ever sees their own rows. The deliberate exceptions are `ingredients` and `recipes` (reclassified by R-01), the intentionally-shared crowdsourced library — every authenticated user reads the whole pool and may contribute rows. The backend is Supabase project `upvraruehzurbetzrxov` (PostgreSQL 15+, EU Frankfurt region for GDPR). Repo is public — RLS is the sole security boundary (see D-F2, `operations.md`).

## Tables

Schema and column lists below are authoritative from `src/types/database.ts` (generated, R-04). The legacy `hudsons-fitness-architecture.md` spec has drifted and is being retired; it must not be trusted for column lists wherever it conflicts with `src/types/database.ts` or the migration files in `supabase/migrations/`.

### `profiles`

Extends Supabase's built-in `auth.users`. One row per user (`id` is the FK to `auth.users(id)`).

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key, references `auth.users(id)` on delete cascade |
| `display_name` | `text` |
| `language` | `text` not null default `'es'`, check in (`'es'`, `'en'`) |
| `start_date` | `date` not null default `current_date` |
| `initial_weight_kg` | `numeric(5,2)` |
| `sex` | `text`, check in (`'male'`, `'female'`, `'other'`) |
| `birth_date` | `date` |
| `height_cm` | `numeric(5,1)` |
| `created_at` | `timestamptz` not null default `now()` |
| `updated_at` | `timestamptz` not null default `now()` |

Two dead columns were dropped from `profiles` on 2026-05-18: `bone_kg` (a single per-user value that fed zero computations and added mandatory onboarding friction — R-03 / D-A6) and `units` (dead legacy, never written or read; the app is metric-only — R-14 / D-E3). Both removals were code/types-first; the prod `DROP COLUMN`s applied at the Wave-3 checkpoint completed them.

### `body_measurements`

One body-composition entry per user per day (`unique (user_id, measured_on)`). Index `idx_body_measurements_user_date` on `(user_id, measured_on desc)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `user_id` | `uuid` not null, references `profiles(id)` on delete cascade |
| `measured_on` | `date` not null |
| `weight_kg` | `numeric(5,2)` |
| `body_fat_pct` | `numeric(4,2)` (0–100) |
| `muscle_pct` | `numeric(4,2)` |
| `water_pct` | `numeric(4,2)` |
| `notes` | `text` |
| `created_at` | `timestamptz` not null default `now()` |

Note: there is no `bone_kg` column here — bone mass is stored once per user on `profiles` (see `profiles`). The weight moving average is exposed via a view (see Views).

### `ingredients` (shared library)

Shared across all users (crowdsourced library). `created_by_user_id = null` indicates a system-seeded ingredient (immutable). Trigram indexes `idx_ingredients_name_trgm` (gin on `name`), `idx_ingredients_name_en_trgm` (gin on `name_en` where not null), and `idx_ingredients_brand_trgm` (gin on `brand` where `brand is not null`).

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `created_by_user_id` | `uuid`, references `profiles(id)` on delete set null |
| `name` | `text` not null |
| `name_en` | `text` — optional EN secondary name; `name` is the ES-primary (F-1) |
| `brand` | `text` |
| `unit_type` | `text` not null default `'gram'`, check in (`'gram'`, `'unit'`) |
| `kcal_per_unit` | `numeric(7,2)` not null |
| `protein_g_per_unit` | `numeric(6,2)` not null |
| `carbs_g_per_unit` | `numeric(6,2)` not null |
| `fat_g_per_unit` | `numeric(6,2)` not null |
| `fiber_g_per_unit` | `numeric(6,2)` not null default 0 |
| `sugar_g_per_unit` | `numeric(6,2)` null — U-1 sub-macro of carbs |
| `saturated_fat_g_per_unit` | `numeric(6,2)` null — U-1 sub-macro of fat |
| `salt_g_per_unit` | `numeric(6,2)` null, check `>= 0` — R-33 wave 6; null = unknown (never 0). Ingredient-level only, not aggregated into recipe/day totals |
| `source` | `text` not null default `'manual'`, check in (`'manual'`, `'openfoodfacts'`, `'bedca'`, `'system'`) |
| `external_id` | `text` |
| `is_verified` | `boolean` not null default false |
| `created_at` | `timestamptz` not null default `now()` |
| `updated_at` | `timestamptz` not null default `now()` |

Key constraints: `unique (source, external_id)` prevents duplicate API imports across all users; `ingredients_external_consistency` check ensures `external_id is null or source in ('openfoodfacts', 'bedca')`. Macros are per 100 g, or per unit when `unit_type = 'unit'`.

### `recipes` (shared pool — R-01)

Shared-pool entity referencing the shared ingredient library — recipes are pooled and discoverable, owned by their creator (see Library Contribution & Lifecycle Model). R-01 renamed the owner column `user_id` → `created_by_user_id` for parity with `ingredients`, dropped the per-user `unique (user_id, name)` index (names are no longer per-user-unique under the shared pool — D-A4), and dropped the `deleted_at` soft-delete column and its two dependent partial indexes (the no-hard-delete model hides via `user_recipe_refs`, not a soft-delete flag).

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `created_by_user_id` | `uuid` not null, references `profiles(id)` on delete cascade |
| `name` | `text` not null |
| `servings` | `numeric(5,2)` not null default 1, check `servings > 0` |
| `description` | `text` |
| `photo_url` | `text` — R-36b: the object path in the `recipe-photos` Storage bucket (`<recipe_id>/full.webp`), not a URL; `null` = no cover photo. See [Storage](#storage). |
| `meal_types` | `text[]` not null default `'{}'`, check `meal_types <@ array['breakfast','lunch','snack','dinner','dessert']` — U-2 (#96); gin index `idx_recipes_meal_types` for slot filtering |
| `prep_time_minutes` | `integer` null, check `> 0` — minutes to prepare; null = no time recorded (R-33 wave 5) |
| `created_at` | `timestamptz` not null default `now()` |
| `updated_at` | `timestamptz` not null default `now()` |

`meal_types` tags a recipe with the meals it suits (U-2 #96, live); `save_recipe` carries it as the `p_meal_types` argument, and gained a trailing `p_prep_time_minutes` argument for the prep-time field (R-33 wave 5). R-36 dropped `instructions` (the old free-text steps column) — steps are now the structured `recipe_steps` child table below, and `save_recipe` takes `p_steps jsonb` instead of the old `p_instructions text`.

### `recipe_ingredients`

Join rows from a recipe to the shared ingredient library. Index `idx_recipe_ingredients_recipe` on `(recipe_id)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `recipe_id` | `uuid` not null, references `recipes(id)` on delete cascade |
| `ingredient_id` | `uuid` not null, references `ingredients(id)` **on delete restrict** |
| `quantity` | `numeric(8,2)` not null — grams or units per `ingredient.unit_type` |
| `per_serving` | `boolean` not null default false |
| `display_order` | `int` not null default 0 |
| `created_at` | `timestamptz` not null default `now()` |

`per_serving = true` means the quantity is added per serving served (e.g. rice in a curry) rather than scaled across servings.

### `recipe_steps` (R-36)

Ordered step text for a recipe — replaces the dropped `recipes.instructions` free-text column. Index `idx_recipe_steps_recipe` on `(recipe_id, display_order)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `recipe_id` | `uuid` not null, references `recipes(id)` on delete cascade |
| `display_order` | `integer` not null default 0 |
| `text` | `text` not null |
| `created_at` | `timestamptz` not null default `now()` |

`save_recipe` replace-children's this table alongside `recipe_ingredients` on every save (delete then reinsert from `p_steps`, ordered by the payload's `display_order`). Blank/whitespace-only steps are skipped at insert (D-F26) — dropped silently, not rejected — and `recipe_steps` starts empty for every existing recipe: R-36 did not migrate the old `instructions` text into steps (D-F25).

### `user_ingredient_refs` (R-01)

Per-user reference rows that compose the live Library model (see Library Contribution & Lifecycle Model). One row = one ingredient in a user's library; "my library" is the set of my reference rows. Private notes live here, never on the shared pool item — the structural PII firewall. `unique (user_id, ingredient_id)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `user_id` | `uuid` not null, references `auth.users(id)` on delete cascade |
| `ingredient_id` | `uuid` not null, references `ingredients(id)` on delete cascade |
| `note` | `text` null — private, per-user |
| `created_at` | `timestamptz` not null default `now()` |
| `updated_at` | `timestamptz` not null default `now()` |

### `user_recipe_refs` (R-01)

Per-user reference rows for recipes — the recipe-layer counterpart of `user_ingredient_refs`. One row = one recipe in a user's library; hide = delete the caller's reference row (`hide_owned_recipe`), the pooled recipe is untouched. `unique (user_id, recipe_id)`. `note` is live (R-36) — a private per-user note editable from the recipe detail page's notes card for any recipe in the caller's library, including recipes they did not create; read and written by a plain single-table `update … eq('recipe_id', …)`, not an RPC, since the table's own `auth.uid() = user_id` RLS already scopes it.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `user_id` | `uuid` not null, references `auth.users(id)` on delete cascade |
| `recipe_id` | `uuid` not null, references `recipes(id)` on delete cascade |
| `note` | `text` null — private, per-user |
| `created_at` | `timestamptz` not null default `now()` |
| `updated_at` | `timestamptz` not null default `now()` |

### `meal_logs` (Diario)

One row per logged food item per day. Index `idx_meal_logs_user_date` on `(user_id, logged_on desc)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `user_id` | `uuid` not null, references `profiles(id)` on delete cascade |
| `logged_on` | `date` not null |
| `meal_type` | `text`, check in (`'breakfast'`, `'lunch'`, `'snack'`, `'dinner'`, `'other'`) |
| `recipe_id` | `uuid`, references `recipes(id)` on delete set null |
| `ingredient_id` | `uuid`, references `ingredients(id)` on delete set null |
| `custom_name` | `text` (ad-hoc entries) |
| `servings` | `numeric(6,2)` (when `recipe_id` set) |
| `quantity` | `numeric(8,2)` (when `ingredient_id` set; g or units) |
| `custom_kcal` | `numeric(7,2)` |
| `custom_protein_g` | `numeric(6,2)` |
| `custom_carbs_g` | `numeric(6,2)` |
| `custom_fat_g` | `numeric(6,2)` |
| `custom_fiber_g` | `numeric(6,2)` |
| `custom_sugar_g` | `numeric(6,2)` — U-1 sub-macro of carbs |
| `custom_saturated_fat_g` | `numeric(6,2)` — U-1 sub-macro of fat |
| `from_plan` | `boolean` not null default false — marks entries auto-materialized from the active plan |
| `plan_week_slot_id` | `uuid`, references `meal_plan_week_slots(id)` on delete set null |
| `notes` | `text` |
| `created_at` | `timestamptz` not null default `now()` |

Constraint `meal_log_one_source` enforces exactly one of `recipe_id` / `ingredient_id` / `custom_name`. Partial unique index `meal_logs_user_plan_slot_uidx` on `(user_id, plan_week_slot_id) where plan_week_slot_id is not null` gives plan-materialization DB-level idempotency.

R-12 / D-D6 is live in prod (since 2026-05-18): the `materialize_plan_for_date` SECURITY INVOKER RPC (`ON CONFLICT DO NOTHING` on the index above → idempotency; `date <= today` Europe/Madrid guard) replaced the prior app-level read-then-write dedup that was hand-mirrored across client and edge. The migration was applied, then the calling-code PR merged (the code depends on the RPC existing first).

### `goals`

One row per user (primary key is `user_id`).

| Column | Type / constraint |
|---|---|
| `user_id` | `uuid` primary key, references `profiles(id)` on delete cascade |
| `target_body_fat_pct` | `numeric(4,2)` not null default 20 |
| `notes` | `text` |
| `updated_at` | `timestamptz` not null default `now()` |

### `phases`

Time-boxed dietary period (cut / maintenance / bulk). Index `idx_phases_user_active` on `(user_id, start_date desc)` where `end_date is null`. An `EXCLUDE USING gist` constraint over `user_id` and `daterange(start_date, coalesce(end_date, 'infinity'), '[]')` prevents overlapping phases per user.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `user_id` | `uuid` not null, references `profiles(id)` on delete cascade |
| `name` | `text` not null |
| `phase_type` | `text` not null, check in (`'cut'`, `'maintenance'`, `'bulk'`) |
| `start_date` | `date` not null |
| `end_date` | `date` (null = ongoing/active) |
| `kcal_mode` | `text` not null, check in (`'absolute'`, `'tdee_delta'`) |
| `kcal_value` | `numeric(6,1)` not null (absolute kcal or signed delta) |
| `protein_g_per_kg` | `numeric(4,2)` not null default 1.80 |
| `fat_pct_of_kcal` | `numeric(4,3)` not null default 0.250 — stored as a fraction (0.10–0.60), not a percent |
| `fiber_mode` | `text` not null default `'per_1000_kcal'`, check in (`'fixed_g'`, `'per_1000_kcal'`) |
| `fiber_value` | `numeric(5,2)` not null default 14 |
| `notes` | `text` |
| `created_at` | `timestamptz` not null default `now()` |

### `meal_plan_templates`

Named, reusable menus. `unique (user_id, name)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `user_id` | `uuid` not null, references `profiles(id)` on delete cascade |
| `name` | `text` not null |
| `same_schedule_all_days` | `boolean` not null default true |
| `default_meal_times` | `time[]` not null default `array['08:00','13:00','17:00','21:00']::time[]` |
| `is_auto_generated` | `boolean` not null default false (true when created from a divergent week at rollover) |
| `phase_type` | `text` null, check in (`'cut'`, `'maintenance'`, `'bulk'`) — R-33 wave 4; a loose phase label (no FK to `phases`); null = serves any phase |
| `notes` | `text` |
| `created_at` | `timestamptz` not null default `now()` |
| `updated_at` | `timestamptz` not null default `now()` |

`phase_type` tags the template with the phase it was written for (R-33 wave 4); both `save_template` and `save_week_as_template` gained a trailing `p_phase_type` argument to carry it.

### `meal_plan_template_day_times`

Per-day meal-time overrides for a template. `unique (template_id, day_of_week)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `template_id` | `uuid` not null, references `meal_plan_templates(id)` on delete cascade |
| `day_of_week` | `int` not null, check between 0 and 6 (0 = Monday, ISO) |
| `meal_times` | `time[]` not null (length = number of meals that day) |

### `meal_plan_template_slots`

Recipes assigned to each meal slot in a template (multiple recipes per slot allowed). Index `idx_template_slots` on `(template_id, day_of_week, meal_index)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `template_id` | `uuid` not null, references `meal_plan_templates(id)` on delete cascade |
| `day_of_week` | `int` not null, check between 0 and 6 |
| `meal_index` | `int` not null, check `>= 0` (position within the day) |
| `recipe_id` | `uuid` not null, references `recipes(id)` on delete restrict |
| `servings` | `numeric(5,2)` not null default 1, check `servings > 0` |
| `display_order` | `int` not null default 0 |
| `created_at` | `timestamptz` not null default `now()` |

### `meal_plan_weeks`

The active dynamic week. `unique (user_id, week_start)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `user_id` | `uuid` not null, references `profiles(id)` on delete cascade |
| `week_start` | `date` not null (Monday of the week) |
| `source_template_id` | `uuid`, references `meal_plan_templates(id)` on delete set null |
| `has_diverged` | `boolean` not null default false (true when slots edited away from the template) |
| `created_at` | `timestamptz` not null default `now()` |
| `updated_at` | `timestamptz` not null default `now()` |

### `meal_plan_week_slots`

Slots inside the dynamic week (per-date, editable). Index `idx_plan_week_slots` on `(plan_week_id, date, meal_index)`. The trigger `trg_mark_week_diverged` (function `mark_week_diverged`) flips the parent week's `has_diverged = true` on any insert/update/delete of a slot whose `date >= current_date`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `plan_week_id` | `uuid` not null, references `meal_plan_weeks(id)` on delete cascade |
| `date` | `date` not null |
| `meal_index` | `int` not null, check `>= 0` |
| `meal_time` | `time` (resolved at generation time) |
| `recipe_id` | `uuid` not null, references `recipes(id)` on delete restrict |
| `servings` | `numeric(5,2)` not null default 1, check `servings > 0` |
| `display_order` | `int` not null default 0 |
| `created_at` | `timestamptz` not null default `now()` |

### `daily_nutrition_history`

Daily snapshot of planned vs. consumed macros, computed by the `daily-nutrition-snapshot` Edge Function. Primary key `(user_id, logged_on)`. Index `idx_daily_history_user` on `(user_id, logged_on desc)`.

| Column | Type / constraint |
|---|---|
| `user_id` | `uuid` not null, references `profiles(id)` on delete cascade |
| `logged_on` | `date` not null |
| `planned_kcal` | `numeric(7,1)` |
| `planned_protein_g` | `numeric(6,2)` |
| `planned_carbs_g` | `numeric(6,2)` |
| `planned_fat_g` | `numeric(6,2)` |
| `planned_fiber_g` | `numeric(6,2)` |
| `planned_sugar_g` | `numeric(6,2)` — U-1 |
| `planned_saturated_fat_g` | `numeric(6,2)` — U-1 |
| `consumed_kcal` | `numeric(7,1)` |
| `consumed_protein_g` | `numeric(6,2)` |
| `consumed_carbs_g` | `numeric(6,2)` |
| `consumed_fat_g` | `numeric(6,2)` |
| `consumed_fiber_g` | `numeric(6,2)` |
| `consumed_sugar_g` | `numeric(6,2)` — U-1 |
| `consumed_saturated_fat_g` | `numeric(6,2)` — U-1 |
| `planned_sugar_complete` | `boolean` not null default false — U-1 data-completeness flag |
| `planned_saturated_fat_complete` | `boolean` not null default false — U-1 data-completeness flag |
| `consumed_sugar_complete` | `boolean` not null default false — U-1 data-completeness flag |
| `consumed_saturated_fat_complete` | `boolean` not null default false — U-1 data-completeness flag |
| `had_active_plan` | `boolean` not null default false |
| `computed_at` | `timestamptz` not null default `now()` |

### `tdee_estimates`

Emitted adaptive-TDEE series, upserted daily by the `recalculate-tdee` Edge Function (per-user persistent filter state lives in `tdee_state`). Index `idx_tdee_user_date` on `(user_id, computed_on desc)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `user_id` | `uuid` not null, references `profiles(id)` on delete cascade |
| `computed_on` | `date` not null |
| `window_days` | `int` not null |
| `avg_kcal_intake` | `numeric(7,1)` not null |
| `weight_delta_kg` | `numeric(5,2)` not null |
| `estimated_tdee_kcal` | `numeric(7,1)` not null (empirical total) |
| `created_at` | `timestamptz` not null default `now()` |
| `confidence` | `text` (variance-derived UI band: `low`/`medium`/`high`; enum lives in `src/core/tdee.ts`, not a DB CHECK) |
| `is_warmup` | `boolean` not null default false (cold-start/long-gap warm-up flag) |

The `confidence` and `is_warmup` columns were added 2026-05-18 (R-07 / D-B4) for the adaptive Kalman estimator (Sprint-17 reader contract unchanged — additive only). Four dead always-null energy-breakdown columns — `bmr_kcal`, `activity_kcal`, `neat_residual_kcal`, `workout_kcal_logged` (§6.4 scaffolding on the replaced two-endpoint model, never written by `recalculate-tdee`) — were dropped the same day (R-08 / D-B5), code/types-first then the prod `DROP COLUMN`. BMR is now a derived, never-stored display (`estimatedBmr` in `src/lib/macros.ts`, surfaced on `/progress`); any future expenditure decomposition is owned by the R-07 adaptive-TDEE spec.

### `tdee_state`

Per-user persistent adaptive-filter memory (one row per user; upserted daily by `recalculate-tdee`). Holds the 2-state Kalman filter — trend weight + expenditure — and its 2×2 covariance stored as 3 free scalars. Added 2026-05-18 (R-07 / D-B4).

| Column | Type / constraint |
|---|---|
| `user_id` | `uuid` primary key, references `profiles(id)` on delete cascade |
| `trend_weight_kg` | `numeric` not null |
| `expenditure_kcal` | `numeric` not null |
| `cov_ww` | `numeric` not null |
| `cov_we` | `numeric` not null |
| `cov_ee` | `numeric` not null |
| `observations_count` | `integer` not null default 0 |
| `last_updated_on` | `date` not null |
| `created_at` | `timestamptz` not null default `now()` |
| `updated_at` | `timestamptz` not null default `now()` |

Standard per-user RLS (the four `auth.uid() = user_id` policies); the edge function writes via the service role (RLS-bypassing).

### `exercises` (shared pool — R-19, applied 2026-05-21)

Shared pool of exercises following the post-R-01 ingredient-pool shape: `created_by_user_id = null` = immutable system seed; a real user id = user-contributed; creator-hide just drops your reference row and keeps ownership (R-25; same pattern as `ingredients`). Bilingual names with trigram indexes for search.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `name_es` | `text` not null — primary Spanish name |
| `name_en` | `text` null — optional English name |
| `primary_muscles` | `text[]` not null default `'{}'` — one or more fine muscle codes; validated by `trg_validate_exercise_muscles` against `muscles.code` (R-26 / D-F11, #155). An exercise may have **multiple** primary movers. |
| `secondary_muscles` | `text[]` not null default `'{}'` — fine muscle codes from the 24-code taxonomy; validated by `trg_validate_exercise_muscles` against `muscles.code WHERE NOT is_full_body` (`full_body` is **not** a valid secondary). |
| `equipment` | `text` null, check in (`'barbell'`, `'dumbbell'`, `'kettlebell'`, `'ez_curl_bar'`, `'machine'`, `'cable'`, `'bodyweight'`, `'band'`, `'medicine_ball'`, `'exercise_ball'`, `'foam_roller'`, `'other'`) — widened 8 → 12 by B1 (#158) |
| `default_increment_kg` | `numeric` null, check `> 0` — used by the double-progression coach rule |
| `level` | `text` null, check in (`'beginner'`, `'intermediate'`, `'expert'`) — free-exercise-db difficulty (B1 #158) |
| `mechanic` | `text` null, check in (`'compound'`, `'isolation'`) — B1 #158 |
| `force` | `text` null, check in (`'push'`, `'pull'`, `'static'`) — B1 #158 |
| `category` | `text` null, check in (`'strength'`, `'stretching'`, `'plyometrics'`, `'powerlifting'`, `'olympic weightlifting'`, `'strongman'`, `'cardio'`) — B1 #158 |
| `images` | `text[]` not null default `'{}'` — relative image paths from the catalog import (B1 #158) |
| `external_id` | `text` null — import idempotency key; partial unique index `idx_exercises_external_id` where `external_id is not null` (manual/system rows keep it null) (B1 #158) |
| `instructions_en` | `text[]` not null default `'{}'` — ordered step list; `instructions_es[i]` translates `instructions_en[i]`, equal length per row (B2a #164) |
| `instructions_es` | `text[]` not null default `'{}'` — Spanish parallel of `instructions_en` (B2a #164) |
| `is_verified` | `boolean` not null default false |
| `created_by_user_id` | `uuid` null, references `auth.users(id)` on delete set null |
| `source` | `text` not null default `'manual'`, check in (`'manual'`, `'system'`, `'free-exercise-db'`) — `'free-exercise-db'` added by B1 (#158) for import provenance |
| `created_at` | `timestamptz` not null default `now()` |
| `updated_at` | `timestamptz` not null default `now()` |

Trigram indexes `idx_exercises_name_es_trgm` (gin on `name_es`) and `idx_exercises_name_en_trgm` (gin on `name_en` where not null). Now ships with **~907 exercises**: the 34 Training-MVP system seeds (applied 2026-05-21) plus the 873-row free-exercise-db catalog ingested by Project B1 (#158, `source = 'free-exercise-db'`), with bilingual step-by-step instructions backfilled by Project B2a (#164). Released to main (tags v2026-06-07-exercise-catalog, v2026-06-08-exercise-browse).

**Fine muscle taxonomy (R-26 / D-F11, #155).** The legacy singular `primary_muscle` column (coarse-12 inline CHECK) was **dropped** by `20260604120000_fine_muscle_taxonomy` and replaced by `primary_muscles text[]` (multiple primaries). The old inline CHECK constraints `exercises_primary_muscle_check` and `exercises_secondary_muscles_valid` were both dropped: a CHECK constraint cannot reference another table, so validation moved to the trigger `trg_validate_exercise_muscles` → function `public.validate_exercise_muscles()` (`SECURITY INVOKER`, `set search_path = public`), which asserts `primary_muscles ⊆ muscles.code` and `secondary_muscles ⊆ muscles.code WHERE NOT is_full_body`. Both columns now carry **fine** codes from the 24-code taxonomy (see `muscles`); the same codes drive the muscle-activity heatmap (`src/core/muscleVolume.ts`): each primary mover earns 1.0 per working set (stimulus is **not** conserved across a set — multiple primaries each count 1.0) and each secondary earns `SECONDARY_SET_WEIGHT = 0.5`; warm-ups are excluded and `full_body` is footnoted, never shaded.

Because the app has no production users yet, #155 re-tagged all 34 system-seed rows to fine codes in place with no backfill; the follow-up migration `20260604130000_fine_taxonomy_retag_review_fixes.sql` corrected 3 rows after an expert anatomical review (Deadlift → `hamstrings` promoted to primary; Kettlebell swing → `+forearms` secondary; Overhead press → `+trap` secondary). The earlier coarse-12 F-4 retag (`20260530120000_f4_secondary_muscles`, applied 2026-05-26, when `secondary_muscles` was first added) is now historical.

### `muscles` (read-only reference dictionary — R-26 / D-F11, #155)

The structural source of the fine muscle taxonomy: 25 seed rows = 24 shadeable fine codes + `full_body`. Read-only reference data, mirrors `src/core/muscles.ts` (the canonical TS structural source); a pgTAP anti-drift test (`supabase/tests/05_muscles.test.sql`) guards the two against drift. The 24 shadeable codes span 6 groups: `shoulders` (`delt_front`, `delt_side`, `delt_rear`); `chest` (`pec_upper`, `pec_lower`); `back` (`lat`, `trap`, `rhomboids`, `lower_back`, `neck`); `arms` (`biceps`, `tri_long`, `tri_lateral`, `forearms`); `core` (`abs_upper`, `abs_lower`, `obliques`); `legs` (`quads`, `hamstrings`, `glutes`, `adductors`, `calves`, `tibialis`, `abductors`). `neck` (back) and `abductors` (legs) were added by Project B1 (#158, commit `771450b`); `abductors` shares the `gluteal` `body_region_slug` with `glutes`, so the gluteal region co-shades both fine codes under the current vendored art. `full_body` is special — footnoted, never shades, not a valid secondary.

| Column | Type / constraint |
|---|---|
| `code` | `text` primary key — fine muscle code |
| `muscle_group` | `text` not null, check in (`'shoulders'`, `'chest'`, `'back'`, `'arms'`, `'core'`, `'legs'`, `'full_body'`) |
| `body_region_slug` | `text` nullable — body-art region the code co-shades into (see `codesForBodyRegion` in `src/core/muscles.ts`); null only for `full_body`, which never shades |
| `display_order` | `int` not null |
| `is_full_body` | `boolean` not null default false |

### `workout_sessions` (R-19, applied 2026-05-21; extended by F-2, live in prod #122 / v2026-06-03)

One row per logged workout session. Multiple sessions per day are allowed (no unique on `(user_id, performed_on)`). Index `idx_workout_sessions_user_date` on `(user_id, performed_on desc)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `user_id` | `uuid` not null, references `auth.users(id)` on delete cascade |
| `performed_on` | `date` not null default `current_date` |
| `title` | `text` null |
| `notes` | `text` null |
| `program_id` | `uuid` null, references `programs(id)` on delete set null — F-2 provenance stamp; null = ad-hoc session |
| `routine_id` | `uuid` null, references `routines(id)` on delete set null — F-2 provenance stamp; null = ad-hoc session |
| `created_at` | `timestamptz` not null default `now()` |
| `updated_at` | `timestamptz` not null default `now()` |

The two provenance columns (`program_id`, `routine_id`) are nullable F-2 additions (live in prod, `20260528120020_f2_workout_session_stamps.sql`, #122 / v2026-06-03). `ON DELETE SET NULL` ensures a logged session survives the deletion of the routine or program that spawned it. Index `idx_workout_sessions_program` on `(program_id) where program_id is not null`.

### `workout_sets` (R-19, applied 2026-05-21)

Child rows of `workout_sessions` (one row per set logged). No `user_id` column — RLS routes through the parent session via an `exists` subquery (mirrors the `recipe_ingredients → recipes` policy shape). `exercise_id` is `ON DELETE RESTRICT` so a historical set can never silently lose its exercise reference. `unique (session_id, exercise_id, set_index)` makes the `save_workout` replace-children RPC race-safe. Index `idx_workout_sets_session` on `(session_id)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `session_id` | `uuid` not null, references `workout_sessions(id)` on delete cascade |
| `exercise_id` | `uuid` not null, references `exercises(id)` on delete restrict |
| `set_index` | `integer` not null, check `>= 1` — per-session-per-exercise ordinal |
| `reps` | `integer` not null, check `>= 0` |
| `weight_kg` | `numeric(8,2)` not null, check `>= 0` |
| `rpe` | `numeric(3,1)` null, check between 6.0 and 10.0 in 0.5 steps (the DB still permits halves; **the app enforces whole numbers only** since F-3 — integers are a subset, so no migration — see D-F9d) |
| `is_warmup` | `boolean` not null default false |
| `created_at` | `timestamptz` not null default `now()` |

### `routines` (F-2, live in prod #122 / v2026-06-03)

User-owned, reusable exercise templates. A routine is a named list of exercise slots with target sets/reps/RPE/rest. It can be referenced by many program days. Index `idx_routines_user` on `(user_id, updated_at desc)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `user_id` | `uuid` not null, references `auth.users(id)` on delete cascade |
| `name` | `text` not null |
| `notes` | `text` null |
| `created_at` | `timestamptz` not null default `now()` |
| `updated_at` | `timestamptz` not null default `now()` |

### `routine_exercises` (F-2, live in prod #122 / v2026-06-03)

Child rows of `routines` — one row per exercise slot in the routine. Ordered by `position` (unique per routine). `exercise_id` is `ON DELETE RESTRICT` to preserve routine integrity. RLS routes through the parent routine via an `exists` subquery (same pattern as `workout_sets`). UPDATE policy carries both `using` and `with check`. Index `idx_routine_exercises_routine` on `(routine_id)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `routine_id` | `uuid` not null, references `routines(id)` on delete cascade |
| `exercise_id` | `uuid` not null, references `exercises(id)` on delete restrict |
| `position` | `int` not null, check `>= 1` — display/execution order; `unique (routine_id, position)` |
| `target_sets` | `int` not null, check `> 0` |
| `target_reps_min` | `int` not null, check `> 0` |
| `target_reps_max` | `int` not null, check `>= target_reps_min` |
| `rest_seconds` | `int` null, check `>= 0` when set |
| `target_rpe` | `numeric` null, check between 6.0 and 10.0 in 0.5 steps when set (DB permits halves; **routine builder + zod enforce whole numbers** since F-3 — see D-F9d) |
| `warmup_sets` | `jsonb` not null default `'[]'`, check `jsonb_typeof(warmup_sets) = 'array'` — F-2b (#128), live; per-slot warm-up prescriptions |

### `programs` (F-2, live in prod #122 / v2026-06-03)

User-owned training programs (cycles). Each program is a named, ordered list of day slots referencing routines. A program that is `is_active = true` must have an `anchor_date` (enforced by a check constraint). Partial unique index `programs_one_active_uidx` on `(user_id) WHERE is_active` — at most one active program per user at the DB level (D-F8). Index `idx_programs_user` on `(user_id, updated_at desc)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `user_id` | `uuid` not null, references `auth.users(id)` on delete cascade |
| `name` | `text` not null |
| `is_active` | `boolean` not null default false |
| `anchor_date` | `date` null — calendar date corresponding to `day_index = 0`; required when `is_active = true` |
| `created_at` | `timestamptz` not null default `now()` |
| `updated_at` | `timestamptz` not null default `now()` |

Check constraint: `not is_active or anchor_date is not null`.

### `program_days` (F-2, live in prod #122 / v2026-06-03)

Child rows of `programs` — one row per day in the cycle, identified by `day_index` (0-based, unique per program). A rest day has `is_rest = true` and `routine_id = null`; a training day has `is_rest = false` and a non-null `routine_id`. The check constraint enforces the mutual exclusion. `routine_id` is `ON DELETE RESTRICT` so a routine cannot be deleted while a program references it. RLS routes through the parent program via an `exists` subquery. UPDATE policy carries both `using` and `with check`. Index `idx_program_days_program` on `(program_id, day_index)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `program_id` | `uuid` not null, references `programs(id)` on delete cascade |
| `day_index` | `int` not null, check `>= 0` — 0-based position; `unique (program_id, day_index)` |
| `is_rest` | `boolean` not null default false |
| `routine_id` | `uuid` null, references `routines(id)` on delete restrict — null iff `is_rest = true` |

Check constraint: `(is_rest and routine_id is null) or (not is_rest and routine_id is not null)`.

## Row-Level Security

Every table is RLS-enabled.

**UPDATE policies and `WITH CHECK`.** Under Postgres, an UPDATE policy with no
`WITH CHECK` applies its `USING` expression to the new row as well — an absent
clause is not an open door. Every UPDATE policy in `public` nonetheless carries
both clauses, written identically (`20260719120000_r22_update_with_check`): the
pair states the intent, and it means a future edit that narrows `USING` cannot
silently stop covering the new row. A pgTAP assertion over `pg_policies` keeps
it that way.

**Standard per-user pattern.** Most tables hold data owned by exactly one user and carry the four-policy set: SELECT / INSERT / UPDATE / DELETE all gated on `auth.uid() = user_id` (`with check` on INSERT, `using` on the rest). Applied to: `body_measurements`, `user_ingredient_refs`, `user_recipe_refs`, `meal_logs`, `goals`, `phases`, `meal_plan_templates`, `meal_plan_template_day_times`, `meal_plan_template_slots` (via join to `meal_plan_templates`), `meal_plan_weeks`, `meal_plan_week_slots` (via join to `meal_plan_weeks`), `daily_nutrition_history`, `tdee_estimates`, `tdee_state`, `workout_sessions`, `routines`, `programs`.

**`profiles` (same shape, keyed on `id`).** `profiles` has no `user_id` column — the row *is* the user, so its four policies gate on `auth.uid() = id` (the PK) instead.

**RLS-via-parent-join pattern.** Child tables with no `user_id` column inherit authorization by joining to their parent: `workout_sets` (via `workout_sessions`), `routine_exercises` (via `routines`), `program_days` (via `programs`). Each carries SELECT / INSERT / UPDATE / DELETE policies using an `exists` subquery that checks the parent's `user_id = auth.uid()`. As with every other table, the UPDATE policies on all three carry both `using` and `with check`, written identically.

**`ingredients` (shared library).** Different shape (see D-A1):
- SELECT: any authenticated user reads the entire library (`using (true)`).
- INSERT: any authenticated user, must mark themselves as creator (`with check (auth.uid() = created_by_user_id)`).
- UPDATE: only the creator (`using` + `with check` on `auth.uid() = created_by_user_id`). System seeds (`created_by_user_id IS NULL`) are effectively immutable.
- DELETE: only the creator (`using (auth.uid() = created_by_user_id)`). The FK from `recipe_ingredients` is `ON DELETE RESTRICT`, which additionally blocks deletion if any user's recipe references the ingredient.

Reversibility escape-hatch (D-A1): the open-SELECT model can later be tightened to `created_by_user_id = auth.uid() OR created_by_user_id IS NULL` with no schema change if the library ever needs privacy.

**`recipes` (shared pool).** Same shape as `ingredients` — R-01 reclassified recipes as a shared pool (see Library Contribution & Lifecycle Model):
- SELECT: any authenticated user reads the whole pool (`using (true)`, policy `"Recipes pool readable"`).
- INSERT: self-tagged (`with check (auth.uid() = created_by_user_id)`).
- UPDATE / DELETE: real-owner only — the predicate `auth.uid() = created_by_user_id AND created_by_user_id IS NOT NULL AND created_by_user_id <> LIBRARY_ANON_OWNER_ID` (anon-sentinel + null-seed write exclusions), so anonymized (creator-hidden) rows match no write policy and are never re-owned.

**`recipe_ingredients` (shared-pool child, via join to `recipes`).** SELECT opens to all authenticated (`using (true)`, policy `"Recipe ingredients pool readable"`) so any recipe's lines render (essential for anon-owned recipes in the diary); INSERT / UPDATE / DELETE stay owner-gated via an `exists` subquery on the parent recipe's real-owner predicate (same anon-sentinel + null-seed exclusions).

**`recipe_steps` (shared-pool child, via join to `recipes`; R-36).** Same shape as `recipe_ingredients`: SELECT opens to all authenticated (`using (true)`, policy `"Recipe steps pool readable"`); INSERT / DELETE are owner-gated via an `exists` subquery on the parent recipe's real-owner predicate (same anon-sentinel + null-seed exclusions). The UPDATE policy carries both `using` and `with check`, written with identical expressions — see the WITH CHECK note under Row-Level Security above.

**`muscles` (read-only reference table).** A single SELECT policy `muscles_select_all` (`using (true)`) — any authenticated user reads the whole dictionary. No INSERT / UPDATE / DELETE policy: the seed data is effectively immutable to all app roles (R-26 / D-F11).

The repo is public, so RLS is the sole security boundary — there is no server-side application tier in front of the database.

## RPCs

User-facing RPCs, all `SECURITY INVOKER`, most of them atomic across multiple tables (the few single-table ones are flagged as such below). Search-path pinning is not uniform: most set `search_path = public`, but several — including both `save_recipe` (R-36) and earlier ones (`save_recipe_ref`, `u2_recipe_meal_types`, `r33_template_phase`, `r33_recipe_prep_time`, the R-00 baseline set) — use the stricter `set search_path to ''` with every table reference fully qualified (`public.recipes`, not `recipes`). Both styles are INVOKER-safe; the empty-path form is pre-existing drift from the nominal convention below, not a R-36 regression.

**Nutrition / meal planning (live in prod):**
- `save_recipe` — create-or-replace a recipe with its ingredients and steps (replace-children on both `recipe_ingredients` and `recipe_steps`). Still 8 args; R-36 dropped `p_instructions text` and added `p_steps jsonb` in its place (old signature explicitly `drop function`-ed first, since the arg-list change would otherwise register an ambiguous overload). INVOKER.
- `save_template`
- `apply_template_to_week`
- `save_week_as_template`
- `copy_week_meal` (U-6) — copy one planned meal onto other days of the active week (atomic multi-row delete-then-insert across N target dates on `meal_plan_week_slots`; single-table, chosen for atomicity over a two-round-trip client delete+insert)
- `materialize_plan_for_date` (R-12 / D-D6)

**Library lifecycle (R-01, narrowed by R-25):**
- `hide_owned_recipe` / `hide_owned_ingredient` — drop the caller's reference row for a pooled item (see the Library model, point 3). Single-table since R-25 removed the hide→anon ownership transfer, so they no longer *need* to be RPCs; kept anyway for a stable client API surface. INVOKER.

**Training MVP (R-19, live in prod since 2026-05-21):**
- `save_workout` — create-or-replace a workout session and its sets (5 args); extended to 7 args by F-2 to accept two nullable provenance stamps (`p_program_id`, `p_routine_id` — both `DEFAULT NULL`; null = ad-hoc). The 5-arg overload was dropped and replaced by the 7-arg signature in `20260528120030_f2_rpcs.sql` (live in prod #122 / v2026-06-03).

**Training Routines & Cyclic Planner (F-2, live in prod #122 / v2026-06-03):**
- `save_routine` — create-or-replace a routine and its exercise slots (replace-children, mirrors `save_recipe`). INVOKER.
- `save_program` — create-or-replace a program and its day slots (replace-children). Does NOT touch `is_active` or `anchor_date` — those are owned by `set_active_program`. INVOKER.
- `set_active_program` — atomic active-flip: deactivates all other programs for the user then activates the target with the given `anchor_date`. Kept as an RPC (rather than client-side) because the two `UPDATE`s must be atomic with respect to the `programs_one_active_uidx` partial unique index — a gap between two client-side statements would transiently violate the constraint (D-F8). INVOKER.

Four sanctioned `SECURITY DEFINER` functions — the only ones in the schema. Two are RPCs:
1. `public.apply_template_to_week_admin` (Sprint 9) — the cron-only admin variant of `apply_template_to_week`; takes `p_user_id` explicitly instead of reading `auth.uid()`, so it needs definer rights to write meal-plan weeks *across* users on behalf of scheduled jobs. Granted to `service_role` only (`revoke all … from public, anon, authenticated`).
2. `public.reconcile_account_delete` (R-01) — account-delete reconciliation, called by the `delete-account` edge function with the service-role client. Definer because the auth user is about to be deleted (there is no invoker identity left to authorize against) and the erase-refs + reassign-to-anon-sentinel work must span `user_*_refs`, `ingredients` and `recipes` atomically. Granted to no app-facing role.

The other two are not RPCs and are never called by the client:
3. `public.handle_new_user()` (R-00 baseline) — the `on_auth_user_created` trigger on `auth.users`. Definer because the trigger fires as the signup path's role, which has no rights on `public.profiles`; it inserts the new user's profile row (`on conflict (id) do nothing`).
4. `private.invoke_edge_function(text)` (Sprint 9) — the cron helper that reads `cron_service_role_key` from `vault.decrypted_secrets` and POSTs to the edge function via `pg_net`. Definer because the `pg_cron` job role must not itself hold read access to Vault; it lives in the non-exposed `private` schema (`revoke all on schema private from public`).

All four pin `set search_path` (`'public'` on `handle_new_user`, `''` on the rest) and fully qualify every table, so none is schema-hijackable.

Invariant (D-C5): any operation that mutates more than one table atomically MUST be an RPC. Single-table mutations stay client-side. All user-callable RPCs must be `SECURITY INVOKER` with `set search_path = public`. `SECURITY DEFINER` is forbidden without explicit security review and a non-`public` schema home; the documented exceptions are the four enumerated above.

`materialize_plan_for_date` (R-12 / D-D6): `SECURITY INVOKER`, `set search_path = public`, in-RPC `date <= today` Europe/Madrid guard, backed by the partial unique index `meal_logs_user_plan_slot_uidx` with `INSERT … ON CONFLICT DO NOTHING`. It replaced the hand-mirrored client/edge materialization copies (single source = the RPC). Live in prod since 2026-05-18 (migration applied, then the calling-code PR merged).

## Views

`body_measurements_smoothed` — selects all of `body_measurements` plus `weight_kg_5day_avg`, a window average of `weight_kg` over `rows between 4 preceding and current row`, partitioned by `user_id` ordered by `measured_on`.

## Extensions

Installed in the `extensions` schema (not `public`):
- `uuid-ossp` — UUID generation; installed by the R-00 baseline as part of the standard Supabase set.
- `pgcrypto` — crypto/digest primitives; installed by the R-00 baseline alongside `uuid-ossp`.
- `pg_trgm` — fuzzy ingredient text search (gin trigram indexes on `ingredients.name` / `ingredients.brand`).
- `btree_gist` — backs the non-overlapping phase date-range constraint via `EXCLUDE USING gist` on `phases`.
- `pg_net` — async HTTP from inside Postgres; the `net.http_post` that `private.invoke_edge_function` fires at the edge functions (Sprint 9).

`pg_cron` is the one exception to the schema rule: it is not relocatable, so it installs into its own `cron` schema. It is what schedules the Sprint-9 jobs, the R-18 healthcheck and the R-36b orphan-photo reaper — see `operations.md` for the job inventory.

## Storage

The app's first use of Supabase Storage (R-36b). One bucket, `recipe-photos` — **public**, `file_size_limit` 2 MB, `allowed_mime_types = {image/webp}` (the client only ever uploads WebP; the bucket rejects anything else as a bug or abuse rather than storing it). Objects are keyed `<recipe_id>/full.webp` and `<recipe_id>/thumb.webp` — stable paths, so replacing a photo overwrites in place instead of orphaning the old one. Migration `supabase/migrations/20260720120000_r36b_recipe_photos_bucket.sql`.

RLS on `storage.objects` (a different table from anything in `public`, gated the same way):
- **SELECT** — permissive across the bucket, for every `authenticated` user: `bucket_id = 'recipe-photos'`, nothing else. Not a convenience: Postgres applies SELECT policies to `update`, `delete` and `insert … on conflict do update` too, so without one the storage API's upsert cannot see the row it is replacing and a delete matches zero rows while still reporting success — i.e. the write policies below would be unreachable. The grant is scoped to this bucket and gives away only object metadata (path, size, mime, timestamps) for objects the CDN already serves to anyone with the URL, all of them under `<recipe_id>/` prefixes for recipes every authenticated user can already read from `public.recipes`.
- **INSERT / UPDATE / DELETE** — real-creator only, same predicate shape as `recipe_ingredients` / `recipe_steps`: the path's first folder is joined back to `public.recipes`, requiring `r.created_by_user_id = auth.uid()` and excluding both a null creator (system seed) and the `LIBRARY_ANON_OWNER_ID` sentinel (creator-hidden rows). The UPDATE policy carries both `using` and `with check`, written identically (same R-22 convention as the table RLS above). The folder→`uuid` cast goes through a `case` guard on the uuid shape, so a malformed path denies with `42501` instead of raising `22P02`.

`recipes.photo_url` holds this bucket's object path (`<recipe_id>/full.webp`), not a URL — see the `recipes` table above. The app derives the public URL client-side via `storage.from('recipe-photos').getPublicUrl(...)`; both keys are re-derived from the recipe id (`photo_url` is read as a presence flag), and a URL-encoded `?v=<updated_at>` busts the CDN cache after a replace. `updated_at` is bumped by the same single-table update that writes `photo_url` — there is no `updated_at` trigger in the schema, so nothing moves it implicitly, and the object key is stable, so without that bump a replaced photo would keep serving the old bytes. The only other writer is `save_recipe`, which sets `updated_at = now()` on every edit; that is harmless (a stale token is the failure mode, a fresh one is not).

## Library Contribution & Lifecycle Model
<a id="library-model"></a>

This is the live model for `ingredients` and `recipes` as of the R-01 Phase 1 apply (2026-05-20). Phase 2 (the auto-reaper) is **cancelled** (2026-06-03) — see point 7 below and `roadmap.md` R-01.

1. **Pool + reference.** `ingredients` and `recipes` become shared-pool entities from creation. Creating one inserts a pool item **and** a per-user *reference* row for the creator. "My library" = the set of my reference rows. Discovery = search the whole pool; adding a found item to my library = create a reference.
2. **Private notes on the reference only.** Per-user notes live on the reference row, never on the pooled item. This is the structural PII firewall — personal data physically cannot enter the shared pool.
3. **No user hard-delete.** "Delete" = hide = remove your reference (and its private note). The pooled item is untouched — including its ownership: the creator keeps it (R-25). `hide_owned_recipe` / `hide_owned_ingredient` are a single-table delete of the caller's reference row.
4. **The anon sentinel** is a fixed seeded `auth.users`/profile row used to anonymize pool ownership. It is reached **only via account deletion** (point 8) — *not* via hide (R-25 removed the hide→anon transfer, which only ever served the now-cancelled Phase-2 reaper and was blocked by the pool UPDATE RLS anyway). **Never `null`**: for `ingredients`, `created_by_user_id = null` already means "immutable system seed," so the anon owner is a distinct sentinel id.
5. **Item name is public from creation** — a UX/labeling concern only. The create form must state the item is contributed to the shared library; private content goes in notes, not the title.
6. **No adoption / claim / fork.** Anon-owned items are never re-owned or user-edited.
7. **Auto-GC (Phase 2) — cancelled (2026-06-03).** No auto-reaper will be built. Anon-owned, zero-reference rows (now produced only by account deletions) are tolerated pool clutter, cleaned by manual SQL if they ever matter. The never-orphan-dependent-data invariant is held by `recipe_ingredients ON DELETE RESTRICT` + the no-hard-delete model alone; duplicate/bad items (D-A4) are better prevented at insert time (trigram warning) than reaped. See `roadmap.md` R-01.
8. **GDPR account-delete reconciliation.** On account delete, hard-delete the user's reference rows (genuine erasure of personal notes) and reassign any still-owned pool items to the reserved anon id (anonymized retention of objective shared data). Replaces blanket CASCADE for `ingredients` + `recipes` in the `delete-account` edge function.

**Phasing.** Phase 1 (own migration sprint): per-user reference tables, backfill every existing row to one pool item + one creator reference, rewrite reads/search/RLS on both layers, seed the reserved anon id, create-form labeling copy (ES+EN), rework `delete-account`; no GC in Phase 1. Phase 2 is **cancelled** — no reaper, no ratings/voting signal.

`recipe_ingredients` `ON DELETE RESTRICT` is kept as the DB-level backstop against orphaned recipe lines (`CASCADE`/`SET NULL` would silently corrupt macros). It stands on its own now that the Phase-2 reaper is cancelled.

## Type definitions & caveats

`src/types/database.ts` is **generated** from the live schema (`supabase gen types typescript`, command + post-generation corrections in `operations.md`; caveats in `conventions.md`), exposing `Tables`, `TablesInsert`, `TablesUpdate` helper generics + `Constants` (R-04 / D-A8, done 2026-05-18). Two generator caveats survive every regen: (1) CHECK-constraint enums (e.g. `phases.kcal_mode`, `phases.fiber_mode`, `tdee_estimates.confidence`, `ingredients.unit_type`, `ingredients.source`) surface as plain `string` — verify allowed values against `pg_constraint`/the pure core before adding form options, the type won't narrow them; (2) the generator cannot infer SQL-function argument nullability and emits non-null `string`, so the nullable `save_recipe`/`save_template` ids (null = "create new") are restored to `string | null` by a documented post-generation patch. `phases.fat_pct_of_kcal` is stored as a fraction in the 0.10–0.60 range, not a percent; the UI converts at the form boundary.
