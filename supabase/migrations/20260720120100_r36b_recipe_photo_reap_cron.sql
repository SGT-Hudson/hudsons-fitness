-- R-36b — weekly cron schedule for the `recipe-photo-reap` debris backstop.
--
-- This migration applies normally (unlike the fully-deferred R-18 pattern):
-- registering the schedule with pg_cron is harmless on its own. What is
-- INERT until a separate step is the actual job — `cron.schedule` here only
-- points at the edge function by name, and `recipe-photo-reap` is not yet
-- deployed. Deploying it (`supabase functions deploy recipe-photo-reap
-- --use-api --import-map supabase/functions/deno.json`) is a separate,
-- user-gated ops step (Task 7). Until that happens, every weekly firing of
-- this job gets a 404 from `private.invoke_edge_function`'s POST and shows
-- up as a failed run in `cron.job_run_details` — harmless, self-contained,
-- and the same "not yet deployed ⇒ visible 404, not a silent no-op" shape
-- the `cron-healthcheck` staging note (20260518010000) calls out.
--
-- Reuses the same `private.invoke_edge_function` + Vault
-- `cron_service_role_key` path the other four jobs use (Sprint 9 /
-- 20260514120000) — no new secret.
--
-- Cadence (UTC, matching the existing jobs' schedule-in-UTC / DST-not-corrected
-- convention): 05:00 UTC Sunday ≈ 06:00 CET / 07:00 CEST — weekly and
-- off-peak, and a day clear of Monday's 02:00 UTC `weekly-rollover` so the
-- two never contend.

select cron.schedule(
  'recipe-photo-reap',
  '0 5 * * 0',
  $cron$ select private.invoke_edge_function('recipe-photo-reap'); $cron$
);
