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
| `units` | `text` not null default `'metric'`, check in (`'metric'`, `'imperial'`) — still in prod; removed from types, `DROP` staged for Wave-3 (R-14) |
| `start_date` | `date` not null default `current_date` |
| `initial_weight_kg` | `numeric(5,2)` |
| `sex` | `text`, check in (`'male'`, `'female'`, `'other'`) |
| `birth_date` | `date` |
| `height_cm` | `numeric(5,1)` |
| `bone_kg` | `numeric(4,2)` — absolute bone mass in kg (smart-scale convention) — still in prod; removed from app + types, `DROP` staged for Wave-3 |
| `created_at` | `timestamptz` not null default `now()` |
| `updated_at` | `timestamptz` not null default `now()` |

> ⚠ Changing — see R-03 (D-A6)

The `bone_kg` column lives here on `profiles` (a single per-user value), not on `body_measurements`. It was dead — it fed zero computations and added mandatory onboarding friction (D-A6). It is now **removed from the app + `src/types/database.ts`** (`estimateBoneKg`, the onboarding/settings inputs, the `isProfileOnboarded` gate, and the i18n keys are all gone), but the physical column still exists in the live `profiles` table: the `ALTER TABLE … DROP COLUMN bone_kg` is staged in `supabase/migrations/20260518030000_r03_drop_bone_kg.sql` and applied by the operator at the Wave-3 prod-migration checkpoint. The marker stays until that prod drop lands.

> ⚠ Changing — see R-14 (D-E3)

The `units` column is dead legacy: no form writes it, nothing reads it, and the app is metric-only (D-E3). It is now **removed from `src/types/database.ts`** (it was code-dead — no `profiles.units` read/write existed anywhere, so no app code changed), but the physical column still exists in the live `profiles` table: the `ALTER TABLE … DROP COLUMN units` is staged in `supabase/migrations/20260518040000_r14_drop_units.sql` and applied by the operator at the Wave-3 prod-migration checkpoint. The marker stays until that prod drop lands.

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

Constraint `meal_log_one_source` enforces exactly one of `recipe_id` / `ingredient_id` / `custom_name`.

> ⚠ Changing — see R-12 (D-D6)

R-12 / D-D6 is implemented (applied + merged at Wave-3): the staged migration `20260518060000_r12_materialize_rpc.sql` adds a partial unique index `meal_logs_user_plan_slot_uidx` on `(user_id, plan_week_slot_id) where plan_week_slot_id is not null` and the `materialize_plan_for_date` SECURITY INVOKER RPC (`ON CONFLICT DO NOTHING` on that index → DB-level idempotency; `date <= today` Europe/Madrid guard). The prior app-level read-then-write dedup, hand-mirrored across client and edge, is removed. Not live in prod until the Wave-3 checkpoint (the migration is applied, then the calling-code PR is merged — the code depends on the RPC existing first).

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

Adaptive TDEE cache, recomputed weekly by an Edge Function. Index `idx_tdee_user_date` on `(user_id, computed_on desc)`.

| Column | Type / constraint |
|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` |
| `user_id` | `uuid` not null, references `profiles(id)` on delete cascade |
| `computed_on` | `date` not null |
| `window_days` | `int` not null |
| `avg_kcal_intake` | `numeric(7,1)` not null |
| `weight_delta_kg` | `numeric(5,2)` not null |
| `estimated_tdee_kcal` | `numeric(7,1)` not null (empirical total) |
| `bmr_kcal` | `numeric(7,1)` |
| `activity_kcal` | `numeric(7,1)` |
| `workout_kcal_logged` | `numeric(7,1)` |
| `neat_residual_kcal` | `numeric(7,1)` |
| `created_at` | `timestamptz` not null default `now()` |

> ⚠ Changing — see R-08 (D-B5) — column drop only

The four columns `bmr_kcal`, `activity_kcal`, `neat_residual_kcal`, and `workout_kcal_logged` were always-null/unused energy-breakdown scaffolding (§6.4: `activity_kcal = TDEE − BMR` + a workout/NEAT split gated on a non-existent Workouts module, built on the replaced two-endpoint model — any future expenditure decomposition is owned by the R-07 adaptive-TDEE spec). They are **removed from `src/types/database.ts` and unused in code** (the `recalculate-tdee` Edge Function never wrote them). The physical `ALTER TABLE … DROP COLUMN` is **staged** (`supabase/migrations/20260518050000_r08_drop_dead_tdee_cols.sql`) and applied at the Wave-3 prod-migration checkpoint — the live columns still physically exist in prod until then, hence the lingering `⚠ R-08` on the column-drop aspect only. BMR is now wired as a derived, never-stored display value (`estimatedBmr` in `src/lib/macros.ts`, surfaced on `/progreso`). This drop is independent and order-free with respect to R-07's separately-staged additive `confidence`/`is_warmup`/`tdee_state` migration (disjoint column sets; either may apply first).

## Row-Level Security

Every table is RLS-enabled.

**Standard per-user pattern.** Most tables hold data owned by exactly one user and carry the four-policy set: SELECT / INSERT / UPDATE / DELETE all gated on `auth.uid() = user_id` (`with check` on INSERT, `using` on the rest). Applied to: `profiles`, `body_measurements`, `recipes`, `recipe_ingredients` (via join to `recipes`), `meal_logs`, `goals`, `phases`, `meal_plan_templates`, `meal_plan_template_day_times`, `meal_plan_template_slots` (via join to `meal_plan_templates`), `meal_plan_weeks`, `meal_plan_week_slots` (via join to `meal_plan_weeks`), `daily_nutrition_history`, `tdee_estimates`.

**`ingredients` (shared library).** Different shape (see D-A1):
- SELECT: any authenticated user reads the entire library (`using (true)`).
- INSERT: any authenticated user, must mark themselves as creator (`with check (auth.uid() = created_by_user_id)`).
- UPDATE: only the creator (`using` + `with check` on `auth.uid() = created_by_user_id`). System seeds (`created_by_user_id IS NULL`) are effectively immutable.
- DELETE: only the creator (`using (auth.uid() = created_by_user_id)`). The FK from `recipe_ingredients` is `ON DELETE RESTRICT`, which additionally blocks deletion if any user's recipe references the ingredient.

Reversibility escape-hatch (D-A1): the open-SELECT model can later be tightened to `created_by_user_id = auth.uid() OR created_by_user_id IS NULL` with no schema change if the library ever needs privacy.

The repo is public, so RLS is the sole security boundary — there is no server-side application tier in front of the database.

## RPCs

Four user-facing RPCs, all `SECURITY INVOKER`, each atomic across multiple tables:
- `save_recipe`
- `save_template`
- `apply_template_to_week`
- `save_week_as_template`

One cron-only exception: `apply_template_to_week_admin` is `SECURITY DEFINER` (Sprint 9), used by scheduled jobs that act across users with the service role.

Invariant (D-C5): any operation that mutates more than one table atomically MUST be an RPC. Single-table mutations stay client-side. All user-callable RPCs must be `SECURITY INVOKER` with `set search_path = public`. `SECURITY DEFINER` is forbidden without explicit security review and a non-`public` schema home; the cron-only `apply_template_to_week_admin` is the documented exception.

> ⚠ Changing — see R-12 (D-D6)

R-12 / D-D6 is implemented (applied + merged at Wave-3): plan materialization is the new `materialize_plan_for_date` `SECURITY INVOKER` RPC (`set search_path = public`, in-RPC `date <= today` Europe/Madrid guard) backed by the partial unique index `meal_logs_user_plan_slot_uidx` on `meal_logs (user_id, plan_week_slot_id) where plan_week_slot_id is not null` with `INSERT … ON CONFLICT DO NOTHING`. The hand-mirrored client/edge copies are deleted (single source = the RPC). Bringing the count of user-facing `SECURITY INVOKER` RPCs to five. Not live until the Wave-3 checkpoint — the staged migration is applied to prod first, then the calling-code PR is merged (the code calls the RPC, so the RPC must exist in prod before the code merges).

## Views

`body_measurements_smoothed` — selects all of `body_measurements` plus `weight_kg_5day_avg`, a window average of `weight_kg` over `rows between 4 preceding and current row`, partitioned by `user_id` ordered by `measured_on`.

## Extensions

Installed in the `extensions` schema (not `public`):
- `pg_trgm` — fuzzy ingredient text search (gin trigram indexes on `ingredients.name` / `ingredients.brand`).
- `btree_gist` — backs the non-overlapping phase date-range constraint via `EXCLUDE USING gist` on `phases`.

## Library Contribution & Lifecycle Model
<a id="library-model"></a>

> ⚠ Changing — see R-01 (D-A2/D-A3/D-A4)

This is the **target** model. `ingredients` and `recipes` do **not** yet work this way; today `ingredients` is the shared crowdsourced library described above and `recipes` are private per-user rows with interim soft-delete (`deleted_at`). The model below is documented here as the decided destination, not current reality.

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

`src/types/database.ts` is **hand-written** today, exposing `Tables`, `TablesInsert`, and `TablesUpdate` helper types. CHECK-constraint enums (e.g. `phases.kcal_mode`, `phases.fiber_mode`, `ingredients.unit_type`, `ingredients.source`) surface as plain `string` in TypeScript — verify the allowed values against `pg_constraint` before adding form options, since the type system does not narrow them. `phases.fat_pct_of_kcal` is stored as a fraction in the 0.10–0.60 range, not a percent; the UI converts at the form boundary.

> ⚠ Changing — see R-04 (D-A8)

The decided change switches `src/types/database.ts` to generated types (`supabase gen types typescript`). CHECK-constraint enums still come through as plain `string` from the generator, so the verify-against-`pg_constraint` rule continues to apply.
