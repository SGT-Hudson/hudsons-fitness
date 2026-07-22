# CLAUDE.md

Hudson's Fitness — bilingual (ES/EN) PWA: body composition, macros, recipes, weekly meal plans, dietary phases, training (sessions, live runner, exercise catalog, routines, programs). React 18 + Vite + TS SPA → Supabase. Solo dev. Repo is public.

## Commands

Node 20+, pnpm 10+.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint .
pnpm build        # tsc -b && vite build (to ./dist)
pnpm test         # vitest run
pnpm preview      # preview ./dist locally
```

`.env.local` needs `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` — public-tier values in README.md. `pnpm lint` + `pnpm build` + `pnpm test` (Vitest) must pass before merge — CI-enforced.

## Hard invariants (never violate)
1. Metric-only (kg/cm/g).
2. DB is canonical; RLS is the sole security boundary (repo is public).
3. Any >1-table atomic mutation is an RPC (`SECURITY INVOKER` + `set search_path = public`). `SECURITY DEFINER` is forbidden without security review; the sanctioned exceptions are enumerated in `data-model.md`.
4. **Ship flow (bright line).** Never push directly to `main`/`develop`. `develop` advances only by squash-auto-merge of a CI-green `claude/*` PR; `main` only by a user-approved `release/*` PR. CI must be green before any merge: `lint-build` (`pnpm lint` + `pnpm build` + `pnpm test`) and `db-test` (Tier-3 pgTAP against a real Postgres) are both required status checks on `develop`; `edge-check` (Deno lint + shared-core type-check) runs on every PR but is not yet required. Full flow in `operations.md`.
5. BMR (Mifflin-St Jeor) and target-weight are derived — never stored.
6. Convert units/fractions only at the form boundary via shared helpers.
7. Never commit secrets. Public repo → a committed key persists in history and is irreversible. Client config is public-tier `.env.local`; server secrets live in Supabase Vault.

## Working preferences
Personal preferences (language, autonomy, answer style) live in the user-level
CLAUDE.md. Repo-level rule that must travel with this **public** repo: **no
AI/Claude attribution anywhere** — commits, PR titles/bodies, code comments (no
`Co-Authored-By`, no "Generated with…" footer, no AI-process phrasing); plain
conventional commits.

## Session lifecycle
- The main checkout (`/home/hudson/dev/hudsons-fitness`) is **sacred**: it stays on `develop`, advanced only by `fetch` + fast-forward — never used for feature work. It is the trustworthy baseline for reading real state.
- All write-work happens in an **ephemeral worktree** created **from WSL** off `origin/develop`, named for the task (`.claude/worktrees/<task>`) on a fresh `claude/<task>` branch. Never create worktrees from Windows `D:/` git (mixing environments produced the ghost worktrees).
- **Teardown on merge:** once the branch merges, `git worktree remove` it and delete the local branch.
- Read-only/brainstorm sessions need no worktree — the SessionStart hook keeps `develop` synced; read docs from there.
- Doc accuracy is reconciled to shipped code **at release** via the doc-audit (`operations.md`), not continuously; mark known-divergent docs `> ⚠ Changing — see R-xx` in the meantime.
- **Scale spec/plan to change size:** no spec for single-file/component changes, copy/i18n tweaks, dependency bumps, pure-doc edits, isolated bug fixes; a spec (and a plan if multi-step) for schema/RLS/RPC changes, a new feature/page, cross-cutting refactors, or anything touching a hard invariant or the data model. Borderline → err toward a short spec (a few sentences is fine).

## Routing
- Schema / RLS / RPCs / ★ Library model → `docs/data-model.md`
- System shape / state model / boundaries / i18n / theme → `docs/architecture.md`
- What the app does / flows / origin → `docs/features.md`
- Code rules (forms, macros, toasts, UI, i18n, theme) → `docs/conventions.md`
- CI / deploy / Supabase / cron / runbook → `docs/operations.md`
- Why a decision was made → `docs/decisions.md` (IDs `D-A1…D-F27`)
- What's still un-built / backlog → `docs/roadmap.md` (IDs `R-00…R-46`; F-/U-/post-V1 family index at end)
- Shipped history → `docs/changelog.md`

Rule: if it isn't needed every session, it does not belong in this file. Deep detail lives in `docs/` — load the one relevant shard on demand.
