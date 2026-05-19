# CLAUDE.md

Hudson's Fitness — bilingual (ES/EN) PWA: body composition, macros, recipes, weekly meal plans, dietary phases. React 18 + Vite + TS SPA → Supabase. Solo dev. Repo is public.

## Commands

Node 20+, pnpm 10+.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint .
pnpm build        # tsc -b && vite build (to ./dist)
pnpm preview      # preview ./dist locally
```

`.env.local` needs `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` — public-tier values in README.md. `pnpm lint` + `pnpm build` must pass before merge — CI-enforced. No test runner configured.

## Hard invariants (never violate)
1. Metric-only (kg/cm/g).
2. DB is canonical; RLS is the sole security boundary (repo is public).
3. Any >1-table atomic mutation is an RPC (`SECURITY INVOKER` + `set search_path = public`); the cron-only `apply_template_to_week_admin` is the documented `SECURITY DEFINER` exception. A second sanctioned `SECURITY DEFINER` exception — `reconcile_account_delete` (account-delete reconciliation; service-role/edge-only, granted to no role) — is `> ⚠ Changing — see R-01` (decided, staged, not yet applied).
4. `pnpm lint` + `pnpm build` (CI-enforced) must pass before merge; work on a short-lived branch → PR → CI → auto-merge to `main`.
5. BMR (Mifflin-St Jeor) and target-weight are derived — never stored.
6. Convert units/fractions only at the form boundary via shared helpers.
7. Never document an un-built design as if it exists — mark it `> ⚠ Changing — see R-xx`.

## Routing
- Schema / RLS / RPCs / ★ Library model → `docs/data-model.md`
- System shape / state model / boundaries / i18n / theme → `docs/architecture.md`
- What the app does / flows / origin → `docs/features.md`
- Code rules (forms, macros, toasts, UI, i18n, theme) → `docs/conventions.md`
- CI / deploy / Supabase / cron / runbook → `docs/operations.md`
- Why a decision was made → `docs/decisions.md` (IDs `D-A1…D-F6`)
- What's still un-built / backlog → `docs/roadmap.md` (IDs `R-00…R-18`)
- Shipped history → `docs/changelog.md`

Rule: if it isn't needed every session, it does not belong in this file. Deep detail lives in `docs/` — load the one relevant shard on demand.
