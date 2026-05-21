-- R-21 REMOVED — drop the OFF contribute-back opt-out column.
--
-- STAGED — DO NOT AUTO-APPLY (apply only AFTER the code that references
-- `profiles.contribute_to_off` is off `main`, to avoid the R-01-style
-- "live code references a dropped column" break — the Settings toggle WROTE
-- this column).
--
-- The OFF contribute-back feature (R-21) was removed as a product decision
-- (2026-05-21). The barcode-scanning lookup (R-20) stays. This reverses
-- 20260523120000_r21_profiles_contribute_to_off.sql.

alter table public.profiles
  drop column if exists contribute_to_off;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- ROLLBACK:
--   alter table public.profiles
--     add column if not exists contribute_to_off boolean not null default true;
