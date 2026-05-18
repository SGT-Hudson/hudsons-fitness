-- R-03 / D-A6: drop the dead profiles.bone_kg column.
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- D-A6 removes `bone_kg` entirely: it fed zero computations (Mifflin uses
-- weight/height/age/sex, protein uses bf%-derived lean mass, the composition
-- chart never referenced it) yet was a mandatory, post-onboarding-editable
-- friction field that also gated app entry via `isProfileOnboarded()`.
--
-- The app + hand-written types (src/types/database.ts) drop `bone_kg` in this
-- same PR; reading fewer columns than exist in prod is safe and causes no
-- runtime break, so the code purge merges autonomously. This file stages the
-- actual schema change but is intentionally NOT applied by this PR: the live
-- Supabase project (upvraruehzurbetzrxov) is untouched here. It is timestamped
-- after the R-00 baseline (20260508080000) and after sprint9
-- (20260514120000), so the order is baseline → sprint9 → staged Wave-3.
--
-- Applied by the operator at the Wave-3 prod-migration checkpoint, alongside
-- the other staged structural migrations. Idempotent (`if exists`) so a
-- re-apply is a verified no-op. Do not run this against any database from CI
-- or from this PR.

alter table public.profiles
  drop column if exists bone_kg;
