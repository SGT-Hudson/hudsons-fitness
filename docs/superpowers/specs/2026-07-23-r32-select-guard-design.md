# R-32 — Tier-4: a CI guard for PostgREST select strings

**Date:** 2026-07-23
**Roadmap:** R-32 (DB-integration test tier / e2e guard for PostgREST select strings)
**Type:** test infrastructure (no product behaviour change)

## Problem

On 2026-05-24 a planner regression reached production: `fetchActiveWeek` selected
`meal_times` from `meal_plan_weeks`, a column that does not exist. PostgREST
answered 400, the planner broke, and every gate stayed green.

Nothing in the pipeline can see this class of bug:

- **Typecheck is blind.** The fetch helpers cast results `as unknown as {…}` (20
  sites), discarding supabase-js's typed-select inference. postgrest-js's
  compile-time select parser is unreliable for deep nested embeds anyway.
- **Tier-1/Tier-2 are blind.** Component and hook tests mock Supabase, so the
  real query string never reaches a server.
- **Tier-3 is blind.** pgTAP exercises schema, RLS and RPCs *in SQL*. It never
  runs the client's `.select(...)` strings.

The roadmap has carried a standing rule since then — "any change to a
`.select(...)` string must be verified against a real DB before merge" — which is
human discipline standing in for a gate.

## Decisions

1. **Guard the select strings; do not build a full integration tier.** PostgREST
   validates the select string before it applies filters, so calling a helper
   with a non-existent user id returns zero rows *but still 400s on an invalid
   column, embed or relation*. The whole guard therefore needs **no seed data and
   no auth session**. Asserting on returned shape would need fixtures that age
   with the schema and would duplicate what pgTAP already covers for RLS.
   Accepted cost: a wrong `as unknown as {…}` mapping still passes this gate.
2. **Cover only selects with an explicit string.** `select()` and `select('*')`
   name no columns and cannot break; `'*, routine_exercises(*)'` names a relation
   and **can**, so it is in scope. Inventory at spec time: **20 helpers in
   scope**, 35 bare-`'*'` and 3 bare-`select()` call sites out of scope.
3. **Mutations are out of scope** — every insert/update/upsert in the codebase
   chains `select()` or `select('*')`. This is a consequence of decision 2, not a
   separate carve-out; if a mutation ever gains an explicit select, the coverage
   meta-test drags it in automatically.
4. **A coverage meta-test, not discipline.** The failure mode of a registry is
   that a new helper never gets registered and the suite silently narrows. The
   meta-test makes that a red build.
5. **Extend the existing `db-test` CI job** rather than adding one. It already
   runs `supabase start` with the full migration history applied, and it is
   already a required check on `develop` — so the guard enters the gate without
   touching branch protection.
6. **Polyfill `ws` in the new tier only.** Under Node 20 `createClient` throws
   `"native WebSocket not found"`, so importing `@/lib/supabase` is fatal.
   Upgrading the project to Node 22 would fix it natively but drags in CI,
   `engines`, the local WSL toolchain and the pnpm version (pnpm 11 already
   crashes on Node 20) — out of scope for R-32. The polyfill is two lines in the
   tier's setup file and is deleted when the project moves to Node 22.
7. **Option 2 of the roadmap entry is not built.** Extending the agent-browser
   e2e harness to cover planner load / apply-template against a real backend
   stays open. R-32 closes the select-string half only; the roadmap entry records
   what is left.

## Design

Three files under `src/test/integration/`, plus config and CI wiring.

### The registry — `registry.ts`

A flat array of cases. Each case names the helper and how to invoke it with
constants that match nothing:

```
{ id: 'planner/fetchActiveWeek', file: 'src/features/planner/api.ts',
  fn: 'fetchActiveWeek', run: () => fetchActiveWeek(MISSING_USER_ID, '2026-01-05') }
```

`MISSING_USER_ID` is a fixed UUID that is never seeded. Dates, ids and limits are
fixed constants — nothing in a case may vary between runs.

This is the only file that grows when a helper is added.

### The runner — `selects.itest.ts`

One `it` per registry case: await `run()`, assert it does not throw. A broken
select surfaces as a PostgREST 400 that the helper rethrows, so the failure names
the helper and carries the server's own message (`column … does not exist`).

Helpers that return `null`/`[]` for a missing user are *passing* — absence of
data is the expected outcome and is not asserted on.

**Each case also asserts that at least one HTTP request left the process.** The
runner wraps `globalThis.fetch` with a per-case counter and fails a case that
completed without querying anything. Without this, a helper that short-circuits
before touching the network — `fetchRecipeMacrosByIds([])` returns `[]` with no
request — would sit in the suite as a permanently green test that exercises no
select string at all. This is the same failure the R-36 review found (four tests
green against deliberately broken code), caught structurally instead of by
hand-mutating all 20 cases. It also pins the registry's arguments: a case must
pass inputs that actually reach PostgREST.

### The coverage meta-test — `coverage.itest.ts`

Reads every non-test `.ts`/`.tsx` under `src/` containing `.select(`, extracts
exported functions whose body contains a select with an explicit string
(excluding bare `select()` and exactly `select('*')`), and asserts the set equals
the registry's. Missing → fail, naming the unregistered function. Stale → fail,
naming the case whose helper no longer exists.

An `EXCLUDED` map holds the deliberate exclusions with a written reason per
entry: the four `select('*')` call sites inside pages (`ExerciseHistoryPage`,
`EntrenamientoPage`, `RoutineEditorPage`, `SessionEditorPage`) — not invocable
without rendering, and a bare `'*'` cannot break.

Known limit, accepted: the extractor is a regex over source, so unusual
formatting could hide a select from it. It is a backstop against forgetting, not
a parser.

### Config and scripts

- `vitest.integration.config.ts` — `include: ['src/test/integration/**/*.itest.ts']`,
  Node environment, single worker, its own setup file. `.itest.ts` is outside
  `vitest.config.ts`'s `include`, so `pnpm test` is unchanged.
- `pnpm test:integration` runs it. It requires a running local stack and says so
  when the connection fails.
- Setup file: polyfills `globalThis.WebSocket` from `ws`, then **asserts the
  Supabase URL host is `127.0.0.1` or `localhost` and aborts otherwise**.

### The production-credentials trap

Vitest runs with mode `test`, so Vite would load `.env.test.local` — which in
this repo holds the agent-browser QA user's **production** credentials. Left
alone, the tier would run against production.

Two independent defences, both required:

1. The integration config sets `test.env` explicitly (URL + local anon key),
   which takes precedence over `.env*` files.
2. The setup file's localhost assertion aborts the run if anything still points
   elsewhere.

The local anon key comes from `supabase status -o env` (CI) and the same in local
use; it is a well-known development key, not a secret, and is not committed.

### CI

`db-test` gains, after `supabase test db`: pnpm/Node setup, `pnpm install
--frozen-lockfile`, export of the stack's URL and anon key from `supabase status
-o env`, then `pnpm test:integration`. `supabase stop` stays in `if: always()`.
Cost: roughly one extra minute of install on a job that already spends ~2.

## Verification

The suite must be proven to bite before it is trusted — four green tests once
passed against deliberately broken code in R-36, and the camera-leak bug escaped
three teardown tests.

Red-then-green, all four run and recorded in the PR:

1. Add a non-existent column to a select in scope → the runner fails, naming that
   helper.
2. Break an embedded relation name (`routine_exercises` → `routine_exercise`) →
   the runner fails.
3. Add a helper with an explicit select and no registry entry → the meta-test
   fails, naming it.
4. Point the URL at a non-local host → the setup aborts before any query runs.
5. Make a registered case short-circuit (pass an empty id array) → the runner
   fails it for issuing no request, rather than passing vacuously.

Then revert all five and confirm the suite is green.

Additionally: the historical bug is reproduced. Re-adding `meal_times` to
`fetchActiveWeek`'s select must fail the runner — that is the regression this
work exists to prevent.

## Out of scope

- Shape assertions on returned data; the `as unknown as {…}` casts are untouched.
- Seed data, auth sessions, RLS assertions from the client (pgTAP owns RLS).
- e2e coverage of planner load / apply-template (roadmap option 2, stays open).
- Any Node 22 upgrade.

## Docs to update

- `docs/roadmap.md` — R-32 status: the select-string half done, option 2 still
  open; retire the standing "verify by hand" rule.
- `docs/operations.md` — the tier list and what `db-test` now runs.
- `docs/architecture.md` / `CLAUDE.md` — Tier-4 in the test-tier description.
- `docs/decisions.md` — a D-id for "guard the select strings, not the shape".
