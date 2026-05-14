# Supabase — Edge Functions + cron

Sprint 9 introduces three scheduled jobs that populate `daily_nutrition_history`
and `tdee_estimates`. They run via `pg_cron` and invoke edge functions through
`pg_net`.

## Layout

```
supabase/
├── migrations/
│   └── 20260514120000_sprint9_cron_and_jobs.sql
└── functions/
    ├── _shared/macros.ts
    ├── daily-nutrition-snapshot/index.ts   # 0 1 * * *  UTC (≈02:00 CET)
    ├── weekly-rollover/index.ts            # 0 2 * * 1  UTC (≈03:00 CET Mon)
    └── recalculate-tdee/index.ts           # 0 3 * * *  UTC (≈04:00 CET)
```

## One-time setup (after the migration is applied)

The cron jobs read the `service_role` key from Vault. Once per project:

```sql
select vault.create_secret(
  '<paste service_role key here>',
  'cron_service_role_key'
);
```

Until this is set, each scheduled run will raise
`Vault secret cron_service_role_key not set` (visible via
`select * from cron.job_run_details order by start_time desc limit 5;`).

## Manual invocation (smoke tests)

```bash
# Specific date (otherwise defaults to yesterday in Europe/Madrid)
curl -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-05-13"}' \
  https://upvraruehzurbetzrxov.supabase.co/functions/v1/daily-nutrition-snapshot

curl -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{}' \
  https://upvraruehzurbetzrxov.supabase.co/functions/v1/weekly-rollover

curl -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{}' \
  https://upvraruehzurbetzrxov.supabase.co/functions/v1/recalculate-tdee
```

Each function returns a JSON array with one entry per profile and a status
(`ok` / `already_exists` / `no_template` / `insufficient_intake` / etc.).

## Cron diagnostics

```sql
select jobname, schedule, active from cron.job;
select jobid, runid, status, return_message, start_time
  from cron.job_run_details
  order by start_time desc
  limit 20;
```

## Math notes

- `daily-nutrition-snapshot` mirrors the client-side macro math in
  `src/features/recipes/macros.ts` and `src/features/diario/macros.ts`. Per-100g
  ingredients divide by 100; per-unit ingredients divide by 1. `per_serving`
  rows scale with the recipe's `servings` before contributing.
- `recalculate-tdee` uses 14 days, 7700 kcal/kg, requires ≥10 days of intake
  data, and tolerates a ±3-day gap on the boundary weight measurements.
- `weekly-rollover` re-applies the most recent `source_template_id` via
  `apply_template_to_week_admin` (a service-role variant of the public
  `apply_template_to_week` RPC, which uses `auth.uid()` and so cannot run from
  cron).
