# Test strategy (R-16 / D-F1)

Spec-first record of the tiered test model. D-F1 is the ruling; this is its
concrete shape. Decisions here are not re-litigated — see `docs/decisions.md`
D-F1 for the *why*.

## Tiers

| Tier | Scope | Runner / env | Where | CI |
|---|---|---|---|---|
| 1 | Pure logic (no DOM/network/DB): `src/core/*`, `src/lib/macros.ts`, `src/lib/dates.ts`, `features/*/targets.ts`, `interpolateSeries`, B3 fraction helpers, edge `_shared/macros.ts` | Vitest, **Node** | `src/**/*.test.ts`, `supabase/functions/**/*.test.ts` | `lint-build` job, `pnpm test` — **landed** |
| 2 | Thin component layer for math-at-boundary forms (PhaseDialog, MeasurementDialog) | Vitest + RTL, **jsdom** (`environmentMatchGlobs`) | `src/**/*.test.tsx` | same `pnpm test` — **landed** (rode R-09) |
| 3 | DB schema / RLS / RPC contracts | **pgTAP** via `supabase test db` (local `supabase start` Postgres) | `supabase/tests/database/*.sql` | separate **manual** `db-tests` workflow — **authored, execution pending an env** |
| E2E | Full browser flows | — | — | **Out of scope** (low ROI for a solo MVP; D-F1) |

Unit vs component vs DB boundary: arithmetic/date/TZ purity → Tier 1; a
form's validation-to-payload mapping → Tier 2; anything whose correctness is
*RLS, a CHECK/EXCLUDE/FK constraint, a trigger, or an RPC body* → Tier 3
(those cannot be exercised without a real Postgres).

## Tier-3 contents

- `00_rls_structural.sql` — the exhaustive RLS pin: RLS enabled on every one
  of the 15 `public` tables, and the exact policy set per table
  (`policies_are`). This is the drift detector — any added/removed/renamed
  policy fails CI.
- `01_rls_behavioral.sql` — depth on the high-risk surfaces: cross-user
  allow/deny for a representative per-user table and a join-scoped table, and
  the **non-uniform** shared-library `ingredients` rules (D-A1: all
  authenticated read; insert self-attributed; update/delete creator-only;
  `created_by_user_id IS NULL` system seed immutable) plus `tdee_state`.
- `02_rpc_security.sql` — every `public` RPC's security class: the four user
  RPCs + `materialize_plan_for_date` are SECURITY INVOKER with a pinned
  `search_path`; `apply_template_to_week_admin` is the **only** SECURITY
  DEFINER RPC reachable via PostgREST and is revoked from
  `public/anon/authenticated`, granted only to `service_role`;
  `private.invoke_edge_function` is DEFINER and not granted to
  anon/authenticated. This encodes the D-C5/D-D6 RPC invariant.
- `03_rpc_behavior.sql` — behavioral contracts that protect real defects the
  conventions review found: `materialize_plan_for_date` no-ops future dates
  and missing weeks, is idempotent via the partial unique index, and maps
  `meal_index → meal_type` correctly; `save_recipe` create-vs-update +
  not-owned raises; the `meal_log_one_source` exactly-one CHECK; the `phases`
  per-user non-overlap EXCLUDE; the shared-data `ON DELETE RESTRICT`
  backstop; `handle_new_user` auto-profile; `mark_week_diverged` today+ only.

Structural is exhaustive (all tables); behavioral is depth on the
security-critical and non-obvious surfaces. Together they pin RLS against
drift and verify the parts of the schema whose correctness is not visible to
lint/build/Vitest.

## RLS actor switching (dependency-free)

No external pgTAP-helper extension. Each test file seeds users by inserting
into `auth.users` (the `handle_new_user` trigger then creates the matching
`public.profiles` row), and switches actor inline:

    set local role authenticated;
    set local "request.jwt.claims" = '{"sub":"<uuid>","role":"authenticated"}';

`auth.uid()` in the Supabase image resolves `sub` from
`request.jwt.claims`. Reset to owner between actors with
`set local role postgres;`. Every file is one `begin … rollback` transaction
(`supabase test db` discards it), so seeded rows never persist.

## CI shape

- `lint-build` (existing, **required**, blocks auto-merge): `pnpm install`,
  `pnpm lint`, `pnpm build`, `pnpm test` (Tier-1 + Tier-2). Unchanged.
- `db-tests` (**new, separate file, `workflow_dispatch` only, NOT a required
  check**): installs the Supabase CLI, `supabase db start`, `supabase test
  db` (Tier-3 pgTAP), then the R-00 reproducibility script. It is manual on
  purpose: it has never had a green run (no local Docker/CLI in the authoring
  environment), so wiring it into branch protection now would block
  auto-merge on an unproven job. Promotion path is documented in the workflow
  header: after the first green dispatch run, add `pull_request` triggers and
  add `db-tests` to the required checks.
- Edge-function (Deno) tests: the existing `_shared/macros.test.ts` parity
  vector runs under Vitest in Tier-1 today (`supabase/functions/**/*.test.ts`
  in `vitest.config.ts`). A dedicated `deno test` job is deferred — not
  blocking; recorded here so the option is pre-analysed.

## Execution constraint (honest status)

Tier-3 is **authored but not executed**. The authoring environment has no
Docker and no Supabase CLI, so `supabase start` / `supabase test db` cannot
run here. R-16 stays `in-progress` until a machine with Docker + the CLI runs:

    supabase db start
    supabase test db
    bash scripts/db-reproducibility-check.sh   # R-00 reproducibility

A clean `supabase test db` + an empty `supabase db diff --linked` flips R-16
Tier-3 and closes the R-00 reproducibility check. Until then, RLS/RPC
correctness rests on manual review + this authored suite, stated honestly in
`operations.md` and `roadmap.md`.
