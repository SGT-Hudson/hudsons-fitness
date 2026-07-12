-- R-33 wave 6 (Ingredientes): the salt sub-macro on `ingredients`.
--
-- Salt is a real nutrition fact the redesigned editor shows, OpenFoodFacts
-- carries it (`salt_100g`), and it fits the U-1 nullable sub-macro pattern
-- exactly — so it mirrors 20260525120000_u1_sub_macros.sql: additive, nullable,
-- no backfill. NULL = unknown (≠ 0): an ingredient with no salt figure has an
-- UNKNOWN salt content, and writing 0 there would falsely assert "salt-free".
-- The DB enforces non-negative only.
--
-- Column-only, by design: ingredients are written by direct table writes under
-- RLS (`createManualIngredient`, `importIngredientFromOFF`, `updateIngredient`)
-- — there is no `save_ingredient` RPC to drop and recreate — so RLS on
-- `ingredients` is untouched.
--
-- Scope: salt is an INGREDIENT-LEVEL fact this wave. It is deliberately NOT
-- aggregated into recipe/day totals (`core/subMacros.ts` stays frozen), so no
-- `meal_logs` / `daily_nutrition_history` columns accompany it — unlike U-1.

alter table public.ingredients
  add column if not exists salt_g_per_unit numeric(6, 2)
    check (salt_g_per_unit is null or salt_g_per_unit >= 0);

comment on column public.ingredients.salt_g_per_unit is
  'Salt per unit (per 100 g, or per unit when unit_type = ''unit''). NULL = unknown, never 0.';
