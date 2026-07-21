-- R-36b — weekly cron schedule for the `recipe-photo-reap` debris backstop.
--
-- STAGED — DO NOT APPLY TO THE LIVE PROJECT BEFORE THE FUNCTION IS DEPLOYED.
-- (Local/CI stacks replay the whole migration history and register the job as
-- a matter of course; nothing there ever fires it at a deployed function.)
--
-- Same ordering rule as the R-18 `cron-healthcheck` schedule (20260518010000),
-- and for the same reason: apply this only AFTER
--   supabase functions deploy recipe-photo-reap --project-ref upvraruehzurbetzrxov \
--     --use-api --import-map supabase/functions/deno.json
--
-- Why the ordering matters even though a firing looks harmless. It is tempting
-- to assume an early firing self-reports — that a 404 from the not-yet-deployed
-- function turns into a failed run in `cron.job_run_details`. It does not.
-- `private.invoke_edge_function` posts through `net.http_post` (pg_net), which
-- is ASYNCHRONOUS: it enqueues the request, returns a request id immediately,
-- and the cron job commits successfully regardless of what the HTTP call later
-- does. The 404 lands in `net._http_response` and nowhere else, so an early
-- firing is a SILENT no-op, not a visible failure — the opposite of what makes
-- an out-of-order apply safe. Deploy first and there is nothing to notice.
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

-- Rollback (manual, if ever needed):
--   select cron.unschedule('recipe-photo-reap');
