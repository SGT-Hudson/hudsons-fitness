-- R-18 / D-F5: cron liveness healthcheck — daily pg_cron schedule.
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- This schedules a fourth pg_cron job that invokes the new `cron-healthcheck`
-- edge function (supabase/functions/cron-healthcheck/) through the EXISTING
-- private.invoke_edge_function helper, which reads the EXISTING Vault secret
-- `cron_service_role_key` (Sprint 9 migration 20260514120000). No new secret
-- and no new helper are introduced — R-18 reuses the established cron auth
-- path exactly (D-F5: "do NOT invent a new secret").
--
-- This file is intentionally NOT applied by its PR: the live Supabase project
-- (upvraruehzurbetzrxov) is untouched here. There is no reproducible migration
-- history yet (see R-00), so this is applied by the operator at the Wave-3
-- prod-migration checkpoint alongside the other staged migrations — AND only
-- after the `cron-healthcheck` edge function has been deployed
-- (`supabase functions deploy cron-healthcheck --project-ref
-- upvraruehzurbetzrxov`), otherwise the very first scheduled run would 404 and
-- self-report as an alert.
--
-- Do not run this against any database from CI or from this PR.
--
-- Schedule (UTC, D-F4 convention — schedules fixed in UTC, in-function date
-- boundaries are Europe/Madrid; DST is NOT corrected, matching the existing
-- three jobs):
--   06:00 UTC = 07:00 CET / 08:00 CEST — runs AFTER all three data crons
--   (snapshot 01:00, weekly-rollover 02:00 Mon, recalculate-tdee 03:00 UTC)
--   so the freshest rows of a healthy run are already written before the
--   liveness check looks at them.

select cron.schedule(
  'cron-healthcheck',
  '0 6 * * *',
  $cron$ select private.invoke_edge_function('cron-healthcheck'); $cron$
);

-- Rollback (manual, if ever needed):
--   select cron.unschedule('cron-healthcheck');
