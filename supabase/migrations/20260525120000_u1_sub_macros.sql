-- U-1 sub-macros: optional sugar + saturated fat. Additive, nullable, no backfill.
-- Sugar ⊂ carbs, saturated fat ⊂ fat — informational "of which" sub-components,
-- never additive to kcal. NULL = unknown (≠ 0). DB enforces non-negative only;
-- the sugar≤carbs / sat≤fat sanity check is a soft (non-blocking) form warning,
-- because real OpenFoodFacts per-100g rounding legitimately violates it.

alter table public.ingredients
  add column if not exists sugar_g_per_unit numeric(6, 2)
    check (sugar_g_per_unit is null or sugar_g_per_unit >= 0),
  add column if not exists saturated_fat_g_per_unit numeric(6, 2)
    check (saturated_fat_g_per_unit is null or saturated_fat_g_per_unit >= 0);

alter table public.meal_logs
  add column if not exists custom_sugar_g numeric(6, 2),
  add column if not exists custom_saturated_fat_g numeric(6, 2);

-- daily_nutrition_history stores the known sum + a per-field completeness flag.
-- History only needs to know whether to render the "≥" qualifier (the exact
-- missing count is recomputed live in the diary, not persisted). Existing rows
-- get NULL grams + complete=true (no contributors were "unknown" pre-feature).
alter table public.daily_nutrition_history
  add column if not exists planned_sugar_g numeric(6, 2),
  add column if not exists consumed_sugar_g numeric(6, 2),
  add column if not exists planned_sugar_complete boolean not null default true,
  add column if not exists consumed_sugar_complete boolean not null default true,
  add column if not exists planned_saturated_fat_g numeric(6, 2),
  add column if not exists consumed_saturated_fat_g numeric(6, 2),
  add column if not exists planned_saturated_fat_complete boolean not null default true,
  add column if not exists consumed_saturated_fat_complete boolean not null default true;
