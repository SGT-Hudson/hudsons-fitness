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

Two-tier flow (D-F7). CI and the merge gate are real and enforced (D-F1, D-F2, D-F7).

- **Workflow:** `.github/workflows/ci.yml` runs on pnpm 10 / Node 20 on PRs
  and pushes to `main` and `develop`, executing `pnpm lint` + `pnpm build` +
  `pnpm test` (real Vitest Tier-1 step — R-16).
- **`develop` = integration + staging.** Short-lived `claude/*` branch → PR
  into `develop` → `lint-build` green → `.github/workflows/auto-merge.yml`
  arms GitHub-native squash auto-merge → merged hands-off; branch
  auto-deleted. Opt out per PR with a draft or the `do-not-merge` label.
  `develop`'s Vercel preview is the soak surface.
- **`main` = production.** `main` advances only via a user-approved
  `release/YYYY-MM-DD`→`main` PR (merge commit, never squash, so histories
  stay convergent). These PRs are intentionally NOT auto-armed. Promotion is
  on-demand ("promote"), not scheduled.
- **Hotfix:** `claude/hotfix-*` → PR into `main` (human-merged) → then an
  auto-opened back-merge PR `main`→`develop` so the fix survives the next
  promotion.
- **Branch protection on `develop`:** required status check `lint-build`;
  `strict` false; force-push/deletion blocked; 0 required reviews.
- **Branch protection on `main`:** required status check `lint-build`;
  `strict` false; a PR is required before merging (0 required reviews —
  solo); force-push/deletion blocked; `enforce_admins` false (the solo
  admin retains an emergency direct-push escape hatch).
- **Public repo:** `github.com/SGT-Hudson/hudsons-fitness` is public, so RLS
  is the sole security boundary — there is no server-side application tier in
  front of the database (D-F2; RLS policy shapes in `data-model.md`
  Row-Level Security).
- **Discipline:** keep branches short-lived and single-purpose; never push
  directly to `main`/`develop`.
- **Supporting automation:** `auto-merge.yml` (arms squash auto-merge on
  `develop` PRs), `prune-merged-branches.yml` (scheduled daily — deletes
  merged `claude/*` branches; a `closed`-triggered workflow and
  `delete_branch_on_merge` both fail here because the auto-merge bot's merge
  does not trigger workflows, so cleanup must be time-triggered),
  `backmerge.yml` (opens a `do-not-merge` `main`→`develop` PR after a
  release/hotfix), `release-tag.yml` (tags + GitHub Release on a
  `release/*`→`main` merge), Dependabot (grouped, weekly, targets
  `develop`), and GitHub secret scanning + push protection (D-F2/D-F7).

## Hosting & deploy

- **Vercel project** `hudsonfitness` (`prj_69QdEbnDr836rfFwd24J9ISFuXqv`,
  team `team_EDiBxgsadwU6GbSqodEH0G3Q`), framework Vite.
- **Production branch** `main` (Vercel Production deploy-on-merge); alias
  `hudsonfitness.vercel.app`. `develop` and feature branches get Preview
  deploys; the `develop` preview is the staging soak surface (D-F7).
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
│   ├── 20260514120000_sprint9_cron_and_jobs.sql
│   ├── 20260518000000_r06_fat_pct_check.sql        # applied 2026-05-18
│   ├── 20260518010000_r18_cron_healthcheck.sql     # applied 2026-05-18
│   └── 20260518020000_r07_adaptive_tdee_state.sql  # applied 2026-05-18
└── functions/
    ├── _shared/macros.ts
    ├── daily-nutrition-snapshot/index.ts   # 0 1 * * *  UTC (≈02:00 CET)
    ├── weekly-rollover/index.ts            # 0 2 * * 1  UTC (≈03:00 CET Mon)
    ├── recalculate-tdee/index.ts           # 0 3 * * *  UTC (≈04:00 CET)
    ├── cron-healthcheck/index.ts           # 0 6 * * *  UTC (R-18, live)
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
supabase functions deploy <function-name> --project-ref upvraruehzurbetzrxov \
  --use-api --import-map supabase/functions/deno.json
```

Both flags are **required**: `--use-api` does Docker-free server-side bundling and
follows the cross-root `src/core/*.ts` imports (R-17); `--import-map
supabase/functions/deno.json` is needed because there is no `supabase/config.toml`,
so the CLI does **not** auto-detect the import map and the bare `@supabase/supabase-js`
specifier otherwise fails to bundle (HTTP 400). Run from the repo root.

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
- `recalculate-tdee` is a daily incremental adaptive **Kalman** filter
  (R-07 / D-B4): a 2-state linear filter on `[trend_weight, expenditure]`
  maintaining persistent per-user state (trend weight + expenditure +
  covariance) in `tdee_state`. Each run predicts the smoothed weight change
  from `intake − expenditure`, compares it to the observed smoothed weigh-in,
  and the residual self-corrects expenditure. 7700 kcal/kg survives only as
  an internal conversion prior, not the headline formula; the retired
  two-endpoint model's `14d / 10d / ±3d` window gating is gone. Filter
  variance maps to a low/medium/high UI **confidence** band (low/medium
  surfaced only for `tdee_delta` phases). Live in prod since 2026-05-18
  (the R-07 `tdee_state`/`confidence`/`is_warmup` migration was applied and
  `recalculate-tdee` deployed; see [Cron](#cron) R-07 entry).

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

**Cross-root core import — validated (2026-05-18).** The edge functions
import the shared core via the relative path `../../../src/core/*.ts`, which
resolves *outside* `supabase/functions/`. This was the open R-17 risk. Verified
at the first prod deploy: `supabase functions deploy <fn> --use-api` follows
and uploads the cross-root files (the upload log lists `src/core/*.ts`, and
the deployed functions execute them correctly). The vendor/relocate fallback
was **not** needed; the D-F3 shared core stays single-source at `src/core/`.
Operational note: deploys must use `--use-api` (server-side bundling) — the
default path needs Docker, which is not available in the deploy environment —
**and** `--import-map supabase/functions/deno.json` (no `config.toml` exists, so
the import map is not auto-detected; without it the `@supabase/supabase-js` bare
specifier fails to bundle with HTTP 400). Confirmed re-deploying
`daily-nutrition-snapshot` on 2026-05-23 (U-1).

**R-07 adaptive-TDEE deploy (applied 2026-05-18 — ordered).** The R-07
rewrite of `recalculate-tdee` + `supabase/migrations/20260518020000_r07_adaptive_tdee_state.sql`
(`tdee_state` table + nullable `tdee_estimates.confidence`/`is_warmup`) are
live in prod. The ordering invariant below must be honoured on any future
redeploy/rollback:

- **Ordering invariant.** Deploy the rewritten `recalculate-tdee` edge
  function FIRST
  (`supabase functions deploy recalculate-tdee --use-api --project-ref
  upvraruehzurbetzrxov`), THEN apply
  `20260518020000_r07_adaptive_tdee_state.sql`. Reversed, the first
  post-migration scheduled run finds an empty `tdee_state` / unpopulated
  new columns with the old two-endpoint function still live, so no run
  seeds the per-user filter state the new schema expects.
- **Cross-root core caveat.** `recalculate-tdee` imports the shared pure
  filter core (`src/core/tdee.ts`) via the same cross-root relative path as
  the other functions — covered by the **Cross-root core import — validated**
  note above (one check for all functions).
- **Rollback.** The migration is the only persistent change; revert by
  dropping the objects (`drop table tdee_state;` and the two
  `tdee_estimates` columns) and redeploying the previous `recalculate-tdee`
  build. The Sprint-17 reader contract is additive-only, so the frontend
  tolerates the columns being absent (no UI rollback needed).

**R-12 materialize_plan_for_date deploy (applied 2026-05-18 — ordered, code
depends on the migration).** R-12 / D-D6 was the one item whose **code
depends on its migration**: the client (`src/features/diario/api.ts`) and the
`daily-nutrition-snapshot` edge function call
`supabase.rpc('materialize_plan_for_date', …)`, and that RPC did not exist in
prod until `supabase/migrations/20260518060000_r12_materialize_rpc.sql` (the
RPC + the `meal_logs_user_plan_slot_uidx` partial unique index) was applied.
Live in prod; the ordering invariant below must be honoured on any future
redeploy/rollback:

- **Ordering invariant (strict).** (1) Apply the R-12 migration to prod —
  apply staged migration files **individually** (Supabase MCP
  `apply_migration` or the SQL editor); do **not** `supabase db push`: prod's
  recorded migration history uses dashboard-built version timestamps that do
  not match the repo's reconstructed baseline/sprint9 files, so `db push`
  would try to re-apply them. (2) THEN merge the R-12 PR (the client/edge
  code that calls the RPC). (3) THEN redeploy the edge function
  (`supabase functions deploy daily-nutrition-snapshot --use-api
  --project-ref upvraruehzurbetzrxov`) so the cron uses the RPC instead of
  its now-deleted mirrored copy. Reversed (code merged / edge redeployed
  before the migration is applied) prod plan-materialization breaks:
  `supabase.rpc(...)` 404s on every Diario open and every snapshot run. This
  inversion (migration FIRST, then code) is the opposite of R-07's (code
  FIRST, then migration) — R-07's code tolerates the old schema; R-12's code
  cannot run without the RPC.
- **Order-free vs the other migrations.** R-12 only ADDs a function plus a
  partial unique index on `public.meal_logs`; it is disjoint from R-06
  (`phases` CHECK), R-18 (`cron`), R-07 (`tdee_state`/`tdee_estimates`),
  R-03/R-14/R-08 (`profiles`/`tdee_estimates` drops) — applied in any order
  relative to them with the same end state.
- **Cross-root core caveat.** `daily-nutrition-snapshot` imports the shared
  core via the same cross-root relative path as the other functions —
  covered by the **Cross-root core import — validated** note above (one
  check for all functions).
- **Rollback.** The migration is additive (one function + one index). To
  roll back: revert the R-12 PR (restore the prior client/edge mirrored
  `materializePlanForDate`) and redeploy `daily-nutrition-snapshot`; the RPC
  + index can stay (harmless and unused) or be dropped
  (`drop function public.materialize_plan_for_date(uuid, date);` then
  `drop index public.meal_logs_user_plan_slot_uidx;` — drop the function
  first, the index has no other dependants). No data migration occurred, so
  there is nothing to backfill or undo in `meal_logs`.

## Cron

Three jobs run via `pg_cron`, each invoking an edge function through
`private.invoke_edge_function` (which reads the service-role key from Vault).
Schedules are in UTC (D-F4, D-F5):

| Schedule (UTC) | Job | Edge function |
|---|---|---|
| `0 1 * * *` | daily nutrition snapshot | `daily-nutrition-snapshot` |
| `0 2 * * 1` | weekly rollover (Monday) | `weekly-rollover` |
| `0 3 * * *` | recalculate TDEE | `recalculate-tdee` |
| `0 6 * * *` | cron liveness healthcheck (R-18, live since 2026-05-18) | `cron-healthcheck` |

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

**Automated cron liveness alerting (R-18 / D-F5).** A fourth job,
`cron-healthcheck`, detects a *silent under-run* of the data crons — the D-F5
failure mode: a missing/stale Vault secret, or pg_cron skipping a job because
the previous run overran (pg_cron does not overlap a job's next occurrence).
Both leave the data crons not writing while nothing surfaces it; the daily
snapshot is also the free-tier keep-alive, so a silent death is double-impact.

- **What it checks.** The edge function `cron-healthcheck`
  (`supabase/functions/cron-healthcheck/index.ts`) reads the freshest
  `daily_nutrition_history.logged_on` and `tdee_estimates.computed_on` and runs
  the shared pure freshness predicate `src/core/liveness.ts`
  (`evaluateFreshness` / `decideAlert`, deterministic Vitest cover in
  `src/core/liveness.test.ts`). "Today" is `Europe/Madrid` via `todayInTZ()`
  (D-F4 — the same boundary the snapshot job keys on).
- **Threshold + rationale.** `daily_nutrition_history` is the PRIMARY signal:
  stale if its freshest `logged_on` is **more than 2 calendar days** behind
  Madrid-today (`STALE_AFTER_DAYS.daily_history = 2`). Reasoning: the snapshot
  writes the *previous* Madrid day so a healthy freshest row is inherently ~1
  day old; +1 day tolerates a single transient missed run (anti-flap); the ±1h
  UTC/DST drift (D-F4) is absorbed by the whole-day UTC-midnight diff. Net: one
  missed daily run does NOT alert; two consecutive missed runs (or an empty
  table) DO. `tdee_estimates` is a SECONDARY signal with a lenient 4-day
  threshold (`recalculate-tdee` legitimately lags new users during the
  adaptive filter's warm-up before a confident estimate is emitted, so it
  trails for data reasons, not cron death) — a stale `tdee_estimates`
  alone never alerts; it only contributes when `daily_history` is also stale.
- **How it alerts (dependency-light, no new secret).** On alert the function
  (1) `console.error`s a single structured `CRON_LIVENESS_ALERT {…}` line (the
  matchable signal for any future log-drain alerting, no dependency added now)
  and (2) returns **HTTP 503**. Because pg_cron invokes it via
  `net.http_post`, the 503 makes the failed run visible in
  `cron.job_run_details` — exactly where the "how to tell crons are dead"
  manual check above looks — so a silent under-run becomes a loud, queryable
  one. A healthy run logs `cron-healthcheck OK …` and returns 200.
- **Live since 2026-05-18 (ordered).** The cron schedule
  **`supabase/migrations/20260518010000_r18_cron_healthcheck.sql`**
  (`0 6 * * *` UTC — after the three data crons; reuses the existing
  `private.invoke_edge_function` + Vault `cron_service_role_key`, no new
  secret/helper) is applied. Ordering invariant (honour on any
  redeploy/rollback): deploy the edge function FIRST
  (`supabase functions deploy cron-healthcheck --use-api --project-ref
  upvraruehzurbetzrxov`), THEN apply the migration — otherwise the first
  scheduled run 404s and self-reports as an alert. Rollback:
  `select cron.unschedule('cron-healthcheck');`.

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

The live schema is now captured in-repo. The baseline migration
`supabase/migrations/20260508080000_r00_baseline_schema.sql` (R-00) was
reconstructed read-only from `information_schema`/`pg_catalog` and recreates
the full pre-existing `public` schema (15 tables, RLS policies, the 4 user
RPCs, the `handle_new_user`/`mark_week_diverged` triggers, the
`body_measurements_smoothed` view, the `extensions`-schema extensions). The
reproducibility gap is closed in-repo: `supabase/migrations/` is now a
complete history rather than the lone Sprint-9 file.

**Migration sequence (the Wave-3 set was applied 2026-05-18).** Filename-lexicographic order:

```
20260508080000_r00_baseline_schema.sql              # pre-Sprint-9 baseline (R-00)
20260514120000_sprint9_cron_and_jobs.sql            # Sprint 9 cron/RPC/Vault helper
20260518000000_r06_fat_pct_check.sql                # applied 2026-05-18 (R-06)
20260518010000_r18_cron_healthcheck.sql             # applied 2026-05-18 (R-18)
20260518020000_r07_adaptive_tdee_state.sql          # applied 2026-05-18 (R-07)
20260518030000_r03_drop_bone_kg.sql                 # applied 2026-05-18 (R-03)
20260518040000_r14_drop_units.sql                   # applied 2026-05-18 (R-14)
20260518050000_r08_drop_dead_tdee_cols.sql          # applied 2026-05-18 (R-08)
20260518060000_r12_materialize_rpc.sql              # applied 2026-05-18 (R-12)
20260520120000_r01_library_anon_seed.sql            # applied 2026-05-20 (R-01)
20260520120010_r01_user_refs.sql                    # applied 2026-05-20 (R-01)
20260520120020_r01_backfill.sql                     # applied 2026-05-20 (R-01)
20260520120030_r01_drop_deleted_at.sql              # applied 2026-05-20 (R-01)
20260520120040_r01_hide_rpcs.sql                    # applied 2026-05-20 (R-01)
20260520120050_r01_save_recipe_ref.sql              # applied 2026-05-20 (R-01)
20260520120060_r01_account_delete_reconcile.sql     # applied 2026-05-20 (R-01, 2nd sanctioned DEFINER)
20260520120070_r01_rls.sql                          # applied 2026-05-20 (R-01, LAST DDL of the set)
20260520120080_r01_backup_table_rls.sql             # applied 2026-05-20 (R-01 follow-up — RLS-enable the rollback snapshot)
20260522120000_training_exercises.sql               # applied 2026-05-21 (R-19, Training MVP)
20260522120010_training_sessions_sets.sql           # applied 2026-05-21 (R-19)
20260522120020_training_save_workout_rpc.sql        # applied 2026-05-21 (R-19)
20260522120030_training_exercises_rls.sql           # applied 2026-05-21 (R-19, LAST DDL of the set)
20260523120000_r21_profiles_contribute_to_off.sql   # applied 2026-05-21 (R-21 — later removed)
20260524120000_r21_drop_contribute_to_off.sql       # STAGED — R-21 REMOVED (drops the column; apply after the removal reaches main)
20260528120000_f2_routines.sql                      # applied 2026-05-24 (F-2 / R-22): routines + routine_exercises tables + RLS
20260528120010_f2_programs.sql                      # applied 2026-05-24 (F-2 / R-22): programs + program_days tables + RLS; AFTER f2_routines (program_days refs routines)
20260528120020_f2_workout_session_stamps.sql        # applied 2026-05-24 (F-2 / R-22): adds program_id + routine_id stamp columns to workout_sessions; AFTER f2_programs
20260528120030_f2_rpcs.sql                          # applied 2026-05-24 (F-2 / R-22): save_routine, save_program, set_active_program RPCs; replaced 5-arg save_workout with 7-arg; LAST (refs all F-2 tables)
20260529120000_f2b_warmup_sets.sql                  # applied 2026-05-24 (F-2b / R-22): routine_exercises.warmup_sets jsonb + array CHECK; recreated save_routine to persist it (additive, backward-compatible)
```

**R-21 OFF contribute-back — REMOVED (2026-05-21).** The feature was pulled as
a product decision before it was ever activated. Removal steps: (1) the
`off-contribute` edge function + client/core code are deleted in-repo; (2) drop
the `profiles.contribute_to_off` column via
`20260524120000_r21_drop_contribute_to_off.sql` — **apply only after the
removal is on `main`** (the Settings toggle WROTE the column; dropping it while
old prod code is live would break, R-01-style); (3) delete the `off-contribute`
edge function from the project; (4) remove the `OFF_USER_ID` / `OFF_PASSWORD`
edge secrets. **Barcode scanning (R-20) is unaffected.**

**R-19 Training MVP Wave-3 apply procedure (executed 2026-05-21).** The
four training migrations were applied **in order** (filename-lexicographic
= build order) via `apply_migration`, after R-01's set (the `exercises`
table follows the post-R-01 ingredient-pool shape verbatim, including the
`LIBRARY_ANON_OWNER_ID` sentinel in the RLS policies). They are NOT
mutually order-free with each other — `training_save_workout_rpc`
references `workout_sessions` and `workout_sets` (Task 2 first);
`training_exercises_rls` references `exercises` (Task 1 first) and is the
LAST DDL of the set. Post-apply check confirmed 34 system-seed exercises,
the two workout tables, the `save_workout` RPC, and 12 RLS policies; the
security advisor flagged nothing new.

**F-2 (R-22) Wave-3 apply procedure (executed 2026-05-24).** The four F-2 migrations were applied **in order** (filename-lexicographic = build order) via `apply_migration` after R-19's four training migrations (already live since 2026-05-21). They are NOT mutually order-free: `f2_programs` references `routines` (after `f2_routines`); `f2_workout_session_stamps` adds FK columns referencing both `programs` and `routines` (after `f2_programs`); `f2_rpcs` references all four F-2 tables and drops/recreates the 5-arg `save_workout` signature (LAST). Post-apply check confirmed the 4 tables RLS-enabled with policies, the two `workout_sessions` stamp columns (`program_id`/`routine_id`, nullable), and the 4 RPCs (all `SECURITY INVOKER` + `search_path=public`, granted to `authenticated`; `save_workout` now 7-arg with the old 5-arg signature dropped). Security advisor flagged nothing new. (The code branch was already merged via #122 before this apply; the 7-arg `save_workout` RPC now backs the live calling code.)

**F-2b warm-up sets Wave-3 apply (executed 2026-05-24).** Single migration `20260529120000_f2b_warmup_sets.sql` applied via `apply_migration` after the F-2 set: adds `routine_exercises.warmup_sets jsonb` (+ array-type CHECK) and recreates `save_routine` to persist it (body otherwise identical to the F-2 version). Additive/backward-compatible — merged via #128 before apply. Post-apply check confirmed the `jsonb` column, the CHECK constraint, and that `save_routine` references `warmup_sets`; security advisor flagged nothing new.

**R-01 Wave-3 apply procedure (executed 2026-05-20).** The eight R-01
migrations were applied **in order** (filename-lexicographic = build
order) via `apply_migration`. They are NOT mutually order-free with each
other — `r01_backfill` reads `recipes.deleted_at` (must run before
`r01_drop_deleted_at`); `r01_hide_rpcs` and `r01_save_recipe_ref`
reference `recipes.created_by_user_id` (must run after the rename in
`r01_drop_deleted_at`); `r01_rls` is the LAST DDL and references both
new tables + the renamed column. Relative to the other 2026-05-* staged
migrations the set is **order-free** (disjoint object surface — see
spec §11). After the eight DB migrations applied, the post-apply security
advisor flagged that `public._r01_recipes_owner_backup` (the rollback
snapshot from migration 3) was exposed to PostgREST without RLS; the
`r01_backup_table_rls` follow-up enables RLS with no policies
(deny-all to anon/authenticated; service_role bypasses RLS for the
rollback procedure). Then the reworked `delete-account` edge function was
redeployed (it calls `reconcile_account_delete` — would fail loudly if
the function wasn't there).

The `20260518*` files were applied **individually** at the Wave-3 checkpoint
(Supabase MCP `apply_migration`), not via `supabase db push` (prod's recorded
migration history uses dashboard-built versions that do not match the repo's
reconstructed baseline/sprint9 files, so `db push` would try to re-apply
them). They are mutually order-free (disjoint object sets). The one special
case was **R-12**: its calling code (client + edge) depends on the RPC, so
the migration was applied **before** the R-12 PR (#38) merged (see the R-12
runbook above).

The baseline deliberately excludes the objects the Sprint-9 migration already
owns (`pg_net`/`pg_cron`, the `private` schema + `invoke_edge_function`,
`apply_template_to_week_admin`, the `tdee_estimates (user_id, computed_on)`
unique constraint, the three cron jobs), so `baseline + sprint9` together
equal the full pre-Wave-3 live schema with no double-create error; the
`20260518*` migrations (applied 2026-05-18) layer their changes on top. The
baseline file itself is a **pre-Wave-3 snapshot** — it intentionally does not
contain the R-06 CHECK, R-18 cron, R-07 `tdee_state`, R-03/R-08/R-14 drops, or
the R-12 RPC; those live in their own `20260518*` files. Current prod =
baseline + sprint9 + all `20260518*`.

**Baseline re-apply is a guarded no-op (R-00 verification still open).** CI
does not run migrations and prod already contains every baseline object, so
the baseline file is not applied by its PR; it is written with
`create … if not exists` / guarded DDL so applying it to prod is a safe
no-op. Verifying that no-op against prod via the Supabase CLI
(`supabase db reset` locally + `supabase db diff --linked`) was **not run**
during the Wave-3 apply (the `20260518*` files were applied directly via MCP,
the baseline was untouched); it remains an open R-00 reproducibility check —
the CLI is now available, so it can be performed in a follow-up.

**Regen / verify command.** To regenerate the baseline from a live project (or
to diff the repo migrations against prod), use the Supabase CLI from a machine
that has it installed and is linked to the project:

```bash
# Regenerate a schema-only dump of the live prod schema:
supabase db dump --project-ref upvraruehzurbetzrxov --schema public -f schema.sql

# Reproducibility check (Wave-3): stand up the migration history locally and
# confirm it matches prod (expected: no diff / a clean no-op apply).
supabase db reset            # applies supabase/migrations/* to a local DB
supabase db diff --linked    # diff local migration state vs the linked prod DB
```

**Regenerate `src/types/database.ts` (R-04).** The DB types are generated
from the live schema, not hand-written. After any applied schema change,
regenerate and commit the file:

```bash
supabase gen types typescript --project-id upvraruehzurbetzrxov > src/types/database.ts
```

Then **re-apply the post-generation corrections** (the generator cannot infer
SQL-function argument nullability and emits every text arg as non-null
`string`): restore `string | null` on `save_recipe.Args.{p_recipe_id,
p_description,p_instructions}` and `save_template.Args.p_template_id` (a null
id means "create new"). The marker comment above the `Functions` block in the
file documents this; see `conventions.md` (generated-types caveats). Verify
with `pnpm typecheck && pnpm lint && pnpm build` before committing.

Tier-3 DB/RLS/RPC tests (R-16) can stand up a local DB from this history via
`supabase start` + pgTAP; the generated-types switch (R-04) and the
`bone_kg` (R-03), `profiles.units` (R-14), dead-`tdee_estimates`-cols (R-08),
and `materialize_plan_for_date` (R-12) migrations are applied in prod and sit
on a reproducible baseline.
