# R-32 (e2e half) — Playwright smoke suite

**Date:** 2026-07-28
**Status:** Approved design, pre-implementation
**Relates to:** R-32 (`docs/roadmap.md`), Tier-4 select-string guard (#230, first half of R-32), D-F1 test-tier ruling

## Goal

A smoke test that proves the app **boots, authenticates, and renders every
spine screen without exploding** — run on every PR, against the same local
Supabase stack the `db-test` job already stands up.

This is deliberately **not** a regression suite. The original R-32 trigger (a
broken `.select(...)` string taking down the planner in production) is already
covered by the Tier-4 guard (#230). What remains uncovered is the class of
failure where a route crashes at render time — an import error, a provider
missing, a runtime TypeError in a component tree — which no existing tier can
see because Tier-1/2 mock the world and Tier-3/4 never render the app.

The suite asserts little **on purpose** so it never needs touching when copy,
layout, or styling changes.

## Decisions (closed in brainstorm — do not relitigate)

1. **Playwright** (`@playwright/test`), not `agent-browser`: real assertions,
   retries, and trace + screenshot artifacts when it fails in a runner nobody
   can attach to. Accepted cost: new dev dependency + ~150–200 MB Chromium in
   CI. `agent-browser` stays for interactive use.
2. **Runs inside the existing `db-test` job**, against the local stack — never
   against production. No prod credentials in GitHub; as a bonus it exercises
   not-yet-deployed migrations.
3. **Small fixture, not an empty account.** An empty account only renders
   empty states; the row-rendering code paths are where crashes live.
4. **Mobile viewport only.** Desktop-specific bugs that have bitten were
   clipped-dropdown/dialog bugs, which a route smoke cannot catch at any width.
5. **Spine routes only** (~11 landing routes, listed below). Detail routes
   with ids are out of V1 — they couple the test to fixture ids. Add one only
   if a real failure ever slips through there.
6. **Weak assertion model** (deliberate): per route — no ErrorBoundary
   fallback, a visible `h1`, zero console errors / `pageerror` outside a short
   allowlist.
7. **Fixture is a separate SQL file applied only by the e2e step** — not
   `supabase/seed.sql`. pgTAP keeps running against an unseeded DB (its tests
   were written that way) and local dev stacks stay clean; a pnpm script
   applies it locally when you want to run the smoke.
8. **Required from day one.** The steps live in `db-test`, which is already a
   required check on `develop`; a red flake is a re-run, and with auto-merge
   active a non-blocking guard guards nothing.
9. **Built app, not dev server.** `pnpm build` runs inside `db-test` with the
   stack's URL/anon key (Vite bakes `VITE_*` env in at build time, so the
   `lint-build` artifact is unusable — it was built pointing nowhere), served
   with `vite preview`. Most faithful to production at ~30–45 s extra.

## Scope

### Routes swept

`/diary`, `/planner`, `/templates`, `/recipes`, `/recipes/ingredients`,
`/training`, `/routine`, `/exercises`, `/progress`, `/progress/goals`,
`/settings`.

Plus the login screen itself, exercised once by the auth setup (below).

### Per-route assertions

1. The ErrorBoundary fallback is **not** visible. The fallback element gains a
   stable `data-testid="error-boundary-fallback"` (added in this work) so the
   assertion survives copy changes in either language.
2. A visible `h1` exists (the app renders one per page; asserting visibility —
   not text — keeps the test copy- and language-proof).
3. No `console.error` messages and no `pageerror` events, minus a short
   explicit allowlist (e.g. React Router v7 future-flag warnings). The
   allowlist lives in one place in the spec file with a comment per entry;
   growing it requires justifying the entry.

Anything stronger (per-row content, navigation flows, mutations) is explicitly
out of scope.

## Architecture

### Test layout

```
e2e/
  smoke.spec.ts        # the route sweep
  auth.setup.ts        # logs in once via the real login form, saves storageState
playwright.config.ts   # root; mobile viewport, retries, trace/screenshot on failure
supabase/seed/
  e2e-fixture.sql      # QA user + representative rows (idempotent)
```

- `auth.setup.ts` runs as a Playwright *setup project*: it performs a real UI
  login with the fixture user's credentials and saves `storageState` to a
  gitignored path. The main project depends on it and reuses the state, so
  login happens exactly once per run and the auth screen itself is smoked.
- Viewport: a standard mobile preset (Pixel-class, ~390×850). One browser:
  Chromium.
- `retries: 1` in CI (a genuine crash fails twice; a browser-startup flake
  self-heals), `0` locally. `trace: 'on-first-retry'`, screenshots on failure,
  uploaded as workflow artifacts.
- The e2e directory is excluded from Vitest globs and from `tsc -b` app
  builds; Playwright type-checks its own files.

### Fixture (`supabase/seed/e2e-fixture.sql`)

One transaction, **idempotent per row** (`on conflict do nothing` /
deterministic UUIDs) so re-applying locally is safe. Seeds:

- **Auth user** `e2e-smoke@hudsonsfitness.test` via raw SQL insert into
  `auth.users` + `auth.identities` (the local GoTrue accepts password grants
  for it; the known NULL-token-column trap applies — empty strings, not NULLs,
  in the token columns).
- **Onboarded profile** (metric, ES locale) so no route redirects to
  onboarding.
- **Representative rows**: one diary day with a couple of meals; one planner
  week; one recipe with ingredients; one routine with a few exercises; a body
  measurement and a goal. Enough that every spine route renders at least one
  real row; no more.

The fixture references only tables/columns that exist post-migrations; since
`db-test` applies the full migration history first, a schema drift that breaks
the fixture fails loudly in CI — which is signal, not noise.

### CI wiring (extending `db-test`)

After the existing Tier-4 step, in order:

1. Apply the fixture: `psql "postgresql://postgres:postgres@127.0.0.1:56322/postgres" -v ON_ERROR_STOP=1 -f supabase/seed/e2e-fixture.sql`
   (the runner ships a psql client; ports come from the committed
   `supabase/config.toml`, same as local).
2. Install Chromium: `pnpm exec playwright install --with-deps chromium`, with
   `~/.cache/ms-playwright` cached via `actions/cache` keyed on the Playwright
   version from the lockfile.
3. Build: `pnpm build` with `VITE_SUPABASE_URL=http://127.0.0.1:56321` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` taken from `supabase status -o env` (same
   extraction pattern the Tier-4 step already uses).
4. Serve: `pnpm preview` in the background (default port 4173).
5. Run: `pnpm test:e2e` (Playwright's `webServer` config can own steps 4–5 —
   implementation may fold them in; behaviour, not mechanism, is the contract).
6. On failure: upload `playwright-report/` + traces as a workflow artifact.

Expected job cost: ~+2 min (build ~40 s, browser install ~5 s cached / ~30 s
cold, sweep ~60 s), taking `db-test` from ~2m10s to ~4–4.5 min. Acceptable.

### Local runs

```bash
supabase start        # or the already-running stack
pnpm e2e:seed         # applies supabase/seed/e2e-fixture.sql to the local DB
pnpm test:e2e         # exports the stack's URL/key, builds, serves preview, runs the sweep
```

Local runs use the same env-injection as CI — the scripts export the local
stack's URL/key before building, so `.env.local` (which may point at
production for `pnpm dev`) is never what the smoke bundle bakes in. The exact
script ergonomics are an implementation detail; the contract is that the
smoke never runs against production. The suite inherits Tier-4's fail-closed
stance: the Playwright config throws at load unless the `VITE_SUPABASE_URL`
it was handed has host `127.0.0.1`/`localhost`.

## Error handling

- **Stack not up / fixture fails:** step fails loudly (`ON_ERROR_STOP`), job
  red. No fallback.
- **Flake:** one CI retry; a route failing twice is a real failure. Trace +
  screenshot artifacts are the debugging story — never "reproduce locally
  first".
- **A route legitimately gains a redirect or loses its `h1`:** the test fails
  and the route list/assertion is updated in the same PR that changes the
  behaviour — that is the intended maintenance cost, and it is small.

## Testing the test

The suite must be proven to bite before merge (red-then-green rule): break a
route on purpose (throw in a component behind one route), watch the sweep
fail with a useful artifact, revert. This proof is a checklist item in the
implementation plan, not a committed artifact.

## Out of scope (V1)

- Desktop viewport, WebKit/Firefox, detail routes with ids, mutation flows,
  visual regression, accessibility asserts, performance budgets.
- Promoting `edge-check` to required (unrelated; tracked separately).
- Any change to the Tier-1/2/3/4 suites beyond excluding `e2e/` from their
  globs.
