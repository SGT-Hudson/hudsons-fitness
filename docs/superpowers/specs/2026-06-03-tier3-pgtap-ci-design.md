# R-16 Tier-3 — pgTAP DB/RLS/RPC tests in CI — Design

- **Date:** 2026-06-03
- **Roadmap:** R-16 (Tier-3), decision D-F1
- **Status:** design
- **Depends on:** R-00 (reproducible migration history — done)

## 1. Goal

Stand up the third and final test tier: DB-level tests that exercise RLS
policies, RPC security/behaviour, and the schema itself against a **real
Postgres**, run automatically in CI. Until now RLS/RPC correctness has rested
on manual review only (documented gap in R-16/R-00). This closes it.

Concretely, Tier-3 must catch the classes of bug that Tier-1 (pure logic) and
Tier-2 (component) structurally cannot:

- A user reading/writing another user's rows (RLS isolation failure).
- A child row re-pointed into another user's parent (the `WITH CHECK` gap R-22
  tracks — these tests make it visible).
- An RPC silently shipped as `SECURITY DEFINER`, or missing `set search_path`,
  violating hard-invariant #3.
- A replace-children RPC leaking/orphaning rows.
- The migration history failing to apply cleanly from zero, or being
  non-idempotent (never actually tested before — the history was authored as
  incremental patches against the live DB).

## 2. Approach — Supabase CLI in GitHub Actions

Three runner options were weighed:

1. **Supabase CLI (`supabase start` + `supabase test db`)** — *chosen.* The
   CLI stands up the real Supabase Postgres image (bundles pgTAP, pg_trgm,
   btree_gist, pgcrypto, pg_cron, pg_net, supabase_vault, the `auth` schema +
   `auth.uid()`/`auth.role()`/`auth.jwt()`, and the `anon`/`authenticated`/
   `service_role` roles), applies all migrations on start, and runs pgTAP via
   `supabase test db`. It is the blessed, faithful path and dissolves the
   pg_cron/pg_net/vault/auth bootstrap problem for free.
2. **Bare `supabase/postgres` service container + psql + pg_prove** — lighter
   but forces us to hand-roll the auth-schema/roles bootstrap and fight
   cron/vault extension loading. Rejected: reinvents what the CLI gives us, more
   fragile, lower fidelity.
3. **Plain `postgres:16` service container** — rejected outright: no pgTAP, no
   auth schema, no Supabase extensions; not faithful to prod.

Cost of the chosen path: the full local stack adds ~2–3 min to CI. Acceptable
for a faithful Tier-3 gate. Image layers cache across runs.

### 2.1 Why not a service container

GitHub Actions service containers cannot override a container's entrypoint
command or pass custom `postgresql.conf` args, which `pg_cron`
(`shared_preload_libraries`) needs. `supabase start` configures Postgres
correctly itself, so we sidestep this entirely.

## 3. Components

### 3.1 `supabase/config.toml` (new)

The project never ran `supabase init` (migrations were applied via MCP). Add a
**minimal** `config.toml` so the CLI can run locally and in CI. Pin the major
Postgres version to match prod (15). Keep only what `db start`/`test db` needs;
studio/auth/realtime/storage stay at defaults (they cost startup time but the
CLI manages them — we may exclude non-DB services via `supabase start -x` to
trim CI time; decided at implementation time against a green baseline).

### 3.2 `supabase/tests/*.test.sql` (new) — the pgTAP suite

One file per concern. Each file is a single transaction:
`begin; select plan(N); … select * from finish(); rollback;` — pgTAP's
standard self-rolling-back shape, so tests never persist and never interfere.

Test users are created by inserting into `auth.users` directly (the test
session runs as the superuser `postgres`, which bypasses RLS). A user context
is simulated per assertion block with:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
```

`auth.uid()` reads `request.jwt.claims->>'sub'`, so this is exactly how Supabase
evaluates RLS in production. `reset role;` (or `set local role postgres`)
returns to the privileged context for setup/teardown between blocks.

Inserting into `auth.users` fires the `handle_new_user` trigger → a `profiles`
row is auto-created, exercising that trigger as a side effect.

**File plan:**

- **`00_schema.test.sql`** — schema smoke + invariants. Every expected table
  exists; RLS is *enabled* on every `public` table (`pg_class.relrowsecurity`);
  every expected RPC exists; the **SECURITY-model invariant**: exactly the
  sanctioned set of functions is `prosecdef` (DEFINER) —
  `apply_template_to_week_admin`, `reconcile_account_delete` (the two sanctioned
  RPC exceptions) plus the infra `handle_new_user` trigger and the private
  `invoke_edge_function` helper — and **every other** `public` function is
  INVOKER with a non-empty `search_path` in `proconfig`. This is the
  machine-checked form of hard-invariant #3.

- **`01_rls_user_owned.test.sql`** — per-user isolation for the standard
  `auth.uid() = user_id` tables (profiles, body_measurements, goals, phases,
  meal_logs, meal_plan_templates, meal_plan_weeks, daily_nutrition_history,
  tdee_estimates, tdee_state, workout_sessions, programs, routines). For a
  representative subset (not all 13 — pick the structurally distinct ones to
  keep the suite legible): user A inserts a row; user B cannot SELECT it, cannot
  UPDATE it, cannot DELETE it; user B cannot INSERT a row tagged with A's
  user_id (INSERT `WITH CHECK`); user A can do all four to their own.

- **`02_rls_child.test.sql`** — via-join child tables (workout_sets,
  recipe_ingredients, meal_plan_template_slots, meal_plan_week_slots,
  routine_exercises, program_days): isolation routes through the parent. User B
  cannot read/write a child whose parent belongs to A. The **cross-parent
  re-point** test (move a child into another user's parent via UPDATE) is the
  R-22 gap: written but wrapped in `todo_start('R-22: UPDATE WITH CHECK gap')` /
  `todo_end()` so it is visible and non-failing today, and will start passing
  (flip to a hard assertion) when R-22 adds the `WITH CHECK` clauses. F-2's
  `routine_exercises`/`program_days` already have `WITH CHECK`, so their
  re-point tests are hard assertions from the start.

- **`03_rls_pool.test.sql`** — shared pool (ingredients, exercises): any
  authenticated user can SELECT the whole pool; only the real owner
  (`created_by_user_id = auth.uid()`, non-NULL, non-anon) can UPDATE/DELETE;
  system seeds (`created_by_user_id IS NULL`) and anon-owned items (sentinel
  `00000000-0000-0000-0000-00000000a0a0`) are immutable to everyone; the
  `user_ingredient_refs`/`user_recipe_refs` PII tables are strictly
  per-user.

- **`04_rpc.test.sql`** — RPC behaviour:
  - `save_recipe` / `save_workout` / `save_routine` / `save_program`:
    create-then-replace children (call twice, assert children fully replaced,
    not duplicated or orphaned); created under the caller's ownership; a second
    user cannot mutate via the RPC.
  - `save_recipe` create-path also inserts the `user_recipe_refs` row (R-01).
  - `materialize_plan_for_date`: future date → 0 rows (Madrid-TZ guard); today
    → materialises active-week slots; second call same date → 0 (idempotent via
    the partial unique index).
  - `set_active_program`: flips exactly one active program per user (partial
    unique index holds; previously-active deactivated).
  - `hide_owned_recipe` / `hide_owned_ingredient`: drops the caller's ref row
    and transfers pool ownership to the anon sentinel; a non-owner call is a
    no-op.
  - `reconcile_account_delete` (DEFINER, service-role): hard-deletes the user's
    ref rows, reassigns still-owned pool items to anon, leaves other users'
    data intact.

### 3.3 `ci.yml` — new `db-test` job

A third job alongside `lint-build` and `edge-check`:

```yaml
db-test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v6
    - uses: supabase/setup-cli@v1
      with: { version: latest }   # pin to a known-good version after first green
    - run: supabase start         # applies all migrations on start
    - run: supabase test db
    - if: always()
      run: supabase stop --no-backup
```

Exact start flags (`-x` service excludes to trim time) are tuned against a
green baseline, not guessed. The job is added to branch-protection required
checks **only after** it is green on `develop` (so it never blocks merges while
being stabilised).

## 4. Expected schema fixes this work will surface

Tier-3 is the first time the migration history runs from zero. Two known issues
will need fixing for `supabase start` to succeed; others may surface:

1. **Timestamp collision** — `20260523120000_f1_ingredients_name_en.sql` and
   `20260523120000_r21_profiles_contribute_to_off.sql` share a version. The CLI
   keys migrations by version and will reject or mis-order duplicates. Fix:
   rename the R-21 one to `20260523120001_…`. Safe — prod was applied via MCP,
   not the CLI migration table, so repo renames don't desync prod. The two
   touch different tables; end-state is identical.
2. **Apply-from-zero / idempotency** — if any migration assumes live-DB state
   the baseline doesn't reconstruct, `supabase start` fails. Fixes are made in
   the offending migration (guarded `IF NOT EXISTS`, ordering) — each fix is a
   real latent-bug catch and is logged in the PR.

These fixes stay **minimal and forward-only**; we do not rewrite history beyond
what apply-from-zero requires. The R-21 add-then-drop pair is left intact (net
no-op) rather than removed, preserving the reproducibility claim.

## 5. Scope boundaries

- **In:** config.toml, the pgTAP suite, the `db-test` CI job, the minimal
  migration fixes to make apply-from-zero + `supabase test db` green, and docs.
- **Out:** the R-22 `WITH CHECK` fix itself (separate task — Tier-3 only makes
  the gap visible via `todo` tests); R-01 Phase 2 reaper; any new feature work;
  edge-function (Deno) DB integration tests (Tier-1 parity already guards the
  shared core; edge↔DB integration is a later tier if ever).
- **Verification reality:** no working local Docker in this environment, so the
  suite is authored against the migration SQL and **verified by running the
  `db-test` job on the PR**, iterating to green. Nothing is claimed green until
  the CI run is green.

## 6. Success criteria

1. `supabase start` applies the full migration history from zero without error.
2. `supabase test db` runs the pgTAP suite green in the `db-test` CI job on the
   PR into `develop`.
3. The suite asserts, at minimum: RLS enabled on all public tables; per-user
   isolation on user-owned + child tables; pool immutability rules; the
   SECURITY-model invariant (only the sanctioned DEFINER set); replace-children
   correctness; `materialize_plan_for_date` guard + idempotency; the R-22 gap
   captured as `todo`.
4. Docs updated: roadmap R-16 Tier-3 → done; operations runbook (how to run
   Tier-3 locally + in CI); a decisions entry for the CLI-based approach.
