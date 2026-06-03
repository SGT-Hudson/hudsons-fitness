-- Apply-from-zero fix (R-16 Tier-3).
--
-- The F-1 whole-foods seed (20260523120100) inserts
-- public.ingredients.sugar_g_per_unit and saturated_fat_g_per_unit, but those
-- two columns were not added to the migration history until
-- u1_sub_macros (20260525120000) — in production they had been added out of
-- band, so the live DB was fine while a from-zero `supabase db reset` failed
-- at the seed (column "sugar_g_per_unit" does not exist, SQLSTATE 42703).
--
-- Add them here (idempotent), ordered immediately before the seed. u1's later
-- `add column if not exists` for the same two columns becomes a no-op; prod,
-- where the columns already exist, is likewise unaffected. Column defs mirror
-- u1_sub_macros exactly.
alter table public.ingredients
  add column if not exists sugar_g_per_unit numeric(6, 2)
    check (sugar_g_per_unit is null or sugar_g_per_unit >= 0),
  add column if not exists saturated_fat_g_per_unit numeric(6, 2)
    check (saturated_fat_g_per_unit is null or saturated_fat_g_per_unit >= 0);
