-- R-08 / D-B5: drop the 4 dead tdee_estimates BMR/breakdown columns.
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- D-B5 drops the 4 always-null scaffolding columns on `tdee_estimates`:
-- `bmr_kcal`, `activity_kcal`, `neat_residual_kcal`, `workout_kcal_logged`.
-- They were the architecture spec's §6.4 energy-breakdown layer
-- (`activity_kcal = TDEE − BMR`, with a workout/NEAT split gated on a
-- non-existent Workouts module) — inert, never written by
-- `recalculate-tdee` (re-verified at impl time: the R-07 rewrite writes
-- estimated_tdee_kcal/confidence/is_warmup and explicitly leaves these 4
-- unset), built on the very two-endpoint total-TDEE model D-B4 replaced.
-- Any future expenditure/BMR decomposition is owned by the D-B4/R-07
-- adaptive-TDEE spec, not pre-scaffolded here. BMR itself stays as a
-- derived, never-stored display value (`estimatedBmr` in src/lib/macros.ts,
-- surfaced on /progreso) — recompute, don't persist.
--
-- The app + hand-written types (src/types/database.ts) drop these 4 columns
-- in this same PR; reading fewer columns than exist in prod is safe and
-- causes no runtime break, so the code/types purge merges autonomously.
-- This file stages the actual schema change but is intentionally NOT applied
-- by this PR: the live Supabase project (upvraruehzurbetzrxov) is untouched
-- here. It is timestamped after the R-00 baseline (20260508080000), after
-- sprint9 (20260514120000), and after the prior staged structural drops
-- (R-03 `20260518030000`, R-14 `20260518040000`), so the order is
-- baseline → sprint9 → staged Wave-3.
--
-- ── R-07 coexistence / ordering (documented in the PR body too) ────────────
-- This migration is INDEPENDENT and ORDER-FREE with respect to the
-- separately-staged R-07 migration
-- (`20260518020000_r07_adaptive_tdee_state.sql`). R-07 ADDs a new
-- `tdee_state` table and 2 nullable columns to `tdee_estimates`
-- (`confidence`, `is_warmup`); R-08 DROPs 4 *different*, unrelated columns
-- from `tdee_estimates`. The two column sets are disjoint, neither
-- references the other, and the rewritten edge function writes nothing to
-- the R-08 columns — so either staged migration may be applied first at the
-- Wave-3 checkpoint with the same end state. (R-07's header carries the
-- mirror of this note.)
--
-- Applied by the operator at the Wave-3 prod-migration checkpoint, alongside
-- the other staged structural migrations. Idempotent (`if exists`) so a
-- re-apply is a verified no-op. Do not run this against any database from CI
-- or from this PR.

alter table public.tdee_estimates
  drop column if exists bmr_kcal,
  drop column if exists activity_kcal,
  drop column if exists neat_residual_kcal,
  drop column if exists workout_kcal_logged;
