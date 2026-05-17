# Operations

Operational reality for building, shipping, and running Hudson's Fitness.
Code rules are in `conventions.md`; schema in `data-model.md`; decisions by
D-id in `decisions.md`; pending work by R-id in `roadmap.md`.

## Contents
- [Commands](#commands)
- [CI & merge workflow](#ci--merge-workflow)
- [Hosting & deploy](#hosting--deploy)
- [Supabase project](#supabase-project)
- [Edge functions](#edge-functions)
- [Cron](#cron)
- [Data seeding](#data-seeding)
- [Backups](#backups)
- [Auth & privacy](#auth--privacy)
- [Schema-in-migrations status](#schema-in-migrations-status)

## Commands

Requires Node 20+ and pnpm 10+.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint .
pnpm build        # tsc -b && vite build (to ./dist)
pnpm preview      # preview ./dist locally
```

Local dev needs `.env.local` with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. The public-tier values used in production are
in `README.md`.

`pnpm lint` and `pnpm build` must pass before merge. This is now
CI-enforced and blocks auto-merge — see [CI & merge workflow](#ci--merge-workflow).

## CI & merge workflow

CI and the merge gate are real and enforced (D-F1, D-F2).

- **Workflow:** `.github/workflows/ci.yml` runs on pnpm 10 / Node 20 and
  executes `pnpm lint` + `pnpm build`. The `pnpm test` step is stubbed (no
  test runner wired yet).
- **Branch protection on `main`:** required status check `lint-build`;
  strict (branch must be up to date before merge); force-push and deletion
  blocked; `enforce_admins` false; 0 required reviews.
- **Auto-merge:** GitHub-native auto-merge is enabled repo-wide. The workflow
  is: short-lived single-purpose branch → PR → CI green → `gh pr merge --auto`
  (squash) → auto-merge to `main` once the required check passes.
- **Public repo:** `github.com/SGT-Hudson/hudsons-fitness` is public, so RLS is
  the sole security boundary — there is no server-side application tier in
  front of the database (D-F2; RLS policy shapes in `data-model.md`
  Row-Level Security).
- **Discipline:** keep branches short-lived and single-purpose; do not let a
  branch run far ahead of `main` again (the historical 22-commit drift that
  D-F2 reconciled).

Tiered Vitest coverage is partially built: Tier-1 (pure-logic suites + a real
CI `pnpm test` step in the `lint-build` job) landed; Tier-2 (component tests)
rides R-09 and Tier-3 (DB/RLS/RPC via local `supabase start` + pgTAP) is gated
behind R-00 — both still pending:

> ⚠ Changing — see R-16 (D-F1) — Tier-1 landed; T2/T3 pending

## Hosting & deploy

- **Vercel project** `hudsonfitness` (`prj_69QdEbnDr836rfFwd24J9ISFuXqv`,
  team `team_EDiBxgsadwU6GbSqodEH0G3Q`), framework Vite.
- **Production branch** `main`, deploy-on-merge; production alias
  `hudsonfitness.vercel.app`.
- **PR previews** auto-deploy for every pull request.
- `vercel.json` carries the SPA fallback rewrite so client-side routes
  resolve on hard navigation.

Historical note: on 2026-05-17 `main` was reconciled via PR #17 (closing the
long-standing dev↔main commit gap) and production was redeployed. This was a
one-time un-stale event, not a recurring step.

## Supabase project

Supabase project `upvraruehzurbetzrxov` (EU Frankfurt region, for GDPR).
Provides Auth, the PostgREST data API, and Realtime; the app talks to it
directly with no application server of its own. The full schema (tables, RLS,
RPCs, views, extensions) is documented in `data-model.md`.

## Edge functions

Edge functions are Deno + TypeScript. Code that is shared between functions
lives in `supabase/functions/_shared/` (this is edge↔edge only — see D-F3).

```
supabase/
├── migrations/
│   └── 20260514120000_sprint9_cron_and_jobs.sql
└── functions/
    ├── _shared/macros.ts
    ├── daily-nutrition-snapshot/index.ts   # 0 1 * * *  UTC (≈02:00 CET)
    ├── weekly-rollover/index.ts            # 0 2 * * 1  UTC (≈03:00 CET Mon)
    ├── recalculate-tdee/index.ts           # 0 3 * * *  UTC (≈04:00 CET)
    └── delete-account/index.ts             # GDPR account erasure (user-invoked)
```

The four functions:

- **`daily-nutrition-snapshot`** — for each profile, runs the same
  plan-materialization the Diario page does (so days never opened still get
  `from_plan` `meal_logs`), then computes planned vs consumed macros for the
  previous day in `Europe/Madrid` and upserts into
  `public.daily_nutrition_history`.
- **`weekly-rollover`** — re-applies the most recent `source_template_id` via
  the `apply_template_to_week_admin` RPC (a `SECURITY DEFINER` service-role
  variant of the public `apply_template_to_week`, which uses `auth.uid()` and
  so cannot run from cron).
- **`recalculate-tdee`** — recomputes the adaptive TDEE estimate per profile.
- **`delete-account`** — user-invoked GDPR account erasure.

**Deploy** (per function):

```bash
supabase functions deploy <function-name> --project-ref upvraruehzurbetzrxov
```

**Manual invocation (smoke tests).** Each function returns a JSON array with
one entry per profile and a status (`ok` / `already_exists` / `no_template` /
`insufficient_intake` / etc.):

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

**Math notes.**

- `daily-nutrition-snapshot` uses the shared pure macro core (no mirrored
  math). Per-100g ingredients divide by 100; per-unit ingredients divide by 1;
  `per_serving` rows scale with the recipe's `servings` before contributing.
- `recalculate-tdee` uses 14 days, 7700 kcal/kg, requires ≥10 days of intake
  data, and tolerates a ±3-day gap on the boundary weight measurements.

The macro and date/TZ logic is single-source (R-17 / D-F3): one dependency-free
camelCase core at `src/core/macros.ts` + `src/core/dates.ts`, imported by the
client (via `src/features/recipes/macros.ts` / `src/lib/dates.ts`) and by the
edge (via `supabase/functions/_shared/macros.ts`, which re-exports the core).
`_shared/` is edge↔edge only; it does not bridge client↔edge — the shared core
does. The edge keeps exactly one snake_case adapter (`toSnakeMacros`), used
only at the `daily_nutrition_history` write boundary in
`daily-nutrition-snapshot`. Deno resolves the core via the relative path
`../../../src/core/*.ts` (no transpile/codegen). Deno dependencies are pinned
once in **`supabase/functions/deno.json`** (import map —
`@supabase/supabase-js@2.45.4`); all functions import the bare
`@supabase/supabase-js` specifier. To bump the SDK, change the single
`deno.json` import-map entry, not each function. The
`supabase/functions/_shared/macros.test.ts` golden-vector suite asserts the
client and edge paths stay numerically identical (CI fails on divergence).

## Cron

Three jobs run via `pg_cron`, each invoking an edge function through
`private.invoke_edge_function` (which reads the service-role key from Vault).
Schedules are in UTC (D-F4, D-F5):

| Schedule (UTC) | Job | Edge function |
|---|---|---|
| `0 1 * * *` | daily nutrition snapshot | `daily-nutrition-snapshot` |
| `0 2 * * 1` | weekly rollover (Monday) | `weekly-rollover` |
| `0 3 * * *` | recalculate TDEE | `recalculate-tdee` |

**Why the DST drift is harmless.** The schedules are fixed in UTC, so the
trigger time shifts ±1h across European DST — but the date boundaries each
function operates on are computed *in-function* in `Europe/Madrid`
(`previousDayInTZ` / `mondayOfTodayInTZ`), independent of when the job fires.
No job fires anywhere near Madrid midnight (01/02/03 UTC = 02–05 Madrid
local), so there is no off-by-one on the date key. The snapshot→tdee ordering
is UTC-fixed (a 2h gap that survives DST), so TDEE always runs after the
snapshot it depends on. The drift moves only *when* a job fires, never *what
data* it targets.

The single-timezone (`Europe/Madrid`) assumption is a known limitation; the
concrete multi-TZ implementation path is pre-specced — see D-F4 (not restated
here).

**Auth: one-time setup.** The cron jobs read the `service_role` key from
Vault. Once per project, after the migration is applied:

```sql
select vault.create_secret(
  '<paste service_role key here>',
  'cron_service_role_key'
);
```

The key must be passed as a single-quoted string literal — pasting the raw
key unquoted is a Postgres syntax error (the error text shows it unquoted).

Until this is set, each scheduled run raises
`Vault secret cron_service_role_key not set` (visible via
`select * from cron.job_run_details order by start_time desc limit 5;`).

**Auth: rotation.** After rotating the `service_role` key in the Supabase
dashboard, update the Vault secret. `vault.update_secret` is id-based, so look
the id up by name first:

```sql
-- Rotate cron_service_role_key after rotating the service-role key in the Supabase dashboard.
-- 1) find the secret id:
select id from vault.secrets where name = 'cron_service_role_key';
-- 2a) update in place:
select vault.update_secret('<secret-uuid>', '<new service_role key>');
-- 2b) OR delete + recreate under the same name:
-- select vault.delete_secret('<secret-uuid>');
-- select vault.create_secret('<new service_role key>', 'cron_service_role_key');
```

Then verify the next scheduled run succeeds via the diagnostics below. The
migration references the secret by name, never by value, so the repo stays
clean by design.

**How to tell crons are dead.** Two manual checks: (1) inspect the pg_cron
run history; (2) check the freshest `daily_nutrition_history` row (and
`tdee_estimates`) — if it is older than expected recency, the jobs are not
running (missing/stale Vault secret, or pg_cron skipped a run because the
previous one overran — pg_cron does not overlap a job). Cron diagnostics:

```sql
select jobname, schedule, active from cron.job;
select jobid, runid, status, return_message, start_time
  from cron.job_run_details
  order by start_time desc
  limit 20;
```

**Keep-alive side effect.** Supabase free-tier projects auto-pause after 7
days with no activity (≈30 s cold-start on the next hit). The
`daily-nutrition-snapshot` and `weekly-rollover` jobs both read and write the
DB, which resets the 7-day counter for free — no dedicated keep-alive is
needed. If these crons are ever removed or disabled, a fallback must take over
the keep-alive: a GitHub Action running
`curl https://upvraruehzurbetzrxov.supabase.co/rest/v1/profiles?limit=1` every
3–4 days, or a Cloudflare Worker scheduled trigger doing the equivalent.

Automated cron liveness alerting (a daily staleness check on
`daily_nutrition_history` / `tdee_estimates` that notifies on stale data) is
decided but not yet built:

> ⚠ Changing — see R-18 (D-F5)

## Data seeding

Rather than parsing the original `GYM Gonzalo.xlsx`, the useful content was
pre-extracted once into committed seed files under `supabase/seed/`
(`ingredients.json` ≈ 21 ingredients, `recipes.json` ≈ 10 recipes for the
founding user, and a generated `seed.sql`). The seed runs once on initial
bootstrap (`supabase db reset` or a one-shot script). Ingredients are inserted
as **system seeds** (`created_by_user_id = null`, `source = 'system'`) so they
are immutable and immediately visible to every user via the shared library
(see `data-model.md` Row-Level Security). A future BEDCA seed of generic
Spanish staples is an uncommitted product idea
(`features.md#product-ideas-uncommitted`).

## Backups

The Supabase free tier has **no automatic backups**. For a personal project
this is acceptable, but a weekly safety net is worthwhile until a Pro upgrade
(which adds 7-day PITR):

```bash
supabase db dump --db-url "postgresql://..." > backup-$(date +%F).sql
```

Wire this into the same scheduled GitHub Action that performs the keep-alive
fallback (see [Cron](#cron)) and commit the dump to a private location. Crude
but effective at this scale.

## Auth & privacy

- **Auth methods:** Supabase Auth with email/password **and** Google OAuth.
  The route/gate chain is `RequireAuth → RequireOnboarded → AppLayout`
  (`architecture.md#frontend-layout`).
- **Region:** Supabase EU (Frankfurt) keeps personal data in the EU for GDPR
  (also noted under [Supabase project](#supabase-project)).
- **Right to deletion:** the user-invoked `delete-account` edge function
  (verifies the caller JWT, then `auth.admin.deleteUser`); the
  `auth.users → profiles → user-scoped tables` CASCADE chain erases all user
  data atomically. The ★ Library model (`data-model.md#library-model`, R-01)
  will refine this so a deleted user's shared-pool contributions are
  reassigned to the reserved anon id rather than CASCADE-deleted.
- **Right to export:** a self-service "Download all my data" export (an edge
  function returning a ZIP of per-table JSON) is **specified but not built** —
  the only GDPR action implemented today is account deletion. Tracked as an
  uncommitted product idea (`features.md#product-ideas-uncommitted`).
- **Analytics:** none by default. If analytics is ever added it must be an
  EU-friendly, self-hostable option (Plausible / Umami) — no third-party
  tracking by default.
- **Pre-launch:** a privacy policy and a cookie banner are required before any
  public launch beyond the solo user.

## Schema-in-migrations status

Only one migration file exists —
`supabase/migrations/20260514120000_sprint9_cron_and_jobs.sql` (the Sprint 9
cron + jobs). The rest of the schema (all 15 tables, RLS policies, RPCs,
views, extensions) was built via the Supabase dashboard / MCP and is **not**
reproducible from `supabase/migrations/` — there is no migration history to
stand up an equivalent local database. RLS/RPC correctness therefore rests on
manual review only today.

Baselining the live schema into a complete, reproducible migration history is
the cross-cutting prerequisite that unblocks the generated-types switch
(R-04), the Tier-3 DB/RLS/RPC tests (R-16), and the `bone_kg` (R-03),
`profiles.units` (R-14), and `materialize_plan_for_date` (R-12) migrations:

> ⚠ Changing — see R-00
