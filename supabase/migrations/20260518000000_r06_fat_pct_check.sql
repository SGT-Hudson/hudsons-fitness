-- R-06 / D-B3: DB CHECK for the phases.fat_pct_of_kcal 0.10–0.60 bound.
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- The 0.10–0.60 fat-fraction bound is currently enforced UI-only (PhaseDialog
-- `register` min/max). D-B3 requires a DB-level backstop. This file stages that
-- constraint but is intentionally NOT applied by this PR: the live Supabase
-- project (upvraruehzurbetzrxov) is untouched here. There is no reproducible
-- migration history yet (see R-00), so this is applied by the operator at the
-- Wave-3 prod-migration checkpoint, alongside the other staged structural
-- migrations — after a one-time pre-flight that no existing phases.fat_pct_of_kcal
-- row falls outside [0.10, 0.60] (the constraint is NOT NOT VALID, so it
-- validates existing rows on apply and will fail loudly if any are out of range).
--
-- Do not run this against any database from CI or from this PR.

alter table public.phases
  add constraint phases_fat_pct_of_kcal_range
  check (fat_pct_of_kcal >= 0.10 and fat_pct_of_kcal <= 0.60);
