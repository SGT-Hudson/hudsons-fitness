# Data Model

## Contents
- [Overview](#overview)
- [Tables](#tables)
- [Row-Level Security](#row-level-security)
- [RPCs](#rpcs)
- [Views](#views)
- [Extensions](#extensions)
- [Library Contribution & Lifecycle Model](#library-contribution--lifecycle-model)
- [Type definitions & caveats](#type-definitions--caveats)

## Overview

Hudson's Fitness has 15 tables, all RLS-enabled. Per-user tables follow the standard `auth.uid() = user_id` pattern so a user only ever sees their own rows. The one deliberate exception is `ingredients`, which is the intentionally-shared crowdsourced library — every authenticated user reads the whole pool and may contribute rows. The backend is Supabase project `upvraruehzurbetzrxov` (PostgreSQL 15+, EU Frankfurt region for GDPR). Repo is public — RLS is the sole security boundary (see D-F2, `operations.md`).

## Tables

Schema and column lists below are authoritative from `src/types/database.ts` — hand-written today to mirror the live Supabase database, and slated to become generated from the real DB per D-A8/R-04. The legacy `hudsons-fitness-architecture.md` spec has drifted and is being retired; it must not be trusted for column lists wherever it conflicts with `src/types/database.ts` (it is still used here only for human-readable column purpose and the RLS / RPC / view / extension / flow narrative).

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

Shared across all users (crowdsourced library). `created_by_user_id = null` indicates a system-seeded ingredient (immutable). Trigram indexes `idx_ingredients_name_trgm` (gin on `name`) and `idx_ingredients_brand_trgm` (gin on `brand` where `brand is not null`).

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `created_by_user_id` | `uuid`, references `profiles(id)` on delete set null |
| `name` | `text` not null |
| `brand` | `text` |
| `unit_type` | `text` not null default `'gram'`, check in (`'gram'`, `'unit'`) |
| `kcal_per_unit` | `numeric(7,2)` not null |
| `protein_g_per_unit` | `numeric(6,2)` not null |
| `carbs_g_per_unit` | `numeric(6,2)` not null |
| `fat_g_per_unit` | `numeric(6,2)` not null |
| `fiber_g_per_unit` | `numeric(6,2)` not null default 0 |
| `source` | `text` not null default `'manual'`, check in (`'manual'`, `'openfoodfacts'`, `'bedca'`, `'system'`) |
| `external_id` | `text` |
| `is_verified` | `boolean` not null default false |
| `created_at` | `timestamptz` not null default `now()` |
| `updated_at` | `timestamptz` not null default `now()` |

Key constraints: `unique (source, external_id)` prevents duplicate API imports across all users; `ingredients_external_consistency` check ensures `external_id is null or source in ('openfoodfacts', 'bedca')`. Macros are per 100 g, or per unit when `unit_type = 'unit'`.

### `recipes`

Per-user (private), referencing the shared ingredient library. `unique (user_id, name)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `user_id` | `uuid` not null, references `profiles(id)` on delete cascade |
| `name` | `text` not null |
| `servings` | `numeric(5,2)` not null default 1, check `servings > 0` |
| `description` | `text` |
| `instructions` | `text` |
| `photo_url` | `text` |
| `deleted_at` | `timestamptz` (null = live; soft-delete marker, partial unique index `where deleted_at is null`) |
| `created_at` | `timestamptz` not null default `now()` |
| `updated_at` | `timestamptz` not null default `now()` |

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
| `notes` | `text` |
| `created_at` | `timestamptz` not null default `now()` |
| `updated_at` | `timestamptz` not null default `now()` |

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
| `consumed_kcal` | `numeric(7,1)` |
| `consumed_protein_g` | `numeric(6,2)` |
| `consumed_carbs_g` | `numeric(6,2)` |
| `consumed_fat_g` | `numeric(6,2)` |
| `consumed_fiber_g` | `numeric(6,2)` |
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

The `confidence` and `is_warmup` columns were added 2026-05-18 (R-07 / D-B4) for the adaptive Kalman estimator (Sprint-17 reader contract unchanged — additive only). Four dead always-null energy-breakdown columns — `bmr_kcal`, `activity_kcal`, `neat_residual_kcal`, `workout_kcal_logged` (§6.4 scaffolding on the replaced two-endpoint model, never written by `recalculate-tdee`) — were dropped the same day (R-08 / D-B5), code/types-first then the prod `DROP COLUMN`. BMR is now a derived, never-stored display (`estimatedBmr` in `src/lib/macros.ts`, surfaced on `/progreso`); any future expenditure decomposition is owned by the R-07 adaptive-TDEE spec.

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

## Row-Level Security

Every table is RLS-enabled.

**Standard per-user pattern.** Most tables hold data owned by exactly one user and carry the four-policy set: SELECT / INSERT / UPDATE / DELETE all gated on `auth.uid() = user_id` (`with check` on INSERT, `using` on the rest). Applied to: `profiles`, `body_measurements`, `recipes`, `recipe_ingredients` (via join to `recipes`), `meal_logs`, `goals`, `phases`, `meal_plan_templates`, `meal_plan_template_day_times`, `meal_plan_template_slots` (via join to `meal_plan_templates`), `meal_plan_weeks`, `meal_plan_week_slots` (via join to `meal_plan_weeks`), `daily_nutrition_history`, `tdee_estimates`, `tdee_state`.

**`ingredients` (shared library).** Different shape (see D-A1):
- SELECT: any authenticated user reads the entire library (`using (true)`).
- INSERT: any authenticated user, must mark themselves as creator (`with check (auth.uid() = created_by_user_id)`).
- UPDATE: only the creator (`using` + `with check` on `auth.uid() = created_by_user_id`). System seeds (`created_by_user_id IS NULL`) are effectively immutable.
- DELETE: only the creator (`using (auth.uid() = created_by_user_id)`). The FK from `recipe_ingredients` is `ON DELETE RESTRICT`, which additionally blocks deletion if any user's recipe references the ingredient.

Reversibility escape-hatch (D-A1): the open-SELECT model can later be tightened to `created_by_user_id = auth.uid() OR created_by_user_id IS NULL` with no schema change if the library ever needs privacy.

The repo is public, so RLS is the sole security boundary — there is no server-side application tier in front of the database.

## RPCs

Five user-facing RPCs, all `SECURITY INVOKER`, each atomic across multiple tables:
- `save_recipe`
- `save_template`
- `apply_template_to_week`
- `save_week_as_template`
- `materialize_plan_for_date`

One cron-only exception: `apply_template_to_week_admin` is `SECURITY DEFINER` (Sprint 9), used by scheduled jobs that act across users with the service role.

Invariant (D-C5): any operation that mutates more than one table atomically MUST be an RPC. Single-table mutations stay client-side. All user-callable RPCs must be `SECURITY INVOKER` with `set search_path = public`. `SECURITY DEFINER` is forbidden without explicit security review and a non-`public` schema home; the cron-only `apply_template_to_week_admin` is the documented exception.

`materialize_plan_for_date` (R-12 / D-D6) is the fifth: `SECURITY INVOKER`, `set search_path = public`, in-RPC `date <= today` Europe/Madrid guard, backed by the partial unique index `meal_logs_user_plan_slot_uidx` with `INSERT … ON CONFLICT DO NOTHING`. It replaced the hand-mirrored client/edge materialization copies (single source = the RPC). Live in prod since 2026-05-18 (migration applied, then the calling-code PR merged).

## Views

`body_measurements_smoothed` — selects all of `body_measurements` plus `weight_kg_5day_avg`, a window average of `weight_kg` over `rows between 4 preceding and current row`, partitioned by `user_id` ordered by `measured_on`.

## Extensions

Installed in the `extensions` schema (not `public`):
- `pg_trgm` — fuzzy ingredient text search (gin trigram indexes on `ingredients.name` / `ingredients.brand`).
- `btree_gist` — backs the non-overlapping phase date-range constraint via `EXCLUDE USING gist` on `phases`.

## Library Contribution & Lifecycle Model
<a id="library-model"></a>

This is the live model for `ingredients` and `recipes` as of the R-01 Phase 1 apply (2026-05-20). Phase 2 (the auto-reaper) is still gated on the deferred ratings/voting signal — see point 7 below and `roadmap.md` R-01.

1. **Pool + reference.** `ingredients` and `recipes` become shared-pool entities from creation. Creating one inserts a pool item **and** a per-user *reference* row for the creator. "My library" = the set of my reference rows. Discovery = search the whole pool; adding a found item to my library = create a reference.
2. **Private notes on the reference only.** Per-user notes live on the reference row, never on the pooled item. This is the structural PII firewall — personal data physically cannot enter the shared pool.
3. **No user hard-delete.** "Delete" = hide = remove your reference (and its private note). The pooled item is untouched.
4. **Creator-hide transfers pool ownership to a reserved anon user id** — a fixed seeded `auth.users`/profile row. **Never `null`**: for `ingredients`, `created_by_user_id = null` already means "immutable system seed," so the anon owner must be a distinct sentinel id.
5. **Item name is public from creation** — a UX/labeling concern only. The create form must state the item is contributed to the shared library; private content goes in notes, not the title.
6. **No adoption / claim / fork.** Anon-owned items are never re-owned or user-edited.
7. **Auto-GC (Phase 2, gated on the deferred ratings/voting system).** The system may auto-delete a pooled item only if all three hold: `owner = reserved anon id` AND zero live references (no `recipe_ingredients` → ingredient; no `meal_logs`/plan slots → recipe) AND negative community signal (sufficient downvotes / no likes). This preserves the never-orphan-dependent-data invariant and is the mechanism that resolves duplicate/bad pooled items (D-A4) and the tombstone-accumulation concern.
8. **GDPR account-delete reconciliation.** On account delete, hard-delete the user's reference rows (genuine erasure of personal notes) and reassign any still-owned pool items to the reserved anon id (anonymized retention of objective shared data). Replaces blanket CASCADE for `ingredients` + `recipes` in the `delete-account` edge function.

**Phasing.** Phase 1 (own migration sprint): per-user reference tables, backfill every existing row to one pool item + one creator reference, rewrite reads/search/RLS on both layers, seed the reserved anon id, create-form labeling copy (ES+EN), rework `delete-account`; no GC in Phase 1. Phase 2 (depends on the ratings/voting feature): downvote/like signal + the 3-predicate safe auto-reaper.

`recipe_ingredients` `ON DELETE RESTRICT` is kept as the DB-level backstop for the Phase-2 reaper: the GC predicate enforces zero references in app logic, and RESTRICT keeps that true at the DB even if the reaper logic has a bug.

## Type definitions & caveats

`src/types/database.ts` is **generated** from the live schema (`supabase gen types typescript`, command + post-generation corrections in `operations.md`; caveats in `conventions.md`), exposing `Tables`, `TablesInsert`, `TablesUpdate` helper generics + `Constants` (R-04 / D-A8, done 2026-05-18). Two generator caveats survive every regen: (1) CHECK-constraint enums (e.g. `phases.kcal_mode`, `phases.fiber_mode`, `tdee_estimates.confidence`, `ingredients.unit_type`, `ingredients.source`) surface as plain `string` — verify allowed values against `pg_constraint`/the pure core before adding form options, the type won't narrow them; (2) the generator cannot infer SQL-function argument nullability and emits non-null `string`, so the nullable `save_recipe`/`save_template` ids (null = "create new") are restored to `string | null` by a documented post-generation patch. `phases.fat_pct_of_kcal` is stored as a fraction in the 0.10–0.60 range, not a percent; the UI converts at the form boundary.
