-- R-07 / D-B4: adaptive-TDEE per-user filter state + estimate confidence cols.
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- This stages the schema for the adaptive expenditure estimator decided in
-- D-B4 and specced in
-- docs/superpowers/specs/2026-05-18-adaptive-tdee-design.md. It is
-- intentionally NOT applied by its PR: the live Supabase project
-- (upvraruehzurbetzrxov) is untouched here. There is no reproducible
-- migration history yet (see R-00), so this is applied by the operator at
-- the Wave-3 prod-migration checkpoint alongside the other staged
-- migrations — AND only after the rewritten `recalculate-tdee` edge function
-- has been deployed (it is the only writer of these objects). Applying the
-- migration without the new edge function would leave `tdee_state` empty and
-- the new estimate columns unpopulated (the reader's `select('*')` still
-- works — the new columns are nullable/defaulted — it just sees no
-- confidence signal until the new function runs).
--
-- Do not run this against any database from CI or from this PR.
--
-- ── R-08 ordering (documented in the PR body) ──────────────────────────────
-- This migration is INDEPENDENT and ORDER-FREE with respect to the
-- separately-staged R-08 migration (which DROPs the 4 dead `tdee_estimates`
-- columns bmr_kcal / activity_kcal / neat_residual_kcal /
-- workout_kcal_logged). R-07 deliberately uses a NEW `tdee_state` table and
-- only ADDs two nullable columns to `tdee_estimates`; it never references the
-- 4 dead columns, and the rewritten edge function writes nothing to them.
-- Either staged migration may be applied first at Wave-3.

-- 1. Per-user adaptive filter memory (one row per user; the edge function
--    upserts it daily). The 2x2 symmetric state covariance P is stored as
--    its 3 free scalars (cov_ww, cov_we == cov_ew, cov_ee) to keep the type
--    plain (no array column) — consistent with the hand-written
--    types/database.ts convention until R-04.
create table public.tdee_state (
  user_id            uuid primary key
                       references public.profiles (id) on delete cascade,
  trend_weight_kg    numeric not null,
  expenditure_kcal   numeric not null,
  cov_ww             numeric not null,
  cov_we             numeric not null,
  cov_ee             numeric not null,
  observations_count integer not null default 0,
  last_updated_on    date not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.tdee_state enable row level security;

-- Standard per-user RLS (the same auth.uid() = user_id pattern as every
-- other per-user table). The edge function uses the service-role key, which
-- bypasses RLS; these policies exist so a future client read is safe and so
-- the public-repo posture (RLS = sole boundary, D-F2) holds.
create policy tdee_state_select_own on public.tdee_state
  for select using (auth.uid() = user_id);
create policy tdee_state_insert_own on public.tdee_state
  for insert with check (auth.uid() = user_id);
create policy tdee_state_update_own on public.tdee_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tdee_state_delete_own on public.tdee_state
  for delete using (auth.uid() = user_id);

-- 2. Additive output columns on the existing emitted-estimate series. The
--    reader (src/features/tdee/api.ts: select('*'), latest by computed_on)
--    keeps working unchanged pre- and post-apply because both columns are
--    nullable / defaulted. `confidence` is the variance-derived UI band;
--    `is_warmup` flags the cold-start/long-gap warm-up window. (No CHECK on
--    `confidence` value set: kept as plain text like `phases.kcal_mode` —
--    the allowed set 'low'|'medium'|'high' lives in the pure core
--    `src/core/tdee.ts`; mirrors the project's "enums typed as string,
--    verified in code" convention, D-A8 caveat.)
alter table public.tdee_estimates
  add column confidence text,
  add column is_warmup  boolean not null default false;

-- Rollback (manual, if ever needed):
--   alter table public.tdee_estimates drop column is_warmup;
--   alter table public.tdee_estimates drop column confidence;
--   drop table public.tdee_state;
